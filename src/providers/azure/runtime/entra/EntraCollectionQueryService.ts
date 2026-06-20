import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type {
  EntraPrincipalAzureRemediationSummary,
  ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type {
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../../core/azure/resources";

import {
  buildPaginatedCollection,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import type { RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";
import type { LocalAzureResourcesReportRuntime } from "../resources/LocalAzureResourcesReportRuntime";
import type { ZeroTrustAssessmentQueryService } from "../zta/ZeroTrustAssessmentQueryService";
import type { ExportService } from "../ExportService";
import type { LocalEntraReportRuntime } from "./LocalEntraReportRuntime";
import {
  projectManagedIdentityOwners,
  projectServicePrincipalOwners
} from "../../ownership/principalOwnerProjection";

export type EntraCollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  azureResourcesQueries: AzureResourcesCollectionQueryService;
  zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  exportService: ExportService;
};

export class EntraCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  private readonly exportService: ExportService;

  constructor(options: EntraCollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.azureResourcesQueries = options.azureResourcesQueries;
    this.zeroTrustAssessmentQueries = options.zeroTrustAssessmentQueries;
    this.exportService = options.exportService;
  }

  async queryServicePrincipals(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.servicePrincipals">> {
    return buildPaginatedCollection("entra.servicePrincipals", await this.readServicePrincipalRows(), options);
  }

  async exportServicePrincipalsCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.servicePrincipals">> {
    return this.exportService.exportEntraServicePrincipalsCsv(await this.readServicePrincipalRows(), options);
  }

  async queryManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.managedIdentities">> {
    return buildPaginatedCollection("entra.managedIdentities", await this.readManagedIdentityRows(), options);
  }

  async exportManagedIdentitiesCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.managedIdentities">> {
    return this.exportService.exportEntraManagedIdentitiesCsv(await this.readManagedIdentityRows(), options);
  }

  async readServicePrincipalRemediationSummaries(
    principalIds: string[]
  ): Promise<Map<string, EntraPrincipalAzureRemediationSummary>> {
    const principalIdSet = new Set(principalIds.map((principalId) => principalId.trim().toLowerCase()).filter(Boolean));
    const summaries = new Map<string, EntraPrincipalAzureRemediationSummary>();

    if (principalIdSet.size === 0) {
      return summaries;
    }

    for (const row of await this.readServicePrincipalRows()) {
      const servicePrincipal = row as unknown as ServicePrincipal;
      const normalizedPrincipalId = servicePrincipal.id.toLowerCase();

      if (!principalIdSet.has(normalizedPrincipalId)) {
        continue;
      }

      summaries.set(normalizedPrincipalId, {
        id: servicePrincipal.id,
        displayName: servicePrincipal.displayName,
        roleAssignments: servicePrincipal.roleAssignments,
        oauthPermissionsCount: servicePrincipal.oauthPermissionsCount,
        appRolesPermissionCount: servicePrincipal.appRolesPermissionCount,
        entraPermissionRisk: servicePrincipal.entraPermissionRisk,
        rbacRoleAssignmentCount: servicePrincipal.rbacRoleAssignmentCount,
        rbacRoleLevel: servicePrincipal.rbacRoleLevel,
        rbacSubscriptionCount: servicePrincipal.rbacSubscriptionCount,
        potentialOwners: servicePrincipal.potentialOwners ?? [],
        ownerConfidence: servicePrincipal.ownerConfidence ?? "none"
      });
    }

    return summaries;
  }

  async queryOAuth2PermissionGrants(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.oauth2PermissionGrants">> {
    return buildPaginatedCollection(
      "entra.oauth2PermissionGrants",
      (await this.entra.readEntraOAuth2PermissionGrants()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryAppRoleAssignments(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.appRoleAssignments">> {
    return buildPaginatedCollection(
      "entra.appRoleAssignments",
      (await this.entra.readEntraAppRoleAssignments()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async readManagedIdentityRows(): Promise<Record<string, unknown>[]> {
    const managedIdentities = await this.enrichWithZtaRemediationSummaries(await this.entra.readManagedIdentities());

    try {
      const [resourceGroupOwnershipRows, userAssignedManagedIdentities] = await Promise.all([
        this.azureResourcesQueries.readResourceGroupOwnershipRows(),
        this.azureResources.readAzureUserAssignedManagedIdentities()
      ]);

      return enrichManagedIdentitiesWithResourceGroupOwners(
        managedIdentities,
        resourceGroupOwnershipRows,
        userAssignedManagedIdentities
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return managedIdentities as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  async readServicePrincipalRows(): Promise<Record<string, unknown>[]> {
    const servicePrincipals = await this.enrichWithZtaRemediationSummaries(await this.entra.readServicePrincipals());

    try {
      return enrichServicePrincipalsWithResourceGroupOwners(
        servicePrincipals,
        await this.azureResourcesQueries.readResourceGroupOwnershipRows()
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return servicePrincipals as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  private async enrichWithZtaRemediationSummaries<Row extends ServicePrincipal | ManagedIdentity>(rows: Row[]): Promise<Row[]> {
    const [summariesByPrincipalId, packagesByPrincipalId] = await Promise.all([
      this.zeroTrustAssessmentQueries.readRemediationSummaries(),
      this.zeroTrustAssessmentQueries.readRemediationPackageSummariesByPrincipalId()
    ]);

    return rows.map((row) => ({
      ...row,
      ...(summariesByPrincipalId.get(row.id.toLowerCase()) ?? {}),
      RemediationPackages: packagesByPrincipalId.get(row.id.toLowerCase()) ?? []
    }));
  }
}

function enrichManagedIdentitiesWithResourceGroupOwners(
  managedIdentities: ManagedIdentity[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[],
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[]
): ManagedIdentity[] {
  return managedIdentities.map((identity) => ({
    ...identity,
    ...projectManagedIdentityOwners(identity.id, identity.appId, resourceGroupOwnershipRows, userAssignedManagedIdentities)
  }));
}

function enrichServicePrincipalsWithResourceGroupOwners(
  servicePrincipals: ServicePrincipal[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[]
): ServicePrincipal[] {
  return servicePrincipals.map((servicePrincipal) => ({
    ...servicePrincipal,
    ...projectServicePrincipalOwners(
      servicePrincipal.roleAssignments,
      resourceGroupOwnershipRows
    )
  }));
}
