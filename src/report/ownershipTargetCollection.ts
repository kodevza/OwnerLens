import type { OwnershipTarget, OwnershipTargetRef } from "../core/ownership";
import { defineReportCollection } from "./reportTypes";

export type OwnershipTargetReportContext = {
  ownershipTargets: OwnershipTarget[];
};

export const ownershipTargetCollection = defineReportCollection<OwnershipTargetReportContext, OwnershipTarget>({
  id: "ownershipTargets",
  title: "Ownership Targets",
  getCount: (ctx) => ctx.ownershipTargets.length,
  getRows: (ctx) => ctx.ownershipTargets,
  getRowKey: (row) => row.id,
  fields: [
    {
      id: "displayName",
      label: "Target",
      valueType: "text",
      getValue: (row) => row.displayName,
      searchable: true
    },
    {
      id: "kind",
      label: "Kind",
      valueType: "text",
      getValue: (row) => row.kind,
      searchable: true,
      filter: { kind: "multiSelect" }
    },
    {
      id: "sourceProvider",
      label: "Source",
      valueType: "text",
      getValue: (row) => row.sourceProvider,
      searchable: true,
      filter: { kind: "multiSelect" }
    },
    {
      id: "owner",
      label: "Owner",
      valueType: "text",
      getValue: (row) => row.ownership?.owner ?? "-"
    },
    {
      id: "confidence",
      label: "Confidence",
      valueType: "ownerConfidence",
      getValue: (row) => row.ownership?.confidence ?? "none",
      filter: { kind: "multiSelect" }
    },
    {
      id: "riskLevel",
      label: "Risk",
      valueType: "text",
      getValue: (row) => row.riskLevel ?? "none",
      filter: { kind: "multiSelect" }
    },
    {
      id: "refs",
      label: "References",
      valueType: "list",
      getValue: (row) => row.refs?.map(formatOwnershipTargetRef) ?? []
    }
  ]
});

function formatOwnershipTargetRef(ref: OwnershipTargetRef): string {
  return ref.label ? `${ref.type}:${ref.id} (${ref.label})` : `${ref.type}:${ref.id}`;
}
