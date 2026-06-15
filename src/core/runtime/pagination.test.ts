import { buildPage, buildPaginatedCollection } from "./pagination";

const rows = Array.from({ length: 75 }, (_, index) => ({ id: index + 1 }));

test("uses default page size of 50", () => {
  expect(buildPage(rows, {}).pageSize).toBe(50);
});

test("clamps page size to max 500", () => {
  const page = buildPage(Array.from({ length: 600 }, (_, index) => index), { pageSize: 1000 });

  expect(page.pageSize).toBe(500);
  expect(page.rows).toHaveLength(500);
});

test("clamps page to available range", () => {
  expect(buildPage(rows, { page: -1, pageSize: 25 }).page).toBe(1);
  expect(buildPage(rows, { page: 99, pageSize: 25 }).page).toBe(3);
});

test("returns count for all rows and only rows for the current page", () => {
  const page = buildPage(rows, { page: 2, pageSize: 10 });

  expect(page.count).toBe(75);
  expect(page.rows.map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
});

test("returns page one and zero count for empty rows", () => {
  expect(buildPage([], { page: 3 })).toEqual({
    rows: [],
    page: 1,
    pageSize: 50,
    count: 0
  });
});

test("builds a paginated collection with collection id and columns", () => {
  expect(buildPaginatedCollection("test", rows, ["id"], { page: 2, pageSize: 2 })).toEqual({
    collectionId: "test",
    columns: ["id"],
    rows: [{ id: 3 }, { id: 4 }],
    page: 2,
    pageSize: 2,
    count: 75
  });
});
