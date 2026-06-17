import { mapRoleAssignmentToAzureRbac } from "../../../../core/azure/azureRbac";
import type { AzureRbac } from "../../../../core/azure/azureRbac";
import type { AzureRoleAssignment, ResourceGroupOwnershipRow } from "../../../../core/azure/resources";

import { evaluateAzureRoleAssignmentRisk } from "../enrichment/evaluateAzureRoleAssignmentRisk";
import { buildAzureOwnershipReport } from "../../ownership/buildAzureOwnershipReport";
import {
  buildPaginatedCollection,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import type { RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { DisabledEvidenceStore } from "../DisabledEvidenceStore";
import type { ExportService } from "../ExportService";
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
  exportService: ExportService;
};

export class AzureResourcesCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;
  private readonly exportService: ExportService;

  constructor(options: AzureResourcesCollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
    this.exportService = options.exportService;
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
    return this.exportService.exportAzureResourceGroupOwnershipCsv(
      await this.readResourceGroupOwnershipRows(),
      options
    );
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
    const [servicePrincipals, roleAssignments] = await Promise.all([
      this.entra.readServicePrincipals(),
      this.azureResources.readAzureRoleAssignments()
    ]);
    const servicePrincipal = servicePrincipals.find(
      (candidate) => candidate.id.toLowerCase() === normalizedServicePrincipalId
    );
    const rowsByAssignmentKey = new Map<string, AzureRbac>();

    for (const assignment of roleAssignments) {
      if (assignment.principalId.toLowerCase() !== normalizedServicePrincipalId) {
        continue;
      }

      addAzureRbacRow(rowsByAssignmentKey, assignment, servicePrincipalId);
    }

    for (const assignment of servicePrincipal?.roleAssignments ?? []) {
      addAzureRbacRow(rowsByAssignmentKey, assignment, servicePrincipal?.id ?? servicePrincipalId);
    }

    return [...rowsByAssignmentKey.values()];
  }
}

function addAzureRbacRow(
  rowsByAssignmentKey: Map<string, AzureRbac>,
  assignment: AzureRoleAssignment,
  servicePrincipalId: string
): void {
  rowsByAssignmentKey.set(
    getAzureRbacAssignmentKey(assignment),
    mapRoleAssignmentToAzureRbac(
      assignment,
      evaluateAzureRoleAssignmentRisk(assignment).riskLevel,
      servicePrincipalId
    )
  );
}

function getAzureRbacAssignmentKey(assignment: AzureRoleAssignment): string {
  if (assignment.roleAssignmentId) {
    return assignment.roleAssignmentId.toLowerCase();
  }

  return [
    assignment.principalId,
    assignment.roleDefinitionId,
    assignment.roleDefinitionName,
    assignment.scope
  ].join(":").toLowerCase();
}
