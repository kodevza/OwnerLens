import { useEffect, useState } from "react";
import { Boxes, BriefcaseBusiness, Fingerprint, KeyRound, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { readAzureInventoryStats, type AzureInventoryStats as AzureInventoryStatsData } from "./api";

type InventoryStatsState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      stats: AzureInventoryStatsData;
    }
  | {
      status: "error";
      message: string;
    };

type InventoryStatItem = {
  key: keyof AzureInventoryStatsData;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
};

const inventoryStatItems: InventoryStatItem[] = [
  { key: "users", label: "Entra Users", shortLabel: "Users", Icon: UserRound },
  { key: "groups", label: "Entra Groups", shortLabel: "Groups", Icon: UsersRound },
  { key: "servicePrincipals", label: "Service Principals", shortLabel: "SP", Icon: Fingerprint },
  { key: "managedIdentities", label: "Managed Identities", shortLabel: "MI", Icon: ShieldCheck },
  { key: "resourceGroups", label: "Resource Groups", shortLabel: "RG", Icon: Boxes },
  { key: "rbacAssignments", label: "Azure RBAC assignments", shortLabel: "RBAC", Icon: KeyRound }
];

export function AzureInventoryStats() {
  const [state, setState] = useState<InventoryStatsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    readAzureInventoryStats({ signal: controller.signal })
      .then((stats) => {
        setState({ status: "ready", stats });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Inventory stats read failed"
        });
      });

    return () => {
      controller.abort();
    };
  }, []);

  if (state.status === "error") {
    return (
      <div
        className="flex min-h-9 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs text-destructive"
        role="status"
      >
        <BriefcaseBusiness className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="max-w-[18rem] truncate" title={state.message}>Stats unavailable</span>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-9 max-w-full items-center gap-1 overflow-x-auto rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
      aria-label="Imported inventory counters"
    >
      {inventoryStatItems.map(({ key, label, shortLabel, Icon }) => (
        <div
          key={key}
          className={cn(
            "flex min-w-[4.75rem] items-center gap-1.5 rounded px-2 py-1 min-[1600px]:min-w-fit",
            state.status === "loading" ? "text-muted-foreground" : "text-foreground"
          )}
          title={label}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium tabular-nums">
            {state.status === "ready" ? formatCount(state.stats[key]) : "..."}
          </span>
          <span className="text-muted-foreground min-[1600px]:hidden">{shortLabel}</span>
          <span className="hidden text-muted-foreground min-[1600px]:inline">{label}</span>
        </div>
      ))}
    </div>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
