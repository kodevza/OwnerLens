import { ExportService } from "../ExportService";
import { AzureResourcesCollectionQueryService } from "./AzureResourcesCollectionQueryService";
import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";

test("exports resource group ownership CSV from a large paginated ownership query", async () => {
  const queryAzureResourceGroupOwnershipCollectionRows = jest.fn().mockResolvedValue([
    ownershipRow("sub-1", "rg-a", "alice@example.test"),
    ownershipRow("sub-1", "rg-b", "bob@example.test")
  ]);
  const service = new AzureResourcesCollectionQueryService({
    entra: {} as never,
    azureResources: {
      queryAzureResourceGroupOwnershipCollectionRows
    } as never,
    disabledEvidenceStore: {} as never,
    exportService: new ExportService()
  });

  const csv = await service.exportResourceGroupOwnershipCsv({
    page: 1,
    pageSize: 1,
    sortRules: [{ columnId: "resourceGroup", direction: "asc" }],
    selectedRowKeys: ["sub-1:rg-b"]
  });

  expect(queryAzureResourceGroupOwnershipCollectionRows).toHaveBeenCalledWith({
    filters: undefined,
    sortRules: [{ columnId: "resourceGroup", direction: "asc" }],
    selectedRowKeys: ["sub-1:rg-b"]
  });
  expect(csv.count).toBe(2);
  expect(csv.body).toContain("rg-a");
  expect(csv.body).toContain("rg-b");
});

function ownershipRow(
  subscriptionId: string,
  resourceGroup: string,
  owner: string
): ResourceGroupOwnershipRow {
  return {
    subscriptionId,
    subscriptionName: "Subscription 1",
    resourceGroup,
    location: "westeurope",
    tags: null,
    targetKey: `${subscriptionId}:${resourceGroup}`,
    ownerCandidates: [
      {
        key: `resourceGroup:${subscriptionId}:${resourceGroup}:ownerUser:${owner}`,
        displayName: owner,
        type: "ownerUser",
        confidence: "high",
        source: "tag",
        rank: 1,
        evidence: [{ user: owner, date: null }],
        relatedScopes: []
      }
    ],
    owner,
    confidence: "high",
    source: "tag.owner",
    evidence: [{ user: owner, date: null }],
    roleAssignments: [],
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none"
  };
}
