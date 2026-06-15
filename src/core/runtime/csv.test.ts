import { serializeRuntimeCsv } from "./csv";

test("serializes CSV rows with discovered columns", () => {
  expect(
    serializeRuntimeCsv([
      { name: "Alice", count: 2 },
      { name: "Bob", count: 3 }
    ])
  ).toBe("name,count\nAlice,2\nBob,3");
});

test("escapes commas, quotes, and new lines", () => {
  expect(serializeRuntimeCsv([{ name: 'Alice "A"', note: "one,two\nthree" }])).toBe(
    'name,note\n"Alice ""A""","one,two\nthree"'
  );
});

test("keeps header when rows are empty and columns are provided", () => {
  expect(serializeRuntimeCsv([], { columns: ["id", { id: "displayName", header: "Display name" }] })).toBe(
    "id,Display name"
  );
});

test("serializes nested values as JSON", () => {
  expect(serializeRuntimeCsv([{ id: "1", tags: ["owner", "prod"], meta: { risk: "high" } }])).toBe(
    'id,tags,meta\n1,"[""owner"",""prod""]","{""risk"":""high""}"'
  );
});
