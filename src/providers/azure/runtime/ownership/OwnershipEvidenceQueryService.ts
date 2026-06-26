import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnershipEvidenceItem,
  OwnerType,
  OwnershipEvidenceResponse,
  OwnershipEvidenceTargetKind
} from "../../../../core/ownership/types";
import { rankOwnerCandidates } from "../../../../core/ownership/ownerCandidateRanking";
import type { DisabledOwnerEvidenceStore } from "../../../../core/runtime/DisabledOwnerEvidenceStore";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { PageOptions } from "../../../../core/runtime/pagination";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type {
  AzurePrincipalResourceGroupOwnerCandidateViewRow,
  AzureResourceGroupOwnerCandidateViewRow,
} from "../resources/tables";
import type { LocalAzureResourcesReportRuntime } from "../resources/LocalAzureResourcesReportRuntime";
import { flattenCandidateEvidence } from "./OwnershipEvidenceHelper";

export type OwnershipEvidenceRequest =
  | {
      kind: "servicePrincipal" | "managedIdentity";
      principalId: string;
    }
  | {
      kind: "resourceGroup";
      subscriptionId: string;
      resourceGroup: string;
      page?: number;
      pageSize?: number;
    };

export type OwnershipEvidenceQueryServiceOptions = {
  entraQueries: EntraCollectionQueryService;
  azureResources: LocalAzureResourcesReportRuntime;
  disabledEvidenceStore?: Pick<DisabledOwnerEvidenceStore, "readKeys">;
};

type ResourceGroupOwnershipEvidenceRequest = Extract<OwnershipEvidenceRequest, { kind: "resourceGroup" }> & {
  principalIds?: string[];
};
const DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT = 100;

export class OwnershipEvidenceQueryService {
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore?: Pick<DisabledOwnerEvidenceStore, "readKeys">;

  constructor(options: OwnershipEvidenceQueryServiceOptions) {
    this.entraQueries = options.entraQueries;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
  }

  async readOwnershipEvidence(request: OwnershipEvidenceRequest): Promise<OwnershipEvidenceResponse> {
    switch (request.kind) {
      case "servicePrincipal":
        return this.readServicePrincipalEvidence(request.principalId);
      case "managedIdentity":
        return this.readManagedIdentityEvidence(request.principalId);
      case "resourceGroup":
        return this.readResourceGroupEvidence(request);
      default:
        return assertNever(request);
    }
  }

