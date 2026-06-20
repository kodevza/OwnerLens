import type { DuckDBConnection } from "@duckdb/node-api";

import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type {
  EntraPrincipalPermissionSummary,
  ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type {
  EntraAppRoleAssignment,
  EntraOAuth2PermissionGrant,
  EntraUserGroupMembershipResponse
} from "../../../../core/azure/entra/types";
import type { PermissionRiskLevel } from "../../../../core/risk/types";
import type {
  EntraOAuth2PermissionGrant as InputEntraOAuth2PermissionGrant,
  EntraServicePrincipal
} from "../../inputTransferObject/generated/EntraSnapshot";

import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraAppRoleAssignmentRows } from "./appRoleAssignmentsTable";
import { mapEntraServicePrincipalsToCore } from "./entraServicePrincipalMapper";
import { readEntraUserGroupMembership } from "./groupMembersTable";
import { readEntraOAuth2PermissionGrantRows } from "./oauth2PermissionGrantsTable";
import { toManagedIdentities, toServicePrincipals } from "./principalProjection";
import { readEntraServicePrincipalRows } from "./servicePrincipalsTable";

export type EntraPrincipalPermissions = {
  principalId: string;
  oauth2PermissionGrants: EntraOAuth2PermissionGrant[];
  appRoleAssignments: EntraAppRoleAssignment[];
};

export async function readRawServicePrincipals(
  connection: DuckDBConnection
): Promise<EntraServicePrincipal[]> {
  return readEntraServicePrincipalRows(connection);
}

export async function readServicePrincipals(
  connection: DuckDBConnection
): Promise<ServicePrincipal[]> {
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(connection);

  return toServicePrincipals(
    mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
    await readLatestAzureIdentityEnrichment(connection),
    permissionsByPrincipalId
  );
}

export async function readManagedIdentities(
  connection: DuckDBConnection
): Promise<ManagedIdentity[]> {
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(connection);

  return toManagedIdentities(
    mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
    await readLatestAzureIdentityEnrichment(connection),
    permissionsByPrincipalId
  );
}

export async function readOAuth2PermissionGrants(
  connection: DuckDBConnection
): Promise<EntraOAuth2PermissionGrant[]> {
  return (await readEntraOAuth2PermissionGrantRows(connection)).map(toCoreEntraOAuth2PermissionGrant);
}

export async function readAppRoleAssignments(
  connection: DuckDBConnection
): Promise<EntraAppRoleAssignment[]> {
  return readEntraAppRoleAssignmentRows(connection);
}

export async function readPrincipalPermissions(
  connection: DuckDBConnection,
  principalId: string
): Promise<EntraPrincipalPermissions> {
  const normalizedPrincipalId = principalId.toLowerCase();

  const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
    readEntraOAuth2PermissionGrantRows(connection),
    readEntraAppRoleAssignmentRows(connection)
  ]);

  return {
    principalId,
    oauth2PermissionGrants: oauth2PermissionGrants
      .filter((grant) => grant.clientId.toLowerCase() === normalizedPrincipalId)
      .map(toCoreEntraOAuth2PermissionGrant),
    appRoleAssignments: appRoleAssignments.filter(
      (assignment) => assignment.principalId.toLowerCase() === normalizedPrincipalId
    )
  };
}

export async function readUserGroupMembership(
  connection: DuckDBConnection,
  user: string
): Promise<EntraUserGroupMembershipResponse> {
  return readEntraUserGroupMembership(connection, user);
}

export async function readPrincipalPermissionSummary(
  connection: DuckDBConnection
): Promise<Map<string, EntraPrincipalPermissionSummary>> {
  const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
    readEntraOAuth2PermissionGrantRows(connection),
    readEntraAppRoleAssignmentRows(connection)
  ]);
  const permissionsByPrincipalId = new Map<string, EntraPrincipalPermissionSummary>();

  for (const grant of oauth2PermissionGrants) {
    const summary = getOrCreatePrincipalPermissionSummary(permissionsByPrincipalId, grant.clientId);
    const scopeCount = countOAuthPermissionScopes(grant.scope);
    summary.oauthPermissionsCount += scopeCount;
    if (scopeCount > 0) {
      summary.entraPermissionRisk = maxPermissionRisk(
        summary.entraPermissionRisk,
        grant.consentType === "AllPrincipals" ? "high" : "medium"
      );
    }
  }

  for (const assignment of appRoleAssignments) {
    const summary = getOrCreatePrincipalPermissionSummary(permissionsByPrincipalId, assignment.principalId);
    summary.appRolesPermissionCount += 1;
    summary.entraPermissionRisk = maxPermissionRisk(summary.entraPermissionRisk, "medium");
  }

  return permissionsByPrincipalId;
}

export function getOrCreatePrincipalPermissionSummary(
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary>,
  principalId: string
): EntraPrincipalPermissionSummary {
  const normalizedPrincipalId = principalId.toLowerCase();
  const existing = permissionsByPrincipalId.get(normalizedPrincipalId);

  if (existing) {
    return existing;
  }

  const summary = {
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none" as PermissionRiskLevel
  };

  permissionsByPrincipalId.set(normalizedPrincipalId, summary);
  return summary;
}

export function countOAuthPermissionScopes(scope: string): number {
  return scope.split(/\s+/).filter(Boolean).length;
}

export function toCoreEntraOAuth2PermissionGrant(grant: InputEntraOAuth2PermissionGrant): EntraOAuth2PermissionGrant {
  return {
    ...grant,
    risk: getOAuth2PermissionGrantRisk(grant)
  };
}

export function getOAuth2PermissionGrantRisk(
  grant: Pick<InputEntraOAuth2PermissionGrant, "consentType">
): PermissionRiskLevel {
  if (grant.consentType === "AllPrincipals") {
    return "high";
  }

  if (grant.consentType === "Principal") {
    return "low";
  }

  return "medium";
}

export function maxPermissionRisk(left: PermissionRiskLevel, right: PermissionRiskLevel): PermissionRiskLevel {
  return permissionRiskRank[left] >= permissionRiskRank[right] ? left : right;
}

export const permissionRiskRank: Record<PermissionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};
