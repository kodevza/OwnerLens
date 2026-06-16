import { useCallback, useEffect, useMemo, useState } from "react";

import type { EntraPrincipalAzureRemediationSummary } from "../../core/azure/entra/servicePrincipal";
import type { ZtaRelatedObject } from "../../core/azure/ztaReport";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { JsonValue, RemediationPackage, RemediationTask } from "../../core/runtime/remediation";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { formatDate, formatValue } from "../../lib/utils";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import { Badge } from "../../report/components/ui/badge";
import { Button } from "../../report/components/ui/button";
import { Card } from "../../report/components/ui/card";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { CsvSelectionActionBar } from "./CsvSelectionActionBar";
import { deleteRemediationTasks, exportRemediationPackageTasksCsv } from "./api";
import {
  buildServicePrincipalFieldRenderers,
  type AzureRbacPrincipalSelection,
  type EntraPermissionsPrincipalSelection,
  formatAzureRbacSummary
} from "./ServicePrincipalFieldRenderers";
import {
  getRelatedObjectId,
  getRelatedObjectLabel,
  getRelatedObjectSearchValuesForObject,
  ztaRelatedObjectFieldFilter
} from "./ztaRelatedObjects";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];
const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];

const remediationTaskFields: ReportFieldDescriptor<RemediationTask>[] = [
  {
    id: "status",
    label: "Status",
    valueType: "text",
    getValue: (task) => task.status,
    filter: { kind: "multiSelect", options: ["open"] }
  },
  {
    id: "target",
    label: "Target",
    valueType: "list",
    getValue: (task) => [task.targetLabel, task.targetId, task.targetKind],
    filter: { kind: "text" }
  },
  {
    id: "RelatedObjects",
    label: "Related objects",
    valueType: "list",
    getValue: getTaskRelatedObjectSearchValues,
    filter: ztaRelatedObjectFieldFilter
  },
  {
    id: "potentialOwners",
    label: "Owner",
    valueType: "text",
    getValue: (task) => getTaskAzureEnrichment(task)?.potentialOwners.join(", ") ?? "",
    getFilterValue: (task) => {
      const enrichment = getTaskAzureEnrichment(task);

      return {
        owner: enrichment?.potentialOwners ?? [],
        confidence: enrichment?.ownerConfidence ?? "none"
      };
    },
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner" },
        { id: "confidence", label: "Confidence", options: ownerConfidenceOptions }
      ]
    }
  },
  {
    id: "oauthPermissionsCount",
    label: "Entra API permissions",
    valueType: "number",
    getValue: (task) => getTaskAzureEnrichment(task)?.oauthPermissionsCount ?? 0,
    getFilterValue: (task) => {
      const enrichment = getTaskAzureEnrichment(task);
      return enrichment
        ? [
            enrichment.entraPermissionRisk,
            String(enrichment.oauthPermissionsCount),
            String(enrichment.appRolesPermissionCount)
          ]
        : ["none"];
    },
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "riskLevel",
    getValue: (task) => getTaskAzureEnrichment(task)?.rbacRoleLevel ?? "none",
    getFilterValue: (task) => {
      const enrichment = getTaskAzureEnrichment(task);
      return enrichment
        ? [
            enrichment.rbacRoleLevel,
            String(enrichment.rbacRoleAssignmentCount),
            String(enrichment.rbacSubscriptionCount),
            formatAzureRbacSummary(enrichment)
          ]
        : ["none"];
    },
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "title",
    label: "Title",
    valueType: "text",
    getValue: (task) => task.title,
    filter: { kind: "text" }
  },
  {
    id: "risk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (task) => normalizePermissionRiskLevel(task.risk),
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "sourceContext",
    label: "Source context",
    valueType: "list",
    getValue: (task) => {
      const context = getZtaSourceContext(task.sourceEvidence);
      return context ? [context.testId, context.testStatus] : task.sourceEvidence;
    },
    filter: { kind: "text" }
  }
];

