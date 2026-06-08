import type { AzureManagedIdentityResourceAssignment, LatestAzureIdentityEnrichment } from "../identityEnrichment";
import type { OwnerConfidence } from "../../ownership/types";
import {
  getAzureIdentityRuntimeEnrichment,
  getEntraPrincipalPermissionSummary,
  type AzureIdentityRuntimeEnrichment,
  type EntraPrincipalPermissionSummary
} from "./servicePrincipal";
import type { EntraServicePrincipal } from "./types";

export type ManagedIdentity = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: "ManagedIdentity";
  managedIdentityAssignments: AzureManagedIdentityResourceAssignment[];
  assignedResourceGroups: string[];
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
} & EntraPrincipalPermissionSummary;

export function isManagedIdentity(servicePrincipal: EntraServicePrincipal): servicePrincipal is ManagedIdentity {
  return servicePrincipal.servicePrincipalType === "ManagedIdentity";
}

export function toManagedIdentities(
  servicePrincipals: EntraServicePrincipal[],
  enrichment?: LatestAzureIdentityEnrichment,
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary> = new Map()
): ManagedIdentity[] {
  return servicePrincipals.filter(isManagedIdentity).map((servicePrincipal) => {
    const assignmentEnrichment = enrichment?.managedIdentityAssignmentsByServicePrincipalId.get(
      servicePrincipal.id.toLowerCase()
    );

    return {
      ...servicePrincipal,
      ...getAzureIdentityRuntimeEnrichment(servicePrincipal, enrichment),
      ...getEntraPrincipalPermissionSummary(servicePrincipal, permissionsByPrincipalId),
      managedIdentityAssignments: assignmentEnrichment?.managedIdentityAssignments ?? [],
      assignedResourceGroups: assignmentEnrichment?.assignedResourceGroups ?? []
    };
  });
}
