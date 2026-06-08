import type { LocalReportRuntime } from "./LocalReportRuntime";

export function queryRuntimeCollection(runtime: LocalReportRuntime, collectionId: string, url: URL) {
  return runtime.queryCollection({
    collectionId,
    filters: parseRuntimeCollectionFilters(url),
    page: parseOptionalInteger(url.searchParams.get("page")),
    pageSize: parseOptionalInteger(url.searchParams.get("pageSize") ?? url.searchParams.get("count"))
  });
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

function parseOptionalInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
