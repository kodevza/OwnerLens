import type { EntraServicePrincipal } from "../../inputTransferObject/generated/EntraSnapshot";
import type { AzureActivityLog } from "../../../../core/azure/resources";

export function normalizeOwner(value: string): string {
  return value.trim().toLowerCase();
}

export function getTagValue(tags: Record<string, string> | null, key: string): string | null {
  if (!tags) {
    return null;
  }

  const matchingKey = Object.keys(tags).find((tagKey) => tagKey.toLowerCase() === key.toLowerCase());
  const value = matchingKey ? tags[matchingKey] : null;
  return value?.trim() ? value.trim() : null;
}

export function getActivityIndexKey(subscriptionId: string, resourceGroupName: string | null): string {
  return `${subscriptionId.toLowerCase()}::${(resourceGroupName ?? "").toLowerCase()}`;
}

export function isOwnerActivity(log: AzureActivityLog): boolean {
  if (log.category !== "Administrative" || log.status !== "Succeeded" || !log.caller?.trim()) {
    return false;
  }

  const action = `${log.authorizationAction ?? ""} ${log.operationNameValue ?? ""}`.toLowerCase();
  return action.includes("/write") || action.includes("/action");
}

export function compareLogsNewestFirst(left: AzureActivityLog, right: AzureActivityLog): number {
  return getTime(right.eventTimestamp) - getTime(left.eventTimestamp);
}

function getTime(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildServicePrincipalIndex(servicePrincipals: EntraServicePrincipal[]): Map<string, EntraServicePrincipal> {
  const index = new Map<string, EntraServicePrincipal>();

  for (const servicePrincipal of servicePrincipals) {
    index.set(servicePrincipal.id.toLowerCase(), servicePrincipal);
    index.set(servicePrincipal.appId.toLowerCase(), servicePrincipal);
  }

  return index;
}

export function describeIdentity(identity: string, servicePrincipalIndex: Map<string, EntraServicePrincipal>): string {
  const normalized = normalizeOwner(identity);
  const servicePrincipal = servicePrincipalIndex.get(normalized);

  if (!servicePrincipal) {
    return normalized;
  }

  return `${servicePrincipal.displayName} (${normalized})`;
}
