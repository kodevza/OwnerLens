import { ExportService } from "../ExportService";
import { AzureResourcesCollectionQueryService } from "./AzureResourcesCollectionQueryService";
import type { AzureResourceGroupOwnershipSqlRow } from "./tables";

test("exports resource group ownership CSV from a large paginated ownership query", async () => {
  const readAzureResourceGroupOwnershipCollectionSqlRows = jest.fn().mockResolvedValue([
    ownershipSqlRow("sub-1", "rg-a", "alice@example.test"),
    ownershipSqlRow("sub-1", "rg-b", "bob@example.test")
  ]);
  const service = new AzureResourcesCollectionQueryService({
    entra: {} as never,
    azureResources: {
      readAzureResourceGroupOwnershipCollectionSqlRows
    } as never,
    disabledEvidenceStore: {} as never,
    exportService: new ExportService()
  });

  const csv = await service.exportResourceGroupOwnershipCsv({
    page: 1,
    pageSize: 1,
    sortRules: [{ columnId: "resourceGroup", direction: "asc" }]
  });

  expect(readAzureResourceGroupOwnershipCollectionSqlRows).toHaveBeenCalledWith(10000);
  expect(csv.count).toBe(2);
  expect(csv.body).toContain("rg-a");
  expect(csv.body).toContain("rg-b");
});

function ownershipSqlRow(
  subscriptionId: string,
  resourceGroup: string,
  owner: string
): AzureResourceGroupOwnershipSqlRow {
  return {
    subscriptionId,
    subscriptionName: "Subscription 1",
    resourceGroup,
    location: "westeurope",
    tags: null,
    targetKey: `${subscriptionId}:${resourceGroup}`,
    kind: "resourceGroup",
    owner,
    ownerCandidate: owner,
    ownerDisplayName: owner,
    principalId: null,
    confidence: "high",
    source: "tag.owner",
    evidence: [{ user: owner, date: null }]
  };
}
