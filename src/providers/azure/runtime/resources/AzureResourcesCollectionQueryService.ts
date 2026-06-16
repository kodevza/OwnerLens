import { mapRoleAssignmentToAzureRbac } from "../../../../core/azure/azureRbac";
import type { AzureRbac } from "../../../../core/azure/azureRbac";
import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";

import { evaluateAzureRoleAssignmentRisk } from "../enrichment/evaluateAzureRoleAssignmentRisk";
import { buildAzureOwnershipReport } from "../../ownership/buildAzureOwnershipReport";
import {
  buildPaginatedCollection,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import { buildRuntimeCollectionCsvExport, type RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { DisabledEvidenceStore } from "../DisabledEvidenceStore";
import type { LocalEntraReportRuntime } from "../entra/LocalEntraReportRuntime";
import {
  type LocalAzureResourcesReportCollectionId,
  type LocalAzureResourcesReportRuntime
} from "./LocalAzureResourcesReportRuntime";
import {
  applyResourceGroupOwnerDisabledEvidence,
  buildResourceGroupOwnershipRows
} from "./resourceGroupOwnership";

export type LocalAzureResourcesExtendedCollectionId =
  | LocalAzureResourcesReportCollectionId
  | "azureResources.resourceGroupOwnership"
  | "azureRbac";

export type AzureResourcesCollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  disabledEvidenceStore: DisabledEvidenceStore;
};

export class AzureResourcesCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;

  constructor(options: AzureResourcesCollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
  }

  async querySubscriptions(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.subscriptions">> {
    return buildPaginatedCollection(
      "azureResources.subscriptions",
      (await this.azureResources.readAzureSubscriptions()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryResourceGroups(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resourceGroups">> {
    return buildPaginatedCollection(
      "azureResources.resourceGroups",
      (await this.azureResources.readAzureResourceGroups()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryResourceGroupOwnership(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resourceGroupOwnership">> {
    return buildPaginatedCollection(
      "azureResources.resourceGroupOwnership",
      await this.readResourceGroupOwnershipRows(),
      options
    );
  }

  async exportResourceGroupOwnershipCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"azureResources.resourceGroupOwnership">> {
    return buildRuntimeCollectionCsvExport({
      collectionId: "azureResources.resourceGroupOwnership",
      fileName: "ownerlens-resource-groups.csv",
      rows: await this.readResourceGroupOwnershipRows(),
      filters: options.filters,
      sortRules: options.sortRules,
      selectedRowKeys: options.selectedRowKeys,
      getRowKey: getResourceGroupOwnershipRowKey,
      includeBom: true
    });
  }

  async queryResources(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resources">> {
    return buildPaginatedCollection(
      "azureResources.resources",
      (await this.azureResources.readAzureResources()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryUserAssignedManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.userAssignedManagedIdentities">> {
    return buildPaginatedCollection(
      "azureResources.userAssignedManagedIdentities",
      (await this.azureResources.readAzureUserAssignedManagedIdentities()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryRoleAssignments(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.roleAssignments">> {
    return buildPaginatedCollection(
      "azureResources.roleAssignments",
      (await this.azureResources.readAzureRoleAssignments()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryAzureRbac(
    servicePrincipalId: string,
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureRbac">> {
    return buildPaginatedCollection(
      "azureRbac",
      (await this.readAzureRbacRows(servicePrincipalId)) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryActivityLogs(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.activityLogs">> {
    return buildPaginatedCollection(
      "azureResources.activityLogs",
      (await this.azureResources.readAzureActivityLogs()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async readResourceGroupOwnershipRows(): Promise<ResourceGroupOwnershipRow[]> {
    const [resourceSnapshot, entraSnapshot, disabledKeys] = await Promise.all([
      this.azureResources.readSnapshot(),
      this.entra.readSnapshot(),
      this.disabledEvidenceStore.readKeys()
    ]);
    const ownerReport = buildAzureOwnershipReport(resourceSnapshot, entraSnapshot);
    const ownerRows = applyResourceGroupOwnerDisabledEvidence(ownerReport.owners, disabledKeys);

    return buildResourceGroupOwnershipRows(resourceSnapshot.resourceGroups, ownerRows);
  }

  private async readAzureRbacRows(servicePrincipalId: string): Promise<AzureRbac[]> {
    const normalizedServicePrincipalId = servicePrincipalId.trim().toLowerCase();
    const servicePrincipals = await this.entra.readServicePrincipals();
    const servicePrincipal = servicePrincipals.find(
      (candidate) => candidate.id.toLowerCase() === normalizedServicePrincipalId
    );

    if (!servicePrincipal) {
      return [];
    }

    return servicePrincipal.roleAssignments.map((assignment) =>
      mapRoleAssignmentToAzureRbac(
        assignment,
        evaluateAzureRoleAssignmentRisk(assignment).riskLevel,
        servicePrincipal.id
      )
    );
  }
}

function getResourceGroupOwnershipRowKey(row: Record<string, unknown>): string {
  const subscriptionId = typeof row.subscriptionId === "string" ? row.subscriptionId : "";
  const resourceGroup = typeof row.resourceGroup === "string" ? row.resourceGroup : "";

  return `${subscriptionId}:${resourceGroup}`;
}
