import { useEffect, useMemo, useRef, useState } from "react";

import type { EntraUserGroupMembershipResponse } from "../../core/azure/entra/types";
import { readEntraUserGroups } from "./api";

type EntraUserGroupsDropdownState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; response: EntraUserGroupMembershipResponse };

export function EntraUserGroupsDropdown({
  left,
  onClose,
  top,
  user
}: {
  left: number;
  onClose: () => void;
  top: number;
  user: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<EntraUserGroupsDropdownState>({ status: "loading" });
  const groupFilter = useMemo(() => compileGroupFilter(filter), [filter]);
  const filteredGroups = useMemo(() => {
    if (state.status !== "loaded") {
      return [];
    }

    if (groupFilter.status !== "valid") {
      return state.response.groups;
    }

    return state.response.groups.filter((group) =>
      groupFilter.regex.test(`${group.groupDisplayName ?? ""}\n${group.groupId}`)
    );
  }, [groupFilter, state]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    readEntraUserGroups({ user, signal: controller.signal })
      .then((response) => setState({ status: "loaded", response }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not read user group membership."
        });
      });

    return () => {
      controller.abort();
    };
  }, [user]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    }

    function handleScroll(event: Event) {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 flex max-h-[50vh] w-80 flex-col overflow-hidden rounded-md border border-border bg-card p-2 text-sm shadow-lg"
      role="dialog"
      style={{ left, top }}
    >
      <input
        aria-label={`Filter direct groups for ${user}`}
        className="mb-2 h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Filter with RegExp"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="mb-2 truncate px-2 py-1 font-medium" title={user}>
        Direct groups for {user}
      </div>
      {groupFilter.status === "invalid" ? (
        <div className="mb-2 px-2 text-xs text-destructive">Invalid regular expression.</div>
      ) : null}
      {state.status === "loading" ? <div className="px-2 py-3 text-muted-foreground">Loading groups...</div> : null}
      {state.status === "error" ? <div className="px-2 py-3 text-destructive">{state.message}</div> : null}
      {state.status === "loaded" && state.response.groups.length === 0 ? (
        <div className="px-2 py-3 text-muted-foreground">No direct group memberships found.</div>
      ) : null}
      {state.status === "loaded" && state.response.groups.length > 0 && filteredGroups.length === 0 ? (
        <div className="px-2 py-3 text-muted-foreground">No direct group memberships match the filter.</div>
      ) : null}
      {state.status === "loaded" && state.response.groups.length > 0 ? (
        <div className="flex min-h-0 flex-col gap-1 overflow-auto">
          {filteredGroups.map((group) => (
            <div key={group.groupId} className="rounded-sm px-2 py-1.5 hover:bg-muted">
              <div className="truncate font-medium" title={group.groupDisplayName ?? group.groupId}>
                {group.groupDisplayName ?? "(unnamed group)"}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground" title={group.groupId}>
                {group.groupId}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function compileGroupFilter(filter: string): { status: "valid"; regex: RegExp } | { status: "invalid" } {
  if (!filter.trim()) {
    return { status: "valid", regex: /(?:)/i };
  }

  try {
    return { status: "valid", regex: new RegExp(filter, "i") };
  } catch {
    return { status: "invalid" };
  }
}
