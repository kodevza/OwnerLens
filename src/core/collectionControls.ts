export type SortDirection = "asc" | "desc";

export type SortRule = {
  columnId: string;
  direction: SortDirection;
};

export type ColumnFilter =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "values";
      values: string[];
    }
  | {
      type: "objectFields";
      conditions: Array<{ fieldId: string; value: string }>;
    };

export type ColumnFilters = Record<string, ColumnFilter>;
export type ColumnFilterOptions = Record<string, string[]>;

export function applyColumnTextFilter(filters: ColumnFilters, columnId: string, value: string): ColumnFilters {
  const next = { ...filters };

  if (value.trim()) {
    next[columnId] = { type: "text", value };
  } else {
    delete next[columnId];
  }

  return next;
}

export function applyColumnValuesFilter(
  currentFilters: ColumnFilters,
  columnId: string,
  values: string[]
): ColumnFilters {
  const next = { ...currentFilters };

  if (values.length === 0) {
    delete next[columnId];
  } else {
    next[columnId] = { type: "values", values };
  }

  return next;
}

export function applyColumnObjectFieldFilter(
  currentFilters: ColumnFilters,
  columnId: string,
  conditions: Array<{ fieldId: string; value: string }>
): ColumnFilters {
  const next = { ...currentFilters };
  const activeConditions = conditions
    .map((condition) => ({
      fieldId: condition.fieldId,
      value: condition.value
    }))
    .filter((condition) => condition.fieldId.trim() && condition.value.trim());

  if (activeConditions.length === 0) {
    delete next[columnId];
  } else {
    next[columnId] = { type: "objectFields", conditions: activeConditions };
  }

  return next;
}

export function applyColumnFilterValueToggle(
  currentFilters: ColumnFilters,
  columnId: string,
  value: string,
  checked: boolean
): ColumnFilters {
  const currentFilter = currentFilters[columnId];
  const selectedValues = currentFilter?.type === "values" ? currentFilter.values : [];

  return applyColumnValuesFilter(currentFilters, columnId, applyColumnValueToggle(selectedValues, value, checked));
}

export function applyColumnValueToggle(selectedValues: string[], value: string, checked: boolean): string[] {
  if (checked) {
    return selectedValues.includes(value) ? selectedValues : [...selectedValues, value];
  }

  return selectedValues.filter((selectedValue) => selectedValue !== value);
}

export function toggleSortRule(sortRules: SortRule[], columnId: string): SortRule[] {
  const existingRule = sortRules.find((rule) => rule.columnId === columnId);

  if (!existingRule) {
    return [...sortRules, { columnId, direction: "asc" }];
  }

  if (existingRule.direction === "asc") {
    return sortRules.map((rule) => (rule.columnId === columnId ? { ...rule, direction: "desc" } : rule));
  }

  return sortRules.filter((rule) => rule.columnId !== columnId);
}
