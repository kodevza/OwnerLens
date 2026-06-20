import type { DuckDBConnection } from "@duckdb/node-api";

import {
  listLocalSnapshotFiles,
  pathExists,
  type LocalSnapshotFile
} from "../../../core/runtime/localSnapshotFiles";

import type { ZtaReport, ZtaReportTest } from "../../../core/azure/ztaReport";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest,
  RemediationPackage
} from "../../../core/runtime/remediation";
import type { RuntimeCollectionCsvExport } from "../../../core/runtime/collectionExport";
import { EntraCollectionQueryService } from "./entra/EntraCollectionQueryService";
import { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type {
  EntraPrincipalPermissions,
  EntraUserGroupMembershipResponse
} from "./entra/EntraReadModel";
import {
  AzureResourcesCollectionQueryService
} from "./resources/AzureResourcesCollectionQueryService";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import {
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../core/runtime/collections";
import { RuntimeHost } from "./RuntimeHost";
import { prepareRuntimeSqlSchema, SnapshotImporter } from "./SnapshotImporter";
import { EnrichmentService, type LocalReportRuntimeInventoryStats } from "./EnrichmentService";
import { ExportService } from "./ExportService";
import {
  OwnershipRuntime,
  type DisabledOwnerKey,
  type OwnershipEvidenceRequest,
  type OwnershipEvidenceResponse
} from "./ownership/OwnershipRuntime";
import { RemediationRuntime } from "./remediation/RemediationRuntime";

export type LocalReportRuntimeOptions = {
  dataDir: string;
  databasePath?: string;
};

export class LocalReportRuntime {
  private readonly dataDir: string;
  private readonly host: RuntimeHost;
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly remediationRuntime: RemediationRuntime;
  private readonly ownershipRuntime: OwnershipRuntime;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly snapshotImporter: SnapshotImporter;
  private readonly enrichmentService: EnrichmentService;
  private readonly exportService: ExportService;
  private initializePromise: Promise<void> | null = null;

  constructor(options: LocalReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.host = new RuntimeHost({ databasePath: options.databasePath ?? ":memory:" });
    this.entra = new LocalEntraReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.azureResources = new LocalAzureResourcesReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.remediationRuntime = new RemediationRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection(),
      getEntraQueries: () => this.entraQueries
    });
    this.snapshotImporter = new SnapshotImporter({
      entra: this.entra,
      azureResources: this.azureResources,
      zeroTrustAssessment: this.remediationRuntime
    });
    this.enrichmentService = new EnrichmentService(() => this.requireConnection());
    this.exportService = new ExportService();
    this.ownershipRuntime = new OwnershipRuntime({
      getConnection: () => this.requireConnection(),
      getEntraQueries: () => this.entraQueries,
      azureResources: this.azureResources
    });
    this.azureResourcesQueries = new AzureResourcesCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      disabledEvidenceStore: this.ownershipRuntime.getDisabledEvidenceStore(),
      exportService: this.exportService
    });
    this.entraQueries = new EntraCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      azureResourcesQueries: this.azureResourcesQueries,
      zeroTrustAssessmentQueries: this.remediationRuntime,
      exportService: this.exportService
    });
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.initializeInternal();
    return this.initializePromise;
  }

  async listSnapshots(): Promise<{ files: LocalSnapshotFile[]; error?: string }> {
    await this.initialize();

    if (!(await pathExists(this.dataDir))) {
      return {
        files: [],
        error:
          "Snapshot directory ./data was not found. Run the snapshot scripts to create ./data/snapshot.json and ./data/entra-snapshot.json."
      };
    }

    return { files: await listLocalSnapshotFiles(this.dataDir) };
  }

  async readInventoryStats(): Promise<LocalReportRuntimeInventoryStats> {
    await this.initialize();
    return this.enrichmentService.readInventoryStats();
  }

  async setOwnerCandidateDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    await this.initialize();
    return this.ownershipRuntime.setOwnerCandidateDisabled(key, disabled);
  }

  async queryEntraServicePrincipals(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.servicePrincipals">> {
    await this.initialize();
    return this.entraQueries.queryServicePrincipals(options);
  }

  async exportEntraServicePrincipalsCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.servicePrincipals">> {
    await this.initialize();
    return this.entraQueries.exportServicePrincipalsCsv(options);
  }

  async queryEntraManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.managedIdentities">> {
    await this.initialize();
    return this.entraQueries.queryManagedIdentities(options);
  }

  async exportEntraManagedIdentitiesCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.managedIdentities">> {
    await this.initialize();
    return this.entraQueries.exportManagedIdentitiesCsv(options);
  }

  async queryEntraOAuth2PermissionGrants(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.oauth2PermissionGrants">> {
    await this.initialize();
    return this.entraQueries.queryOAuth2PermissionGrants(options);
  }

  async queryEntraAppRoleAssignments(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.appRoleAssignments">> {
    await this.initialize();
    return this.entraQueries.queryAppRoleAssignments(options);
  }

  async readEntraPrincipalPermissions(principalId: string): Promise<EntraPrincipalPermissions> {
    await this.initialize();
    return this.entra.readEntraPrincipalPermissions(principalId);
  }

  async readEntraUserGroups(user: string): Promise<EntraUserGroupMembershipResponse> {
    await this.initialize();
    return this.entra.readUserGroupMembership(user);
  }

  async queryAzureSubscriptions(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.subscriptions">> {
    await this.initialize();
    return this.azureResourcesQueries.querySubscriptions(options);
  }

  async queryAzureResourceGroups(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resourceGroups">> {
    await this.initialize();
    return this.azureResourcesQueries.queryResourceGroups(options);
  }

  async queryAzureResourceGroupOwnership(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resourceGroupOwnership">> {
    await this.initialize();
    return this.azureResourcesQueries.queryResourceGroupOwnership(options);
  }

  async readOwnershipEvidence(request: OwnershipEvidenceRequest): Promise<OwnershipEvidenceResponse> {
    await this.initialize();
    return this.ownershipRuntime.readOwnershipEvidence(request);
  }

  async exportAzureResourceGroupOwnershipCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"azureResources.resourceGroupOwnership">> {
    await this.initialize();
    return this.azureResourcesQueries.exportResourceGroupOwnershipCsv(options);
  }

  async queryAzureResources(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.resources">> {
    await this.initialize();
    return this.azureResourcesQueries.queryResources(options);
  }

  async queryAzureUserAssignedManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.userAssignedManagedIdentities">> {
    await this.initialize();
    return this.azureResourcesQueries.queryUserAssignedManagedIdentities(options);
  }

  async queryAzureRoleAssignments(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.roleAssignments">> {
    await this.initialize();
    return this.azureResourcesQueries.queryRoleAssignments(options);
  }

  async queryAzureRbac(
    servicePrincipalId: string,
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureRbac">> {
    await this.initialize();
    return this.azureResourcesQueries.queryAzureRbac(servicePrincipalId, options);
  }

  async queryAzureRbacForResourceGroup(
    target: { subscriptionId: string; resourceGroup: string },
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureRbac">> {
    await this.initialize();
    return this.azureResourcesQueries.queryAzureRbacForResourceGroup(target, options);
  }

  async queryZeroTrustAssessmentReport(
    options: LocalReportCollectionQueryOptions
  ): Promise<
    LocalReportPaginatedCollection<"zeroTrustAssessment.report"> & Pick<ZtaReport, "Meta"> & { Tests: ZtaReportTest[] }
  > {
    await this.initialize();
    return this.remediationRuntime.queryZeroTrustAssessmentReport(options);
  }

  async exportZeroTrustAssessmentReportCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"zeroTrustAssessment.report">> {
    await this.initialize();
    return this.remediationRuntime.exportZeroTrustAssessmentReportCsv(options);
  }

  async createZeroTrustAssessmentRemediationPackage(
    request: CreateRuntimeRemediationPackageRequest
  ): Promise<RemediationPackage> {
    await this.initialize();
    return this.remediationRuntime.createZeroTrustAssessmentRemediationPackage(request);
  }

  async readRemediationPackage(packageId: string): Promise<RemediationPackage> {
    await this.initialize();
    return this.remediationRuntime.readRemediationPackage(packageId);
  }

  async exportRemediationPackageTasksCsv(
    packageId: string,
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"remediationPackage.tasks">> {
    await this.initialize();
    return this.remediationRuntime.exportRemediationPackageTasksCsv(packageId, options);
  }

  async deleteRemediationTasks(request: DeleteRuntimeRemediationTasksRequest): Promise<RemediationPackage> {
    await this.initialize();
    return this.remediationRuntime.deleteRemediationTasks(request);
  }

  async close(): Promise<void> {
    await this.host.close();
    this.initializePromise = null;
  }

  private async initializeInternal(): Promise<void> {
    await this.host.initialize();
    await prepareRuntimeSqlSchema(this.requireConnection());
    await this.snapshotImporter.importSnapshots();
    await this.enrichmentService.recalculate();
    await this.enrichmentService.readStatus();
  }

  private requireConnection(): DuckDBConnection {
    return this.host.requireConnection();
  }
}
