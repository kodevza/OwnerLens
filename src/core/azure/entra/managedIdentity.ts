import type { AzureManagedIdentityResourceAssignment } from "../identityEnrichment";
import type { OwnerConfidence } from "../../ownership/types";
import type {
  AzureIdentityRuntimeEnrichment,
  EntraPrincipalPermissionSummary,
  EntraPrincipalRbacSummary
} from "./servicePrincipal";
import type { ZtaRemediationSummary } from "../ztaReport";
import type { EntraServicePrincipal } from "./types";

export type ManagedIdentity = EntraServicePrincipal & AzureIdentityRuntimeEnrichment & {
  servicePrincipalType: "ManagedIdentity";
  managedIdentityAssignments: AzureManagedIdentityResourceAssignment[];
  assignedResourceGroups: string[];
  potentialOwners?: string[];
  ownerConfidence?: OwnerConfidence;
} & EntraPrincipalPermissionSummary & EntraPrincipalRbacSummary & ZtaRemediationSummary;

export function isManagedIdentity(servicePrincipal: EntraServicePrincipal): servicePrincipal is ManagedIdentity {
  return servicePrincipal.servicePrincipalType === "ManagedIdentity";
}