  private async readServicePrincipalEvidence(principalId: string): Promise<OwnershipEvidenceResponse> {
    const row = await this.entraQueries.findServicePrincipalById(principalId);

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "servicePrincipal",
        id: row.id,
        displayName: row.displayName
      },
      evidence: withOwnershipEvidenceStatusKeys(flattenCandidateEvidence(rankOwnerCandidates(
        await this.readPrincipalOwnerCandidates(row.id, getRoleAssignmentResourceGroupOwnershipTarget(row.roleAssignments ?? []))
      )))
    };
  }

  private async readDisabledOwnerEvidenceKeys(): Promise<ReadonlySet<string>> {
    const keys = await this.disabledEvidenceStore?.readKeys();
    return new Set([...(keys ?? [])].map(normalizeKey));
  }

  private async readPrincipalOwnerCandidates(
    principalId: string,
    target: { subscriptionIds: string[]; resourceGroups: string[] }
  ): Promise<OwnerCandidate[]> {
    try {
      return this.applyStoredPrincipalOwnerDisabledEvidence(
        (await this.azureResources.readAzurePrincipalResourceGroupOwnerCandidateViewRows(
          {
            principalId,
            ...target
          },
          DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT
        )).flatMap(mapPrincipalResourceGroupOwnerCandidateViewRowToOwnerCandidate)
      );
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return [];
      }

      throw error;
    }
  }

  private async readManagedIdentityEvidence(principalId: string): Promise<OwnershipEvidenceResponse> {
    const normalizedPrincipalId = normalizeKey(principalId);
    const row = (await this.entraQueries.readManagedIdentityRows()).find(
      (candidate) => normalizeKey(String(candidate.id ?? "")) === normalizedPrincipalId
    ) as ManagedIdentity | undefined;

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    const identityResourceGroup = await this.readManagedIdentityResourceGroup(row);

    return {
      target: {
        kind: "managedIdentity",
        id: row.id,
        displayName: row.displayName
      },
      evidence: withOwnershipEvidenceStatusKeys(flattenCandidateEvidence(rankOwnerCandidates(
        await this.readPrincipalOwnerCandidates(
          row.id,
          identityResourceGroup
            ? {
                subscriptionIds: [identityResourceGroup.subscriptionId],
                resourceGroups: [identityResourceGroup.resourceGroup]
              }
            : {
                subscriptionIds: [],
                resourceGroups: []
              }
        )
      )))
    };
  }

  private async readManagedIdentityResourceGroup(
    row: ManagedIdentity
  ): Promise<Pick<AzureUserAssignedManagedIdentity, "subscriptionId" | "resourceGroup"> | null> {
    const resourceGroup = row.resourceGroup?.trim();
    if (!resourceGroup) {
      return null;
    }

    const normalizedPrincipalId = normalizeKey(row.id);
    const normalizedClientId = normalizeKey(row.appId);
    const normalizedResourceGroup = normalizeKey(resourceGroup);
    const identities = await this.azureResources.readAzureUserAssignedManagedIdentities();

    return identities.find((identity) => {
      const identityKeyMatches =
        normalizeKey(identity.principalId) === normalizedPrincipalId ||
        normalizeKey(identity.clientId) === normalizedClientId;

      return identityKeyMatches && normalizeKey(identity.resourceGroup) === normalizedResourceGroup;
    }) ?? null;
  }

  private async readResourceGroupEvidence(
    request: ResourceGroupOwnershipEvidenceRequest
  ): Promise<OwnershipEvidenceResponse> {
    const ownerRows = await this.azureResources.readAzureResourceGroupOwnerCandidateViewRows(
      {
        subscriptionId: request.subscriptionId,
        resourceGroup: request.resourceGroup
      },
      getResourceGroupOwnershipLookupLimit(request)
    );
    const targetRow = ownerRows[0];

    if (!targetRow) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    const ownerCandidates = await this.applyStoredResourceGroupDisabledEvidence(
      ownerRows.flatMap((row, index) => mapResourceGroupOwnerCandidateViewRowToOwnerCandidate(
        row,
        index,
        request.principalIds
      ))
    );

    return {
      target: {
        kind: "resourceGroup",
        id: `resourceGroup:${targetRow.subscriptionId.trim().toLowerCase()}:${targetRow.resourceGroup.trim().toLowerCase()}`,
        displayName: targetRow.resourceGroup,
        subscriptionId: targetRow.subscriptionId,
        subscriptionName: targetRow.subscriptionName,
        resourceGroup: targetRow.resourceGroup
      },
      evidence: withOwnershipEvidenceStatusKeys(flattenCandidateEvidence(rankOwnerCandidates(
        ownerCandidates
      )))
    };
  }

  private async applyStoredResourceGroupDisabledEvidence(candidates: OwnerCandidate[]): Promise<OwnerCandidate[]> {
    const disabledKeys = await this.readDisabledOwnerEvidenceKeys();
    if (disabledKeys.size === 0) {
      return candidates;
    }

    return candidates.map((candidate) => {
      if (!isResourceGroupOwnerCandidateDisabled(candidate, disabledKeys)) {
        return candidate;
      }

      return {
        ...candidate,
        evidence: candidate.evidence.map((evidence) => ({
          ...evidence,
          disabled: true
        }))
      };
    });
  }

  private async applyStoredPrincipalOwnerDisabledEvidence(candidates: OwnerCandidate[]): Promise<OwnerCandidate[]> {
    const disabledKeys = await this.readDisabledOwnerEvidenceKeys();
    if (disabledKeys.size === 0) {
      return candidates;
    }

    return candidates.map((candidate) => {
      const disabledEvidence = candidate.evidence.map((evidence) => ({
        ...evidence,
        disabled:
          isDirectOwnerEvidenceDisabled(candidate, evidence, disabledKeys) ||
          isResourceGroupOwnerCandidateDisabled(candidate, disabledKeys) ||
          undefined
      }));

      return {
        ...candidate,
        evidence: disabledEvidence
      };
    });
  }
}

function withOwnershipEvidenceStatusKeys(
  evidenceItems: OwnershipEvidenceItem[],
  principalId?: string
): OwnershipEvidenceItem[] {
  return evidenceItems.map((item) => ({
    ...item,
    statusKey: getOwnershipEvidenceStatusKey(item, principalId)
  }));
}

