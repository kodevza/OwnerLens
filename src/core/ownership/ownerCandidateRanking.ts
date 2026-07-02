import type { OwnerCandidate, OwnerCandidateSource, OwnerConfidence } from "./types";

export const OWNER_CONFIDENCE_RANK: Record<OwnerConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

const SOURCE_WEIGHT: Record<OwnerCandidateSource, number> = {
  activity: 1,
  subscriptionOwner: 2,
  entraServicePrincipalOwner: 3,
  entraApplicationOwner: 4,
  resourceGroupOwner: 5,
  tag: 5,
  ownerCustom: 5
};

export function rankOwnerCandidates(candidates: OwnerCandidate[]): OwnerCandidate[] {
  return [...candidates]
    .sort(compareOwnerCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }));
}

export function maxOwnerConfidence(left: OwnerConfidence, right: OwnerConfidence): OwnerConfidence {
  return OWNER_CONFIDENCE_RANK[left] >= OWNER_CONFIDENCE_RANK[right] ? left : right;
}

function compareOwnerCandidates(left: OwnerCandidate, right: OwnerCandidate): number {
  return (
    compareDescending(getActiveEvidenceRank(left), getActiveEvidenceRank(right)) ||
    compareDescending(OWNER_CONFIDENCE_RANK[left.confidence], OWNER_CONFIDENCE_RANK[right.confidence]) ||
    compareDescending(SOURCE_WEIGHT[left.source], SOURCE_WEIGHT[right.source]) ||
    compareDescending(left.relatedScopes.length, right.relatedScopes.length) ||
    compareDescending(left.evidence.length, right.evidence.length) ||
    left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" })
  );
}

function getActiveEvidenceRank(candidate: OwnerCandidate): number {
  return candidate.evidence.length === 0 || candidate.evidence.some((evidence) => !evidence.disabled) ? 1 : 0;
}

function compareDescending(left: number, right: number): number {
  return right - left;
}
