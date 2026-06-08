import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import type { ColumnFilterOptions } from "../../report/applyCollectionControls";

type RuntimeServicePrincipalRow = ServicePrincipal | ManagedIdentity;

export function buildServicePrincipalRuntimeFilterOptions(rows: RuntimeServicePrincipalRow[]): ColumnFilterOptions {
  return {
    accountEnabled: ["true", "false"],
    isAllParticipant: ["true", "false"],
    ownerConfidence: uniqueSorted(rows.map((row) => row.ownerConfidence ?? "")),
    permissionRisk: uniqueSorted(rows.map((row) => row.permissionRisk ?? "")),
    servicePrincipalType: uniqueSorted(rows.map((row) => row.servicePrincipalType)),
    ztaMaxRisk: uniqueSorted(rows.map((row) => row.ztaMaxRisk ?? ""))
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
