import type { ColumnFilterOptions } from "../../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../reportTypes";

export function resolveColumnFilterOptions<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  filterOptions: ColumnFilterOptions
): ColumnFilterOptions {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      filterOptions[field.id] ?? (field.filterColumnId ? filterOptions[field.filterColumnId] : undefined) ?? []
    ])
  );
}
