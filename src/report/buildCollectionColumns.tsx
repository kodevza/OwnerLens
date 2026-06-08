import type { ReactNode } from "react";

import type { ReportColumnHelp, ReportFieldDescriptor } from "./reportTypes";
import type { ReportTableColumn } from "./components/reportTableControls";
import { renderReportValue } from "./reportValueRenderers";

export type ReportColumnRenderers<TRow> = Partial<Record<string, (row: TRow) => ReactNode>>;

export function buildCollectionColumns<TRow>(
  fields: ReportFieldDescriptor<TRow>[],
  {
    columnHelp = {},
    renderers = {}
  }: {
    columnHelp?: Record<string, ReportColumnHelp>;
    renderers?: ReportColumnRenderers<TRow>;
  } = {}
): ReportTableColumn<TRow>[] {
  return fields.map((field) => ({
    id: field.id,
    label: field.label,
    help: field.help ?? columnHelp[field.id],
    filter: getColumnFilterKind(field),
    render: renderers[field.id] ?? ((row) => renderReportValue(field, row))
  }));
}

function getColumnFilterKind<TRow>(field: ReportFieldDescriptor<TRow>): ReportTableColumn<TRow>["filter"] {
  if (field.filter?.kind === "multiSelect") {
    return "multiselect";
  }

  if (field.filter?.kind === "text") {
    return "text";
  }

  return "auto";
}
