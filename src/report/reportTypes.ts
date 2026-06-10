export type ReportColumnHelp = {
  source: string;
  field?: string;
  logic?: string[];
};

export type ReportValueType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "list"
  | "riskLevel"
  | "ownerConfidence"
  | "details";

export type ReportDetailsValue = {
  title: string;
  details: Array<{ label: string; value: string }>;
  searchText?: string;
};

export type ReportFilterDescriptor = {
  kind: "text" | "multiSelect";
  options?: readonly string[];
};

export type ReportFieldDescriptor<TRow> = {
  id: string;
  label: string;
  help?: ReportColumnHelp;
  valueType: ReportValueType;
  getValue: (row: TRow) => unknown;
  getFilterValue?: (row: TRow) => unknown;
  filterColumnId?: string;
  searchable?: boolean;
  filter?: ReportFilterDescriptor;
};

export type ReportExportFormat = "json" | "csv";

export type ReportExportArtifact =
  | {
      kind: "json";
      fileName: string;
      data: unknown;
    }
  | {
      kind: "csv";
      fileName: string;
      rows: ReportCsvRow[];
    };

export type ReportCsvRow = Record<string, unknown>;
