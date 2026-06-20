import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../core/ownership/types";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import { Card } from "../../report/components/ui/card";
import { EntraUserGroupsDropdown } from "./EntraUserGroupsDropdown";
import { readOwnershipEvidence, updateEvidenceStatus, type EvidenceStatus, type OwnershipEvidenceTarget } from "./api";
import { formatOwnershipEvidenceTarget } from "./ownershipEvidenceFormatters";
import { ownershipEvidenceFields } from "./ownershipEvidenceFields";
import { buildOwnershipEvidenceFieldRenderers, getOwnerCandidateStatusKey } from "./OwnershipEvidenceRenderers";

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
  onOwnershipEvidenceClick,
  target
}: {
  displayName: string;
  onOwnershipEvidenceClick?: (selection: { displayName: string; target: OwnershipEvidenceTarget }) => void;
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
      const statusKey = getOwnerCandidateStatusKey(target, evidence);
      if (!statusKey) {
        return;
      }

      setUpdatingEvidenceKeys((current) => new Set(current).add(statusKey));

      try {
        await updateEvidenceStatus({ key: statusKey, status });
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
          next.delete(statusKey);
          return next;
        });
      }
    },
    [loadOwnershipEvidence, target]
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
        onUserGroupsClick: handleUserGroupsClick,
        onStatusChange: handleStatusChange,
        target,
        updatingEvidenceKeys
      }),
    [handleStatusChange, handleUserGroupsClick, onOwnershipEvidenceClick, target, updatingEvidenceKeys]
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
        <h2 className="text-base font-semibold">{displayName}</h2>
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
