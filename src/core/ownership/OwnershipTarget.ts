import type { OwnerResolution } from "./types";

export type OwnershipSourceProvider = "azure" | "entra" | "zeroTrustAssessment";

export type OwnershipTargetRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type OwnershipTargetRef = {
  type: string;
  id: string;
  label?: string;
};

export type OwnershipTarget = {
  id: string;
  kind: string;
  displayName: string;
  sourceProvider: OwnershipSourceProvider;
  technicalId?: string | null;
  ownership?: OwnerResolution;
  riskLevel?: OwnershipTargetRiskLevel;
  refs?: OwnershipTargetRef[];
};

export function buildZeroTrustAssessmentAuditFindingTarget(
  target: Omit<OwnershipTarget, "kind" | "sourceProvider">
): OwnershipTarget {
  return {
    ...target,
    kind: "zta.auditFinding",
    sourceProvider: "zeroTrustAssessment"
  };
}
