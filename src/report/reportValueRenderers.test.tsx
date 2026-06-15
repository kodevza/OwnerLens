import type { ReportFieldDescriptor } from "./reportTypes";
import { renderReportValue } from "./reportValueRenderers";

type Row = {
  createdAt: string;
};

test("renders date fields as canonical ISO timestamps", () => {
  const field: ReportFieldDescriptor<Row> = {
    id: "createdAt",
    label: "Created",
    valueType: "date",
    getValue: (row) => row.createdAt
  };

  expect(renderReportValue(field, { createdAt: "2026-06-02T16:06:31.305+02:00" })).toBe(
    "2026-06-02T14:06:31.305Z"
  );
});
