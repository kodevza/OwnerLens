import type { AzureRoleAssignment } from "../../domain/resources/AzureRoleAssignment";

export function isBroadAzureScope(assignment: AzureRoleAssignment): boolean {
  const scopeType = classifyAzureScope(assignment);
  return scopeType === "ManagementGroup" || scopeType === "Subscription";
}

export function classifyAzureScope(assignment: AzureRoleAssignment): NonNullable<AzureRoleAssignment["scopeType"]> {
  if (assignment.scopeType) {
    return assignment.scopeType;
  }

  if (/^\/providers\/Microsoft\.Management\/managementGroups\/[^/]+$/i.test(assignment.scope)) {
    return "ManagementGroup";
  }

  if (/^\/subscriptions\/[^/]+$/i.test(assignment.scope)) {
    return "Subscription";
  }

  if (/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+$/i.test(assignment.scope)) {
    return "ResourceGroup";
  }

  if (/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/.+/i.test(assignment.scope)) {
    return "Resource";
  }

  return "Unknown";
}
