import { UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../core/ownership/types";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import { ConfidenceBadge } from "../../report/components/ConfidenceBadge";
import { Badge } from "../../report/components/ui/badge";
import { Card } from "../../report/components/ui/card";
import { EntraUserGroupsDropdown } from "./EntraUserGroupsDropdown";
import { readOwnershipEvidence, updateEvidenceStatus, type EvidenceStatus, type OwnershipEvidenceTarget } from "./api";
import {
  formatOwnershipEvidenceDiscoverySource,
  formatOwnershipEvidencePath,
  formatOwnershipEvidenceScope,
  formatOwnershipEvidenceSource,
  formatOwnershipEvidenceTarget,
  getEvidenceStatusLabel
} from "./ownershipEvidenceFormatters";
import { ownershipEvidenceFields } from "./ownershipEvidenceFields";

function buildOwnershipEvidenceFieldRenderers({
  onUserGroupsClick,
  onStatusChange,
  updatingEvidenceKeys
}: {
  onUserGroupsClick: (evidence: OwnershipEvidenceItem, event: MouseEvent<HTMLButtonElement>) => void;
  onStatusChange: (evidence: OwnershipEvidenceItem, status: EvidenceStatus) => void;
  updatingEvidenceKeys: ReadonlySet<string>;
}): ReportColumnRenderers<OwnershipEvidenceItem> {
  return {
    ownerDisplayName: (evidence) => (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate font-medium" title={evidence.ownerDisplayName || undefined}>
            {evidence.ownerDisplayName || "-"}
          </div>
          {evidence.ownerType === "ownerUser" && evidence.ownerDisplayName ? (
            <button
              aria-label={`Open direct groups for ${evidence.ownerDisplayName}`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-input text-muted-foreground hover:bg-muted hover:text-foreground"
              title={`Open direct groups for ${evidence.ownerDisplayName}`}
              type="button"
              onClick={(event) => onUserGroupsClick(evidence, event)}
            >
              <UsersRound aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
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
      const nextStatusLabel = evidence.disabled ? "Active" : "Inactive";

      return (
        <Badge
          aria-disabled={isUpdating}
          aria-label={`Set ${evidence.ownerDisplayName} ownership evidence ${nextStatusLabel}`}
          className="min-w-20 justify-center"
          role="button"
          tabIndex={isUpdating ? -1 : 0}
          title={`Set ${nextStatusLabel}`}
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

type UserGroupsDropdownSelection = {
  left: number;
  top: number;
  user: string;
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
  const [userGroupsDropdown, setUserGroupsDropdown] = useState<UserGroupsDropdownSelection | null>(null);

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

  const handleUserGroupsClick = useCallback(
    (evidence: OwnershipEvidenceItem, event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();

      setUserGroupsDropdown({
        left: rect.left,
        top: rect.bottom + 4,
        user: evidence.ownerDisplayName
      });
    },
    []
  );

  const fieldRenderers = useMemo(
    () =>
      buildOwnershipEvidenceFieldRenderers({
        onUserGroupsClick: handleUserGroupsClick,
        onStatusChange: handleStatusChange,
        updatingEvidenceKeys
      }),
    [handleStatusChange, handleUserGroupsClick, updatingEvidenceKeys]
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
      {userGroupsDropdown ? (
        <EntraUserGroupsDropdown
          key={`${userGroupsDropdown.user}:${userGroupsDropdown.left}:${userGroupsDropdown.top}`}
          left={userGroupsDropdown.left}
          top={userGroupsDropdown.top}
          user={userGroupsDropdown.user}
          onClose={() => setUserGroupsDropdown(null)}
        />
      ) : null}
    </section>
  );
}
