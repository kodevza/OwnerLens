import type { SortRule } from "../collectionControls";
import type { LocalReportCollectionQueryOptions } from "./collections";

export function parseRuntimeCollectionQueryOptions(url: URL): LocalReportCollectionQueryOptions {
  return {
    filters: parseRuntimeCollectionFilters(url),
    sortRules: parseRuntimeCollectionSortRules(url),
    page: parseOptionalInteger(url.searchParams.get("page")),
    pageSize: parseOptionalInteger(url.searchParams.get("pageSize") ?? url.searchParams.get("count")),
    selectedRowKeys: parseSelectedRowKeys(url)
  };
}

function parseRuntimeCollectionFilters(url: URL): Array<{ column: string; values: string[] }> {
  const filters = new Map<number, { column: string; values: string[] }>();

  for (const [key, value] of url.searchParams) {
    const match = /^filter\[(\d+)\]\[(column|value|values)\](?:\[(\d+)\])?$/.exec(key);
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const property = match[2];
    const filter = filters.get(index) ?? { column: "", values: [] };

    if (property === "column") {
      filter.column = value;
    } else {
      filter.values.push(value);
    }

    filters.set(index, filter);
  }

  return [...filters.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, filter]) => filter)
    .filter((filter) => filter.column && filter.values.length > 0);
}

function parseRuntimeCollectionSortRules(url: URL): SortRule[] {
  const sortRules = new Map<number, Partial<SortRule>>();

  for (const [key, value] of url.searchParams) {
    const match = /^sort\[(\d+)\]\[(column|direction)\]$/.exec(key);
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const property = match[2];
    const sortRule = sortRules.get(index) ?? {};

    if (property === "column") {
      sortRule.columnId = value;
    } else if (value === "asc" || value === "desc") {
      sortRule.direction = value;
    }

    sortRules.set(index, sortRule);
  }

  return [...sortRules.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, rule]) => rule)
    .filter((rule): rule is SortRule => Boolean(rule.columnId?.trim()) && Boolean(rule.direction));
}

function parseOptionalInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSelectedRowKeys(url: URL): string[] | undefined {
  const selectedRowKeys = url.searchParams
    .getAll("selectedRowKey")
    .map((rowKey) => rowKey.trim())
    .filter(Boolean);

  return selectedRowKeys.length > 0 ? selectedRowKeys : undefined;
}
