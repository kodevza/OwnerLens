import {
  applyColumnObjectFieldFilter,
  applyColumnFilterOpen,
  applyColumnFilterValueToggle,
  applyColumnValueToggle,
  applyReportTableControls
} from "./reportTableControls.tsx";
import type { ReportFieldDescriptor } from "../reportTypes.ts";

type Row = {
  id: string;
  ownership: "External" | "Tenant owned" | "Unknown";
  risk: "high" | "low" | "none";
  relatedObjects?: Array<{ id: string; displayName?: string; servicePrincipalType?: string }>;
};

const rows: Row[] = [
  { id: "external-low", ownership: "External", risk: "low" },
  { id: "tenant-high", ownership: "Tenant owned", risk: "high" },
  { id: "tenant-low", ownership: "Tenant owned", risk: "low" },
  { id: "tenant-none", ownership: "Tenant owned", risk: "none" },
  { id: "unknown-high", ownership: "Unknown", risk: "high" }
];

const fields: ReportFieldDescriptor<Row>[] = [
  {
    id: "ownership",
    label: "Ownership",
    valueType: "text",
    getValue: (row) => row.ownership
  },
  {
    id: "risk",
    label: "Permission risk",
    valueType: "riskLevel",
    getValue: (row) => row.risk
  }
];

const objectRows: Row[] = [
  {
    id: "app-one",
    ownership: "Tenant owned",
    risk: "high",
    relatedObjects: [{ id: "sp-1", displayName: "Payroll API", servicePrincipalType: "Application" }]
  },
  {
    id: "mi-one",
    ownership: "Tenant owned",
    risk: "low",
    relatedObjects: [{ id: "mi-1", displayName: "Worker identity", servicePrincipalType: "ManagedIdentity" }]
  }
];

const objectFields: ReportFieldDescriptor<Row>[] = [
  {
    id: "relatedObjects",
    label: "Related objects",
    valueType: "list",
    getValue: (row) => row.relatedObjects,
    filter: {
      kind: "objectFields",
      fields: [
        { id: "id", label: "ID" },
        { id: "displayName", label: "Display name" },
        { id: "servicePrincipalType", label: "Service principal type" }
      ]
    }
  }
];

test("applies multiple column value filters", () => {
  const result = applyReportTableControls(rows, fields, {
    ownership: { type: "values", values: ["External", "Tenant owned"] },
    risk: { type: "values", values: ["low", "high"] }
  });

  expect(result.controlledRows.map((row) => row.id)).toEqual(["external-low", "tenant-high", "tenant-low"]);
});

test("applies text column filters as regular expressions", () => {
  const result = applyReportTableControls(rows, fields, {
    ownership: { type: "text", value: "^tenant\\s+owned$" }
  });

  expect(result.controlledRows.map((row) => row.id)).toEqual(["tenant-high", "tenant-low", "tenant-none"]);
});

test("constructs filters from column value toggles", () => {
  const constructedFilters = applyColumnFilterValueToggle(
    applyColumnFilterValueToggle(
      applyColumnFilterValueToggle(applyColumnFilterValueToggle({}, "ownership", "External", true), "ownership", "Tenant owned", true),
      "risk",
      "low",
      true
    ),
    "risk",
    "high",
    true
  );

  expect(constructedFilters).toEqual({
    ownership: { type: "values", values: ["External", "Tenant owned"] },
    risk: { type: "values", values: ["low", "high"] }
  });

  expect(applyReportTableControls(rows, fields, constructedFilters).controlledRows.map((row) => row.id)).toEqual([
    "external-low",
    "tenant-high",
    "tenant-low"
  ]);
});

test("constructs object-field filters and removes empty conditions", () => {
  const constructedFilters = applyColumnObjectFieldFilter({}, "relatedObjects", [
    { fieldId: "id", value: "sp-1" },
    { fieldId: "displayName", value: " " }
  ]);

  expect(constructedFilters).toEqual({
    relatedObjects: {
      type: "objectFields",
      conditions: [{ fieldId: "id", value: "sp-1" }]
    }
  });

  expect(applyColumnObjectFieldFilter(constructedFilters, "relatedObjects", [])).toEqual({});
});

