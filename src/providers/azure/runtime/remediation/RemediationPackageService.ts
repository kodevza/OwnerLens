import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import { RemediationPackageStore } from "../../../../core/runtime/RemediationPackageStore";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest,
  JsonValue,
  RemediationPackage,
  RemediationTask,
  RuntimeRemediationPackageFilter
} from "../../../../core/runtime/remediation";
import {
  buildRuntimeCollectionCsvExport,
  type RuntimeCollectionCsvExport
} from "../../../../core/runtime/collectionExport";
import type { RuntimeCsvRow } from "../../../../core/runtime/csv";
import type {
  LocalReportCollectionFilter,
  LocalReportCollectionQueryOptions
} from "../../../../core/runtime/collections";
import { ZeroTrustAssessmentQueryService } from "../zta/ZeroTrustAssessmentQueryService";
import type { EntraPrincipalAzureRemediationSummary } from "../../../../core/azure/entra/servicePrincipal";

type ReadServicePrincipalRemediationSummaries = (
  principalIds: string[]
) => Promise<Map<string, EntraPrincipalAzureRemediationSummary>>;

type RemediationPackageServiceOptions = {
  remediationPackageStore: RemediationPackageStore;
  readServicePrincipalRemediationSummaries: ReadServicePrincipalRemediationSummaries;
  zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
};

export class RemediationPackageService {
  private readonly remediationPackageStore: RemediationPackageStore;
  private readonly readServicePrincipalRemediationSummaries: ReadServicePrincipalRemediationSummaries;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;

  constructor(options: RemediationPackageServiceOptions) {
    this.remediationPackageStore = options.remediationPackageStore;
    this.readServicePrincipalRemediationSummaries = options.readServicePrincipalRemediationSummaries;
    this.zeroTrustAssessmentQueries = options.zeroTrustAssessmentQueries;
  }

  async createZeroTrustAssessmentRemediationPackage(
    request: CreateRuntimeRemediationPackageRequest
  ): Promise<RemediationPackage> {
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

    const remediationPackage = await this.remediationPackageStore.deleteTasks(packageId, taskIds);

    if (!remediationPackage) {
      throw new RuntimeHttpError("Remediation package not found.", 404);
    }

    return this.enrichRemediationPackage(remediationPackage);
  }

  private async enrichRemediationPackage(remediationPackage: RemediationPackage): Promise<RemediationPackage> {
    const principalIds = extractRemediationPackagePrincipalIds(remediationPackage);
    let summariesByPrincipalId: Awaited<ReturnType<ReadServicePrincipalRemediationSummaries>>;

    try {
      summariesByPrincipalId = await this.readServicePrincipalRemediationSummaries(principalIds);
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
  summariesByPrincipalId: Awaited<ReturnType<ReadServicePrincipalRemediationSummaries>>
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
