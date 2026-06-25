import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../../core/ownership/types";
import { SelectableGenericTable } from "../../../report/components/table/SelectableGenericTable";
import { Card } from "../../../report/components/ui/card";
import { EntraUserGroupsDropdown } from "./EntraUserGroupsDropdown";
import { readOwnershipEvidence, updateEvidenceStatus, type EvidenceStatus, type OwnershipEvidenceTarget } from "../api";
import { ownershipEvidenceFields } from "./ownershipEvidenceFields";
import { buildOwnershipEvidenceFieldRenderers, getOwnerCandidateStatusKey } from "./OwnershipEvidenceRenderers";
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
  allowAzureRbacFallback = true,
  azureRbac,
  displayName,
  filters,
  onAzureRbacClick,
  onAzureRbacFallback,
  onFiltersChange,
  onOwnershipEvidenceClick,
  onSortRulesChange,
  sortRules,
  target
}: {
  allowAzureRbacFallback?: boolean;
  azureRbac: boolean;
  displayName: string;
  filters?: ColumnFilters;
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onAzureRbacFallback?: () => void;
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
    async (signal: AbortSignal) => {
      setLoadState({ status: "loading" });

      const response = await readOwnershipEvidence({
        azureRbac,
        signal,
        target
      });

      if (!azureRbac && allowAzureRbacFallback && isPrincipalTarget(target) && response.evidence.length === 0) {
        if (onAzureRbacFallback) {
          onAzureRbacFallback();
          return;
        }

        const azureRbacResponse = await readOwnershipEvidence({
          azureRbac: true,
          signal,
          target
        });
        setLoadState({ status: "ready", response: azureRbacResponse });
        return;
      }

      setLoadState({ status: "ready", response });
    },
    [allowAzureRbacFallback, azureRbac, onAzureRbacFallback, target]
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
      const statusKey = getOwnerCandidateStatusKey(target, evidence);
      if (!statusKey) {
        return;
      }

      setUpdatingEvidenceKeys((current) => new Set(current).add(statusKey));

      try {
        await updateEvidenceStatus({ key: statusKey, status });
        setLoadState((current) => {
          if (current.status !== "ready") {
            return current;
          }

          return {
            status: "ready",
            response: {
              ...current.response,
              evidence: current.response.evidence.map((item) =>
                getOwnerCandidateStatusKey(target, item) === statusKey
                  ? { ...item, disabled: status === "inactive" }
                  : item
              )
            }
          };
        });
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
    [target]
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
        target,
        updatingEvidenceKeys
      }),
    [handleStatusChange, handleUserGroupsClick, onAzureRbacClick, onOwnershipEvidenceClick, target, updatingEvidenceKeys]
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

function isPrincipalTarget(
  target: OwnershipEvidenceTarget
): target is Extract<OwnershipEvidenceTarget, { kind: "servicePrincipal" | "managedIdentity" }> {
  return target.kind === "servicePrincipal" || target.kind === "managedIdentity";
}
