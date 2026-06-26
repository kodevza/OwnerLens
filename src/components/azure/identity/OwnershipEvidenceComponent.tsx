import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../../core/ownership/types";
import { SelectableGenericTable } from "../../../report/components/table/SelectableGenericTable";
import { Card } from "../../../report/components/ui/card";
import { EntraUserGroupsDropdown } from "./EntraUserGroupsDropdown";
import { readOwnershipEvidence, updateEvidenceStatus, type EvidenceStatus, type OwnershipEvidenceTarget } from "../api";
import { ownershipEvidenceFields } from "./ownershipEvidenceFields";
import { buildOwnershipEvidenceFieldRenderers } from "./OwnershipEvidenceRenderers";
import type { AzureRbacPrincipalSelection } from "./ServicePrincipalFieldRenderers";

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
  filters,
  onAzureRbacClick,
  onFiltersChange,
  onOwnershipEvidenceClick,
  onSortRulesChange,
  sortRules,
  target
}: {
  displayName: string;
  filters?: ColumnFilters;
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onFiltersChange?: (filters: ColumnFilters) => void;
  onOwnershipEvidenceClick?: (selection: { displayName: string; target: OwnershipEvidenceTarget }) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
  sortRules?: SortRule[];
  target: OwnershipEvidenceTarget;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [updatingEvidenceKeys, setUpdatingEvidenceKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [userGroupsDropdown, setUserGroupsDropdown] = useState<UserGroupsDropdownSelection | null>(null);

  const loadOwnershipEvidence = useCallback(
    async (signal: AbortSignal, options: { showLoading?: boolean } = {}) => {
      if (options.showLoading !== false) {
        setLoadState({ status: "loading" });
      }

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
      const statusKey = evidence.statusKey;
      if (!statusKey) {
        return;
      }

      setUpdatingEvidenceKeys((current) => new Set(current).add(statusKey));

      try {
        await updateEvidenceStatus({ key: statusKey, status });
        setLoadState((current) => markEvidenceStatus(current, statusKey, status));
        try {
          await loadOwnershipEvidence(new AbortController().signal, { showLoading: false });
        } catch {
          // Keep the confirmed local status when a follow-up refresh fails.
        }
      } catch (error) {
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not update ownership evidence status."
        });
      } finally {
        setUpdatingEvidenceKeys((current) => {
          const next = new Set(current);
          next.delete(statusKey);
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
        onApplicationEvidenceClick: onOwnershipEvidenceClick
          ? (evidence, applicationTarget) =>
              onOwnershipEvidenceClick({
                displayName: evidence.ownerDisplayName,
                target: applicationTarget
              })
          : undefined,
        onApplicationRbacClick: onAzureRbacClick
          ? (evidence, applicationTarget) => {
              if (applicationTarget.kind === "servicePrincipal") {
                onAzureRbacClick({
                  displayName: evidence.ownerDisplayName,
                  objectId: applicationTarget.principalId
                });
              }
            }
          : undefined,
        onUserGroupsClick: handleUserGroupsClick,
        onStatusChange: handleStatusChange,
        updatingEvidenceKeys
      }),
    [handleStatusChange, handleUserGroupsClick, onAzureRbacClick, onOwnershipEvidenceClick, updatingEvidenceKeys]
  );

  if (loadState.status === "loading") {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Loading ownership evidence...</Card>;
  }

  if (loadState.status === "error") {
    return <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-900">{loadState.message}</Card>;
  }

  return (
    <section className="flex flex-col gap-4">

      <SelectableGenericTable
        columnWidthsStorageKey="ownership-evidence"
        emptyMessage="No ownership evidence was found."
        fieldRenderers={fieldRenderers}
        fields={ownershipEvidenceFields}
        filters={filters}
        getRowKey={(evidence) => evidence.key}
        getRowSelectionLabel={(evidence) => `Select ownership evidence ${evidence.ownerDisplayName} ${evidence.evidence}`}
        minWidthClassName="min-w-[1360px]"
        rows={loadState.response.evidence}
        sortRules={sortRules}
        onFiltersChange={onFiltersChange}
        onSortRulesChange={onSortRulesChange}
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

function markEvidenceStatus(
  current: LoadState,
  statusKey: string,
  status: EvidenceStatus
): LoadState {
  if (current.status !== "ready") {
    return current;
  }

  return {
    status: "ready",
    response: {
      ...current.response,
      evidence: current.response.evidence.map((item) =>
        item.statusKey === statusKey
          ? { ...item, disabled: status === "inactive" }
          : item
      )
    }
  };
}
