import type { OwnerResolution } from "../../../core/ownership/types";

export type OwnerReportRow = OwnerResolution & {
  kind: "subscription" | "resourceGroup";
  resourceGroup: string | null;
  subscriptionId: string;
  subscriptionName: string;
  targetKey: string;
};

export type OwnerReport = {
  owners: OwnerReportRow[];
};
