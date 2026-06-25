import { appConfig } from "../../../../core/config";
import {
  OWNER_CONFIDENCE_RANK,
  rankOwnerCandidates
} from "../../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnerType
} from "../../../../core/ownership/types";
import type {
  AzureResourceGroup,
  AzureRoleAssignment,
  ResourceGroupOwnershipRow
} from "../../../../core/azure/resources";
import type { EntraServicePrincipal } from "../../../../core/azure/entra/types";
import type { PermissionRiskLevel } from "../../../../core/risk/types";
import type { OwnerReportRow } from "../ownership/azureOwnerReportTypes";
import { evaluateAzureRoleAssignmentRisk } from "../enrichment/evaluateAzureRoleAssignmentRisk";

export function buildResourceGroupOwnershipRows(
  resourceGroups: AzureResourceGroup[],
  ownerRows: OwnerReportRow[],
  roleAssignments: AzureRoleAssignment[] = [],
  servicePrincipals: EntraServicePrincipal[] = []
): ResourceGroupOwnershipRow[] {
  const ownerIndex = buildResourceGroupOwnerIndex(ownerRows);
  const servicePrincipalIds = new Set(servicePrincipals.map((principal) => principal.id.toLowerCase()));

  return resourceGroups.map((group) => {
    const ownerRow = ownerIndex.get(getResourceGroupOwnerIndexKey(group.subscriptionId, group.resourceGroup));
    const groupRoleAssignments = getResourceGroupServicePrincipalRoleAssignments(
      group,
      roleAssignments,
      servicePrincipalIds
    );

    return {
      ...group,
      targetKey: ownerRow?.targetKey ?? getResourceGroupTargetKey(group.subscriptionId, group.resourceGroup),
      ownerCandidates: ownerRow ? buildResourceGroupOwnerCandidates(group, ownerRow) : [],
      owner: ownerRow?.owner ?? null,
      confidence: ownerRow?.confidence ?? "none",
      source: ownerRow?.source ?? "none",
      evidence: ownerRow?.evidence ?? [],
      roleAssignments: groupRoleAssignments,
      rbacRoleAssignmentCount: groupRoleAssignments.length,
      rbacRoleLevel: getHighestRbacRiskLevel(groupRoleAssignments)
    };
  });
}

function getResourceGroupServicePrincipalRoleAssignments(
  group: AzureResourceGroup,
  roleAssignments: AzureRoleAssignment[],
  servicePrincipalIds: ReadonlySet<string>
): AzureRoleAssignment[] {
  return roleAssignments.filter(
    (assignment) =>
      isServicePrincipalRoleAssignment(assignment, servicePrincipalIds) &&
      isRoleAssignmentInResourceGroup(assignment, group)
  );
}

function isServicePrincipalRoleAssignment(
  assignment: AzureRoleAssignment,
  servicePrincipalIds: ReadonlySet<string>
): boolean {
  return assignment.principalType?.toLowerCase() === "serviceprincipal" ||
    servicePrincipalIds.has(assignment.principalId.toLowerCase());
}

function isRoleAssignmentInResourceGroup(assignment: AzureRoleAssignment, group: AzureResourceGroup): boolean {
  const scopeSubscriptionId = assignment.scopeSubscriptionId ?? getScopeSubscriptionId(assignment.scope);
  const scopeResourceGroup = assignment.scopeResourceGroup ?? getScopeResourceGroup(assignment.scope);

  return (
    Boolean(scopeSubscriptionId) &&
    Boolean(scopeResourceGroup) &&
    scopeSubscriptionId?.toLowerCase() === group.subscriptionId.toLowerCase() &&
    scopeResourceGroup?.toLowerCase() === group.resourceGroup.toLowerCase()
  );
}

function getHighestRbacRiskLevel(roleAssignments: AzureRoleAssignment[]): PermissionRiskLevel {
  let highestRisk: PermissionRiskLevel = "none";

  for (const assignment of roleAssignments) {
    const riskLevel = evaluateAzureRoleAssignmentRisk(assignment).riskLevel;
    if (permissionRiskRank[riskLevel] > permissionRiskRank[highestRisk]) {
      highestRisk = riskLevel;
    }
  }

  return highestRisk;
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

const permissionRiskRank: Record<PermissionRiskLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
  none: 0
};

function buildResourceGroupOwnerCandidates(
  group: AzureResourceGroup,
  ownerRow: OwnerReportRow
): OwnerCandidate[] {
  const owner = ownerRow.owner?.trim();

  if (!owner) {
    return [];
  }

  return rankOwnerCandidates([
    {
      key: getOwnerCandidateKey(owner, inferOwnerType(owner, ownerRow.source)),
      displayName: owner,
      type: inferOwnerType(owner, ownerRow.source),
      confidence: ownerRow.confidence,
      source: inferOwnerCandidateSource(ownerRow.source),
      rank: 0,
      evidence: [...ownerRow.evidence],
      relatedScopes: [
        {
          subscriptionId: group.subscriptionId,
          subscriptionName: group.subscriptionName,
          resourceGroup: group.resourceGroup
        }
      ]
    }
  ]);
}

