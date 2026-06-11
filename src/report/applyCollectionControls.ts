import { hasSearchExpression, matchesSearchExpression } from "../lib/searchFilterUtils";
import type { ReportDetailsValue, ReportFieldDescriptor } from "./reportTypes";

export type SortDirection = "asc" | "desc";

export type SortRule = {
  columnId: string;
  direction: SortDirection;
};

export type ColumnFilter =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "values";
      values: string[];
    };

export type ColumnFilters = Record<string, ColumnFilter>;
export type ColumnFilterOptions = Record<string, string[]>;

type ActiveFieldFilter<TRow> = {
  field: ReportFieldDescriptor<TRow>;
  filter: ColumnFilter;
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

export function applyCollectionControls<TRow>(
  rows: TRow[],
  fields: ReportFieldDescriptor<TRow>[],
  {
    query = "",
    filters = {},
    sortRules = []
  }: {
    query?: string;
    filters?: ColumnFilters;
    sortRules?: SortRule[];
  } = {}
) {
  const filterOptions = getConfiguredFilterOptions(fields);
  const searchedRows = applyCollectionSearch(rows, fields, query);
  const activeFilters = buildActiveFieldFilters(fields, filters);
  const filteredRows = applyCollectionFieldFilters(searchedRows, activeFilters);
  const controlledRows = applyCollectionSort(filteredRows, fields, sortRules);

  logCollectionControlDebug(rows, controlledRows, activeFilters, fields, filters);

  return {
    controlledRows,
    filterOptions
  };
}

export function getConfiguredFilterOptions<TRow>(fields: ReportFieldDescriptor<TRow>[]): ColumnFilterOptions {
  return Object.fromEntries(
    fields.map((field) => [field.id, field.filter?.options ? [...field.filter.options] : []])
  );
}

export function applyCollectionSearch<TRow>(
  rows: TRow[],
  fields: ReportFieldDescriptor<TRow>[],
  query: string
): TRow[] {
  if (!hasSearchExpression(query)) {
    return rows;
  }

  const searchableFields = fields.filter((field) => field.searchable !== false);

  return rows.filter((row) =>
    matchesSearchExpression(
      searchableFields.map((field) => formatReportSearchValue(field.getValue(row))).join(" "),
      query
    )
  );
}

function applyCollectionFieldFilters<TRow>(
  rows: TRow[],
  activeFilters: ActiveFieldFilter<TRow>[]
): TRow[] {
  if (activeFilters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    activeFilters.every(({ field, filter }) => {
      const fieldValue = formatControlValue(getFieldFilterValue(field, row));

      if (filter.type === "values") {
        return filter.values.includes(fieldValue);
      }

      return matchesSearchExpression(fieldValue, filter.value);
    })
  );
}

function getFieldFilterValue<TRow>(field: ReportFieldDescriptor<TRow>, row: TRow): unknown {
  return field.getFilterValue ? field.getFilterValue(row) : field.getValue(row);
}

function applyCollectionSort<TRow>(
  rows: TRow[],
  fields: ReportFieldDescriptor<TRow>[],
  sortRules: SortRule[]
): TRow[] {
  if (sortRules.length === 0) {
    return rows;
  }

  const fieldById = new Map(fields.map((field) => [field.id, field]));

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const rule of sortRules) {
        const field = fieldById.get(rule.columnId);
        if (!field) {
          continue;
        }

        const result = compareValues(field.getValue(left.row), field.getValue(right.row));
        if (result !== 0) {
          return rule.direction === "asc" ? result : -result;
        }
      }

      return left.index - right.index;
    })
    .map(({ row }) => row);
}

function buildActiveFieldFilters<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  filters: ColumnFilters
): ActiveFieldFilter<TRow>[] {
  return fields
    .map((field) => ({
      field,
      filter: filters[field.id]
    }))
    .filter((entry): entry is ActiveFieldFilter<TRow> => isActiveFilter(entry.filter));
}

function isActiveFilter(filter: ColumnFilter | undefined): boolean {
  if (!filter) {
    return false;
  }

  if (filter.type === "values") {
    return filter.values.length > 0;
  }

  return hasSearchExpression(filter.value);
}

function compareValues(left: unknown, right: unknown): number {
  const leftText = formatControlValue(left);
  const rightText = formatControlValue(right);

  if (!leftText && !rightText) {
    return 0;
  }

  if (!leftText) {
    return 1;
  }

  if (!rightText) {
    return -1;
  }

  return collator.compare(leftText, rightText);
}

export function formatControlValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(formatControlValue).filter(Boolean).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

export function formatReportSearchValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(formatReportSearchValue).filter(Boolean).join(", ");
  }

  if (isReportDetailsValue(value)) {
    return [
      value.searchText,
      value.title,
      ...value.details.flatMap((detail) => [detail.label, detail.value])
    ]
      .filter(Boolean)
      .join(" ");
  }

  return JSON.stringify(value);
}

function isReportDetailsValue(value: unknown): value is ReportDetailsValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    "details" in value &&
    Array.isArray((value as ReportDetailsValue).details)
  );
}

function logCollectionControlDebug<TRow>(
  rows: TRow[],
  controlledRows: TRow[],
  activeFilters: ActiveFieldFilter<TRow>[],
  fields: ReportFieldDescriptor<TRow>[],
  filters: ColumnFilters
): void {
  if (!isReportTableFilterDebugEnabled()) {
    return;
  }

  const activeFieldIds = new Set(activeFilters.map(({ field }) => field.id));
  const debugFields = fields.filter((field) => activeFieldIds.has(field.id));
  const controlledRowSet = new Set(controlledRows);

  console.groupCollapsed(
    `[OwnerLens table filters] ${controlledRows.length}/${rows.length} rows after ${activeFilters.length} filters`
  );
  console.log("filters", filters);
  console.log(
    "activeFilters",
    activeFilters.map(({ field, filter }) => ({
      columnId: field.id,
      label: field.label,
      filter
    }))
  );
  console.table(
    rows.map((row) => {
      const rowRecord = row as Record<string, unknown>;
      const debugRow: Record<string, unknown> = {
        included: controlledRowSet.has(row),
        id: rowRecord.id,
        displayName: rowRecord.displayName,
        appId: rowRecord.appId
      };

      for (const field of debugFields) {
        debugRow[field.id] = formatControlValue(field.getValue(row));
      }

      return debugRow;
    })
  );
  console.groupEnd();
}

function isReportTableFilterDebugEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem("ownerLensDebugTableFilters") === "1"
  );
}
