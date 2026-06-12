import type { DuckDBConnection } from "@duckdb/node-api";

import {
  listLocalSnapshotFiles,
  pathExists,
  readLocalSnapshotFile,
  RuntimeHttpError,
  validateSnapshotFileName,
  type LocalSnapshotData,
  type LocalSnapshotFile
} from "../../../core/runtime/localSnapshotFiles";
import type { ManagedIdentity } from "../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../core/azure/entra/servicePrincipal";
import type { ZtaReport, ZtaReportTest } from "../../../core/azure/ztaReport";
import { RemediationPackageStore } from "../../../core/runtime/RemediationPackageStore";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest,
  RemediationPackage,
  RuntimeRemediationPackageFilter
} from "../../../core/runtime/remediation";
import type { AzureIdentityEnrichmentStatus } from "./enrichment/azureIdentityEnrichment";
import { EntraCollectionQueryService } from "./entra/EntraCollectionQueryService";
import {
  LocalEntraReportRuntime,
  type EntraPrincipalPermissions,
  type LocalEntraReportCollectionId
} from "./entra/LocalEntraReportRuntime";
import type { EntraDuckDbImportStatus } from "./entra/snapshotStore";
import {
  AzureResourcesCollectionQueryService,
  type LocalAzureResourcesExtendedCollectionId
} from "./resources/AzureResourcesCollectionQueryService";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import type { AzureResourcesDuckDbImportStatus } from "./resources/snapshotStore";
import { LocalZeroTrustAssessmentReportRuntime } from "./zta/LocalZeroTrustAssessmentReportRuntime";
import type { ZeroTrustAssessmentDuckDbImportStatus } from "./zta/snapshotStore";
import {
  ZeroTrustAssessmentQueryService,
  type LocalZeroTrustAssessmentReportCollectionId
} from "./zta/ZeroTrustAssessmentQueryService";
import {
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "./localReportCollections";
import { RuntimeHost } from "./RuntimeHost";
import { SnapshotImporter } from "./SnapshotImporter";
import { EnrichmentService } from "./EnrichmentService";
import { DisabledEvidenceStore, type DisabledOwnerKey } from "./DisabledEvidenceStore";
import { prepareRuntimeSqlSchema } from "./runtimeSqlSchema";

export type LocalReportRuntimeOptions = {
  dataDir: string;
  databasePath?: string;
};

export type LocalReportRuntimeStatus = {
  initialized: boolean;
  databasePath: string;
  entra: EntraDuckDbImportStatus;
  azureResources: AzureResourcesDuckDbImportStatus;
  zeroTrustAssessment: ZeroTrustAssessmentDuckDbImportStatus;
  enrichment: AzureIdentityEnrichmentStatus;
};

export type LocalReportCollectionId =
  | LocalEntraReportCollectionId
  | LocalAzureResourcesExtendedCollectionId
  | LocalZeroTrustAssessmentReportCollectionId;

export class LocalReportRuntime {
  private readonly dataDir: string;
  private readonly host: RuntimeHost;
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly snapshotImporter: SnapshotImporter;
  private readonly enrichmentService: EnrichmentService;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;
  private readonly remediationPackageStore: RemediationPackageStore;
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
    this.zeroTrustAssessment = new LocalZeroTrustAssessmentReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.zeroTrustAssessmentQueries = new ZeroTrustAssessmentQueryService({
      zeroTrustAssessment: this.zeroTrustAssessment
    });
    this.snapshotImporter = new SnapshotImporter({
      entra: this.entra,
      azureResources: this.azureResources,
      zeroTrustAssessment: this.zeroTrustAssessment
    });
    this.enrichmentService = new EnrichmentService(() => this.requireConnection());
    this.disabledEvidenceStore = new DisabledEvidenceStore(() => this.requireConnection());
    this.remediationPackageStore = new RemediationPackageStore(() => this.requireConnection());
    this.azureResourcesQueries = new AzureResourcesCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      disabledEvidenceStore: this.disabledEvidenceStore
    });
    this.entraQueries = new EntraCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      azureResourcesQueries: this.azureResourcesQueries,
      zeroTrustAssessmentQueries: this.zeroTrustAssessmentQueries
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

  async readSnapshot(name: string): Promise<LocalSnapshotData> {
    await this.initialize();
    validateSnapshotFileName(name);

    if (this.entra.canReadSnapshot(name)) {
      return this.entra.readSnapshot();
    }

    if (this.azureResources.canReadSnapshot(name)) {
      return this.azureResources.readSnapshot();
    }

    return readLocalSnapshotFile(this.dataDir, name);
  }

  getStatus(): LocalReportRuntimeStatus {
    const importStatus = this.snapshotImporter.getStatus();

    return {
      initialized: this.host.isInitialized(),
      databasePath: this.host.getDatabasePath(),
      entra: importStatus.entra,
      azureResources: importStatus.azureResources,
      zeroTrustAssessment: importStatus.zeroTrustAssessment,
      enrichment: this.enrichmentService.getStatus()
    };
  }

  async readServicePrincipals(): Promise<ServicePrincipal[]> {
    await this.initialize();
    return this.entra.readServicePrincipals();
  }

  async readManagedIdentities(): Promise<ManagedIdentity[]> {
    await this.initialize();
    return this.entra.readManagedIdentities();
  }

  async readZeroTrustAssessmentReport(): Promise<ZtaReport> {
    await this.initialize();
    return this.zeroTrustAssessmentQueries.readReport();
  }

  async recalculateEnrichment(): Promise<void> {
    await this.initialize();
    await this.enrichmentService.recalculate();
  }

  async setOwnerEvidenceDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    await this.initialize();
    return this.disabledEvidenceStore.setDisabled(key, disabled);
  }

  async queryEntraServicePrincipals(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.servicePrincipals">> {
    await this.initialize();
    return this.entraQueries.queryServicePrincipals(options);
  }

  async queryEntraManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.managedIdentities">> {
    await this.initialize();
    return this.entraQueries.queryManagedIdentities(options);
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

  async queryAzureActivityLogs(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"azureResources.activityLogs">> {
    await this.initialize();
    return this.azureResourcesQueries.queryActivityLogs(options);
  }

  async queryZeroTrustAssessmentReport(
    options: LocalReportCollectionQueryOptions
  ): Promise<
    LocalReportPaginatedCollection<"zeroTrustAssessment.report"> & Pick<ZtaReport, "Meta"> & { Tests: ZtaReportTest[] }
  > {
    await this.initialize();
    return this.zeroTrustAssessmentQueries.queryReport(options);
  }

  async createZeroTrustAssessmentRemediationPackage(
    request: CreateRuntimeRemediationPackageRequest
  ): Promise<RemediationPackage> {
    await this.initialize();
    const packageInput = await this.zeroTrustAssessmentQueries.buildRemediationPackageInput({
      filters: toLocalReportCollectionFilters(request.filters),
      selectedRowKeys: validateSelectedRowKeys(request.selectedRowKeys)
    });

    return this.remediationPackageStore.createPackage({
      ...packageInput,
      sourceQuery: {
        filters: request.filters,
        selectedRowKeys: request.selectedRowKeys
      }
    });
  }

  async readRemediationPackage(packageId: string): Promise<RemediationPackage> {
    const trimmedPackageId = packageId.trim();

    if (!trimmedPackageId) {
      throw new RuntimeHttpError("Missing remediation package id.", 400);
    }

    await this.initialize();
    const remediationPackage = await this.remediationPackageStore.readPackage(trimmedPackageId);

    if (!remediationPackage) {
      throw new RuntimeHttpError("Remediation package not found.", 404);
    }

    return remediationPackage;
  }

  async deleteRemediationTasks(request: DeleteRuntimeRemediationTasksRequest): Promise<RemediationPackage> {
    const packageId = request.packageId.trim();
    const taskIds = validateRemediationTaskIds(request.taskIds);

    if (!packageId) {
      throw new RuntimeHttpError("Missing remediation package id.", 400);
    }

    if (taskIds.length === 0) {
      throw new RuntimeHttpError("Missing remediation task ids.", 400);
    }

    await this.initialize();
    const remediationPackage = await this.remediationPackageStore.deleteTasks(packageId, taskIds);

    if (!remediationPackage) {
      throw new RuntimeHttpError("Remediation package not found.", 404);
    }

    return remediationPackage;
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

function toLocalReportCollectionFilters(
  filters: CreateRuntimeRemediationPackageRequest["filters"]
): LocalReportCollectionFilter[] {
  if (!isRecord(filters)) {
    throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filters.", 400);
  }

  return Object.entries(filters).flatMap(([column, filter]) => {
    const values = getFilterValues(filter);
    return values.length > 0 ? [{ column, values }] : [];
  });
}

function getFilterValues(filter: RuntimeRemediationPackageFilter): string[] {
  if (!isRecord(filter) || typeof filter.type !== "string") {
    throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filter.", 400);
  }

  if (filter.type === "text") {
    return typeof filter.value === "string" && filter.value.trim() ? [filter.value] : [];
  }

  if (filter.type === "values") {
    if (!Array.isArray(filter.values) || !filter.values.every((value) => typeof value === "string")) {
      throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filter values.", 400);
    }

    return filter.values;
  }

  throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filter type.", 400);
}

function validateSelectedRowKeys(selectedRowKeys: unknown): string[] {
  if (!Array.isArray(selectedRowKeys) || !selectedRowKeys.every((rowKey) => typeof rowKey === "string")) {
    throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package selection.", 400);
  }

  return selectedRowKeys;
}

function validateRemediationTaskIds(taskIds: unknown): string[] {
  if (!Array.isArray(taskIds)) {
    throw new RuntimeHttpError("Invalid remediation task ids.", 400);
  }

  return taskIds.map((taskId) => {
    if (typeof taskId !== "string" || taskId.trim().length === 0) {
      throw new RuntimeHttpError("Invalid remediation task id.", 400);
    }

    return taskId.trim();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