export function applyResourceGroupOwnerDisabledEvidence(
  ownerRows: OwnerReportRow[],
  disabledKeys: ReadonlySet<string>
): OwnerReportRow[] {
  return ownerRows.map((row) => {
    if (row.kind !== "resourceGroup") {
      return row;
    }

    if (!row.source.startsWith("activity.")) {
      const owner = row.owner?.trim();
      const disabledCandidate =
        owner ? disabledKeys.has(getResourceGroupOwnerCandidateDisabledKey(row, owner)) : false;
      if (!disabledCandidate) {
        return row;
      }

      return {
        ...row,
        owner: null,
        confidence: "none",
        evidence: row.evidence.map((entry) => ({ ...entry, disabled: true }))
      };
    }

    const evidence = row.evidence.map((entry) => ({
      ...entry,
      disabled:
        disabledKeys.has(getResourceGroupOwnerCandidateDisabledKey(row, entry.user)) ||
        isDefaultDisabledOwnerEvidence(entry) ||
        undefined
    }));
    const activeEvidence = evidence.filter((entry) => !entry.disabled);

    if (activeEvidence.length === 0) {
      return {
        ...row,
        owner: null,
        confidence: "none",
        evidence
      };
    }

    return {
      ...row,
      owner: activeEvidence[0].user,
      confidence: "low",
      evidence
    };
  });
}

function buildResourceGroupOwnerIndex(ownerRows: OwnerReportRow[]): Map<string, OwnerReportRow> {
  const index = new Map<string, OwnerReportRow>();

  for (const row of ownerRows) {
    if (row.kind === "resourceGroup" && row.resourceGroup) {
      const key = getResourceGroupOwnerIndexKey(row.subscriptionId, row.resourceGroup);
      const existing = index.get(key);
      index.set(key, existing ? getPreferredOwnerRow(existing, row) : row);
    }
  }

  return index;
}

function getPreferredOwnerRow(existing: OwnerReportRow, next: OwnerReportRow): OwnerReportRow {
  const existingActiveEvidenceRank = getActiveEvidenceRank(existing);
  const nextActiveEvidenceRank = getActiveEvidenceRank(next);

  return nextActiveEvidenceRank > existingActiveEvidenceRank ||
    (
      nextActiveEvidenceRank === existingActiveEvidenceRank &&
      OWNER_CONFIDENCE_RANK[next.confidence] > OWNER_CONFIDENCE_RANK[existing.confidence]
    )
    ? next
    : existing;
}

function getActiveEvidenceRank(row: OwnerReportRow): number {
  return row.evidence.length === 0 || row.evidence.some((evidence) => !evidence.disabled) ? 1 : 0;
}

function getResourceGroupOwnerIndexKey(subscriptionId: string, resourceGroup: string): string {
  return `${subscriptionId.toLowerCase()}:${resourceGroup.toLowerCase()}`;
}

function getResourceGroupTargetKey(subscriptionId: string, resourceGroup: string): string {
  return ["resourceGroup", subscriptionId.toLowerCase(), resourceGroup.toLowerCase()].join(":");
}

function getOwnerCandidateKey(owner: string, type: OwnerType): string {
  return `${type}:${owner.trim().toLowerCase()}`;
}

function inferOwnerType(owner: string, source: string): OwnerType {
  const tagName = getOwnerTagSourceName(source);

  if (tagName === "ownerGroup") {
    return "ownerGroup";
  }

  if (tagName === "ownerUser") {
    return "ownerUser";
  }

  if (tagName) {
    return "ownerTag";
  }

  if (owner.includes("@")) {
    return "ownerUser";
  }

  return "unknown";
}

function getOwnerTagSourceName(source: string): string | null {
  const tagName = source.match(/^tag\.(.+)$/)?.[1];

  if (!tagName) {
    return null;
  }

  return appConfig.azure.ownership.ownerTags.some((tag) => tag.name === tagName) ? tagName : null;
}

function inferOwnerCandidateSource(source: string): OwnerCandidateSource {
  if (source.startsWith("activity.")) {
    return "activity";
  }

  if (source.startsWith("tag.")) {
    return "tag";
  }

  return "resourceGroupOwner";
}

function getResourceGroupOwnerCandidateDisabledKey(
  row: Pick<OwnerReportRow, "targetKey" | "source">,
  owner: string
): string {
  return [row.targetKey, getOwnerCandidateKey(owner, inferOwnerType(owner, row.source))].join(":");
}

function isDefaultDisabledOwnerEvidence(evidence: Pick<OwnerEvidence, "user">): boolean {
  return !evidence.user.includes("@");
}
