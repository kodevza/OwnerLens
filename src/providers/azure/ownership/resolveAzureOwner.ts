import type { AzureActivityLog, AzureResourceGroup, AzureResourceTags } from "../../../core/azure/resources";
import type { OwnerEvidence, OwnerResolution } from "../../../core/ownership/types";
import {
  compareLogsNewestFirst,
  describeIdentity,
  getActivityIndexKey,
  getTagValue,
  isOwnerActivity,
  normalizeOwner
} from "./azureActivityOwnershipEvidence";
import type { ActivityLogIndex, OwnerResolverAdapter, OwnerResolverContext } from "./azureOwnershipTypes";

type AzureResourceWithTags = {
  tags: AzureResourceTags | null;
};

export const azureOwnerAdapter: OwnerResolverAdapter = {
  resolveOwner(target, context) {
    if (target.kind === "resourceGroup") {
      const owner = resolveOwnerFromTags(target.resourceGroup, context);
      if (owner === null) {
        return resolveResourceGroupOwnerFromActivity(target.resourceGroup, context);
      }

      return owner;
    }

    const owner = resolveOwnerFromTags(target.subscription, context);
    if (owner === null) {
      return resolveSubscriptionOwner(target.subscription.subscriptionId, context);
    }

    return owner;
  }
};

function resolveOwnerFromTags(resource: AzureResourceWithTags, context: OwnerResolverContext): OwnerResolution | null {
  for (const [tagName, tagConfig] of Object.entries(context.tags)) {
    const tagValue = getTagValue(resource.tags, tagName);
    if (!tagValue) {
      continue;
    }

    return {
      ...tagConfig,
      owner: normalizeOwner(tagValue),
      source: `tag.${tagName}`,
      evidence: [buildTagEvidence(tagName, tagValue)]
    };
  }

  return null;
}

function buildTagEvidence(tagName: string, tagValue: string): OwnerEvidence {
  return {
    user: `${tagName}=${tagValue}`,
    date: null
  };
}

function resolveResourceGroupOwnerFromActivity(
  resourceGroup: AzureResourceGroup,
  context: OwnerResolverContext
): OwnerResolution {
  const logs = context.activityLogIndex.get(getActivityIndexKey(resourceGroup.subscriptionId, resourceGroup.resourceGroup)) ?? [];
  return resolveFromActivity(logs, context, "activity.lastModifier");
}

function resolveSubscriptionOwner(subscriptionId: string, context: OwnerResolverContext): OwnerResolution {
  const logs = context.resourceSnapshot.activityLogs.filter(
    (log) => log.subscriptionId.toLowerCase() === subscriptionId.toLowerCase()
  );
  return resolveFromActivity(logs, context, "activity.subscriptionLastModifier");
}

function resolveFromActivity(
  logs: AzureActivityLog[],
  context: OwnerResolverContext,
  source: string
): OwnerResolution {
  const lastWrite = logs.filter(isOwnerActivity).sort(compareLogsNewestFirst)[0];

  if (!lastWrite?.caller) {
    return {
      owner: null,
      confidence: "none",
      source: "none",
      evidence: []
    };
  }

  const owner = describeIdentity(lastWrite.caller, context.servicePrincipalIndex);
  const evidence = getLastActionByCallerEvidence(logs, context.servicePrincipalIndex);

  return {
    owner,
    confidence: "low",
    source,
    evidence
  };
}

function getLastActionByCallerEvidence(
  logs: AzureActivityLog[],
  servicePrincipalIndex: OwnerResolverContext["servicePrincipalIndex"]
): OwnerEvidence[] {
  const lastActionByCaller = new Map<string, AzureActivityLog>();

  for (const log of logs.filter(isOwnerActivity)) {
    const caller = normalizeOwner(log.caller ?? "");
    const previous = lastActionByCaller.get(caller);

    if (!previous || compareLogsNewestFirst(log, previous) < 0) {
      lastActionByCaller.set(caller, log);
    }
  }

  return [...lastActionByCaller.values()]
    .sort(compareLogsNewestFirst)
    .map((log) => ({
      user: getEvidenceCallerName(log.caller ?? "", servicePrincipalIndex),
      date: log.eventTimestamp
    }));
}

function getEvidenceCallerName(
  caller: string,
  servicePrincipalIndex: OwnerResolverContext["servicePrincipalIndex"]
): string {
  const normalizedCaller = normalizeOwner(caller);
  return servicePrincipalIndex.get(normalizedCaller)?.displayName ?? normalizedCaller;
}

export function buildActivityIndex(activityLogs: AzureActivityLog[]): ActivityLogIndex {
  const index: ActivityLogIndex = new Map();

  for (const log of activityLogs) {
    const key = getActivityIndexKey(log.subscriptionId, log.resourceGroupName);
    const logs = index.get(key) ?? [];
    logs.push(log);
    index.set(key, logs);
  }

  return index;
}
