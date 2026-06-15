import { buildRuntimeCollectionCsvExport } from "./collectionExport";

test("builds filtered CSV export for runtime collection", () => {
  const exportArtifact = buildRuntimeCollectionCsvExport({
    collectionId: "test.collection",
    fileName: "test.csv",
    rows: [
      { id: "1", displayName: "Prod app", risk: "high" },
      { id: "2", displayName: "Dev app", risk: "low" }
    ],
    filters: [{ column: "risk", values: ["high"] }]
  });

  expect(exportArtifact).toEqual({
    kind: "csv",
    collectionId: "test.collection",
    fileName: "test.csv",
    contentType: "text/csv; charset=utf-8",
    body: "id,displayName,risk\n1,Prod app,high",
    columns: ["id", "displayName", "risk"],
    count: 1
  });
});

test("filters nested collection values", () => {
  const exportArtifact = buildRuntimeCollectionCsvExport({
    collectionId: "test.collection",
    fileName: "test.csv",
    rows: [
      { id: "1", owners: [{ email: "alice@example.com" }] },
      { id: "2", owners: [{ email: "bob@example.com" }] }
    ],
    filters: [{ column: "owners.email", values: ["alice"] }],
    columns: ["id", "owners"]
  });

  expect(exportArtifact.body).toBe('id,owners\n1,"[{""email"":""alice@example.com""}]"');
  expect(exportArtifact.count).toBe(1);
});

test("filters CSV export by exact selected row keys", () => {
  const exportArtifact = buildRuntimeCollectionCsvExport({
    collectionId: "test.collection",
    fileName: "test.csv",
    rows: [
      { id: "sp-1", displayName: "Prod app" },
      { id: "sp-10", displayName: "Prod worker" }
    ],
    selectedRowKeys: ["sp-1"],
    getRowKey: (row) => String(row.id ?? "")
  });

  expect(exportArtifact.body).toBe("id,displayName\nsp-1,Prod app");
  expect(exportArtifact.count).toBe(1);
});
