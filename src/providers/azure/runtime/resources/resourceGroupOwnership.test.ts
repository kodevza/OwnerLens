import type { AzureResourceGroup } from "../../../../core/azure/resources";
import type { OwnerReportRow } from "../../ownership/azureOwnerReportTypes";
import { buildResourceGroupOwnershipRows } from "./resourceGroupOwnership";

test("classifies configured non-principal owner tags as ownerTag", () => {
  const [row] = buildResourceGroupOwnershipRows(
    [resourceGroup("rg-cost-center")],
    [ownerRow("rg-cost-center", "tag.costCenter", "cc-1001", "high")]
  );

  expect(row.ownerCandidates).toEqual([
    expect.objectContaining({
      key: "ownerTag:cc-1001",
      displayName: "cc-1001",
      type: "ownerTag",
      confidence: "high",
      evidence: [{ user: "costCenter=cc-1001", date: null }]
    })
  ]);
});

test("classifies configured ownerGroup tag as ownerGroup", () => {
  const [row] = buildResourceGroupOwnershipRows(
    [resourceGroup("rg-platform")],
    [ownerRow("rg-platform", "tag.ownerGroup", "platform-team", "high")]
  );

  expect(row.ownerCandidates).toEqual([
    expect.objectContaining({
      key: "ownerGroup:platform-team",
      displayName: "platform-team",
      type: "ownerGroup",
      confidence: "high",
      evidence: [{ user: "ownerGroup=platform-team", date: null }]
    })
  ]);
});

function resourceGroup(resourceGroupName: string): AzureResourceGroup {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription 1",
    resourceGroup: resourceGroupName,
    location: "westeurope",
    tags: null
  };
}

function ownerRow(
  resourceGroupName: string,
  source: string,
  owner: string,
  confidence: OwnerReportRow["confidence"]
): OwnerReportRow {
  const tagName = source.replace(/^tag\./, "");

  return {
    kind: "resourceGroup",
    targetKey: `resourceGroup:sub-1:${resourceGroupName}`,
    subscriptionId: "sub-1",
    subscriptionName: "Subscription 1",
    resourceGroup: resourceGroupName,
    owner,
    confidence,
    source,
    evidence: [{ user: `${tagName}=${owner}`, date: null }]
  };
}
