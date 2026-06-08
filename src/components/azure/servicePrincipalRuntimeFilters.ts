import type { EntraServicePrincipal } from "../../providers/azure/inputTransferObject/entra/EntraServicePrincipal";
import type { ColumnFilterOptions } from "../../report/applyCollectionControls";

export function buildServicePrincipalRuntimeFilterOptions(rows: EntraServicePrincipal[]): ColumnFilterOptions {
  return {
    accountEnabled: ["true", "false"],
    servicePrincipalType: uniqueSorted(rows.map((row) => row.servicePrincipalType))
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}