export function RemediationPackageComponent({
  onAzureRbacClick,
  onEntraPermissionsClick,
  remediationPackage
}: {
  remediationPackage: RemediationPackage;
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
}) {
  const [currentPackage, setCurrentPackage] = useState(remediationPackage);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteState, setDeleteState] = useState<{
    status: "idle" | "deleting" | "error";
    message?: string;
  }>({ status: "idle" });
  const fieldRenderers = useMemo<ReportColumnRenderers<RemediationTask>>(
    () => ({
      ...buildServicePrincipalFieldRenderers<RemediationTask>({
        getPrincipalSummary: getTaskAzureEnrichment,
        onAzureRbacClick,
        onEntraPermissionsClick
      }),
      status: (task) => <Badge variant="outline">{task.status}</Badge>,
      target: (task) => (
        <div>
          <div className="font-medium">{task.targetLabel}</div>
          <div className="font-mono text-xs text-muted-foreground">{task.targetId}</div>
          <div className="text-xs text-muted-foreground">{task.targetKind}</div>
        </div>
      ),
      RelatedObjects: (task) => <RelatedObjectEvidence task={task} />,
      sourceContext: (task) => <SourceEvidence task={task} />
    }),
    [onAzureRbacClick, onEntraPermissionsClick]
  );
  const deleteSelectedTasks = useCallback(
    async (taskIds: string[]) => {
      setDeleteState({ status: "deleting" });

      try {
        const updatedPackage = await deleteRemediationTasks({
          packageId: currentPackage.id,
          taskIds
        });

        setCurrentPackage(updatedPackage);
        setSelectedTaskIds([]);
        setDeleteState({ status: "idle" });
      } catch (error) {
        setDeleteState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not delete remediation tasks."
        });
      }
    },
    [currentPackage.id]
  );

  useEffect(() => {
    setCurrentPackage(remediationPackage);
    setSelectedTaskIds([]);
    setDeleteState({ status: "idle" });
  }, [remediationPackage]);

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Source" value={currentPackage.sourceLabel} />
        <SummaryCard label="Created" value={formatDate(currentPackage.createdAt)} />
        <SummaryCard label="Tasks" value={currentPackage.taskCount} />
        <SummaryCard label="Source kind" value={currentPackage.sourceKind} />
      </div>
      <SelectableGenericTable
        emptyMessage="No remediation tasks were created."
        fields={remediationTaskFields}
        fieldRenderers={fieldRenderers}
        getRowKey={(task) => task.id}
        getRowSelectionLabel={(task) => `Select remediation task ${task.title}`}
        minWidthClassName="min-w-[1800px]"
        rows={currentPackage.tasks}
        selectedRowKeys={selectedTaskIds}
        onSelectionChange={setSelectedTaskIds}
        renderSelectionOverlay={({ filters, selectAllMatchingFilters, selectedRowKeys, sortRules }) => (
          <CsvSelectionActionBar
            filters={filters}
            itemLabel="remediation tasks"
            selectAllMatchingFilters={selectAllMatchingFilters}
            selectedRowKeys={selectedRowKeys}
            sortRules={sortRules}
            onExportCsv={(selection) => exportRemediationPackageTasksCsv(currentPackage.id, selection)}
          >
            <span className="text-sm text-muted-foreground">
              {selectedRowKeys.length} selected
            </span>
            <Button
              aria-label={`Delete ${selectedRowKeys.length} selected remediation tasks`}
              disabled={deleteState.status === "deleting"}
              type="button"
              variant="destructive"
              onClick={() => {
                void deleteSelectedTasks(selectedRowKeys);
              }}
            >
              {deleteState.status === "deleting" ? "Deleting..." : "Delete"}
            </Button>
            {deleteState.status === "error" ? <span className="text-sm text-destructive">{deleteState.message}</span> : null}
          </CsvSelectionActionBar>
        )}
      />
    </section>
  );
}

function normalizePermissionRiskLevel(value: string | null): PermissionRiskLevel | null {
  const normalizedValue = value?.toLowerCase();

  return permissionRiskLevelOptions.find((riskLevel) => riskLevel === normalizedValue) ?? null;
}

function RelatedObjectEvidence({ task }: { task: RemediationTask }) {
  const relatedObject = getZtaRelatedObjectContext(task.sourceEvidence);

  if (!relatedObject) {
    return <span className="text-muted-foreground">-</span>;
  }

  const id = getRelatedObjectId(relatedObject);

  return (
    <div className="max-w-md text-sm">
      <div>{getRelatedObjectLabel(relatedObject)}</div>
      {id ? <div className="font-mono text-xs text-muted-foreground">{id}</div> : null}
      {relatedObject.servicePrincipalType ? (
        <div className="text-xs text-muted-foreground">{relatedObject.servicePrincipalType}</div>
      ) : null}
    </div>
  );
}

