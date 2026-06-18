import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../core/azure/resources";
import type { EntraOwner } from "../../../core/azure/entra/types";
import { rankOwnerCandidates } from "../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateScope,
  OwnerConfidence,
  OwnerEvidence,
  OwnerType
} from "../../../core/ownership/types";

export type PrincipalOwnerProjection = {
  ownerCandidates: OwnerCandidate[];
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
};

type ResourceGroupOwnershipIndex = {
  byResourceGroup: Map<string, ResourceGroupOwnershipRow>;
  bySubscription: Map<string, ResourceGroupOwnershipRow[]>;
};

export function projectManagedIdentityOwners(
  principalId: string,
  clientId: string,
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[],
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[]
): PrincipalOwnerProjection {
  const ownershipByResourceGroup = buildResourceGroupOwnershipIndex(resourceGroupOwnershipRows).byResourceGroup;
  const locationsByPrincipal = buildManagedIdentityLocationIndex(userAssignedManagedIdentities);
  const identity = locationsByPrincipal.get(principalId.toLowerCase()) ?? locationsByPrincipal.get(clientId.toLowerCase());

  if (!identity) {
    return emptyPrincipalOwnerProjection();
  }

  const ownership = ownershipByResourceGroup.get(getResourceGroupKey(identity.subscriptionId, identity.resourceGroup));
  const ownerCandidates = ownership && ownership.ownerCandidates.length > 0
    ? buildOwnerCandidatesFromResourceGroupRows([
        {
          row: ownership,
          scope: {
            subscriptionId: identity.subscriptionId,
            subscriptionName: identity.subscriptionName,
            resourceGroup: identity.resourceGroup,
            scope: identity.resourceId,
            roleDefinitionName: null
          }
        }
      ])
    : [];

  return buildPrincipalOwnerProjection(ownerCandidates);
}

