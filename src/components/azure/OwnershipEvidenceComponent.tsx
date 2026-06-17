import { useCallback, useEffect, useMemo, useState } from "react";

import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../core/ownership/types";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import { ConfidenceBadge } from "../../report/components/ConfidenceBadge";
import { Badge } from "../../report/components/ui/badge";
import { Card } from "../../report/components/ui/card";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { readOwnershipEvidence, updateEvidenceStatus, type EvidenceStatus, type OwnershipEvidenceTarget } from "./api";

const ownershipEvidenceFields: ReportFieldDescriptor<OwnershipEvidenceItem>[] = [
  {
    id: "ownerDisplayName",
    label: "Owner candidate",
    valueType: "text",
    getValue: (evidence) => evidence.ownerDisplayName,
    getFilterValue: (evidence) => ({
      owner: evidence.ownerDisplayName,
      type: evidence.ownerType
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner candidate", filterColumnId: "ownerDisplayName" },
        { id: "type", label: "Type", filterColumnId: "ownerType", options: ["ownerUser", "ownerGroup", "ownerTag", "unknown"] }
      ]
    }
  },
  {
    id: "status",
    label: "Status",
    valueType: "text",
    getValue: (evidence) => getEvidenceStatusLabel(evidence),
    filter: { kind: "multiSelect", options: ["Active", "Unactive"] }
  },
  {
    id: "confidence",
    label: "Confidence",
    valueType: "ownerConfidence",
    getValue: (evidence) => evidence.confidence,
    filter: { kind: "multiSelect", options: ["high", "medium", "low", "none"] }
  },
  {
    id: "source",
    label: "Source",
    valueType: "text",
    getValue: (evidence) => evidence.source,
    filter: {
      kind: "multiSelect",
      options: [
        "resourceGroupOwner",
        "subscriptionOwner",
        "entraServicePrincipalOwner",
        "entraApplicationOwner",
        "activity",
        "tag"
      ]
    }
  },
  {
    id: "path",
    label: "Path",
    valueType: "text",
    getValue: (evidence) => evidence.path,
    filter: { kind: "multiSelect", options: ["direct", "indirect"] }
  },
  {
    id: "discoverySource",
    label: "Found by",
    valueType: "text",
    getValue: (evidence) => evidence.discoverySource,
    filter: {
      kind: "multiSelect",
      options: ["azureRbac", "activityLog", "tag", "applicationOwner", "servicePrincipalOwner"]
    }
  },
  {
    id: "evidence",
    label: "Evidence",
    valueType: "text",
    getValue: (evidence) => evidence.evidence,
    filter: { kind: "text" }
  },
  {
    id: "relatedScopes",
    label: "Evidence location",
    valueType: "text",
    getValue: (evidence) => evidence.relatedScopes.map(formatOwnershipEvidenceScope).join(", "),
    filter: { kind: "text" }
  },
  {
    id: "date",
    label: "Evidence date",
    valueType: "date",
    getValue: (evidence) => evidence.date,
    filter: { kind: "text" }
  },
];

function buildOwnershipEvidenceFieldRenderers({
  onStatusChange,
  updatingEvidenceKeys
}: {
  onStatusChange: (evidence: OwnershipEvidenceItem, status: EvidenceStatus) => void;
  updatingEvidenceKeys: ReadonlySet<string>;
}): ReportColumnRenderers<OwnershipEvidenceItem> {
  return {
    ownerDisplayName: (evidence) => (
      <div className="min-w-0">
        <div className="font-medium">{evidence.ownerDisplayName || "-"}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{evidence.ownerType}</div>
      </div>
    ),
    confidence: (evidence) => <ConfidenceBadge confidence={evidence.confidence} />,
    source: (evidence) => <span>{formatOwnershipEvidenceSource(evidence.source)}</span>,
    path: (evidence) => <span>{formatOwnershipEvidencePath(evidence.path)}</span>,
    discoverySource: (evidence) => <span>{formatOwnershipEvidenceDiscoverySource(evidence.discoverySource)}</span>,
    relatedScopes: (evidence) => (
      <div className="max-w-md space-y-1">
        {evidence.relatedScopes.length === 0
          ? <span className="text-muted-foreground">-</span>
          : evidence.relatedScopes.map((scope) => (
              <div key={formatOwnershipEvidenceScope(scope)} className="truncate" title={formatOwnershipEvidenceScope(scope)}>
                {formatOwnershipEvidenceScope(scope)}
              </div>
            ))}
      </div>
    ),
    status: (evidence) => {
      const isUpdating = updatingEvidenceKeys.has(evidence.key);
      const nextStatus: EvidenceStatus = evidence.disabled ? "active" : "unactive";

      return (
        <Badge
          aria-disabled={isUpdating}
          aria-label={`Set ${evidence.ownerDisplayName} ownership evidence ${nextStatus}`}
          className="min-w-20 justify-center"
          role="button"
          tabIndex={isUpdating ? -1 : 0}
          title={evidence.disabled ? "Set Active" : "Set Unactive"}
          variant={evidence.disabled ? "riskMedium" : "riskLow"}
          onClick={() => {
            if (!isUpdating) {
              onStatusChange(evidence, nextStatus);
            }
          }}
          onKeyDown={(event) => {
            if (!isUpdating && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onStatusChange(evidence, nextStatus);
            }
          }}
        >
          {isUpdating ? "Updating" : getEvidenceStatusLabel(evidence)}
        </Badge>
      );
    }
  };
}

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      response: OwnershipEvidenceResponse;
    }
  | {
      status: "error";
      message: string;
    };

