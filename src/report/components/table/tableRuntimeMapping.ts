import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../reportTypes";

export function remapSortRulesForRuntime<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  sortRules: SortRule[]
): SortRule[] {
  const sortColumnByFieldId = new Map(fields.map((field) => [field.id, field.sortColumnId ?? field.id]));

  return sortRules.map((rule) => ({
    ...rule,
    columnId: sortColumnByFieldId.get(rule.columnId) ?? rule.columnId
  }));
}

export function remapColumnFiltersForRuntime<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  filters: ColumnFilters
): ColumnFilters {
  const filterColumnByFieldId = new Map(fields.map((field) => [field.id, field.filterColumnId ?? field.id]));
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const next: ColumnFilters = {};

  for (const [columnId, filter] of Object.entries(filters)) {
    const field = fieldById.get(columnId);
    const runtimeColumnId = filterColumnByFieldId.get(columnId) ?? columnId;

    if (filter.type === "objectFields" && field?.filter?.kind === "objectFields") {
      const filterFieldById = new Map(field.filter.fields.map((filterField) => [filterField.id, filterField]));
      const runtimeObjectConditions: Array<{ fieldId: string; value: string }> = [];

      filter.conditions.forEach((condition) => {
        const filterField = filterFieldById.get(condition.fieldId);

        if (filterField?.filterColumnId) {
          next[filterField.filterColumnId] = { type: "text", value: condition.value };
          return;
        }

        runtimeObjectConditions.push({
          fieldId: condition.fieldId,
          value: condition.value
        });
      });

      if (runtimeObjectConditions.length > 0) {
        next[runtimeColumnId] = {
          type: "objectFields",
          conditions: runtimeObjectConditions
        };
      }
      continue;
    }

    next[runtimeColumnId] = filter;
  }

  return next;
}
