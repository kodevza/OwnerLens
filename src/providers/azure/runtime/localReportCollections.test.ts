import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import { applyRuntimeCollectionFilters } from "./localReportCollections";

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
