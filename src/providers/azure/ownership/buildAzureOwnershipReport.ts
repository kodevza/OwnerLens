import type { EntraSnapshot } from "../domain/entra";
import type { AzureSnapshot } from "../domain/resources";
import type { OwnerReport, OwnerReportRow } from "./azureOwnerReportTypes";
import { azureOwnershipConfig } from "./azureOwnershipConfig";
import { buildActivityIndex } from "./resolveAzureOwner";
import { buildServicePrincipalIndex } from "./azureActivityOwnershipEvidence";
import type { AzureReportConfig, AzureScopeOwnershipTarget } from "./azureOwnershipTypes";

export function buildAzureOwnershipReport(
  resourceSnapshot: AzureSnapshot,
  entraSnapshot: EntraSnapshot,
  config: AzureReportConfig = azureOwnershipConfig
): OwnerReport {
  const context = {
    resourceSnapshot,
    entraSnapshot,
    tags: config.tags,
    activityLogIndex: buildActivityIndex(resourceSnapshot.activityLogs),
    servicePrincipalIndex: buildServicePrincipalIndex(entraSnapshot.servicePrincipals)
  };

  const owners = config.ownerTargets.flatMap((targetConfig) => {
    const targets = getTargets(targetConfig.kind, resourceSnapshot);
    return targets.map((target): OwnerReportRow => {
      const resolution = targetConfig.adapter.resolveOwner(target, context);
      const identity = getTargetIdentity(target);

      return {
        ...identity,
        ...resolution
      };
    });
  });

  return {
    owners
  };
}

export const buildOwnerReport = buildAzureOwnershipReport;

function getTargets(
  kind: AzureScopeOwnershipTarget["kind"],
  resourceSnapshot: AzureSnapshot
): AzureScopeOwnershipTarget[] {
  if (kind === "subscription") {
    return resourceSnapshot.subscriptions.map((subscription) => ({
      kind,
      subscription
    }));
  }

  return resourceSnapshot.resourceGroups.map((resourceGroup) => ({
    kind,
    resourceGroup
  }));
}

function getTargetIdentity(target: AzureScopeOwnershipTarget): Pick<
  OwnerReportRow,
  "targetKey" | "kind" | "subscriptionId" | "subscriptionName" | "resourceGroup"
> {
  if (target.kind === "subscription") {
    return {
      targetKey: getAzureOwnerTargetKey(target.kind, target.subscription.subscriptionId, null),
      kind: target.kind,
      subscriptionId: target.subscription.subscriptionId,
      subscriptionName: target.subscription.subscriptionName,
      resourceGroup: null
    };
  }

  return {
    targetKey: getAzureOwnerTargetKey(
      target.kind,
      target.resourceGroup.subscriptionId,
      target.resourceGroup.resourceGroup
    ),
    kind: target.kind,
    subscriptionId: target.resourceGroup.subscriptionId,
    subscriptionName: target.resourceGroup.subscriptionName,
    resourceGroup: target.resourceGroup.resourceGroup
  };
}

function getAzureOwnerTargetKey(
  kind: OwnerReportRow["kind"],
  subscriptionId: string,
  resourceGroup: string | null
): string {
  return [kind, subscriptionId.toLowerCase(), (resourceGroup ?? "").toLowerCase()].join(":");
}
