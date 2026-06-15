import type { ColumnFilters, SortRule } from "../core/collectionControls";

type RuntimeCollectionFilter = { column: string; values: string[] };

export function appendRuntimeCollectionFilters(url: URL, filters: ColumnFilters): void {
  getRuntimeCollectionFilters(filters).forEach(({ column, values }, filterIndex) => {
    if (values.length === 0) {
      return;
    }

    url.searchParams.set(`filter[${filterIndex}][column]`, column);
    values.forEach((value, valueIndex) => {
      url.searchParams.append(`filter[${filterIndex}][value][${valueIndex}]`, value);
    });
  });
}

export function appendRuntimeCollectionSortRules(url: URL, sortRules: SortRule[]): void {
  sortRules.forEach((rule, sortIndex) => {
    if (!rule.columnId.trim()) {
      return;
    }

    url.searchParams.set(`sort[${sortIndex}][column]`, rule.columnId);
    url.searchParams.set(`sort[${sortIndex}][direction]`, rule.direction);
  });
}

export function appendRuntimeSelectedRowKeys(url: URL, selectedRowKeys: string[]): void {
  selectedRowKeys
    .map((rowKey) => rowKey.trim())
    .filter(Boolean)
    .forEach((rowKey) => {
      url.searchParams.append("selectedRowKey", rowKey);
    });
}

function getRuntimeCollectionFilters(filters: ColumnFilters): RuntimeCollectionFilter[] {
  return Object.entries(filters).flatMap(([column, filter]) => {
    if (filter.type === "objectFields") {
      return filter.conditions
        .map((condition) => ({
          column: condition.fieldId.includes(".") ? condition.fieldId : `${column}.${condition.fieldId}`,
          values: condition.value.trim() ? [condition.value] : []
        }))
        .filter((condition) => condition.values.length > 0);
    }

    if (filter.type === "values") {
      return [{ column, values: filter.values }];
    }

    return [{ column, values: filter.value.trim() ? [filter.value] : [] }];
  });
}
