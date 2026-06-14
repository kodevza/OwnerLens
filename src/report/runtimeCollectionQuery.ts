import type { ColumnFilter, ColumnFilters } from "../core/collectionControls";

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

function getRuntimeCollectionFilters(filters: ColumnFilters): Array<{ column: string; values: string[] }> {
  return Object.entries(filters).flatMap(([column, filter]) => {
    if (filter.type === "objectFields") {
      return filter.conditions
        .map((condition) => ({
          column: condition.fieldId.includes(".") ? condition.fieldId : `${column}.${condition.fieldId}`,
          values: condition.value.trim() ? [condition.value] : []
        }))
        .filter((condition) => condition.values.length > 0);
    }

    return [
      {
        column,
        values: getRuntimeCollectionFilterValues(filter)
      }
    ];
  });
}

function getRuntimeCollectionFilterValues(filter: ColumnFilter): string[] {
  if (filter.type === "values") {
    return filter.values;
  }

  if (filter.type === "objectFields") {
    return [];
  }

  return filter.value.trim() ? [filter.value] : [];
}
