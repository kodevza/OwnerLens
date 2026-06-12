import { useCallback, useEffect, useMemo, useState } from "react";

import type { JsonValue, RemediationPackage, RemediationTask } from "../../core/runtime/remediation";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { formatDate, formatValue } from "../../lib/utils";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import { Badge } from "../../report/components/ui/badge";
import { Button } from "../../report/components/ui/button";
import { Card } from "../../report/components/ui/card";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { deleteRemediationTasks } from "./api";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];

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
    id: "relatedObject",
    label: "Related object",
    valueType: "list",
    getValue: (task) => {
      const relatedObject = getZtaRelatedObjectContext(task.sourceEvidence);
      return relatedObject ? [relatedObject.label, relatedObject.id, relatedObject.kind] : [];
    },
    filter: { kind: "text" }
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

export function RemediationPackageComponent({ remediationPackage }: { remediationPackage: RemediationPackage }) {
  const [currentPackage, setCurrentPackage] = useState(remediationPackage);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteState, setDeleteState] = useState<{
    status: "idle" | "deleting" | "error";
    message?: string;
  }>({ status: "idle" });
  const fieldRenderers = useMemo<ReportColumnRenderers<RemediationTask>>(
    () => ({
      status: (task) => <Badge variant="outline">{task.status}</Badge>,
      target: (task) => (
        <div>
          <div className="font-medium">{task.targetLabel}</div>
          <div className="font-mono text-xs text-muted-foreground">{task.targetId}</div>
          <div className="text-xs text-muted-foreground">{task.targetKind}</div>
        </div>
      ),
      relatedObject: (task) => <RelatedObjectEvidence task={task} />,
      sourceContext: (task) => <SourceEvidence task={task} />
    }),
    []
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
        minWidthClassName="min-w-[1400px]"
        rows={currentPackage.tasks}
        selectedRowKeys={selectedTaskIds}
        onSelectionChange={setSelectedTaskIds}
        renderSelectionOverlay={({ selectedRowKeys }) => (
          <div className="fixed bottom-0 left-0 z-50 flex h-[120px] w-full items-center justify-end gap-4 border-t bg-background/95 px-6 shadow-lg backdrop-blur">
            {deleteState.status === "error" ? (
              <div className="max-w-xl text-sm text-destructive">{deleteState.message}</div>
            ) : null}
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
          </div>
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

  return (
    <div className="max-w-md text-sm">
      <div>{relatedObject.label}</div>
      {relatedObject.id ? <div className="font-mono text-xs text-muted-foreground">{relatedObject.id}</div> : null}
      {relatedObject.kind ? <div className="text-xs text-muted-foreground">{relatedObject.kind}</div> : null}
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

function getZtaRelatedObjectContext(sourceEvidence: JsonValue): {
  id: string | null;
  kind: string | null;
  label: string;
} | null {
  if (!isRecord(sourceEvidence) || sourceEvidence.sourceKind !== "zeroTrustAssessment") {
    return null;
  }

  const relatedObject = sourceEvidence.relatedObject;

  if (!isRecord(relatedObject)) {
    return null;
  }

  const id = toNullableString(relatedObject.id) ?? toNullableString(relatedObject.object_id);
  const label =
    toNullableString(relatedObject.displayName) ??
    toNullableString(relatedObject.userPrincipalName) ??
    toNullableString(relatedObject.servicePrincipalId) ??
    id ??
    "-";

  return {
    id,
    kind: toNullableString(relatedObject.servicePrincipalType),
    label
  };
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