export function projectServicePrincipalOwners(
  servicePrincipalOwners: EntraOwner[] | undefined,
  applicationOwners: EntraOwner[] | undefined,
  roleAssignments: AzureRoleAssignment[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[]
): PrincipalOwnerProjection {
  const ownershipIndex = buildResourceGroupOwnershipIndex(resourceGroupOwnershipRows);
  const ownerRows: ResourceGroupOwnerCandidateInput[] = [];

  for (const assignment of roleAssignments) {
    for (const row of getRoleAssignmentResourceGroupOwners(assignment, ownershipIndex)) {
      if (row.ownerCandidates.length === 0) {
        continue;
      }

      ownerRows.push({
        row,
        scope: {
          subscriptionId: row.subscriptionId,
          subscriptionName: row.subscriptionName,
          resourceGroup: row.resourceGroup,
          scope: assignment.scope,
          roleDefinitionName: assignment.roleDefinitionName
        }
      });
    }
  }

  return buildPrincipalOwnerProjection(rankOwnerCandidates([
    ...buildDirectEntraOwnerCandidates(servicePrincipalOwners ?? [], "entraServicePrincipalOwner"),
    ...buildDirectEntraOwnerCandidates(applicationOwners ?? [], "entraApplicationOwner"),
    ...buildOwnerCandidatesFromResourceGroupRows(ownerRows)
  ]));
}

function emptyPrincipalOwnerProjection(): PrincipalOwnerProjection {
  return {
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none"
  };
}

function buildPrincipalOwnerProjection(ownerCandidates: OwnerCandidate[]): PrincipalOwnerProjection {
  return {
    ownerCandidates,
    potentialOwners: ownerCandidates.map((candidate) => candidate.displayName),
    ownerConfidence: ownerCandidates.reduce<OwnerConfidence>(
      (confidence, candidate) => maxOwnerConfidence(confidence, candidate.confidence),
      "none"
    )
  };
}

function buildDirectEntraOwnerCandidates(
  owners: EntraOwner[],
  source: "entraServicePrincipalOwner" | "entraApplicationOwner"
): OwnerCandidate[] {
  const candidates = new Map<string, OwnerCandidate>();

  for (const owner of owners) {
    const displayName = getOwnerDisplayName(owner);
    if (!displayName) {
      continue;
    }

    const ownerType = inferEntraOwnerType(owner);
    const key = getOwnerCandidateKey(displayName, ownerType);
    const evidence: OwnerEvidence = {
      user: displayName,
      date: null
    };
    const existing = candidates.get(key);

    if (existing) {
      existing.evidence = mergeOwnerEvidence(existing.evidence, [evidence]);
      continue;
    }

    candidates.set(key, {
      key,
      displayName,
      type: ownerType,
      confidence: "high",
      source,
      rank: 0,
      evidence: [evidence],
      relatedScopes: []
    });
  }

  return [...candidates.values()];
}

function getOwnerDisplayName(owner: EntraOwner): string | null {
  return firstNonEmpty([
    owner.userPrincipalName,
    owner.mail,
    owner.displayName,
    owner.id
  ]);
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function inferEntraOwnerType(owner: EntraOwner): OwnerType {
  const ownerType = owner.ownerType?.trim().toLowerCase();
  if (ownerType === "group") {
    return "ownerGroup";
  }

  if (ownerType === "user") {
    return "ownerUser";
  }

  return "unknown";
}

function getOwnerCandidateKey(owner: string, type: OwnerType): string {
  return `${type}:${owner.trim().toLowerCase()}`;
}

type ResourceGroupOwnerCandidateInput = {
  row: ResourceGroupOwnershipRow;
  scope: OwnerCandidateScope;
};

function buildOwnerCandidatesFromResourceGroupRows(inputs: ResourceGroupOwnerCandidateInput[]): OwnerCandidate[] {
  const candidates = new Map<string, OwnerCandidate>();

  for (const input of inputs) {
    for (const resourceGroupCandidate of input.row.ownerCandidates) {
      const key = resourceGroupCandidate.key;
      const existing = candidates.get(key);

      if (existing) {
        existing.confidence = maxOwnerConfidence(existing.confidence, resourceGroupCandidate.confidence);
        existing.evidence = mergeOwnerEvidence(existing.evidence, resourceGroupCandidate.evidence);
        existing.relatedScopes = mergeOwnerCandidateScopes(existing.relatedScopes, [input.scope]);
        continue;
      }

      candidates.set(key, {
        ...resourceGroupCandidate,
        source: "resourceGroupOwner",
        rank: 0,
        evidence: [...resourceGroupCandidate.evidence],
        relatedScopes: [input.scope]
      });
    }
  }

  return rankOwnerCandidates([...candidates.values()]);
}

function buildResourceGroupOwnershipIndex(rows: ResourceGroupOwnershipRow[]): ResourceGroupOwnershipIndex {
  const byResourceGroup = new Map<string, ResourceGroupOwnershipRow>();
  const bySubscription = new Map<string, ResourceGroupOwnershipRow[]>();

  for (const row of rows) {
    byResourceGroup.set(getResourceGroupKey(row.subscriptionId, row.resourceGroup), row);

    const subscriptionKey = row.subscriptionId.toLowerCase();
    const subscriptionRows = bySubscription.get(subscriptionKey) ?? [];
    subscriptionRows.push(row);
    bySubscription.set(subscriptionKey, subscriptionRows);
  }

  return { byResourceGroup, bySubscription };
}

function buildManagedIdentityLocationIndex(
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[]
): Map<string, AzureUserAssignedManagedIdentity> {
  const index = new Map<string, AzureUserAssignedManagedIdentity>();

  for (const identity of userAssignedManagedIdentities) {
    addManagedIdentityLocation(index, identity.principalId, identity);
    addManagedIdentityLocation(index, identity.clientId, identity);
  }

  return index;
}

function addManagedIdentityLocation(
  index: Map<string, AzureUserAssignedManagedIdentity>,
  key: string,
  identity: AzureUserAssignedManagedIdentity
): void {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) {
    return;
  }

  index.set(normalizedKey, identity);
}

function getRoleAssignmentResourceGroupOwners(
  assignment: AzureRoleAssignment,
  ownershipIndex: ResourceGroupOwnershipIndex
): ResourceGroupOwnershipRow[] {
  const scope = assignment.scope;
  const subscriptionId = getScopeSubscriptionId(scope) ?? assignment.subscriptionId;
  const resourceGroup = getScopeResourceGroup(scope);

  if (subscriptionId && resourceGroup) {
    const row = ownershipIndex.byResourceGroup.get(getResourceGroupKey(subscriptionId, resourceGroup));
    return row ? [row] : [];
  }

  if (isSubscriptionScope(scope) && subscriptionId) {
    return ownershipIndex.bySubscription.get(subscriptionId.toLowerCase()) ?? [];
  }

  return [];
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

function isSubscriptionScope(scope: string): boolean {
  return /^\/subscriptions\/[^/]+\/?$/i.test(scope);
}

function getResourceGroupKey(subscriptionId: string, resourceGroup: string): string {
  return `${subscriptionId.toLowerCase()}:${resourceGroup.toLowerCase()}`;
}

function maxOwnerConfidence(left: OwnerConfidence, right: OwnerConfidence): OwnerConfidence {
  return OWNER_CONFIDENCE_RANK[left] >= OWNER_CONFIDENCE_RANK[right] ? left : right;
}

function mergeOwnerEvidence(left: OwnerEvidence[], right: OwnerEvidence[]): OwnerEvidence[] {
  const merged = new Map<string, OwnerEvidence>();

  for (const evidence of [...left, ...right]) {
    merged.set(getOwnerEvidenceKey(evidence), evidence);
  }

  return [...merged.values()];
}

function getOwnerEvidenceKey(evidence: OwnerEvidence): string {
  return `${evidence.user}:${evidence.date ?? ""}:${evidence.disabled ? "disabled" : "enabled"}`;
}

function mergeOwnerCandidateScopes(left: OwnerCandidateScope[], right: OwnerCandidateScope[]): OwnerCandidateScope[] {
  const merged = new Map<string, OwnerCandidateScope>();

  for (const scope of [...left, ...right]) {
    merged.set(getOwnerCandidateScopeKey(scope), scope);
  }

  return [...merged.values()];
}

function getOwnerCandidateScopeKey(scope: OwnerCandidateScope): string {
  return [
    scope.subscriptionId ?? "",
    scope.subscriptionName ?? "",
    scope.resourceGroup ?? "",
    scope.scope ?? "",
    scope.roleDefinitionName ?? ""
  ].join(":");
}

const OWNER_CONFIDENCE_RANK: Record<OwnerConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};
