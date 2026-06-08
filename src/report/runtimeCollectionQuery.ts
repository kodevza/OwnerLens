import type { ColumnFilter, ColumnFilters } from "./components/reportTableControls";

export function appendRuntimeCollectionFilters(url: URL, filters: ColumnFilters): void {
  Object.entries(filters).forEach(([column, filter], filterIndex) => {
    const values = getRuntimeCollectionFilterValues(filter);
    if (values.length === 0) {
      return;
    }

    url.searchParams.set(`filter[${filterIndex}][column]`, column);
    values.forEach((value, valueIndex) => {
      url.searchParams.append(`filter[${filterIndex}][value][${valueIndex}]`, value);
    });
  });
}

function getRuntimeCollectionFilterValues(filter: ColumnFilter): string[] {
  if (filter.type === "values") {
    return filter.values;
  }

  return filter.value.trim() ? [filter.value] : [];
}
