import { formatValue } from "../lib/utils";
import type { OwnerConfidence } from "./types";
import type { ReportDetailsValue, ReportFieldDescriptor } from "./reportTypes";
import { ConfidenceBadge } from "./components/ConfidenceBadge";
import { PermissionRiskBadge } from "./components/PermissionRiskBadge";
import type { PermissionRiskLevel } from "../core/risk/types";

export function renderReportValue<TRow>(
  field: ReportFieldDescriptor<TRow>,
  row: TRow
) {
  const value = field.getValue(row);

  if (field.valueType === "riskLevel") {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    return <PermissionRiskBadge riskLevel={value as PermissionRiskLevel} />;
  }

  if (field.valueType === "ownerConfidence") {
    return <ConfidenceBadge confidence={value as OwnerConfidence} />;
  }

  if (field.valueType === "details") {
    return renderDetailsValue(value);
  }

  if (field.valueType === "boolean") {
    return typeof value === "boolean" ? (value ? "Yes" : "No") : formatValue(value);
  }

  if (field.valueType === "list") {
    return Array.isArray(value) ? value.map(formatValue).filter(Boolean).join(", ") : formatValue(value);
  }

  return formatValue(value);
}

function renderDetailsValue(value: unknown) {
  const details = value as ReportDetailsValue;

  return (
    <div>
      <div>{details.title}</div>
      {details.details.map((detail) => (
        <div key={detail.label} className="mt-1 text-xs text-muted-foreground">
          {detail.label}: {detail.value}
        </div>
      ))}
    </div>
  );
}
