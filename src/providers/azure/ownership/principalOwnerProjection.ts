import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../core/azure/resources";
import { rankOwnerCandidates } from "../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateScope,
  OwnerConfidence,
  OwnerEvidence
} from "../../../core/ownership/types";

export type PrincipalOwnerProjection = {
  resourceGroup?: string;
  ownerCandidates: OwnerCandidate[];
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
};

type ResourceGroupOwnershipIndex = {
  byResourceGroup: Map<string, ResourceGroupOwnershipRow>;
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

  return {
    resourceGroup: identity.resourceGroup,
    ...buildPrincipalOwnerProjection(ownerCandidates)
  };
}

export function projectServicePrincipalOwners(
  roleAssignments: AzureRoleAssignment[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[]
): PrincipalOwnerProjection {
  const ownershipIndex = buildResourceGroupOwnershipIndex(resourceGroupOwnershipRows);
  const ownerRows: ResourceGroupOwnerCandidateInput[] = [];

  for (const assignment of roleAssignments) {
    const row = getRoleAssignmentResourceGroupOwner(assignment, ownershipIndex);
    if (!row || row.ownerCandidates.length === 0) {
      continue;
    }

    ownerRows.push({
      row,
      scope: {
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceGroup: row.resourceGroup,
        principalId: assignment.principalId,
        scope: assignment.scope,
        roleDefinitionName: assignment.roleDefinitionName
      }
    });
  }

  return buildPrincipalOwnerProjection(rankOwnerCandidates(buildOwnerCandidatesFromResourceGroupRows(ownerRows)));
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

  for (const row of rows) {
    byResourceGroup.set(getResourceGroupKey(row.subscriptionId, row.resourceGroup), row);
  }

  return { byResourceGroup };
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

function getRoleAssignmentResourceGroupOwner(
  assignment: AzureRoleAssignment,
  ownershipIndex: ResourceGroupOwnershipIndex
): ResourceGroupOwnershipRow | null {
  const scope = assignment.scope;
  const subscriptionId = getScopeSubscriptionId(scope) ?? assignment.subscriptionId;
  const resourceGroup = getScopeResourceGroup(scope);

  if (!subscriptionId || !resourceGroup) {
    return null;
  }

  return ownershipIndex.byResourceGroup.get(getResourceGroupKey(subscriptionId, resourceGroup)) ?? null;
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
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
    scope.principalId ?? "",
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
