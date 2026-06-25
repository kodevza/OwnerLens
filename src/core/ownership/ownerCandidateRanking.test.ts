import { rankOwnerCandidates } from "./ownerCandidateRanking";
import type { OwnerCandidate } from "./types";

test("ranks active owner candidates ahead of stronger inactive candidates", () => {
  const [first, second] = rankOwnerCandidates([
    ownerCandidate("inactive-platform-team", "platform-team", "high", true),
    ownerCandidate("active-app-team", "app-team", "medium", false)
  ]);

  expect(first).toEqual(
    expect.objectContaining({
      key: "active-app-team",
      rank: 1
    })
  );
  expect(second).toEqual(
    expect.objectContaining({
      key: "inactive-platform-team",
      rank: 2
    })
  );
});

test("keeps the strongest owner candidate first when all candidates are inactive", () => {
  const [first, second] = rankOwnerCandidates([
    ownerCandidate("inactive-app-team", "app-team", "medium", true),
    ownerCandidate("inactive-platform-team", "platform-team", "high", true)
  ]);

  expect(first).toEqual(
    expect.objectContaining({
      key: "inactive-platform-team",
      rank: 1
    })
  );
  expect(second).toEqual(
    expect.objectContaining({
      key: "inactive-app-team",
      rank: 2
    })
  );
});

function ownerCandidate(
  key: string,
  displayName: string,
  confidence: OwnerCandidate["confidence"],
  disabled: boolean
): OwnerCandidate {
  return {
    key,
    displayName,
    type: "ownerGroup",
    confidence,
    source: "resourceGroupOwner",
    rank: 0,
    evidence: [{ user: displayName, date: null, disabled }],
    relatedScopes: []
  };
}
