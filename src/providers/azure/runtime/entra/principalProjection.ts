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
    oauthPermissionsCount: 0,
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
