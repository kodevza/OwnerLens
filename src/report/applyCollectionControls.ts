import { hasSearchExpression, matchesSearchExpression } from "../core/searchFilterUtils";
import type { ColumnFilter, ColumnFilterOptions, ColumnFilters, SortRule } from "../core/collectionControls";
import type { ReportDetailsValue, ReportFieldDescriptor } from "./reportTypes";

export type { ColumnFilterOptions, ColumnFilters, SortRule } from "../core/collectionControls";

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

  return {
    controlledRows,
    filterOptions
  };
}

export function getConfiguredFilterOptions<TRow>(fields: ReportFieldDescriptor<TRow>[]): ColumnFilterOptions {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.filter?.kind === "multiSelect" && field.filter.options ? [...field.filter.options] : []
    ])
  );
}

function applyCollectionSearch<TRow>(
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
      if (filter.type === "values") {
        const fieldValue = formatControlValue(getFieldFilterValue(field, row));
        return filter.values.includes(fieldValue);
      }

      if (filter.type === "objectFields") {
        return matchesObjectFieldFilter(getFieldFilterValue(field, row), filter.conditions);
      }

      const fieldValue = formatControlValue(getFieldFilterValue(field, row));
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

  if (filter.type === "objectFields") {
    return filter.conditions.some((condition) => hasSearchExpression(condition.value));
  }

  return hasSearchExpression(filter.value);
}

function matchesObjectFieldFilter(
  value: unknown,
  conditions: Array<{ fieldId: string; value: string }>
): boolean {
  const activeConditions = conditions.filter((condition) => hasSearchExpression(condition.value));

  if (activeConditions.length === 0) {
    return true;
  }

  return activeConditions.every((condition) =>
    getNestedValues(value, condition.fieldId).some((nestedValue) =>
      matchesSearchExpression(formatControlValue(nestedValue), condition.value)
    )
  );
}

function getNestedValues(value: unknown, path: string): unknown[] {
  const segments = path.split(".").filter(Boolean);

  if (segments.length === 0) {
    return [value];
  }

  return getNestedValuesFromSegments(value, segments);
}

function getNestedValuesFromSegments(value: unknown, segments: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => getNestedValuesFromSegments(item, segments));
  }

  if (segments.length === 0) {
    return [value];
  }

  if (!isRecord(value)) {
    return [];
  }

  const [segment, ...remainingSegments] = segments;
  return getNestedValuesFromSegments(value[segment], remainingSegments);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function formatControlValue(value: unknown): string {
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

function formatReportSearchValue(value: unknown): string {
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