function getOwnershipEvidenceStatusKey(item: OwnershipEvidenceItem, principalId?: string): string | null {
  if (item.path === "direct") {
    return item.key;
  }

  const scopedKey = principalId ? getPrincipalScopedOwnershipEvidenceStatusKey(item, principalId) : null;
  return scopedKey ?? item.key;
}

function getPrincipalScopedOwnershipEvidenceStatusKey(item: OwnershipEvidenceItem, principalId: string): string | null {
  const scope = item.relatedScopes.find((candidateScope) => candidateScope.subscriptionId && candidateScope.resourceGroup);
  if (!scope?.subscriptionId || !scope.resourceGroup) {
    return null;
  }

  return [
    "resourceGroup",
    scope.subscriptionId,
    scope.resourceGroup,
    "principal",
    principalId,
    item.ownerCandidateKey
  ].join(":");
}

function getResourceGroupOwnershipLookupLimit(options: PageOptions): number {
  if (options.page === undefined || options.pageSize === undefined) {
    return DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT;
  }

  return Math.max(1, Math.trunc(options.page) * Math.trunc(options.pageSize));
}

function isDirectOwnerEvidenceDisabled(
  candidate: Pick<OwnerCandidate, "key">,
  evidence: OwnerEvidence,
  disabledKeys: ReadonlySet<string>
): boolean {
  return disabledKeys.has(normalizeKey(getDirectOwnerEvidenceKey(candidate, evidence)));
}

function getDirectOwnerEvidenceKey(candidate: Pick<OwnerCandidate, "key">, evidence: OwnerEvidence): string {
  return [candidate.key, evidence.user.trim().toLowerCase(), evidence.date ?? ""].join(":");
}

function isResourceGroupOwnerCandidateDisabled(
  candidate: Pick<OwnerCandidate, "key" | "relatedScopes">,
  disabledKeys: ReadonlySet<string>
): boolean {
  return candidate.relatedScopes.some((scope) => {
    if (!scope.subscriptionId || !scope.resourceGroup) {
      return false;
    }

    const resourceGroupKey = [
      "resourceGroup",
      scope.subscriptionId,
      scope.resourceGroup,
      candidate.key
    ].join(":");

    if (disabledKeys.has(normalizeKey(resourceGroupKey))) {
      return true;
    }

    if (!scope.principalId) {
      return false;
    }

    return disabledKeys.has(normalizeKey([
      "resourceGroup",
      scope.subscriptionId,
      scope.resourceGroup,
      "principal",
      scope.principalId,
      candidate.key
    ].join(":")));
  });
}

function mapResourceGroupOwnerCandidateViewRowToOwnerCandidate(
  row: AzureResourceGroupOwnerCandidateViewRow,
  index: number,
  principalIds: string[] | undefined
): OwnerCandidate[] {
  return readPrincipalScopes(principalIds).map((principalId) => ({
    key: getResourceGroupOwnerCandidateKey(row.ownerCandidate, row.ownerType, row.owner),
    displayName: row.owner,
    type: row.ownerType,
    confidence: row.confidence,
    source: inferResourceGroupOwnerCandidateSource(row.source),
    rank: index + 1,
    evidence: [
      {
        user: row.evidenceValue,
        date: row.evidenceDate,
        key: getScopedResourceGroupEvidenceKey(row, principalId)
      }
    ],
    relatedScopes: [
      buildResourceGroupRelatedScope(row, principalId)
    ]
  }));
}

function mapPrincipalResourceGroupOwnerCandidateViewRowToOwnerCandidate(
  row: AzurePrincipalResourceGroupOwnerCandidateViewRow,
  index: number
): OwnerCandidate[] {
  return [
    {
      key: getPrincipalOwnerCandidateKey(row),
      displayName: row.owner,
      type: row.ownerType,
      confidence: row.confidence,
      source: row.source,
      rank: index + 1,
      evidence: [
        {
          user: row.evidenceValue,
          date: row.evidenceDate,
          key: row.evidenceKey
        }
      ],
      relatedScopes: row.path === "indirect" && row.subscriptionId && row.resourceGroup
        ? [
            {
              subscriptionId: row.subscriptionId,
              subscriptionName: row.subscriptionName ?? undefined,
              resourceGroup: row.resourceGroup,
              principalId: row.principalId
            }
          ]
        : []
    }
  ];
}

