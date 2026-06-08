import type {
  LatestAzureIdentityEnrichment,
  ManagedIdentityPermissionRiskLevel,
  ManagedIdentityPermissionRiskSummary
} from "../identityEnrichment";
import type { AzureRoleAssignment } from "../resources";
import type { OwnerConfidence } from "../../ownership/types";
import type { EntraServicePrincipal, EntraServicePrincipalType } from "./types";

export type AzureIdentityRuntimeEnrichment = {
  permissionRisk: ManagedIdentityPermissionRiskLevel;
  azureRbac: string;
  roleAssignments: AzureRoleAssignment[];
};

export type EntraPrincipalPermissionSummary = {
  oauthPemrissionsCount: number;
  appRolesPermissionCount: number;
  isAllParticipant: boolean;
};

export type ServicePrincipal = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: Exclude<EntraServicePrincipalType, "ManagedIdentity">;
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
} & EntraPrincipalPermissionSummary;

export function isServicePrincipal(servicePrincipal: EntraServicePrincipal): servicePrincipal is ServicePrincipal {
  return servicePrincipal.servicePrincipalType !== "ManagedIdentity";
}

export function toServicePrincipals(
  servicePrincipals: EntraServicePrincipal[],
  enrichment?: LatestAzureIdentityEnrichment,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary> = new Map()
): ServicePrincipal[] {
  return servicePrincipals.filter(isServicePrincipal).map((servicePrincipal) => ({
    ...servicePrincipal,
    ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
    ...getEntraPrincipalPermissionSummary(servicePrincipal, permissionsByPrincipalId)
  }));
}

export function getEntraPrincipalPermissionSummary(
  servicePrincipal: EntraServicePrincipal,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary>
): EntraPrincipalPermissionSummary {
  return permissionsByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createEmptyPermissionSummary();
}

function createEmptyPermissionSummary(): EntraPrincipalPermissionSummary {
  return {
    oauthPemrissionsCount: 0,
    appRolesPermissionCount: 0,
    isAllParticipant: false
  };
}

export function getAzureIdentityRuntimeEnrichment(
  servicePrincipal: EntraServicePrincipal,
  enrichment?: LatestAzureIdentityEnrichment
): AzureIdentityRuntimeEnrichment {
  const roleAssignments =
    enrichment?.roleAssignmentsByPrincipalId.get(servicePrincipal.id.toLowerCase())?.roleAssignments ?? [];
  const permissionRisk = enrichment?.accessRiskByPrincipalId.get(servicePrincipal.id.toLowerCase()) ?? createRiskSummary(servicePrincipal.id);

  return {
    permissionRisk: permissionRisk.riskLevel,
    azureRbac: formatAzureRbac(permissionRisk, roleAssignments),
    roleAssignments
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
