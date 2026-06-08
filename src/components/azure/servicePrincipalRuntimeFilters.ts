import type { EntraServicePrincipal } from "../../providers/azure/inputTransferObject/entra/EntraServicePrincipal";
import type { ColumnFilterOptions } from "../../report/applyCollectionControls";

type RuntimeServicePrincipalRow = EntraServicePrincipal & {
  permissionRisk?: string;
  ownerConfidence?: string;
};

export function buildServicePrincipalRuntimeFilterOptions(rows: RuntimeServicePrincipalRow[]): ColumnFilterOptions {
  return {
    accountEnabled: ["true", "false"],
    isAllParticipant: ["true", "false"],
    ownerConfidence: uniqueSorted(rows.map((row) => row.ownerConfidence ?? "")),
    permissionRisk: uniqueSorted(rows.map((row) => row.permissionRisk ?? "")),
    servicePrincipalType: uniqueSorted(rows.map((row) => row.servicePrincipalType))
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
