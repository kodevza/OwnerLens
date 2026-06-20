import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../../core/azure/resources";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnerType,
  OwnershipEvidenceDiscoverySource,
  OwnershipEvidenceItem,
  OwnershipEvidencePath,
  OwnershipEvidenceResponse,
  OwnershipEvidenceTargetKind
} from "../../../../core/ownership/types";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { PageOptions } from "../../../../core/runtime/pagination";
import { projectServicePrincipalOwners } from "../../ownership/principalOwnerProjection";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type { AzureResourceGroupOwnershipSqlRow } from "../resources/tables";
import type { LocalAzureResourcesReportRuntime } from "../resources/LocalAzureResourcesReportRuntime";

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
};

type ResourceGroupOwnershipEvidenceRequest = Extract<OwnershipEvidenceRequest, { kind: "resourceGroup" }>;
const DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT = 100;

export class OwnershipEvidenceQueryService {
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly azureResources: LocalAzureResourcesReportRuntime;

  constructor(options: OwnershipEvidenceQueryServiceOptions) {
    this.entraQueries = options.entraQueries;
    this.azureResources = options.azureResources;
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
    const normalizedPrincipalId = normalizeKey(principalId);
    const row = (await this.entraQueries.readServicePrincipalRows()).find(
      (candidate) => normalizeKey(String(candidate.id ?? "")) === normalizedPrincipalId
    ) as ServicePrincipal | undefined;

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "servicePrincipal",
        id: row.id,
        displayName: row.displayName
      },
      evidence: flattenCandidateEvidence(await this.readServicePrincipalOwnerCandidates(row))
    };
  }

  private async readServicePrincipalOwnerCandidates(row: ServicePrincipal): Promise<OwnerCandidate[]> {
    const roleAssignments = row.roleAssignments ?? [];
    const target = getRoleAssignmentResourceGroupOwnershipTarget(roleAssignments);

    if (target.subscriptionIds.length === 0 || target.resourceGroups.length === 0) {
      return row.ownerCandidates ?? projectServicePrincipalOwners(
        roleAssignments,
        []
      ).ownerCandidates;
    }

    try {
      const resourceGroupOwnershipRows = mapSqlRowsToResourceGroupOwnershipRows(
        await this.azureResources.readAzureResourceGroupOwnershipSqlRows(
          {
            ...target,
            principalIds: [row.id]
          },
          DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT
        )
      );

      return projectServicePrincipalOwners(
        roleAssignments,
        resourceGroupOwnershipRows
      ).ownerCandidates;
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return row.ownerCandidates ?? projectServicePrincipalOwners(
          roleAssignments,
          []
        ).ownerCandidates;
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
    if (identityResourceGroup) {
      return this.readResourceGroupEvidence({
        kind: "resourceGroup",
        subscriptionId: identityResourceGroup.subscriptionId,
        resourceGroup: identityResourceGroup.resourceGroup
      });
    }

    return {
      target: {
        kind: "managedIdentity",
        id: row.id,
        displayName: row.displayName
      },
      evidence: []
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
    const ownerRows = await this.azureResources.readAzureResourceGroupOwnershipSqlRows(
      {
        subscriptionIds: [request.subscriptionId],
        resourceGroups: [request.resourceGroup]
      },
      getResourceGroupOwnershipLookupLimit(request)
    );
    const targetRow = ownerRows[0];

    if (!targetRow) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "resourceGroup",
        id: targetRow.targetKey,
        displayName: targetRow.resourceGroup,
        subscriptionId: targetRow.subscriptionId,
        subscriptionName: targetRow.subscriptionName,
        resourceGroup: targetRow.resourceGroup
      },
      evidence: flattenCandidateEvidence(ownerRows.flatMap(mapResourceGroupOwnershipSqlRowToOwnerCandidate))
    };
  }
}

function getResourceGroupOwnershipLookupLimit(options: PageOptions): number {
  if (options.page === undefined || options.pageSize === undefined) {
    return DEFAULT_RESOURCE_GROUP_OWNERSHIP_EVIDENCE_LIMIT;
  }

  return Math.max(1, Math.trunc(options.page) * Math.trunc(options.pageSize));
}

