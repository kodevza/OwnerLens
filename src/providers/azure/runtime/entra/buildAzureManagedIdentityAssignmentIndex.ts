import type { AzureResource } from "../../../../core/azure/resources";
import type { AzureManagedIdentityResourceAssignment } from "./azureIdentityTypes";
import { normalizeUserAssignedIdentityAssignments } from "./userAssignedIdentityAssignments";

export function getResourceManagedIdentityAssignments(resource: AzureResource): AzureManagedIdentityResourceAssignment[] {
  const assignments = normalizeUserAssignedIdentityAssignments(resource.userAssignedIdentities).map((assignment) => ({
    ...assignment,
    assignedResourceId: resource.resourceId,
    assignedResourceName: resource.resourceName,
    assignedResourceType: resource.resourceType,
    assignedResourceGroup: resource.resourceGroup,
    subscriptionId: resource.subscriptionId,
    subscriptionName: resource.subscriptionName
  }));

  if (hasSystemAssignedIdentity(resource)) {
    assignments.push({
      resourceId: resource.resourceId,
      clientId: null,
      principalId: resource.identityPrincipalId,
      assignedResourceId: resource.resourceId,
      assignedResourceName: resource.resourceName,
      assignedResourceType: resource.resourceType,
      assignedResourceGroup: resource.resourceGroup,
      subscriptionId: resource.subscriptionId,
      subscriptionName: resource.subscriptionName
    });
  }

  return assignments;
}

function hasSystemAssignedIdentity(resource: AzureResource): boolean {
  return Boolean(resource.identityPrincipalId && resource.identityType?.toLowerCase().includes("systemassigned"));
}
