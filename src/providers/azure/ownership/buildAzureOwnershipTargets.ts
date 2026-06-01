import type { OwnershipTarget, OwnershipTargetRef } from "../../../core/ownership";
import type { EntraServicePrincipal } from "../domain/entra";
import type { AzureUserAssignedManagedIdentity } from "../domain/resources";

export function buildAzureManagedIdentityOwnershipTargets(
  managedIdentities: AzureUserAssignedManagedIdentity[]
): OwnershipTarget[] {
  return managedIdentities.map((identity) => ({
    id: identity.resourceId,
    kind: "azure.managedIdentity",
    displayName: identity.name,
    sourceProvider: "azure",
    technicalId: identity.principalId,
    refs: compactRefs([
      { type: "azure.subscription", id: identity.subscriptionId, label: identity.subscriptionName },
      { type: "azure.resourceGroup", id: identity.resourceGroup },
      { type: "entra.servicePrincipal", id: identity.principalId },
      { type: "entra.application", id: identity.clientId },
      { type: "entra.tenant", id: identity.tenantId }
    ])
  }));
}

export function buildEntraServicePrincipalOwnershipTargets(
  servicePrincipals: EntraServicePrincipal[]
): OwnershipTarget[] {
  return servicePrincipals.map((servicePrincipal) => ({
    id: servicePrincipal.id,
    kind: "entra.servicePrincipal",
    displayName: servicePrincipal.displayName,
    sourceProvider: "entra",
    technicalId: servicePrincipal.appId,
    refs: compactRefs([
      { type: "entra.application", id: servicePrincipal.appId, label: servicePrincipal.appDisplayName ?? undefined },
      { type: "entra.tenant", id: servicePrincipal.appOwnerOrganizationId ?? "" }
    ])
  }));
}

function compactRefs(refs: OwnershipTargetRef[]): OwnershipTargetRef[] {
  return refs.filter((ref) => ref.id.trim().length > 0);
}
