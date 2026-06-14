import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import { matchesSearchExpression } from "../../../lib/searchFilterUtils";

export type LocalReportCollectionQueryOptions = {
  page?: number;
  pageSize?: number;
  filters?: LocalReportCollectionFilter[];
};

export type LocalReportCollectionFilter = {
  column: string;
  values: string[];
};

export type LocalReportPaginatedCollection<CollectionId extends string = string> = {
  collectionId: CollectionId;
  rows: Record<string, unknown>[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

export function buildPaginatedCollection<CollectionId extends string>(
  collectionId: CollectionId,
  rows: Record<string, unknown>[],
  query: LocalReportCollectionQueryOptions
): LocalReportPaginatedCollection<CollectionId> {
  const columns = buildCollectionColumns(rows);
  const filteredRows = applyRuntimeCollectionFilters(rows, columns, query.filters ?? []);
  const pageSize = clampInteger(query.pageSize ?? 50, 1, 500);
  const page = clampInteger(query.page ?? 1, 1, Math.max(1, Math.ceil(filteredRows.length / pageSize)));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    collectionId,
    rows: pageRows,
    columns,
    page,
    pageSize,
    count: filteredRows.length
  };
}

function buildCollectionColumns(rows: Record<string, unknown>[]): string[] {
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

function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(Math.max(integer, min), max);
}
