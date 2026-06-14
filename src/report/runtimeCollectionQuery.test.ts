import { appendRuntimeCollectionFilters } from "./runtimeCollectionQuery";

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
