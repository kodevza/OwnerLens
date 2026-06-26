import type {
  AzureActivityLog,
  AzureResourceGroup,
  AzureSubscription
} from "../../../../core/azure/resources";
import type { OwnerResolver } from "../../../../core/ownership/resolveOwner";
import type { OwnerResolution, OwnerType } from "../../../../core/ownership/types";
import type { AzureSnapshot } from "../../inputTransferObject/generated/AzureSnapshot";
import type { EntraServicePrincipal, EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";

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

type AzureOwnerTargetConfig = {
  kind: AzureScopeOwnershipTarget["kind"];
  adapter: OwnerResolverAdapter;
};

export type AzureReportConfig = {
  tags: AzureOwnerTagConfigMap;
  ownerTargets: AzureOwnerTargetConfig[];
};

export type ActivityLogIndex = Map<string, AzureActivityLog[]>;

type AzureOwnerTagConfig = Pick<OwnerResolution, "confidence"> & {
  type: OwnerType;
};

export type AzureOwnerTagConfigMap = Record<string, AzureOwnerTagConfig>;
