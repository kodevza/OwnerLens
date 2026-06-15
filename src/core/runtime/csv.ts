export type RuntimeCsvRow = Record<string, unknown>;

export type RuntimeCsvColumn =
  | string
  | {
      id: string;
      header?: string;
    };

export type RuntimeCsvOptions = {
  columns?: readonly RuntimeCsvColumn[];
  includeBom?: boolean;
};

export function serializeRuntimeCsv(rows: readonly RuntimeCsvRow[], options: RuntimeCsvOptions = {}): string {
  const columns = resolveRuntimeCsvColumns(rows, options.columns);

  if (columns.length === 0) {
    return options.includeBom ? "\uFEFF" : "";
  }

  const header = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(row[column.id])).join(","));
  const csv = [header, ...body].join("\n");

  return options.includeBom ? `\uFEFF${csv}` : csv;
}

function resolveRuntimeCsvColumns(
  rows: readonly RuntimeCsvRow[],
  columns: readonly RuntimeCsvColumn[] | undefined
): Array<{ id: string; header: string }> {
  if (columns) {
    return columns.map((column) => (typeof column === "string" ? { id: column, header: column } : { ...column, header: column.header ?? column.id }));
  }

  const ids = new Set<string>();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      ids.add(column);
    }
  }

  return [...ids].map((id) => ({ id, header: id }));
}

function escapeCsvValue(value: unknown): string {
  const text = formatCsvValue(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
