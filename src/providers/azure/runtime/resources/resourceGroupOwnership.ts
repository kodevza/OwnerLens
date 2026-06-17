import { appConfig } from "../../../../core/config";
import { rankOwnerCandidates } from "../../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnerType
} from "../../../../core/ownership/types";
import type { AzureResourceGroup, ResourceGroupOwnershipRow } from "../../../../core/azure/resources";
import type { OwnerReportRow } from "../../ownership/azureOwnerReportTypes";

export function buildResourceGroupOwnershipRows(
  resourceGroups: AzureResourceGroup[],
  ownerRows: OwnerReportRow[]
): ResourceGroupOwnershipRow[] {
  const ownerIndex = buildResourceGroupOwnerIndex(ownerRows);

  return resourceGroups.map((group) => {
    const ownerRow = ownerIndex.get(getResourceGroupOwnerIndexKey(group.subscriptionId, group.resourceGroup));

    return {
      ...group,
      targetKey: ownerRow?.targetKey ?? getResourceGroupTargetKey(group.subscriptionId, group.resourceGroup),
      ownerCandidates: ownerRow ? buildResourceGroupOwnerCandidates(group, ownerRow) : [],
      owner: ownerRow?.owner ?? null,
      confidence: ownerRow?.confidence ?? "none",
      source: ownerRow?.source ?? "none",
      evidence: ownerRow?.evidence ?? []
    };
  });
}

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
    if (row.kind !== "resourceGroup" || !row.source.startsWith("activity.")) {
      return row;
    }

    const evidence = row.evidence.map((entry) => ({
      ...entry,
      disabled:
        isDefaultDisabledOwnerEvidence(entry) ||
        disabledKeys.has(getResourceGroupOwnerEvidenceKey(row, entry)) ||
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
      index.set(getResourceGroupOwnerIndexKey(row.subscriptionId, row.resourceGroup), row);
    }
  }

  return index;
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

function getResourceGroupOwnerEvidenceKey(
  row: Pick<OwnerReportRow, "targetKey">,
  evidence: Pick<OwnerEvidence, "user" | "date">
): string {
  return [row.targetKey, evidence.user.trim().toLowerCase(), evidence.date ?? ""].join(":");
}

function isDefaultDisabledOwnerEvidence(evidence: Pick<OwnerEvidence, "user">): boolean {
  return !evidence.user.includes("@");
}
