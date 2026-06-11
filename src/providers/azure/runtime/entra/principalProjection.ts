import type {
  LatestAzureIdentityEnrichment,
  ManagedIdentityPermissionRiskSummary
} from "../../../../core/azure/identityEnrichment";
import type { AzureRoleAssignment } from "../../../../core/azure/resources";
import type { ZtaRemediationSummary } from "../../../../core/azure/ztaReport";
import { isManagedIdentity, type ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import {
  isServicePrincipal,
  type AzureIdentityRuntimeEnrichment,
  type EntraPrincipalPermissionSummary,
  type EntraPrincipalRbacSummary,
  type ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type { EntraServicePrincipal } from "../../../../core/azure/entra/types";

export function toServicePrincipals(
  servicePrincipals: EntraServicePrincipal[],
  enrichment?: LatestAzureIdentityEnrichment,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary> = new Map(),
  ztaSummariesByPrincipalId: Map<string, ZtaRemediationSummary> = new Map()
): ServicePrincipal[] {
  return servicePrincipals.filter(isServicePrincipal).map((servicePrincipal) => ({
    ...servicePrincipal,
    ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
    ...getEntraPrincipalPermissionSummary(servicePrincipal, permissionsByPrincipalId),
    ...getZtaRemediationSummary(servicePrincipal, ztaSummariesByPrincipalId)
  }));
}

export function toManagedIdentities(
  servicePrincipals: EntraServicePrincipal[],
  enrichment?: LatestAzureIdentityEnrichment,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary> = new Map(),
  ztaSummariesByPrincipalId: Map<string, ZtaRemediationSummary> = new Map()
): ManagedIdentity[] {
  return servicePrincipals.filter(isManagedIdentity).map((servicePrincipal) => {
    const assignmentEnrichment = enrichment?.managedIdentityAssignmentsByServicePrincipalId.get(
      servicePrincipal.id.toLowerCase()
    );

    return {
      ...servicePrincipal,
      ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
      ...getEntraPrincipalPermissionSummary(servicePrincipal, permissionsByPrincipalId),
      ...getZtaRemediationSummary(servicePrincipal, ztaSummariesByPrincipalId),
      managedIdentityAssignments: assignmentEnrichment?.managedIdentityAssignments ?? [],
      assignedResourceGroups: assignmentEnrichment?.assignedResourceGroups ?? []
    };
  });
}

function getZtaRemediationSummary(
  servicePrincipal: EntraServicePrincipal,
  ztaSummariesByPrincipalId: Map<string, ZtaRemediationSummary>
): ZtaRemediationSummary {
  return ztaSummariesByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createEmptyZtaRemediationSummary();
}

function getEntraPrincipalPermissionSummary(
  servicePrincipal: EntraServicePrincipal,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary>
): EntraPrincipalPermissionSummary {
  return permissionsByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createEmptyPermissionSummary();
}

function createEmptyPermissionSummary(): EntraPrincipalPermissionSummary {
  return {
    oauthPemrissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none"
  };
}

function createEmptyZtaRemediationSummary(): ZtaRemediationSummary {
  return {
    ztaRemediationCountAll: 0,
    ztaRemediationFailedCount: 0,
    ztaMaxRisk: "none"
  };
}

function getAzureIdentityRuntimeEnrichment(
  servicePrincipal: EntraServicePrincipal,
  enrichment?: LatestAzureIdentityEnrichment
): AzureIdentityRuntimeEnrichment {
  const roleAssignments =
    enrichment?.roleAssignmentsByPrincipalId.get(servicePrincipal.id.toLowerCase())?.roleAssignments ?? [];
  const permissionRisk =
    enrichment?.accessRiskByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createRiskSummary(servicePrincipal.id);

  return {
    permissionRisk: permissionRisk.riskLevel,
    azureRbac: formatAzureRbac(permissionRisk, roleAssignments),
    roleAssignments,
    ...createRbacSummary(permissionRisk, roleAssignments)
  };
}

function createRiskSummary(principalId: string): ManagedIdentityPermissionRiskSummary {
  return {
    principalId,
    riskLevel: "none",
    assignmentCount: 0,
    highRiskAssignmentCount: 0,
    broadScopeAssignmentCount: 0,
    roleAssignments: []
  };
}

function formatAzureRbac(
  permissionRisk: ManagedIdentityPermissionRiskSummary,
  roleAssignments: AzureRoleAssignment[]
): string {
  if (permissionRisk.assignmentCount > 0) {
    return permissionRisk.roleAssignments
      .map((assignment) => {
        const reasons = assignment.reasons.length > 0 ? ` (${assignment.reasons.join(", ")})` : "";
        return `${assignment.roleDefinitionName ?? "Role"} on ${formatScope(assignment.scope)}${reasons}`;
      })
      .join(", ");
  }

  if (roleAssignments.length > 0) {
    return roleAssignments
      .map((assignment) => `${assignment.roleDefinitionName ?? "Role"} on ${formatScope(assignment.scope)}`)
      .join(", ");
  }

  return "No Azure RBAC assignments";
}

function formatScope(scope: string): string {
  const resourceGroupMatch = scope.match(/\/resourceGroups\/([^/]+)/i);
  if (resourceGroupMatch) {
    return `rg/${resourceGroupMatch[1]}`;
  }

  const subscriptionMatch = scope.match(/^\/subscriptions\/([^/]+)$/i);
  if (subscriptionMatch) {
    return "subscription";
  }

  return scope.split("/").filter(Boolean).slice(-2).join("/") || scope;
}

function createRbacSummary(
  permissionRisk: ManagedIdentityPermissionRiskSummary,
  roleAssignments: AzureRoleAssignment[]
): EntraPrincipalRbacSummary {
  return {
    rbacRoleAssignmentCount: roleAssignments.length,
    rbacRoleLevel: permissionRisk.riskLevel,
    rbacSubscriptionCount: countRbacSubscriptions(roleAssignments)
  };
}

function countRbacSubscriptions(roleAssignments: AzureRoleAssignment[]): number {
  const subscriptionIds = new Set<string>();

  for (const assignment of roleAssignments) {
    const subscriptionId = getRoleAssignmentSubscriptionId(assignment);
    if (subscriptionId) {
      subscriptionIds.add(subscriptionId.toLowerCase());
    }
  }

  return subscriptionIds.size;
}

function getRoleAssignmentSubscriptionId(assignment: AzureRoleAssignment): string | null {
  return assignment.scopeSubscriptionId ?? assignment.subscriptionId ?? assignment.scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}