export function OwnershipEvidenceComponent({
  displayName,
  target
}: {
  displayName: string;
  target: OwnershipEvidenceTarget;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [updatingEvidenceKeys, setUpdatingEvidenceKeys] = useState<ReadonlySet<string>>(() => new Set());

  const loadOwnershipEvidence = useCallback(
    async (signal: AbortSignal) => {
      setLoadState({ status: "loading" });

      const response = await readOwnershipEvidence({
        signal,
        target
      });

      setLoadState({ status: "ready", response });
    },
    [target]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        await loadOwnershipEvidence(controller.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load ownership evidence."
        });
      }
    }

    void load();

    return () => controller.abort();
  }, [loadOwnershipEvidence]);

  const handleStatusChange = useCallback(
    async (evidence: OwnershipEvidenceItem, status: EvidenceStatus) => {
      setUpdatingEvidenceKeys((current) => new Set(current).add(evidence.key));

      try {
        await updateEvidenceStatus({ key: evidence.key, status });
        const controller = new AbortController();
        await loadOwnershipEvidence(controller.signal);
      } catch (error) {
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not update ownership evidence status."
        });
      } finally {
        setUpdatingEvidenceKeys((current) => {
          const next = new Set(current);
          next.delete(evidence.key);
          return next;
        });
      }
    },
    [loadOwnershipEvidence]
  );

  const fieldRenderers = useMemo(
    () =>
      buildOwnershipEvidenceFieldRenderers({
        onStatusChange: handleStatusChange,
        updatingEvidenceKeys
      }),
    [handleStatusChange, updatingEvidenceKeys]
  );

  if (loadState.status === "loading") {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading ownership evidence...</Card>;
  }

  if (loadState.status === "error") {
    return <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-900">{loadState.message}</Card>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{loadState.response.target.displayName ?? displayName}</h2>
        <div className="mt-1 text-sm text-muted-foreground">{formatOwnershipEvidenceTarget(loadState.response)}</div>
      </div>
      <SelectableGenericTable
        emptyMessage="No ownership evidence was found."
        fieldRenderers={fieldRenderers}
        fields={ownershipEvidenceFields}
        getRowKey={(evidence) => evidence.key}
        getRowSelectionLabel={(evidence) => `Select ownership evidence ${evidence.ownerDisplayName} ${evidence.evidence}`}
        minWidthClassName="min-w-[1360px]"
        rows={loadState.response.evidence}
      />
    </section>
  );
}

function getEvidenceStatusLabel(evidence: Pick<OwnershipEvidenceItem, "disabled">): "Active" | "Unactive" {
  return evidence.disabled ? "Unactive" : "Active";
}

function formatOwnershipEvidenceScope(scope: OwnershipEvidenceItem["relatedScopes"][number]): string {
  const resourceGroup = scope.resourceGroup ? ` / ${scope.resourceGroup}` : "";
  const assignmentScope = scope.scope ? ` on ${scope.scope}` : "";
  const role = scope.roleDefinitionName ? ` as ${scope.roleDefinitionName}` : "";

  return `${scope.subscriptionName ?? scope.subscriptionId ?? "Subscription"}${resourceGroup}${assignmentScope}${role}`;
}

function formatOwnershipEvidenceTarget(response: OwnershipEvidenceResponse): string {
  const { target } = response;

  if (target.kind === "resourceGroup") {
    return `${target.subscriptionName ?? target.subscriptionId ?? "Subscription"} / ${target.resourceGroup ?? target.id}`;
  }

  return target.id;
}

function formatOwnershipEvidenceSource(source: OwnershipEvidenceItem["source"]): string {
  switch (source) {
    case "resourceGroupOwner":
      return "Resource group owner";
    case "subscriptionOwner":
      return "Subscription owner";
    case "entraServicePrincipalOwner":
      return "Service principal owner";
    case "entraApplicationOwner":
      return "Application owner";
    case "activity":
      return "Activity";
    case "tag":
      return "Tag";
  }
}

function formatOwnershipEvidencePath(path: OwnershipEvidenceItem["path"]): string {
  switch (path) {
    case "direct":
      return "Direct";
    case "indirect":
      return "Indirect";
  }
}

function formatOwnershipEvidenceDiscoverySource(source: OwnershipEvidenceItem["discoverySource"]): string {
  switch (source) {
    case "azureRbac":
      return "Azure RBAC";
    case "activityLog":
      return "Activity log";
    case "tag":
      return "Tag";
    case "applicationOwner":
      return "Application owner";
    case "servicePrincipalOwner":
      return "Service principal owner";
  }
}
