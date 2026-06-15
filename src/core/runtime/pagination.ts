export type Page<Row> = {
  rows: Row[];
  page: number;
  pageSize: number;
  count: number;
};

export type PageOptions = {
  page?: number;
  pageSize?: number;
};

export type PaginatedCollection<CollectionId extends string = string, Row = Record<string, unknown>> = Page<Row> & {
  collectionId: CollectionId;
  columns: string[];
};

export function buildPage<Row>(
  rows: Row[],
  options: PageOptions,
  defaults?: {
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): Page<Row> {
  const defaultPageSize = defaults?.defaultPageSize ?? 50;
  const maxPageSize = defaults?.maxPageSize ?? 500;

  const pageSize = clampInteger(options.pageSize ?? defaultPageSize, 1, maxPageSize);
  const page = clampInteger(options.page ?? 1, 1, Math.max(1, Math.ceil(rows.length / pageSize)));

  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    count: rows.length
  };
}

export function buildPaginatedCollection<CollectionId extends string, Row>(
  collectionId: CollectionId,
  rows: Row[],
  columns: string[],
  options: PageOptions,
  defaults?: {
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): PaginatedCollection<CollectionId, Row> {
  return {
    collectionId,
    columns,
    ...buildPage(rows, options, defaults)
  };
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(Math.max(integer, min), max);
}