test("applies object-field filters with AND conditions", () => {
  const result = applyReportTableControls(objectRows, objectFields, {
    relatedObjects: {
      type: "objectFields",
      conditions: [
        { fieldId: "id", value: "^sp-" },
        { fieldId: "servicePrincipalType", value: "Application" }
      ]
    }
  });

  expect(result.controlledRows.map((row) => row.id)).toEqual(["app-one"]);
});

test("matches no local rows for invalid object-field regular expressions", () => {
  const result = applyReportTableControls(objectRows, objectFields, {
    relatedObjects: {
      type: "objectFields",
      conditions: [{ fieldId: "id", value: "[" }]
    }
  });

  expect(result.controlledRows).toEqual([]);
});

test("keeps only one column filter popover open", () => {
  const openFilterColumnId = applyColumnFilterOpen(
    applyColumnFilterOpen(applyColumnFilterOpen(null, "ownership", true), "risk", true),
    "ownership",
    false
  );

  expect(openFilterColumnId).toBe("risk");
});

test("toggles column values", () => {
  expect(applyColumnValueToggle(["External"], "Tenant owned", true)).toEqual(["External", "Tenant owned"]);

  expect(applyColumnValueToggle(["External", "Tenant owned"], "External", false)).toEqual(["Tenant owned"]);
});

test("applies descriptor-backed ownership and permission risk filters through table columns", () => {
  const fields: ReportFieldDescriptor<Row>[] = [
    {
      id: "ownership",
      label: "Ownership",
      valueType: "text",
      getValue: (row) => row.ownership,
      filter: {
        kind: "multiSelect",
        options: ["External", "Tenant owned", "Unknown"]
      }
    },
    {
      id: "permissionRisk",
      label: "Permission risk",
      valueType: "riskLevel",
      getValue: (row) => row.risk,
      filter: {
        kind: "multiSelect",
        options: ["high", "low", "none"]
      }
    }
  ];
  const result = applyReportTableControls(rows, fields, {
    ownership: { type: "values", values: ["External", "Tenant owned"] },
    permissionRisk: { type: "values", values: ["low", "high"] }
  });

  expect(result.controlledRows.map((row) => row.id)).toEqual([
    "external-low",
    "tenant-high",
    "tenant-low"
  ]);
  expect(result.controlledRows.every((row) => ["External", "Tenant owned"].includes(row.ownership))).toBe(true);
});

test("uses descriptor filter values for options and filtering without changing display values", () => {
  const fields: ReportFieldDescriptor<Row>[] = [
    {
      id: "riskSummary",
      label: "Risk summary",
      valueType: "text",
      getValue: (row) => `Rendered ${row.risk}`,
      getFilterValue: (row) => row.risk,
      filter: {
        kind: "multiSelect",
        options: ["high", "low", "none"]
      }
    }
  ];

  const result = applyReportTableControls(rows, fields, {
    riskSummary: { type: "values", values: ["high"] }
  });

  expect(result.filterOptions.riskSummary).toEqual(["high", "low", "none"]);
  expect(result.controlledRows.map((row) => row.id)).toEqual(["tenant-high", "unknown-high"]);
});

test("uses configured multiselect options instead of narrowing options to filtered rows", () => {
  const fields: ReportFieldDescriptor<Row>[] = [
    {
      id: "ownership",
      label: "Ownership",
      valueType: "text",
      getValue: (row) => row.ownership,
      filter: {
        kind: "multiSelect",
        options: ["External", "Tenant owned", "Unknown"]
      }
    }
  ];

  const result = applyReportTableControls(rows, fields, {
    ownership: { type: "values", values: ["External"] }
  });

  expect(result.controlledRows.map((row) => row.id)).toEqual(["external-low"]);
  expect(result.filterOptions.ownership).toEqual(["External", "Tenant owned", "Unknown"]);
});
