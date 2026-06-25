import {
  buildRuntimeCollectionCsvExport,
  type RuntimeCollectionCsvExport
} from "../../../core/runtime/collectionExport";
import type { LocalReportCollectionQueryOptions } from "../../../core/runtime/collections";

export class ExportService {
  exportEntraServicePrincipalsCsv(
    rows: Record<string, unknown>[],
    options: LocalReportCollectionQueryOptions
  ): RuntimeCollectionCsvExport<"entra.servicePrincipals"> {
    return buildRuntimeCollectionCsvExport({
      collectionId: "entra.servicePrincipals",
      fileName: "ownerlens-service-principals.csv",
      rows,
      filters: options.filters,
      sortRules: options.sortRules,
      selectedRowKeys: options.selectedRowKeys,
      getRowKey: getPrincipalRowKey,
      includeBom: true
    });
  }

  exportEntraManagedIdentitiesCsv(
    rows: Record<string, unknown>[],
    options: LocalReportCollectionQueryOptions
  ): RuntimeCollectionCsvExport<"entra.managedIdentities"> {
    return buildRuntimeCollectionCsvExport({
      collectionId: "entra.managedIdentities",
      fileName: "ownerlens-managed-identities.csv",
      rows,
      filters: options.filters,
      sortRules: options.sortRules,
      selectedRowKeys: options.selectedRowKeys,
      getRowKey: getPrincipalRowKey,
      includeBom: true
    });
  }

  exportAzureResourceGroupOwnershipCsv(
    rows: Record<string, unknown>[],
    options: LocalReportCollectionQueryOptions,
    columns?: readonly string[]
  ): RuntimeCollectionCsvExport<"azureResources.resourceGroupOwnership"> {
    return buildRuntimeCollectionCsvExport({
      collectionId: "azureResources.resourceGroupOwnership",
      fileName: "ownerlens-resource-groups.csv",
      rows,
      filters: options.filters,
      sortRules: options.sortRules,
      selectedRowKeys: options.selectedRowKeys,
      getRowKey: getResourceGroupOwnershipRowKey,
      columns,
      includeBom: true
    });
  }
}

function getPrincipalRowKey(row: Record<string, unknown>): string {
  return typeof row.id === "string" ? row.id : "";
}

function getResourceGroupOwnershipRowKey(row: Record<string, unknown>): string {
  const subscriptionId = typeof row.subscriptionId === "string" ? row.subscriptionId : "";
  const resourceGroup = typeof row.resourceGroup === "string" ? row.resourceGroup : "";

  return `${subscriptionId}:${resourceGroup}`;
}
