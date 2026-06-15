import type { AzureRoleAssignment } from "../../../../core/azure/resources";

export function isBroadAzureScope(assignment: AzureRoleAssignment): boolean {
  const scopeType = classifyAzureScope(assignment);
  return scopeType === "ManagementGroup" || scopeType === "Subscription";
}

export function classifyAzureScope(assignment: AzureRoleAssignment): NonNullable<AzureRoleAssignment["scopeType"]> {
  if (assignment.scopeType) {
    return assignment.scopeType;
  }

  return "Unknown";
}
