import type { OwnerCandidate, OwnerCandidateSource, OwnerConfidence } from "./types";

const CONFIDENCE_WEIGHT: Record<OwnerConfidence, number> = {
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
  tag: 5
};

export function rankOwnerCandidates(candidates: OwnerCandidate[]): OwnerCandidate[] {
  return [...candidates]
    .sort(compareOwnerCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1
    }));
}

function compareOwnerCandidates(left: OwnerCandidate, right: OwnerCandidate): number {
  return (
    compareDescending(CONFIDENCE_WEIGHT[left.confidence], CONFIDENCE_WEIGHT[right.confidence]) ||
    compareDescending(SOURCE_WEIGHT[left.source], SOURCE_WEIGHT[right.source]) ||
    compareDescending(left.relatedScopes.length, right.relatedScopes.length) ||
    compareDescending(left.evidence.length, right.evidence.length) ||
    left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" })
  );
}

function compareDescending(left: number, right: number): number {
  return right - left;
}
