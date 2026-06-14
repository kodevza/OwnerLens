import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import { applyRuntimeCollectionFilters, buildPaginatedCollection } from "./localReportCollections";

const rows: Record<string, unknown>[] = [
  {
    id: "object-row",
    RelatedObjects: {
      id: "sp-1",
      displayName: "Payroll API",
      servicePrincipalType: "Application"
    }
  },
  {
    id: "array-row",
    RelatedObjects: [
      {
        id: "mi-1",
        displayName: "Worker identity",
        servicePrincipalType: "ManagedIdentity"
      },
      {
        id: "sp-2",
        displayName: "Billing API",
        servicePrincipalType: "Application"
      }
    ]
  }
];

test("filters runtime rows by dotted paths over object values", () => {
  expect(
    applyRuntimeCollectionFilters(rows, ["id", "RelatedObjects"], [
      { column: "RelatedObjects.displayName", values: ["Payroll"] }
    ]).map((row) => row.id)
  ).toEqual(["object-row"]);
});

test("filters runtime rows by dotted paths over arrays of objects", () => {
  expect(
    applyRuntimeCollectionFilters(rows, ["id", "RelatedObjects"], [
      { column: "RelatedObjects.id", values: ["sp-2"] }
    ]).map((row) => row.id)
  ).toEqual(["array-row"]);
});

test("ANDs multiple runtime filters and ORs values for one path", () => {
  expect(
    applyRuntimeCollectionFilters(rows, ["id", "RelatedObjects"], [
      { column: "RelatedObjects.id", values: ["sp-1", "sp-2"] },
      { column: "RelatedObjects.servicePrincipalType", values: ["Application"] }
    ]).map((row) => row.id)
  ).toEqual(["object-row", "array-row"]);
});

test("matches no runtime rows for invalid regular expressions", () => {
  expect(
    applyRuntimeCollectionFilters(rows, ["id", "RelatedObjects"], [
      { column: "RelatedObjects.id", values: ["["] }
    ])
  ).toEqual([]);
});

test("throws 400 for unknown dotted runtime filter root columns", () => {
  expect(() =>
    applyRuntimeCollectionFilters(rows, ["id", "RelatedObjects"], [
      { column: "Unknown.id", values: ["sp-1"] }
    ])
  ).toThrow(RuntimeHttpError);
});

test("sorts runtime rows before pagination", () => {
  const collection = buildPaginatedCollection(
    "test",
    [
      { id: "third", displayName: "Gamma 10" },
      { id: "first", displayName: "Alpha 2" },
      { id: "second", displayName: "Alpha 10" }
    ],
    {
      page: 1,
      pageSize: 2,
      sortRules: [{ columnId: "displayName", direction: "asc" }]
    }
  );

  expect(collection.rows.map((row) => row.id)).toEqual(["first", "second"]);
  expect(collection.count).toBe(3);
});

test("sorts runtime rows by multiple rules and dotted paths", () => {
  const collection = buildPaginatedCollection(
    "test",
    [
      { id: "first", owner: { confidence: "low", name: "Bob" } },
      { id: "second", owner: { confidence: "high", name: "Alice" } },
      { id: "third", owner: { confidence: "high", name: "Charlie" } }
    ],
    {
      sortRules: [
        { columnId: "owner.confidence", direction: "asc" },
        { columnId: "owner.name", direction: "desc" }
      ]
    }
  );

  expect(collection.rows.map((row) => row.id)).toEqual(["third", "second", "first"]);
});

test("throws 400 for unknown runtime sort columns", () => {
  expect(() =>
    buildPaginatedCollection("test", rows, {
      sortRules: [{ columnId: "Unknown.id", direction: "asc" }]
    })
  ).toThrow(RuntimeHttpError);
});
