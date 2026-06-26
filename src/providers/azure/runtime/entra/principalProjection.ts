import type {
  LatestAzureIdentityEnrichment,
  ManagedIdentityPermissionRiskSummary
} from "../../../../core/azure/identityEnrichment";
import type { AzureRoleAssignment } from "../../../../core/azure/resources";
import { isManagedIdentity, type ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import {
  isServicePrincipal,
  type AzureIdentityRuntimeEnrichment,
  type EntraPrincipalRbacSummary,
  type ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type { EntraServicePrincipal } from "../../../../core/azure/entra/types";
import type { PermissionRiskLevel } from "../../../../core/risk/types";
import type { EntraServicePrincipalRuntimeRow } from "./domain/servicePrincipalsTable";

type EntraServicePrincipalProjectionRow = EntraServicePrincipal & Omit<
  EntraServicePrincipalRuntimeRow,
  keyof EntraServicePrincipal
>;

export function toServicePrincipals(
  servicePrincipals: EntraServicePrincipalProjectionRow[],
  enrichment?: LatestAzureIdentityEnrichment
): ServicePrincipal[] {
  return servicePrincipals.filter(isServicePrincipal).map((servicePrincipal) => ({
    ...servicePrincipal,
    ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
    ...getEntraPrincipalPermissionSummary(servicePrincipal)
  }));
}

export function toManagedIdentities(
  servicePrincipals: EntraServicePrincipalProjectionRow[],
  enrichment?: LatestAzureIdentityEnrichment
): ManagedIdentity[] {
  return servicePrincipals.filter(isManagedIdentity).map((servicePrincipal) => {
    const assignmentEnrichment = enrichment?.managedIdentityAssignmentsByServicePrincipalId.get(
      servicePrincipal.id.toLowerCase()
    );

    return {
      ...servicePrincipal,
      ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
      ...getEntraPrincipalPermissionSummary(servicePrincipal),
      resourceGroup: servicePrincipal.managedIdentityHomeResourceGroup,
      managedIdentityAssignments: assignmentEnrichment?.managedIdentityAssignments ?? [],
      assignedResourceGroups: assignmentEnrichment?.assignedResourceGroups ?? []
    };
  });
}

function getEntraPrincipalPermissionSummary(
  servicePrincipal: EntraServicePrincipalProjectionRow
): {
  oauthPermissionsCount: number;
  appRolesPermissionCount: number;
  entraPermissionCount: number;
  entraPermissionRisk: PermissionRiskLevel;
} {
  return {
    oauthPermissionsCount: servicePrincipal.oauthPermissionsCount ?? 0,
    appRolesPermissionCount: servicePrincipal.appRolesPermissionCount ?? 0,
    entraPermissionCount: servicePrincipal.entraPermissionCount ?? 0,
    entraPermissionRisk: servicePrincipal.entraPermissionRisk ?? "none"
  };
}

function getAzureIdentityRuntimeEnrichment(
  servicePrincipal: EntraServicePrincipalProjectionRow,
  enrichment?: LatestAzureIdentityEnrichment
): AzureIdentityRuntimeEnrichment {
  const roleAssignments =
    enrichment?.roleAssignmentsByPrincipalId.get(servicePrincipal.id.toLowerCase())?.roleAssignments ?? [];
  const permissionRisk =
    enrichment?.accessRiskByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createRiskSummary(servicePrincipal.id);

  return {
    permissionRisk: servicePrincipal.permissionRisk ?? permissionRisk.riskLevel,
    roleAssignments,
    ...createRbacSummary(servicePrincipal, roleAssignments)
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
  servicePrincipal: EntraServicePrincipalProjectionRow,
  roleAssignments: AzureRoleAssignment[]
): EntraPrincipalRbacSummary {
  return {
    rbacRoleAssignmentCount: servicePrincipal.rbacRoleAssignmentCount ?? 0,
    rbacRoleLevel: servicePrincipal.rbacRoleLevel ?? "none",
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
