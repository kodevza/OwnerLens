import type { AzureResourceTags } from "./AzureResourceGroup";

export type { AzureUserAssignedIdentityAssignment } from "../../../../core/azure/resources";

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
