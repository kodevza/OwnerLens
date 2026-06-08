import type { PermissionRiskLevel } from "../risk/types";
import type { AzureRoleAssignment, AzureUserAssignedIdentityAssignment } from "./resources";

export type AzureManagedIdentityResourceAssignment = AzureUserAssignedIdentityAssignment & {
  assignedResourceId: string;
  assignedResourceName: string;
  assignedResourceType: string;
  assignedResourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
};

export type ManagedIdentityPermissionRiskLevel = PermissionRiskLevel;

export type ManagedIdentityPermissionRiskAssignment = AzureRoleAssignment & {
  riskLevel: ManagedIdentityPermissionRiskLevel;
  reasons: string[];
};

export type ManagedIdentityPermissionRiskSummary = {
  principalId: string;
  riskLevel: ManagedIdentityPermissionRiskLevel;
  assignmentCount: number;
  highRiskAssignmentCount: number;
  broadScopeAssignmentCount: number;
  roleAssignments: ManagedIdentityPermissionRiskAssignment[];
};

export const AZURE_ACCESS_RISK_RANK: Record<ManagedIdentityPermissionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

export type AzureIdentityEnrichmentStatus = {
  calculated: boolean;
  latestRunId: string | null;
  identityRoleAssignmentCount: number;
  accessRiskIdentityCount: number;
  managedIdentityAssignmentCount: number;
  calculatedAt: string | null;
};

export type AzureRoleAssignmentEnrichment = {
  principalId: string;
  roleAssignments: AzureRoleAssignment[];
  assignmentCount: number;
};

export type AzureManagedIdentityAssignmentEnrichment = {
  servicePrincipalId: string;
  principalId: string;
  clientId: string;
  managedIdentityAssignments: AzureManagedIdentityResourceAssignment[];
  assignedResourceGroups: string[];
  assignmentCount: number;
};

export type LatestAzureIdentityEnrichment = {
  status: AzureIdentityEnrichmentStatus;
  roleAssignmentsByPrincipalId: Map<string, AzureRoleAssignmentEnrichment>;
  accessRiskByPrincipalId: Map<string, ManagedIdentityPermissionRiskSummary>;
  managedIdentityAssignmentsByServicePrincipalId: Map<string, AzureManagedIdentityAssignmentEnrichment>;
};
