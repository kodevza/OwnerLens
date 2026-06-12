import { formatDate } from "./utils";

test("formats dates as canonical ISO timestamps", () => {
  expect(formatDate("2026-06-12T10:00:00.000Z")).toBe("2026-06-12T10:00:00.000Z");
  expect(formatDate("2026-06-02T16:06:31.305+02:00")).toBe("2026-06-02T14:06:31.305Z");
});

test("keeps invalid date strings visible", () => {
  expect(formatDate("not-a-date")).toBe("not-a-date");
  expect(formatDate(null)).toBe("-");
});
