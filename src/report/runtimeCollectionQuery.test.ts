import { appendRuntimeCollectionFilters, appendRuntimeCollectionSortRules } from "./runtimeCollectionQuery";

test("serializes object-field filters as dotted runtime filter columns", () => {
  const url = new URL("http://localhost/api/data/zeroTrustAssessment/report");

  appendRuntimeCollectionFilters(url, {
    RelatedObjects: {
      type: "objectFields",
      conditions: [
        { fieldId: "id", value: "sp-1" },
        { fieldId: "tags", value: "HideApp" },
        { fieldId: "displayName", value: " " }
      ]
    }
  });

  expect(url.searchParams.get("filter[0][column]")).toBe("RelatedObjects.id");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("sp-1");
  expect(url.searchParams.get("filter[1][column]")).toBe("RelatedObjects.tags");
  expect(url.searchParams.get("filter[1][value][0]")).toBe("HideApp");
  expect(url.searchParams.get("filter[2][column]")).toBeNull();
});

test("serializes text filters with their source column", () => {
  const url = new URL("http://localhost/api/data/entra/servicePrincipals");

  appendRuntimeCollectionFilters(url, {
    displayName: { type: "text", value: "app" }
  });

  expect(url.searchParams.get("filter[0][column]")).toBe("displayName");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("app");
});

test("serializes value filters with multiple values", () => {
  const url = new URL("http://localhost/api/data/entra/servicePrincipals");

  appendRuntimeCollectionFilters(url, {
    accountEnabled: { type: "values", values: ["true", "false"] }
  });

  expect(url.searchParams.get("filter[0][column]")).toBe("accountEnabled");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("true");
  expect(url.searchParams.get("filter[0][value][1]")).toBe("false");
});

test("keeps remapped object-field filter columns as absolute runtime paths", () => {
  const url = new URL("http://localhost/api/data/zeroTrustAssessment/report");

  appendRuntimeCollectionFilters(url, {
    RelatedObjects: {
      type: "objectFields",
      conditions: [{ fieldId: "RelatedObjects.object_id", value: "sp-1" }]
    }
  });

  expect(url.searchParams.get("filter[0][column]")).toBe("RelatedObjects.object_id");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("sp-1");
});

test("serializes runtime sort rules", () => {
  const url = new URL("http://localhost/api/data/entra/servicePrincipals");

  appendRuntimeCollectionSortRules(url, [
    { columnId: "displayName", direction: "asc" },
    { columnId: "permissionRisk", direction: "desc" }
  ]);

  expect(url.searchParams.get("sort[0][column]")).toBe("displayName");
  expect(url.searchParams.get("sort[0][direction]")).toBe("asc");
  expect(url.searchParams.get("sort[1][column]")).toBe("permissionRisk");
  expect(url.searchParams.get("sort[1][direction]")).toBe("desc");
});