function getPrincipalOwnerCandidateKey(row: AzurePrincipalResourceGroupOwnerCandidateViewRow): string {
  if (
    row.source === "entraApplicationOwner" ||
    row.source === "entraServicePrincipalOwner"
  ) {
    return row.ownerCandidate;
  }

  return getResourceGroupOwnerCandidateKey(row.ownerCandidate, row.ownerType, row.owner);
}

function buildResourceGroupRelatedScope(
  row: Pick<AzureResourceGroupOwnerCandidateViewRow, "subscriptionId" | "subscriptionName" | "resourceGroup">,
  principalId: string | undefined
): NonNullable<OwnerCandidate["relatedScopes"]>[number] {
  const scope: NonNullable<OwnerCandidate["relatedScopes"]>[number] = {
    subscriptionId: row.subscriptionId,
    subscriptionName: row.subscriptionName,
    resourceGroup: row.resourceGroup
  };

  if (principalId) {
    scope.principalId = principalId;
  }

  return scope;
}

function readPrincipalScopes(principalIds: string[] | undefined): Array<string | undefined> {
  const normalizedPrincipalIds = [
    ...new Set((principalIds ?? []).map((principalId) => principalId.trim().toLowerCase()).filter(Boolean))
  ];

  return normalizedPrincipalIds.length > 0 ? normalizedPrincipalIds : [undefined];
}

function getScopedResourceGroupEvidenceKey(
  row: Pick<AzureResourceGroupOwnerCandidateViewRow, "subscriptionId" | "resourceGroup" | "ownerCandidate" | "evidenceKey">,
  principalId: string | undefined
): string {
  if (!principalId) {
    return row.evidenceKey;
  }

  return [
    "resourceGroup",
    row.subscriptionId.trim().toLowerCase(),
    row.resourceGroup.trim().toLowerCase(),
    "principal",
    principalId,
    row.ownerCandidate
  ].join(":");
}

function getResourceGroupOwnerCandidateKey(
  ownerCandidate: string | null | undefined,
  ownerType: OwnerType,
  owner: string
): string {
  if (parseOwnerCandidateType(ownerCandidate) && ownerCandidate) {
    const separatorIndex = ownerCandidate.indexOf(":");
    return [
      ownerCandidate.slice(0, separatorIndex).trim(),
      ownerCandidate.slice(separatorIndex + 1).trim().toLowerCase()
    ].join(":");
  }

  return `${ownerType}:${owner.trim().toLowerCase()}`;
}

function getRoleAssignmentResourceGroupOwnershipTarget(
  roleAssignments: AzureRoleAssignment[]
): { subscriptionIds: string[]; resourceGroups: string[] } {
  const pairs = new Map<string, { subscriptionId: string; resourceGroup: string }>();

  for (const assignment of roleAssignments) {
    const subscriptionId = firstNonEmpty([
      assignment.scopeSubscriptionId,
      getScopeSubscriptionId(assignment.scope),
      assignment.subscriptionId
    ]);
    const resourceGroup = firstNonEmpty([
      assignment.scopeResourceGroup,
      getScopeResourceGroup(assignment.scope)
    ]);

    if (!subscriptionId || !resourceGroup) {
      continue;
    }

    const normalizedSubscriptionId = normalizeKey(subscriptionId);
    const normalizedResourceGroup = normalizeKey(resourceGroup);
    pairs.set(`${normalizedSubscriptionId}:${normalizedResourceGroup}`, {
      subscriptionId: subscriptionId.trim(),
      resourceGroup: resourceGroup.trim()
    });
  }

  const targets = [...pairs.values()];

  return {
    subscriptionIds: targets.map((target) => target.subscriptionId),
    resourceGroups: targets.map((target) => target.resourceGroup)
  };
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function parseOwnerCandidateType(ownerCandidate: string | null | undefined): OwnerType | null {
  const separatorIndex = ownerCandidate?.indexOf(":") ?? -1;
  if (separatorIndex <= 0) {
    return null;
  }

  const type = ownerCandidate?.slice(0, separatorIndex);

  if (
    type === "ownerUser" ||
    type === "ownerGroup" ||
    type === "ownerTag" ||
    type === "application" ||
    type === "unknown"
  ) {
    return type;
  }

  return null;
}

function inferResourceGroupOwnerCandidateSource(source: string): OwnerCandidateSource {
  if (source.startsWith("activity.")) {
    return "activity";
  }

  if (source.startsWith("tag.")) {
    return "tag";
  }

  return "resourceGroupOwner";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported ownership evidence target kind: ${(value as { kind?: OwnershipEvidenceTargetKind }).kind}`);
}
