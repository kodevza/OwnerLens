import type { OwnerCandidate, OwnerConfidence, OwnerEvidence } from "../ownership/types";

export type AzureResourceTags = Record<string, string>;

export type AzureResourceGroup = {
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  tags: AzureResourceTags | null;
};

export type AzureResource = {
  subscriptionId: string;
  subscriptionName: string;
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  resourceType: string;
  kind: string | null;
  location: string;
  tags: AzureResourceTags | null;
  identityType: string | null;
  identityPrincipalId: string | null;
  identityTenantId: string | null;
  userAssignedIdentityResourceIds: string[];
  userAssignedIdentities: unknown;
};

export type AzureSubscriptionState = "Enabled" | "Disabled" | "Warned" | "PastDue" | "Deleted";

export type AzureSubscription = {
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  state: AzureSubscriptionState;
  tags: AzureResourceTags | null;
};

export type AzureUserAssignedManagedIdentity = {
  subscriptionId: string;
  subscriptionName: string;
  resourceId: string;
  name: string;
  resourceGroup: string;
  location: string;
  clientId: string;
  principalId: string;
  tenantId: string;
  tags: AzureResourceTags | null;
};

export type AzureActivityLog = {
  subscriptionId: string;
  subscriptionName: string;
  eventTimestamp: string;
  submissionTimestamp: string | null;
  caller: string | null;
  callerUserPrincipalName?: string | null;
  callerName?: string | null;
  callerEmail?: string | null;
  callerObjectId?: string | null;
  callerIdentityType?: string | null;
  callerAppId?: string | null;
  callerIpAddress?: string | null;
  callerTenantId?: string | null;
  operationName: string | null;
  operationNameValue: string | null;
  status: string | null;
  subStatus: string | null;
  category: string | null;
  resourceGroupName: string | null;
  resourceId: string | null;
  resourceProviderName: string | null;
  resourceType: string | null;
  authorizationAction: string | null;
  authorizationScope: string | null;
};

export type AzureSnapshotMeta = {
  provider: "azure";
  snapshotVersion: string;
  createdAt: string;
  activityDays: number;
  activityStartTime: string;
  maxActivityRecords: number;
  requestedSubscriptions: string[];
  subscriptionCount: number;
  resourceGroupCount: number;
  resourceCount: number;
  userAssignedManagedIdentityCount: number;
  roleAssignmentCount?: number;
  activityLogCount: number;
};

export type AzureSnapshot = {
  meta: AzureSnapshotMeta;
  subscriptions: AzureSubscription[];
  resourceGroups: AzureResourceGroup[];
  resources: AzureResource[];
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[];
  roleAssignments?: AzureRoleAssignment[];
  activityLogs: AzureActivityLog[];
};

export type ResourceGroupOwnershipRow = AzureResourceGroup & {
  targetKey: string;
  ownerCandidates: OwnerCandidate[];
  owner: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: OwnerEvidence[];
};

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
  assignmentSource?: "direct" | "group";
  inheritedFromGroupId?: string;
  inheritedFromGroupDisplayName?: string | null;
};
