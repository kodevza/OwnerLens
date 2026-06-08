export type AzureUserAssignedIdentityAssignment = {
  resourceId: string;
  clientId: string | null;
  principalId: string | null;
};

export type AzureRoleAssignment = {
  subscriptionId: string;
  subscriptionName: string;
  roleAssignmentId: string | null;
  scope: string;
  scopeType?: "ManagementGroup" | "Subscription" | "ResourceGroup" | "Resource" | "Unknown" | null;
  scopeSubscriptionId?: string | null;
  scopeResourceGroup?: string | null;
  scopeResourceProvider?: string | null;
  scopeResourceType?: string | null;
  scopeResourceName?: string | null;
  scopeManagementGroup?: string | null;
  principalId: string;
  principalType: string | null;
  principalDisplayName: string | null;
  signInName: string | null;
  roleDefinitionId: string | null;
  roleDefinitionName: string | null;
  canDelegate: boolean | null;
  condition: string | null;
  conditionVersion: string | null;
};
