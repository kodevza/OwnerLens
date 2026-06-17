import type { ManagedIdentityPermissionRiskLevel } from "../identityEnrichment";
import type { AzureRoleAssignment } from "../resources";
import type { ZtaRemediationSummary } from "../ztaReport";
import type { OwnerCandidate, OwnerConfidence } from "../../ownership/types";
import type { PermissionRiskLevel } from "../../risk/types";
import type { EntraServicePrincipal, EntraServicePrincipalType } from "./types";

export type AzureIdentityRuntimeEnrichment = {
  permissionRisk: ManagedIdentityPermissionRiskLevel;
  roleAssignments: AzureRoleAssignment[];
};

export type EntraPrincipalPermissionSummary = {
  oauthPermissionsCount: number;
  appRolesPermissionCount: number;
  entraPermissionRisk: PermissionRiskLevel;
};

export type EntraPrincipalRbacSummary = {
  rbacRoleAssignmentCount: number;
  rbacRoleLevel: PermissionRiskLevel;
  rbacSubscriptionCount: number;
};

export type EntraPrincipalOwnerSummary = {
  ownerCandidates: OwnerCandidate[];
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
};

export type EntraPrincipalRemediationOwnerSummary = {
  ownerCandidates?: OwnerCandidate[];
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
};

export type EntraPrincipalAzureRemediationSummary = EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & EntraPrincipalRemediationOwnerSummary & {
  displayName: string;
  id: string;
  roleAssignments: AzureRoleAssignment[];
};

export type ServicePrincipal = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: Exclude<EntraServicePrincipalType, "ManagedIdentity">;
  ownerCandidates?: OwnerCandidate[];
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
} & EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & ZtaRemediationSummary;

export function isServicePrincipal(servicePrincipal: EntraServicePrincipal): servicePrincipal is ServicePrincipal {
  return servicePrincipal.servicePrincipalType !== "ManagedIdentity";
}
