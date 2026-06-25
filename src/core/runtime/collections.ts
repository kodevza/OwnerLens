import type { SortRule } from "../collectionControls";
import { matchesSearchExpression } from "../searchFilterUtils";
import { RuntimeHttpError } from "./localSnapshotFiles";
import {
  buildPaginatedCollection as buildPaginatedPageCollection,
  type PaginatedCollection
} from "./pagination";

export type LocalReportCollectionQueryOptions = {
  page?: number;
  pageSize?: number;
  filters?: LocalReportCollectionFilter[];
  sortRules?: SortRule[];
  selectedRowKeys?: string[];
};

export type LocalReportCollectionFilter = {
  column: string;
  values: string[];
};

export type LocalReportPaginatedCollection<
  CollectionId extends string = string,
  Row = Record<string, unknown>
> = PaginatedCollection<
  CollectionId,
  Row
>;

export function buildPaginatedCollection<CollectionId extends string>(
  collectionId: CollectionId,
  rows: Record<string, unknown>[],
  query: LocalReportCollectionQueryOptions
): LocalReportPaginatedCollection<CollectionId> {
  const columns = buildCollectionColumns(rows);
  const filteredRows = applyRuntimeCollectionFilters(rows, columns, query.filters ?? []);
  const sortedRows = applyRuntimeCollectionSort(filteredRows, columns, query.sortRules ?? []);
  return buildPaginatedPageCollection(collectionId, sortedRows, columns, query);
}

export function buildCollectionColumns(rows: Record<string, unknown>[]): string[] {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }

  return [...columns];
}

export function applyRuntimeCollectionFilters(
  rows: Record<string, unknown>[],
  columns: string[],
  filters: LocalReportCollectionFilter[]
): Record<string, unknown>[] {
  const activeFilters = filters
    .map((filter) => ({
      column: filter.column,
      values: filter.values.map((value) => value.trim()).filter(Boolean)
    }))
    .filter((filter) => filter.column && filter.values.length > 0);

  if (activeFilters.length === 0) {
    return rows;
  }

  for (const filter of activeFilters) {
    const rootColumn = getRuntimeFilterRootColumn(filter.column);
    if (!columns.includes(rootColumn)) {
      throw new RuntimeHttpError(`Unknown collection column: ${filter.column}`, 400);
    }
  }

  return rows.filter((row) =>
    activeFilters.every((filter) => {
      const rootColumn = getRuntimeFilterRootColumn(filter.column);
      const values = getRuntimeFilterValues(row[rootColumn], getRuntimeFilterPathSegments(filter.column));
      return filter.values.some((filterValue) =>
        values.some((value) => matchesSearchExpression(formatRuntimeFilterValue(value), filterValue))
      );
    })
  );
}

export function applyRuntimeCollectionSelection(
  rows: Record<string, unknown>[],
  selectedRowKeys: string[],
  getRowKey: ((row: Record<string, unknown>) => string) | undefined
): Record<string, unknown>[] {
  const selectedRowKeySet = new Set(selectedRowKeys.map((rowKey) => rowKey.trim()).filter(Boolean));
  if (selectedRowKeySet.size === 0) {
    return rows;
  }

  if (!getRowKey) {
    return rows;
  }

  return rows.filter((row) => selectedRowKeySet.has(getRowKey(row)));
}

export function applyRuntimeCollectionSort(
  rows: Record<string, unknown>[],
  columns: string[],
  sortRules: SortRule[]
): Record<string, unknown>[] {
  const activeSortRules = sortRules.filter((rule) => rule.columnId.trim());

  if (activeSortRules.length === 0) {
    return rows;
  }

  for (const rule of activeSortRules) {
    const rootColumn = getRuntimeFilterRootColumn(rule.columnId);
    if (!columns.includes(rootColumn)) {
      throw new RuntimeHttpError(`Unknown collection column: ${rule.columnId}`, 400);
    }
  }

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const rule of activeSortRules) {
        const rootColumn = getRuntimeFilterRootColumn(rule.columnId);
        const leftValue = getRuntimeFilterValues(left.row[rootColumn], getRuntimeFilterPathSegments(rule.columnId));
        const rightValue = getRuntimeFilterValues(right.row[rootColumn], getRuntimeFilterPathSegments(rule.columnId));
        const result = compareRuntimeValues(leftValue, rightValue);

        if (result !== 0) {
          return rule.direction === "asc" ? result : -result;
        }
      }

      return left.index - right.index;
    })
    .map(({ row }) => row);
}

function getRuntimeFilterRootColumn(column: string): string {
  return column.split(".", 1)[0] ?? column;
}

function getRuntimeFilterPathSegments(column: string): string[] {
  return column.split(".").slice(1).filter(Boolean);
}

function getRuntimeFilterValues(value: unknown, pathSegments: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => getRuntimeFilterValues(item, pathSegments));
  }

  if (pathSegments.length === 0) {
    return [value];
  }

  if (!isRecord(value)) {
    return [];
  }

  const [segment, ...remainingSegments] = pathSegments;
  return getRuntimeFilterValues(value[segment], remainingSegments);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatRuntimeFilterValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function compareRuntimeValues(left: unknown, right: unknown): number {
  const leftText = formatRuntimeSortValue(left);
  const rightText = formatRuntimeSortValue(right);

  if (!leftText && !rightText) {
    return 0;
  }

  if (!leftText) {
    return 1;
  }

  if (!rightText) {
    return -1;
  }

  return runtimeCollator.compare(leftText, rightText);
}

function formatRuntimeSortValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(formatRuntimeSortValue).filter(Boolean).join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

const runtimeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});
