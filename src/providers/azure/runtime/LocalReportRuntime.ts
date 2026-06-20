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
import type { EntraUserGroupMembershipResponse } from "../../../core/azure/entra/types";
import type { ZtaReport, ZtaReportTest } from "../../../core/azure/ztaReport";
import { RemediationPackageStore } from "../../../core/runtime/RemediationPackageStore";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest,
  JsonValue,
  RemediationPackage,
  RemediationTask,
  RuntimeRemediationPackageFilter
} from "../../../core/runtime/remediation";
import {
  buildRuntimeCollectionCsvExport,
  type RuntimeCollectionCsvExport
} from "../../../core/runtime/collectionExport";
import type { RuntimeCsvRow } from "../../../core/runtime/csv";
import type { SnapshotImportStatus } from "../../../core/runtime/snapshotImportRegistry";
import type { OwnershipEvidenceResponse } from "../../../core/ownership/types";
import type { AzureIdentityEnrichmentStatus } from "./enrichment/azureIdentityEnrichment";
import { EntraCollectionQueryService } from "./entra/EntraCollectionQueryService";
import {
  LocalEntraReportRuntime,
  type EntraPrincipalPermissions
} from "./entra/LocalEntraReportRuntime";
import {
  AzureResourcesCollectionQueryService
} from "./resources/AzureResourcesCollectionQueryService";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import { LocalZeroTrustAssessmentReportRuntime } from "./zta/LocalZeroTrustAssessmentReportRuntime";
import { ZeroTrustAssessmentQueryService } from "./zta/ZeroTrustAssessmentQueryService";
import {
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../core/runtime/collections";
import { RuntimeHost } from "./RuntimeHost";
import { SnapshotImporter } from "./SnapshotImporter";
import { EnrichmentService } from "./EnrichmentService";
import { ExportService } from "./ExportService";
import { DisabledEvidenceStore, type DisabledOwnerKey } from "./DisabledEvidenceStore";
import {
  OwnershipEvidenceQueryService,
  type OwnershipEvidenceRequest
} from "./ownership/OwnershipEvidenceQueryService";
import { prepareRuntimeSqlSchema } from "./runtimeSqlSchema";

export type LocalReportRuntimeOptions = {
  dataDir: string;
  databasePath?: string;
};

export type LocalReportRuntimeStatus = {
  initialized: boolean;
  databasePath: string;
  entra: SnapshotImportStatus;
  azureResources: SnapshotImportStatus;
  zeroTrustAssessment: SnapshotImportStatus;
  enrichment: AzureIdentityEnrichmentStatus;
};

export type LocalReportRuntimeInventoryStats = {
  users: number;
  groups: number;
  servicePrincipals: number;
  managedIdentities: number;
  resourceGroups: number;
  rbacAssignments: number;
};

export class LocalReportRuntime {
  private readonly dataDir: string;
  private readonly host: RuntimeHost;
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly ownershipEvidenceQueries: OwnershipEvidenceQueryService;
  private readonly snapshotImporter: SnapshotImporter;
  private readonly enrichmentService: EnrichmentService;
  private readonly exportService: ExportService;
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
    this.exportService = new ExportService();
    this.disabledEvidenceStore = new DisabledEvidenceStore(() => this.requireConnection());
    this.remediationPackageStore = new RemediationPackageStore(() => this.requireConnection());
    this.azureResourcesQueries = new AzureResourcesCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      disabledEvidenceStore: this.disabledEvidenceStore,
      exportService: this.exportService
    });
    this.entraQueries = new EntraCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      azureResourcesQueries: this.azureResourcesQueries,
      zeroTrustAssessmentQueries: this.zeroTrustAssessmentQueries,
      exportService: this.exportService
    });
    this.ownershipEvidenceQueries = new OwnershipEvidenceQueryService({
      entraQueries: this.entraQueries,
      azureResources: this.azureResources
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

  async readInventoryStats(): Promise<LocalReportRuntimeInventoryStats> {
    await this.initialize();

    const reader = await this.requireConnection().runAndReadAll(`
      select
        (select count(distinct member_id) from entra_group_members where lower(coalesce(member_type, '')) = 'user') as users,
        (select count(distinct group_id) from entra_group_members) as groups,
        (
          select count(*)
          from entra_service_principals
          where lower(service_principal_type) <> 'managedidentity'
        ) as servicePrincipals,
        (
          select count(*)
          from entra_service_principals
          where lower(service_principal_type) = 'managedidentity'
        ) as managedIdentities,
        (
          select count(distinct subscription_id || ':' || lower(resource_group))
          from azure_resource_groups
        ) as resourceGroups,
        (select count(*) from azure_role_assignments) as rbacAssignments
    `);
    const [row] = reader.getRowObjectsJson() as RuntimeInventoryStatsRow[];

    return {
      users: readCount(row?.users),
      groups: readCount(row?.groups),
      servicePrincipals: readCount(row?.servicePrincipals),
      managedIdentities: readCount(row?.managedIdentities),
      resourceGroups: readCount(row?.resourceGroups),
      rbacAssignments: readCount(row?.rbacAssignments)
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

  async setOwnerCandidateDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    await this.initialize();
    return this.disabledEvidenceStore.setDisabled(key, disabled);
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
    return this.ownershipEvidenceQueries.readOwnershipEvidence(request);
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
    return this.zeroTrustAssessmentQueries.queryReport(options);
  }

  async exportZeroTrustAssessmentReportCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"zeroTrustAssessment.report">> {
    await this.initialize();
    return this.zeroTrustAssessmentQueries.exportReportCsv(options);
  }

  async createZeroTrustAssessmentRemediationPackage(
    request: CreateRuntimeRemediationPackageRequest
  ): Promise<RemediationPackage> {
    await this.initialize();
    const selectAllMatchingFilters = normalizeSelectAllMatchingFilters(request.selectAllMatchingFilters);
    const packageInput = await this.zeroTrustAssessmentQueries.buildRemediationPackageInput({
      filters: toLocalReportCollectionFilters(request.filters),
      selectAllMatchingFilters,
      selectedRowKeys: validateSelectedRowKeys(request.selectedRowKeys)
    });

    return this.remediationPackageStore.createPackage({
      ...packageInput,
      sourceQuery: {
        filters: request.filters,
        selectAllMatchingFilters,
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

    return this.enrichRemediationPackage(remediationPackage);
  }

  async exportRemediationPackageTasksCsv(
    packageId: string,
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"remediationPackage.tasks">> {
    const remediationPackage = await this.readRemediationPackage(packageId);

    return buildRuntimeCollectionCsvExport({
      collectionId: "remediationPackage.tasks",
      fileName: `ownerlens-remediation-package-${remediationPackage.id}.csv`,
      rows: remediationPackage.tasks.map(toRemediationTaskCsvRow),
      filters: options.filters,
      sortRules: options.sortRules,
      selectedRowKeys: options.selectedRowKeys,
      getRowKey: (row) => String(row.id ?? ""),
      columns: remediationTaskCsvColumns,
      includeBom: true
    });
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

    return this.enrichRemediationPackage(remediationPackage);
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

  private async enrichRemediationPackage(remediationPackage: RemediationPackage): Promise<RemediationPackage> {
    const principalIds = extractRemediationPackagePrincipalIds(remediationPackage);
    let summariesByPrincipalId: Awaited<ReturnType<EntraCollectionQueryService["readServicePrincipalRemediationSummaries"]>>;

    try {
      summariesByPrincipalId = await this.entraQueries.readServicePrincipalRemediationSummaries(principalIds);
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return remediationPackage;
      }

      throw error;
    }

    if (summariesByPrincipalId.size === 0) {
      return remediationPackage;
    }

    return {
      ...remediationPackage,
      tasks: remediationPackage.tasks.map((task) => enrichRemediationTask(task, summariesByPrincipalId))
    };
  }
}

function enrichRemediationTask(
  task: RemediationTask,
  summariesByPrincipalId: Awaited<ReturnType<EntraCollectionQueryService["readServicePrincipalRemediationSummaries"]>>
): RemediationTask {
  const summary = getTaskPrincipalIds(task).map((principalId) => summariesByPrincipalId.get(principalId)).find(Boolean);

  if (!summary || !isRecord(task.sourceEvidence)) {
    return task;
  }

  return {
    ...task,
    sourceEvidence: {
      ...task.sourceEvidence,
      azureEnrichment: toJsonValue(summary)
    }
  };
}

function extractRemediationPackagePrincipalIds(remediationPackage: RemediationPackage): string[] {
  return [...new Set(remediationPackage.tasks.flatMap(getTaskPrincipalIds))];
}

function getTaskPrincipalIds(task: RemediationTask): string[] {
  const ids = [
    task.targetId,
    ...getSourceEvidenceRelatedPrincipalIds(task.sourceEvidence)
  ];

  return ids.map((id) => id.trim().toLowerCase()).filter(Boolean);
}

function getSourceEvidenceRelatedPrincipalIds(sourceEvidence: JsonValue): string[] {
  if (!isRecord(sourceEvidence)) {
    return [];
  }

  const relatedObject = sourceEvidence.relatedObject;
  if (!isRecord(relatedObject)) {
    return [];
  }

  return [
    toNullableString(relatedObject.id),
    toNullableString(relatedObject.object_id),
    toNullableString(relatedObject.servicePrincipalId)
  ].filter((value): value is string => value !== null);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function toLocalReportCollectionFilters(
  filters: CreateRuntimeRemediationPackageRequest["filters"]
): LocalReportCollectionFilter[] {
  if (!isRecord(filters)) {
    throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filters.", 400);
  }

  return Object.entries(filters).flatMap(([column, filter]) => {
    if (isRecord(filter) && filter.type === "objectFields") {
      if (
        !Array.isArray(filter.conditions) ||
        !filter.conditions.every(
          (condition) => isRecord(condition) && typeof condition.fieldId === "string" && typeof condition.value === "string"
        )
      ) {
        throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package filter conditions.", 400);
      }

      return filter.conditions
        .filter((condition) => condition.fieldId.trim() && condition.value.trim())
        .map((condition) => ({
          column: condition.fieldId.includes(".") ? condition.fieldId : `${column}.${condition.fieldId}`,
          values: [condition.value]
        }));
    }

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

function normalizeSelectAllMatchingFilters(value: unknown): boolean {
  return value === true;
}

const remediationTaskCsvColumns = [
  { id: "id", header: "Task ID" },
  { id: "packageId", header: "Package ID" },
  { id: "createdAt", header: "Created" },
  { id: "status", header: "Status" },
  { id: "targetLabel", header: "Target label" },
  { id: "RelatedObjects", header: "Related objects" },
  { id: "potentialOwners", header: "Owner" },
  { id: "ownerConfidence", header: "Owner confidence" },
  { id: "oauthPermissionsCount", header: "OAuth permissions" },
  { id: "appRolesPermissionCount", header: "App role permissions" },
  { id: "entraPermissionRisk", header: "Entra permission risk" },
  { id: "azureRbac", header: "Azure RBAC risk" },
  { id: "rbacRoleAssignmentCount", header: "Azure RBAC assignments" },
  { id: "rbacSubscriptionCount", header: "Azure RBAC subscriptions" },
  { id: "title", header: "Title" },
  { id: "risk", header: "Risk" },

] as const;

function toRemediationTaskCsvRow(task: RemediationTask): RuntimeCsvRow {
  const enrichment = readAzureEnrichment(task.sourceEvidence);
  const relatedObject = readRelatedObject(task.sourceEvidence);
  const sourceContext = readZtaSourceContext(task.sourceEvidence);

  return {
    id: task.id,
    packageId: task.packageId,
    createdAt: task.createdAt,
    status: task.status,
    target: [task.targetLabel, task.targetId, task.targetKind],
    targetKind: task.targetKind,
    targetId: task.targetId,
    targetLabel: task.targetLabel,
    RelatedObjects: relatedObject,
    potentialOwners: {
      owner: enrichment?.potentialOwners ?? [],
      confidence: enrichment?.ownerConfidence ?? "none"
    },
    ownerConfidence: enrichment?.ownerConfidence ?? "none",
    oauthPermissionsCount: enrichment
      ? [
          enrichment.entraPermissionRisk,
          String(enrichment.oauthPermissionsCount),
          String(enrichment.appRolesPermissionCount)
        ]
      : ["none"],
    appRolesPermissionCount: enrichment?.appRolesPermissionCount ?? 0,
    entraPermissionRisk: enrichment?.entraPermissionRisk ?? "none",
    azureRbac: enrichment
      ? [
          enrichment.rbacRoleLevel,
          String(enrichment.rbacRoleAssignmentCount),
          String(enrichment.rbacSubscriptionCount)
        ]
      : ["none"],
    rbacRoleAssignmentCount: enrichment?.rbacRoleAssignmentCount ?? 0,
    rbacSubscriptionCount: enrichment?.rbacSubscriptionCount ?? 0,
    title: task.title,
    risk: task.risk,
    sourceContext: sourceContext ? [sourceContext.testId, sourceContext.testStatus] : task.sourceEvidence,
    sourceEvidence: task.sourceEvidence
  };
}

function readAzureEnrichment(sourceEvidence: JsonValue): {
  appRolesPermissionCount: number;
  entraPermissionRisk: string;
  oauthPermissionsCount: number;
  ownerConfidence: string;
  potentialOwners: string[];
  rbacRoleAssignmentCount: number;
  rbacRoleLevel: string;
  rbacSubscriptionCount: number;
} | null {
  if (!isRecord(sourceEvidence) || !isRecord(sourceEvidence.azureEnrichment)) {
    return null;
  }

  const enrichment = sourceEvidence.azureEnrichment;

  return {
    appRolesPermissionCount: readNumber(enrichment.appRolesPermissionCount),
    entraPermissionRisk: readString(enrichment.entraPermissionRisk) ?? "none",
    oauthPermissionsCount: readNumber(enrichment.oauthPermissionsCount),
    ownerConfidence: readString(enrichment.ownerConfidence) ?? "none",
    potentialOwners: readStringArray(enrichment.potentialOwners),
    rbacRoleAssignmentCount: readNumber(enrichment.rbacRoleAssignmentCount),
    rbacRoleLevel: readString(enrichment.rbacRoleLevel) ?? "none",
    rbacSubscriptionCount: readNumber(enrichment.rbacSubscriptionCount)
  };
}

function readRelatedObject(sourceEvidence: JsonValue): Record<string, string | string[] | null> | null {
  if (!isRecord(sourceEvidence) || !isRecord(sourceEvidence.relatedObject)) {
    return null;
  }

  const relatedObject = sourceEvidence.relatedObject;

  return {
    id: readString(relatedObject.id),
    object_id: readString(relatedObject.object_id),
    servicePrincipalId: readString(relatedObject.servicePrincipalId),
    applicationId: readString(relatedObject.applicationId),
    displayName: readString(relatedObject.displayName),
    servicePrincipalType: readString(relatedObject.servicePrincipalType),
    userPrincipalName: readString(relatedObject.userPrincipalName),
    tags: readStringArray(relatedObject.tags)
  };
}

function readZtaSourceContext(sourceEvidence: JsonValue): { testId: string; testStatus: string } | null {
  if (!isRecord(sourceEvidence) || sourceEvidence.sourceKind !== "zeroTrustAssessment" || !isRecord(sourceEvidence.test)) {
    return null;
  }

  return {
    testId: `ZTA test ${formatJsonScalar(sourceEvidence.test.TestId)}`,
    testStatus: `Status: ${formatJsonScalar(sourceEvidence.test.TestStatus)}`
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type RuntimeInventoryStatsRow = {
  users?: unknown;
  groups?: unknown;
  servicePrincipals?: unknown;
  managedIdentities?: unknown;
  resourceGroups?: unknown;
  rbacAssignments?: unknown;
};

function readCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatJsonScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
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
