import type { DuckDBValue } from "@duckdb/node-api";

import type { SortRule } from "../../../core/collectionControls";
import {
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions
} from "../../../core/runtime/collections";
import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";

export type RuntimeSqlColumnType = "text" | "number" | "risk";

export type RuntimeSqlColumn = {
  expr: string;
  type: RuntimeSqlColumnType;
};

export type RuntimeSqlColumnMap = Record<string, RuntimeSqlColumn>;

export type RuntimeSqlFragment = {
  sql: string;
  params: Record<string, DuckDBValue>;
};

export function buildWhereSql(
  filters: LocalReportCollectionFilter[] = [],
  columnMap: RuntimeSqlColumnMap
): RuntimeSqlFragment {
  const clauses: string[] = [];
  const params: Record<string, DuckDBValue> = {};

  for (const [filterIndex, filter] of filters.entries()) {
    const values = filter.values.map((value) => value.trim()).filter(Boolean);
    if (!filter.column.trim() || values.length === 0) {
      continue;
    }

    const column = readSqlColumn(filter.column, columnMap);
    const valueClauses = values.map((value, valueIndex) => {
      const paramName = `filter_${filterIndex}_${valueIndex}`;
      params[paramName] = value;
      return `regexp_matches(${formatFilterColumnExpr(column)}, $${paramName}, 'i')`;
    });

    clauses.push(`(${valueClauses.join(" or ")})`);
  }

  return {
    sql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    params
  };
}

export function buildOrderBySql(
  sortRules: SortRule[] = [],
  columnMap: RuntimeSqlColumnMap,
  defaultOrder: string
): string {
  const activeRules = sortRules.filter((rule) => rule.columnId.trim());

  if (activeRules.length === 0) {
    return `order by ${defaultOrder}`;
  }

  const clauses = activeRules.map((rule) => {
    const column = readSqlColumn(rule.columnId, columnMap);
    const direction = rule.direction === "desc" ? "desc" : "asc";
    return `${formatSortColumnExpr(column)} ${direction} nulls last`;
  });

  return `order by ${clauses.join(", ")}, ${defaultOrder}`;
}

export function buildPageSql(
  page: LocalReportCollectionQueryOptions["page"],
  pageSize: LocalReportCollectionQueryOptions["pageSize"]
): RuntimeSqlFragment {
  if (page === undefined || pageSize === undefined) {
    return {
      sql: "",
      params: {}
    };
  }

  const normalizedPage = Math.max(1, Math.trunc(page));
  const normalizedPageSize = Math.max(1, Math.trunc(pageSize));

  return {
    sql: "limit $limit offset $offset",
    params: {
      limit: normalizedPageSize,
      offset: (normalizedPage - 1) * normalizedPageSize
    }
  };
}

export function buildCountSql(baseQuery: string, where: RuntimeSqlFragment): {
  sql: string;
  params: Record<string, DuckDBValue>;
} {
  return {
    sql: `
      select count(*) as count
      from (
        ${baseQuery}
      ) collection_rows
      ${where.sql}
    `,
    params: where.params
  };
}

export function buildSelectedRowsWhereSql(
  selectedRowKeys: string[] | undefined,
  keyExpr: string
): RuntimeSqlFragment {
  const keys = (selectedRowKeys ?? []).map((key) => key.trim()).filter(Boolean);

  if (keys.length === 0) {
    return {
      sql: "",
      params: {}
    };
  }

  return {
    sql: `${keyExpr} in (
      select json_extract_string(value, '$')
      from json_each($selectedRowKeys::json)
    )`,
    params: {
      selectedRowKeys: JSON.stringify(keys)
    }
  };
}

export function combineWhereSql(fragments: RuntimeSqlFragment[]): RuntimeSqlFragment {
  const clauses = fragments
    .map((fragment) => fragment.sql.trim())
    .filter(Boolean)
    .map((sql) => sql.replace(/^where\s+/i, ""));

  return {
    sql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    params: Object.assign({}, ...fragments.map((fragment) => fragment.params))
  };
}

function readSqlColumn(columnId: string, columnMap: RuntimeSqlColumnMap): RuntimeSqlColumn {
  const column = columnMap[columnId];

  if (!column) {
    throw new RuntimeHttpError(`Unknown collection column: ${columnId}`, 400);
  }

  return column;
}

function formatFilterColumnExpr(column: RuntimeSqlColumn): string {
  return `coalesce(cast(${column.expr} as varchar), '')`;
}

function formatSortColumnExpr(column: RuntimeSqlColumn): string {
  if (column.type === "risk") {
    return `case ${column.expr} when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end`;
  }

  if (column.type === "number") {
    return `try_cast(${column.expr} as double)`;
  }

  return `lower(coalesce(cast(${column.expr} as varchar), ''))`;
}
