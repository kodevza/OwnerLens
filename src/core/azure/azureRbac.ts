import type { AzureRoleAssignment } from "./resources";
import type { PermissionRiskLevel } from "../risk/types";

export type AzureRbac = AzureRoleAssignment & {
  servicePrincipalId: string;
  accessRisk: PermissionRiskLevel;
  accessScope: string;
  accessScopeType: AzureRoleAssignment["scopeType"];
  accessResourceId: string | null;
  accessResourceGroup: string | null;
  accessSubscriptionId: string | null;
  accessDisplayName: string;
};

export function mapRoleAssignmentToAzureRbac(
  assignment: AzureRoleAssignment,
  permissionRiskLevel: PermissionRiskLevel
): AzureRbac {
  return {
    ...assignment,
    servicePrincipalId: assignment.principalId,
    accessRisk: permissionRiskLevel,
    accessScope: assignment.scope,
    accessScopeType: assignment.scopeType ?? "Unknown",
    accessResourceId: getResourceScopeId(assignment),
    accessResourceGroup: assignment.scopeResourceGroup ?? getScopeResourceGroup(assignment.scope),
    accessSubscriptionId: assignment.scopeSubscriptionId ?? getScopeSubscriptionId(assignment.scope),
    accessDisplayName: formatAccessDisplayName(assignment)
  };
}

function formatAccessDisplayName(assignment: AzureRoleAssignment): string {
  const role = assignment.roleDefinitionName ?? "Unknown role";
  const scopeType = assignment.scopeType ?? "Unknown";
  const scope = formatScope(assignment);

  return `${role} on ${scopeType.toLowerCase()} ${scope}`;
}

function formatScope(assignment: AzureRoleAssignment): string {
  if (assignment.scopeType === "ManagementGroup" && assignment.scopeManagementGroup) {
    return assignment.scopeManagementGroup;
  }

  if (assignment.scopeType === "Subscription") {
    return assignment.subscriptionName || assignment.scopeSubscriptionId || assignment.subscriptionId;
  }

  if (assignment.scopeType === "ResourceGroup" && assignment.scopeResourceGroup) {
    return assignment.scopeResourceGroup;
  }

  if (assignment.scopeType === "Resource" && assignment.scopeResourceName) {
    return assignment.scopeResourceName;
  }

  return assignment.scope;
}

function getResourceScopeId(assignment: AzureRoleAssignment): string | null {
  return assignment.scopeType === "Resource" ? assignment.scope : null;
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}