function mapResourceGroupOwnershipSqlRowToOwnerCandidate(
  row: AzureResourceGroupOwnershipSqlRow,
  index: number
): OwnerCandidate[] {
  const owner = row.owner?.trim() || inferDisabledResourceGroupOwner(row);

  if (!owner) {
    return [];
  }

  const ownerType = inferResourceGroupOwnerType(owner, row.source, row.ownerCandidate);

  return [
    {
      key: getResourceGroupOwnerCandidateKey(row.ownerCandidate, ownerType, owner),
      displayName: owner,
      type: ownerType,
      confidence: row.confidence,
      source: inferResourceGroupOwnerCandidateSource(row.source),
      rank: index + 1,
      evidence: row.evidence,
      relatedScopes: [
        {
          subscriptionId: row.subscriptionId,
          subscriptionName: row.subscriptionName,
          resourceGroup: row.resourceGroup,
          principalId: row.principalId ?? undefined
        }
      ]
    }
  ];
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

function mapSqlRowsToResourceGroupOwnershipRows(
  rows: AzureResourceGroupOwnershipSqlRow[]
): ResourceGroupOwnershipRow[] {
  const rowsByTargetKey = new Map<string, ResourceGroupOwnershipRow>();

  for (const row of rows) {
    const existing = rowsByTargetKey.get(row.targetKey);
    const ownerCandidates = mapResourceGroupOwnershipSqlRowToOwnerCandidate(row, existing?.ownerCandidates.length ?? 0);

    if (existing) {
      existing.ownerCandidates.push(...ownerCandidates);
      continue;
    }

    rowsByTargetKey.set(row.targetKey, {
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      resourceGroup: row.resourceGroup,
      location: row.location,
      tags: row.tags,
      targetKey: row.targetKey,
      ownerCandidates,
      owner: row.owner,
      confidence: row.confidence,
      source: row.source,
      evidence: row.evidence,
      roleAssignments: [],
      rbacRoleAssignmentCount: 0,
      rbacRoleLevel: "none"
    });
  }

  return [...rowsByTargetKey.values()];
}

function getRoleAssignmentResourceGroupOwnershipTarget(
  roleAssignments: AzureRoleAssignment[]
): { subscriptionIds: string[]; resourceGroups: string[] } {
  const subscriptionIds = new Map<string, string>();
  const resourceGroups = new Map<string, string>();

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

    subscriptionIds.set(normalizeKey(subscriptionId), subscriptionId.trim());
    resourceGroups.set(normalizeKey(resourceGroup), resourceGroup.trim());
  }

  return {
    subscriptionIds: [...subscriptionIds.values()],
    resourceGroups: [...resourceGroups.values()]
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

function inferDisabledResourceGroupOwner(row: AzureResourceGroupOwnershipSqlRow): string | null {
  if (row.confidence !== "none") {
    return null;
  }

  if (row.source.startsWith("activity.")) {
    return row.ownerDisplayName?.trim() || null;
  }

  const evidence = row.evidence.find((entry) => entry.disabled && entry.user.trim());
  if (!evidence) {
    return null;
  }

  if (row.source.startsWith("tag.")) {
    return evidence.user.split("=", 2)[1]?.trim() || null;
  }

  return evidence.user.trim();
}

function inferResourceGroupOwnerType(owner: string, source: string, ownerCandidate?: string | null): OwnerType {
  const ownerCandidateType = parseOwnerCandidateType(ownerCandidate);
  if (ownerCandidateType) {
    return ownerCandidateType;
  }

  if (source === "tag.ownerGroup") {
    return "ownerGroup";
  }

  if (source === "tag.ownerUser") {
    return "ownerUser";
  }

  if (source.startsWith("tag.")) {
    return "ownerTag";
  }

  if (owner.includes("@")) {
    return "ownerUser";
  }

  return "unknown";
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

function flattenCandidateEvidence(candidates: OwnerCandidate[]): OwnershipEvidenceItem[] {
  return candidates.flatMap((candidate) =>
    candidate.evidence.map((evidence) => {
      const item: OwnershipEvidenceItem = {
        key: getOwnershipEvidenceItemKey(candidate, evidence),
        ownerCandidateKey: candidate.key,
        ownerDisplayName: candidate.displayName,
        ownerType: candidate.type,
        confidence: candidate.confidence,
        source: candidate.source,
        path: inferOwnershipEvidencePath(candidate),
        discoverySource: inferOwnershipEvidenceDiscoverySource(candidate, evidence),
        rank: candidate.rank,
        evidence: evidence.user,
        date: evidence.date,
        relatedScopes: candidate.relatedScopes
      };

      if (evidence.disabled !== undefined) {
        item.disabled = evidence.disabled;
      }

      return item;
    })
  );
}

function getOwnershipEvidenceItemKey(candidate: OwnerCandidate, evidence: OwnerEvidence): string {
  return [candidate.key, evidence.user.trim().toLowerCase(), evidence.date ?? ""].join(":");
}

function inferOwnershipEvidencePath(candidate: OwnerCandidate): OwnershipEvidencePath {
  if (candidate.source === "resourceGroupOwner" || candidate.source === "subscriptionOwner") {
    return "indirect";
  }

  return "direct";
}

function inferOwnershipEvidenceDiscoverySource(
  candidate: OwnerCandidate,
  evidence: OwnerEvidence
): OwnershipEvidenceDiscoverySource {
  switch (candidate.source) {
    case "resourceGroupOwner":
      return inferScopedOwnerDiscoverySource(evidence);
    case "subscriptionOwner":
      return inferScopedOwnerDiscoverySource(evidence);
    case "entraServicePrincipalOwner":
      return "servicePrincipalOwner";
    case "entraApplicationOwner":
      return "applicationOwner";
    case "activity":
      return "activityLog";
    case "tag":
      return "tag";
    default:
      return assertNeverOwnerCandidateSource(candidate.source);
  }
}

function inferScopedOwnerDiscoverySource(evidence: OwnerEvidence): OwnershipEvidenceDiscoverySource {
  if (evidence.user.includes("=")) {
    return "tag";
  }

  return "activityLog";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported ownership evidence target kind: ${(value as { kind?: OwnershipEvidenceTargetKind }).kind}`);
}

function assertNeverOwnerCandidateSource(value: never): never {
  throw new Error(`Unsupported owner candidate source: ${value as OwnerCandidateSource}`);
}
