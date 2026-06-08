import type { EntraSnapshot } from "../inputTransferObject/entra/EntraSnapshot";
import type { EntraServicePrincipal } from "../inputTransferObject/entra/EntraServicePrincipal";
import type { AzureActivityLog } from "../domain/resources/AzureActivityLog";
import type { AzureResourceGroup } from "../domain/resources/AzureResourceGroup";
import type { AzureSnapshot } from "../domain/resources/AzureSnapshot";
import type { AzureSubscription } from "../domain/resources/AzureSubscription";
import type { OwnerResolver } from "../../../core/ownership/resolveOwner";
import type { OwnerResolution } from "../../../core/ownership/types";

export type AzureScopeOwnershipTarget =
  | {
      kind: "subscription";
      subscription: AzureSubscription;
    }
  | {
      kind: "resourceGroup";
      resourceGroup: AzureResourceGroup;
    };

export type OwnerResolverContext = {
  resourceSnapshot: AzureSnapshot;
  entraSnapshot: EntraSnapshot;
  tags: AzureOwnerTagConfigMap;
  activityLogIndex: ActivityLogIndex;
  servicePrincipalIndex: Map<string, EntraServicePrincipal>;
};

export type OwnerResolverAdapter = OwnerResolver<AzureScopeOwnershipTarget, OwnerResolverContext>;

export type AzureOwnerTargetConfig = {
  kind: AzureScopeOwnershipTarget["kind"];
  adapter: OwnerResolverAdapter;
};

export type AzureReportConfig = {
  tags: AzureOwnerTagConfigMap;
  ownerTargets: AzureOwnerTargetConfig[];
};

export type ActivityLogIndex = Map<string, AzureActivityLog[]>;

export type AzureOwnerTagConfig = Pick<OwnerResolution, "confidence">;

export type AzureOwnerTagConfigMap = Record<string, AzureOwnerTagConfig>;
