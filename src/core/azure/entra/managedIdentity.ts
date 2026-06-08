import type { AzureManagedIdentityResourceAssignment, LatestAzureIdentityEnrichment } from "../identityEnrichment";
import { getAzureIdentityRuntimeEnrichment, type AzureIdentityRuntimeEnrichment } from "./servicePrincipal";
import type { EntraServicePrincipal } from "./types";

export type ManagedIdentity = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: "ManagedIdentity";
  managedIdentityAssignments: AzureManagedIdentityResourceAssignment[];
  assignedResourceGroups: string[];
};

export function isManagedIdentity(servicePrincipal: EntraServicePrincipal): servicePrincipal is ManagedIdentity {
  return servicePrincipal.servicePrincipalType === "ManagedIdentity";
}

export function toManagedIdentities(
  servicePrincipals: EntraServicePrincipal[],
  enrichment?: LatestAzureIdentityEnrichment
): ManagedIdentity[] {
  return servicePrincipals.filter(isManagedIdentity).map((servicePrincipal) => {
    const assignmentEnrichment = enrichment?.managedIdentityAssignmentsByServicePrincipalId.get(
      servicePrincipal.id.toLowerCase()
    );

    return {
      ...servicePrincipal,
      ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
      managedIdentityAssignments: assignmentEnrichment?.managedIdentityAssignments ?? [],
      assignedResourceGroups: assignmentEnrichment?.assignedResourceGroups ?? []
    };
  });
}
