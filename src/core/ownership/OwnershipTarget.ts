import type { OwnerResolution } from "./types";

type OwnershipSourceProvider = "azure" | "entra" | "zeroTrustAssessment";

type OwnershipTargetRiskLevel = "none" | "low" | "medium" | "high" | "critical";

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