function SourceEvidence({ task }: { task: RemediationTask }) {
  const context = getZtaSourceContext(task.sourceEvidence);

  if (context) {
    return (
      <div className="max-w-md text-sm">
        <div>{context.testId}</div>
        <div className="text-xs text-muted-foreground">{context.testStatus}</div>
      </div>
    );
  }

  return <pre className="max-w-md overflow-auto text-xs">{JSON.stringify(task.sourceEvidence, null, 2)}</pre>;
}

function getZtaSourceContext(sourceEvidence: JsonValue): {
  testId: string;
  testStatus: string;
} | null {
  if (!isRecord(sourceEvidence) || sourceEvidence.sourceKind !== "zeroTrustAssessment") {
    return null;
  }

  const test = sourceEvidence.test;

  return {
    testId: isRecord(test) ? `ZTA test ${formatValue(test.TestId)}` : "ZTA test",
    testStatus: isRecord(test) ? `Status: ${formatValue(test.TestStatus)}` : "Status: -"
  };
}

function getZtaRelatedObjectContext(sourceEvidence: JsonValue): ZtaRelatedObject | null {
  if (!isRecord(sourceEvidence) || sourceEvidence.sourceKind !== "zeroTrustAssessment") {
    return null;
  }

  const relatedObject = sourceEvidence.relatedObject;

  if (!isRecord(relatedObject)) {
    return null;
  }

  return {
    id: toNullableString(relatedObject.id),
    object_id: toNullableString(relatedObject.object_id),
    servicePrincipalId: toNullableString(relatedObject.servicePrincipalId),
    tags: toStringArray(relatedObject.tags),
    applicationId: toNullableString(relatedObject.applicationId),
    displayName: toNullableString(relatedObject.displayName),
    servicePrincipalType: toNullableString(relatedObject.servicePrincipalType),
    userPrincipalName: toNullableString(relatedObject.userPrincipalName)
  };
}

function getTaskRelatedObjectSearchValues(task: RemediationTask): string[] {
  const relatedObject = getZtaRelatedObjectContext(task.sourceEvidence);

  return relatedObject ? getRelatedObjectSearchValuesForObject(relatedObject) : [];
}

function getTaskAzureEnrichment(task: RemediationTask): EntraPrincipalAzureRemediationSummary | null {
  if (!isRecord(task.sourceEvidence) || !isRecord(task.sourceEvidence.azureEnrichment)) {
    return null;
  }

  const enrichment = task.sourceEvidence.azureEnrichment;

  if (
    typeof enrichment.id !== "string" ||
    typeof enrichment.displayName !== "string" ||
    typeof enrichment.oauthPermissionsCount !== "number" ||
    typeof enrichment.appRolesPermissionCount !== "number" ||
    !isPermissionRiskLevel(enrichment.entraPermissionRisk) ||
    typeof enrichment.rbacRoleAssignmentCount !== "number" ||
    !isPermissionRiskLevel(enrichment.rbacRoleLevel) ||
    typeof enrichment.rbacSubscriptionCount !== "number" ||
    !Array.isArray(enrichment.roleAssignments) ||
    !Array.isArray(enrichment.potentialOwners) ||
    !enrichment.potentialOwners.every((owner) => typeof owner === "string") ||
    !isOwnerConfidence(enrichment.ownerConfidence)
  ) {
    return null;
  }

  return enrichment as EntraPrincipalAzureRemediationSummary;
}

function isPermissionRiskLevel(value: unknown): value is PermissionRiskLevel {
  return permissionRiskLevelOptions.includes(value as PermissionRiskLevel);
}

function isOwnerConfidence(value: unknown): value is OwnerConfidence {
  return ownerConfidenceOptions.includes(value as OwnerConfidence);
}

function SummaryCard({ label, value }: { label: string; value: unknown }) {
  return (
    <Card className="flex min-h-24 flex-col gap-2 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="[overflow-wrap:anywhere] text-xl leading-tight">{formatValue(value)}</strong>
    </Card>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  return values.length > 0 ? values : null;
}
