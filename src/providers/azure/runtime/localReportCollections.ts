import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";

export type LocalReportCollectionQuery = {
  collectionId: string;
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
  query: Pick<LocalReportCollectionQuery, "filters" | "page" | "pageSize">
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

function applyRuntimeCollectionFilters(
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
    if (!columns.includes(filter.column)) {
      throw new RuntimeHttpError(`Unknown collection column: ${filter.column}`, 400);
    }
  }

  return rows.filter((row) =>
    activeFilters.every((filter) => {
      const fieldValue = formatRuntimeFilterValue(row[filter.column]).toLocaleLowerCase();
      return filter.values.some((value) => fieldValue.includes(value.toLocaleLowerCase()));
    })
  );
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
