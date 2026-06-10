import type { ManagedIdentityPermissionRiskLevel } from "../identityEnrichment";
import type { AzureRoleAssignment } from "../resources";
import type { ZtaRemediationSummary } from "../ztaReport";
import type { OwnerConfidence } from "../../ownership/types";
import type { PermissionRiskLevel } from "../../risk/types";
import type { EntraServicePrincipal, EntraServicePrincipalType } from "./types";

export type AzureIdentityRuntimeEnrichment = {
  permissionRisk: ManagedIdentityPermissionRiskLevel;
  azureRbac: string;
  roleAssignments: AzureRoleAssignment[];
};

export type EntraPrincipalPermissionSummary = {
  oauthPemrissionsCount: number;
  appRolesPermissionCount: number;
  entraPermissionRisk: PermissionRiskLevel;
};

export type EntraPrincipalRbacSummary = {
  rbacRoleAssignmentCount: number;
  rbacRoleLevel: PermissionRiskLevel;
  rbacSubscriptionCount: number;
};

export type ServicePrincipal = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: Exclude<EntraServicePrincipalType, "ManagedIdentity">;
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
} & EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & ZtaRemediationSummary;

export function isServicePrincipal(servicePrincipal: EntraServicePrincipal): servicePrincipal is ServicePrincipal {
  return servicePrincipal.servicePrincipalType !== "ManagedIdentity";
}
