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
import type { LocalReportCollectionFilter } from "../../../../core/runtime/collections";
import type { PageOptions } from "../../../../core/runtime/pagination";
import type {
  EntraOAuth2PermissionGrant as InputEntraOAuth2PermissionGrant,
  EntraServicePrincipal
} from "../../inputTransferObject/generated/EntraSnapshot";

import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraAppRoleAssignmentRows } from "./domain/appRoleAssignmentsTable";
import { mapEntraServicePrincipalsToCore } from "./entraServicePrincipalMapper";
import { readEntraUserGroupMembership } from "./domain/groupMembersTable";
import { readEntraOAuth2PermissionGrantRows } from "./domain/oauth2PermissionGrantsTable";
import { toManagedIdentities, toServicePrincipals } from "./principalProjection";
import {
  countEntraServicePrincipalRows,
  readEntraServicePrincipalRowById,
  readEntraServicePrincipalRows
} from "./domain/servicePrincipalsTable";

export type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
export type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
export type { EntraUserGroupMembershipResponse } from "../../../../core/azure/entra/types";

export type EntraPrincipalPermissions = {
  principalId: string;
  oauth2PermissionGrants: EntraOAuth2PermissionGrant[];
  appRoleAssignments: EntraAppRoleAssignment[];
};

export type EntraPrincipalReadOptions = PageOptions & {
  filters?: LocalReportCollectionFilter[];
};

export type EntraPermissionReadOptions = {
  principalId?: string;
  principalIds?: string[];
};

export async function readRawServicePrincipals(
  connection: DuckDBConnection
): Promise<EntraServicePrincipal[]> {
  return readEntraServicePrincipalRows(connection);
}

export async function readServicePrincipals(
  connection: DuckDBConnection,
  options: EntraPrincipalReadOptions = {}
): Promise<ServicePrincipal[]> {
  const servicePrincipals = mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection, {
    ...options,
    principalKind: "servicePrincipal"
  }));
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );

  return toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals)),
    permissionsByPrincipalId
  );
}

export async function countServicePrincipals(
  connection: DuckDBConnection,
  options: EntraPrincipalReadOptions = {}
): Promise<number> {
  return countEntraServicePrincipalRows(connection, {
    ...options,
    principalKind: "servicePrincipal"
  });
}

export async function findServicePrincipalById(
  connection: DuckDBConnection,
  principalId: string
): Promise<ServicePrincipal | null> {
  const servicePrincipal = await readEntraServicePrincipalRowById(connection, principalId);

  if (!servicePrincipal) {
    return null;
  }

  const servicePrincipals = mapEntraServicePrincipalsToCore([servicePrincipal]);
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );

  return toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals)),
    permissionsByPrincipalId
  )[0] ?? null;
}

export async function readManagedIdentities(
  connection: DuckDBConnection,
  options: EntraPrincipalReadOptions = {}
): Promise<ManagedIdentity[]> {
  const managedIdentityPrincipals = mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection, {
    ...options,
    principalKind: "managedIdentity"
  }));
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(managedIdentityPrincipals)
  );

  return toManagedIdentities(
    managedIdentityPrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(managedIdentityPrincipals)),
    permissionsByPrincipalId
  );
}

export async function countManagedIdentities(
  connection: DuckDBConnection,
  options: EntraPrincipalReadOptions = {}
): Promise<number> {
  return countEntraServicePrincipalRows(connection, {
    ...options,
    principalKind: "managedIdentity"
  });
}

export async function readOAuth2PermissionGrants(
  connection: DuckDBConnection,
  options: EntraPermissionReadOptions = {}
): Promise<EntraOAuth2PermissionGrant[]> {
  return (await readEntraOAuth2PermissionGrantRows(connection, {
    clientId: options.principalId,
    clientIds: options.principalIds
  })).map(toCoreEntraOAuth2PermissionGrant);
}

export async function readAppRoleAssignments(
  connection: DuckDBConnection,
  options: EntraPermissionReadOptions = {}
): Promise<EntraAppRoleAssignment[]> {
  return readEntraAppRoleAssignmentRows(connection, options);
}

export async function readPrincipalPermissions(
  connection: DuckDBConnection,
  principalId: string
): Promise<EntraPrincipalPermissions> {
  const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
    readEntraOAuth2PermissionGrantRows(connection, { clientId: principalId }),
    readEntraAppRoleAssignmentRows(connection, { principalId })
  ]);

  return {
    principalId,
    oauth2PermissionGrants: oauth2PermissionGrants.map(toCoreEntraOAuth2PermissionGrant),
    appRoleAssignments
  };
}

export async function readUserGroupMembership(
  connection: DuckDBConnection,
  user: string
): Promise<EntraUserGroupMembershipResponse> {
  return readEntraUserGroupMembership(connection, user);
}

async function readPrincipalPermissionSummary(
  connection: DuckDBConnection,
  principalIds: string[]
): Promise<Map<string, EntraPrincipalPermissionSummary>> {
  const normalizedPrincipalIds = normalizePrincipalIds(principalIds);
  if (normalizedPrincipalIds.length === 0) {
    return new Map();
  }

  const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
    readEntraOAuth2PermissionGrantRows(connection, { clientIds: normalizedPrincipalIds }),
    readEntraAppRoleAssignmentRows(connection, { principalIds: normalizedPrincipalIds })
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

function getPrincipalIds(servicePrincipals: Pick<EntraServicePrincipal, "id">[]): string[] {
  return servicePrincipals.map((servicePrincipal) => servicePrincipal.id);
}

function normalizePrincipalIds(principalIds: string[]): string[] {
  return [...new Set(principalIds.map((principalId) => principalId.trim()).filter(Boolean))];
}

function getOrCreatePrincipalPermissionSummary(
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

function countOAuthPermissionScopes(scope: string): number {
  return scope.split(/\s+/).filter(Boolean).length;
}

function toCoreEntraOAuth2PermissionGrant(grant: InputEntraOAuth2PermissionGrant): EntraOAuth2PermissionGrant {
  return {
    ...grant,
    risk: getOAuth2PermissionGrantRisk(grant)
  };
}

function getOAuth2PermissionGrantRisk(
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

function maxPermissionRisk(left: PermissionRiskLevel, right: PermissionRiskLevel): PermissionRiskLevel {
  return permissionRiskRank[left] >= permissionRiskRank[right] ? left : right;
}

const permissionRiskRank: Record<PermissionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

function getPrincipalEnrichmentKeys(servicePrincipals: Pick<EntraServicePrincipal, "id" | "appId">[]): string[] {
  return servicePrincipals.flatMap((servicePrincipal) => [servicePrincipal.id, servicePrincipal.appId]);
}
