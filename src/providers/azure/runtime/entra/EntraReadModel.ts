import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

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
import {
  maxOwnerConfidence,
  rankOwnerCandidates
} from "../../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateScope,
  OwnerCandidateSource,
  OwnerConfidence,
  OwnerEvidence,
  OwnerType,
  OwnershipEvidenceDiscoverySource,
  OwnershipEvidencePath
} from "../../../../core/ownership/types";
import type {
  EntraOAuth2PermissionGrant as InputEntraOAuth2PermissionGrant,
  EntraServicePrincipal
} from "../../inputTransferObject/generated/EntraSnapshot";

import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraAppRoleAssignmentRows } from "./domain/appRoleAssignmentsTable";
import { readEntraApplicationNotesByAppIds } from "./domain/applicationsTable";
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
  const servicePrincipals = await attachApplicationNotes(
    connection,
    mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection, {
      ...options,
      principalKind: "servicePrincipal"
    }))
  );
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );

  return attachPrincipalOwnerSummaries(toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals)),
    permissionsByPrincipalId
  ), ownerCandidatesByPrincipalId);
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

  const servicePrincipals = await attachApplicationNotes(
    connection,
    mapEntraServicePrincipalsToCore([servicePrincipal])
  );
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(servicePrincipals)
  );

  return attachPrincipalOwnerSummaries(toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals)),
    permissionsByPrincipalId
  ), ownerCandidatesByPrincipalId)[0] ?? null;
}

export async function readManagedIdentities(
  connection: DuckDBConnection,
  options: EntraPrincipalReadOptions = {}
): Promise<ManagedIdentity[]> {
  const managedIdentityPrincipals = await attachApplicationNotes(
    connection,
    mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection, {
      ...options,
      principalKind: "managedIdentity"
    }))
  );
  const permissionsByPrincipalId = await readPrincipalPermissionSummary(
    connection,
    getPrincipalIds(managedIdentityPrincipals)
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(managedIdentityPrincipals)
  );

  return attachPrincipalOwnerSummaries(toManagedIdentities(
    managedIdentityPrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(managedIdentityPrincipals)),
    permissionsByPrincipalId
  ), ownerCandidatesByPrincipalId);
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

async function readPrincipalOwnerCandidateSummary(
  connection: DuckDBConnection,
  principalIds: string[]
): Promise<Map<string, OwnerCandidate[]>> {
  const normalizedPrincipalIds = normalizePrincipalIds(principalIds).map((principalId) => principalId.toLowerCase());
  if (normalizedPrincipalIds.length === 0) {
    return new Map();
  }

  const rows = await readRows<PrincipalOwnerCandidateSqlRow>(
    connection,
    `
      with target_principals as (
        select lower(trim(json_extract_string(value, '$'))) as principal_id
        from json_each($principalIds::json)
        where trim(json_extract_string(value, '$')) <> ''
      ),
      latest_run as (
        select run_id
        from azure_runtime_enrichment_runs
        where status = 'completed'
        order by completed_at desc
        limit 1
      ),
      role_assignment_resource_groups as (
        select distinct
          lower(trim(role_enrichment.principal_id)) as principal_id,
          coalesce(
            nullif(trim(json_extract_string(role_entry.value, '$.scopeSubscriptionId')), ''),
            nullif(trim(json_extract_string(role_entry.value, '$.subscriptionId')), ''),
            nullif(regexp_extract(json_extract_string(role_entry.value, '$.scope'), '/subscriptions/([^/]+)', 1), '')
          ) as subscription_id,
          coalesce(
            nullif(trim(json_extract_string(role_entry.value, '$.scopeResourceGroup')), ''),
            nullif(regexp_extract(json_extract_string(role_entry.value, '$.scope'), '/resourceGroups/([^/]+)', 1), '')
          ) as resource_group,
          nullif(trim(json_extract_string(role_entry.value, '$.scope')), '') as scope,
          nullif(trim(json_extract_string(role_entry.value, '$.roleDefinitionName')), '') as role_definition_name
        from azure_identity_role_assignment_enrichment role_enrichment
        join latest_run on role_enrichment.run_id = latest_run.run_id
        join target_principals target on lower(trim(role_enrichment.principal_id)) = target.principal_id
        join json_each(role_enrichment.role_assignments) role_entry on true
      ),
      managed_identity_resource_groups as (
        select distinct
          lower(trim(identity_enrichment.service_principal_id)) as principal_id,
          nullif(trim(json_extract_string(assignment_entry.value, '$.subscriptionId')), '') as subscription_id,
          nullif(trim(json_extract_string(assignment_entry.value, '$.assignedResourceGroup')), '') as resource_group,
          nullif(trim(json_extract_string(assignment_entry.value, '$.assignedResourceId')), '') as scope,
          null::varchar as role_definition_name
        from azure_managed_identity_assignment_enrichment identity_enrichment
        join latest_run on identity_enrichment.run_id = latest_run.run_id
        join target_principals target on lower(trim(identity_enrichment.service_principal_id)) = target.principal_id
        join json_each(identity_enrichment.managed_identity_assignments) assignment_entry on true
      ),
      user_assigned_identity_resource_groups as (
        select distinct
          lower(trim(identity.principal_id)) as principal_id,
          identity.subscription_id,
          identity.resource_group,
          identity.resource_id as scope,
          null::varchar as role_definition_name
        from azure_user_assigned_managed_identities identity
        join target_principals target
          on lower(trim(identity.principal_id)) = target.principal_id
          or lower(trim(identity.client_id)) = target.principal_id
      ),
      principal_resource_groups as (
        select *
        from role_assignment_resource_groups
        where subscription_id is not null and resource_group is not null
        union
        select *
        from managed_identity_resource_groups
        where subscription_id is not null and resource_group is not null
        union
        select *
        from user_assigned_identity_resource_groups
        where subscription_id is not null and resource_group is not null
      )
      select *
      from (
        select
          candidate.principal_id,
          candidate.subscription_id,
          candidate.subscription_name,
          candidate.resource_group,
          candidate.owner,
          candidate.owner_type,
          candidate.owner_candidate,
          candidate.evidence_key,
          candidate.confidence,
          candidate.source,
          candidate.path,
          candidate.discovery_source,
          candidate.evidence_value,
          candidate.evidence_date,
          candidate.priority,
          null::varchar as scope,
          null::varchar as role_definition_name
        from azure_principal_resource_group_owner_candidates candidate
        join target_principals target on lower(trim(candidate.principal_id)) = target.principal_id
        where candidate.path = 'direct'
        union all
        select
          target_scope.principal_id,
          candidate.subscription_id,
          candidate.subscription_name,
          candidate.resource_group,
          candidate.owner,
          candidate.owner_type,
          candidate.owner_candidate,
          concat(
            'resourceGroup:',
            lower(trim(candidate.subscription_id)),
            ':',
            lower(trim(candidate.resource_group)),
            ':principal:',
            target_scope.principal_id,
            ':',
            candidate.owner_candidate
          ) as evidence_key,
          candidate.confidence,
          candidate.source,
          candidate.path,
          candidate.discovery_source,
          candidate.evidence_value,
          candidate.evidence_date,
          candidate.priority,
          target_scope.scope,
          target_scope.role_definition_name
        from principal_resource_groups target_scope
        join azure_principal_resource_group_owner_candidates candidate
          on candidate.path = 'indirect'
          and lower(trim(candidate.subscription_id)) = lower(trim(target_scope.subscription_id))
          and lower(trim(candidate.resource_group)) = lower(trim(target_scope.resource_group))
      ) owner_rows
      order by
        principal_id,
        case confidence
          when 'high' then 3
          when 'medium' then 2
          when 'low' then 1
          else 0
        end desc,
        case source
          when 'tag' then 5
          when 'resourceGroupOwner' then 5
          when 'entraApplicationOwner' then 4
          when 'entraServicePrincipalOwner' then 3
          when 'activity' then 1
          else 0
        end desc,
        priority,
        lower(trim(coalesce(subscription_id, ''))),
        lower(trim(coalesce(resource_group, ''))),
        lower(trim(owner_candidate))
    `,
    { principalIds: JSON.stringify(normalizedPrincipalIds) }
  );

  return buildPrincipalOwnerCandidatesByPrincipalId(rows);
}

function attachPrincipalOwnerSummaries<Row extends { id: string }>(
  rows: Row[],
  ownerCandidatesByPrincipalId: Map<string, OwnerCandidate[]>
): Row[] {
  return rows.map((row) => {
    const ownerCandidates = ownerCandidatesByPrincipalId.get(row.id.toLowerCase()) ?? [];

    if (ownerCandidates.length === 0) {
      return {
        ...row,
        ownerCandidates: [],
        potentialOwners: [],
        ownerConfidence: "none" as OwnerConfidence
      };
    }

    return {
      ...row,
      ownerCandidates,
      potentialOwners: ownerCandidates.map((candidate) => candidate.displayName),
      ownerConfidence: ownerCandidates.reduce<OwnerConfidence>(
        (confidence, candidate) => maxOwnerConfidence(confidence, candidate.confidence),
        "none"
      )
    };
  });
}

function buildPrincipalOwnerCandidatesByPrincipalId(
  rows: PrincipalOwnerCandidateSqlRow[]
): Map<string, OwnerCandidate[]> {
  const ownerCandidatesByPrincipalId = new Map<string, Map<string, OwnerCandidate>>();

  for (const row of rows) {
    const principalId = row.principal_id.toLowerCase();
    const candidateKey = getPrincipalOwnerCandidateKey(row);
    const candidates = ownerCandidatesByPrincipalId.get(principalId) ?? new Map<string, OwnerCandidate>();
    const existing = candidates.get(candidateKey);
    const evidence = toOwnerEvidence(row);
    const relatedScope = toOwnerCandidateScope(row);

    if (existing) {
      existing.confidence = maxOwnerConfidence(existing.confidence, row.confidence);
      existing.evidence = mergeOwnerEvidence(existing.evidence, [evidence]);
      existing.relatedScopes = relatedScope
        ? mergeOwnerCandidateScopes(existing.relatedScopes, [relatedScope])
        : existing.relatedScopes;
      continue;
    }

    candidates.set(candidateKey, {
      key: candidateKey,
      displayName: row.owner,
      type: row.owner_type,
      confidence: row.confidence,
      source: row.source,
      rank: 0,
      evidence: [evidence],
      relatedScopes: relatedScope ? [relatedScope] : []
    });
    ownerCandidatesByPrincipalId.set(principalId, candidates);
  }

  return new Map(
    [...ownerCandidatesByPrincipalId.entries()].map(([principalId, candidates]) => [
      principalId,
      rankOwnerCandidates([...candidates.values()])
    ])
  );
}

function getPrincipalOwnerCandidateKey(row: PrincipalOwnerCandidateSqlRow): string {
  if (row.source === "entraApplicationOwner" || row.source === "entraServicePrincipalOwner") {
    return row.owner_candidate;
  }

  return getResourceGroupOwnerCandidateKey(row.owner_candidate, row.owner_type, row.owner);
}

function getResourceGroupOwnerCandidateKey(ownerCandidate: string, ownerType: OwnerType, owner: string): string {
  if (ownerCandidate.trim()) {
    return ownerCandidate;
  }

  return `${ownerType}:${owner.trim().toLowerCase()}`;
}

function toOwnerEvidence(row: PrincipalOwnerCandidateSqlRow): OwnerEvidence {
  return {
    user: row.evidence_value,
    date: row.evidence_date,
    key: row.evidence_key
  };
}

function toOwnerCandidateScope(row: PrincipalOwnerCandidateSqlRow): OwnerCandidateScope | null {
  if (row.path !== "indirect" || !row.subscription_id || !row.resource_group) {
    return null;
  }

  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name ?? undefined,
    resourceGroup: row.resource_group,
    principalId: row.principal_id,
    scope: row.scope ?? undefined,
    roleDefinitionName: row.role_definition_name
  };
}

function mergeOwnerEvidence(left: OwnerEvidence[], right: OwnerEvidence[]): OwnerEvidence[] {
  const merged = new Map<string, OwnerEvidence>();

  for (const evidence of [...left, ...right]) {
    merged.set(getOwnerEvidenceKey(evidence), evidence);
  }

  return [...merged.values()];
}

function getOwnerEvidenceKey(evidence: OwnerEvidence): string {
  return `${evidence.key ?? ""}:${evidence.user}:${evidence.date ?? ""}`;
}

function mergeOwnerCandidateScopes(left: OwnerCandidateScope[], right: OwnerCandidateScope[]): OwnerCandidateScope[] {
  const merged = new Map<string, OwnerCandidateScope>();

  for (const scope of [...left, ...right]) {
    merged.set(getOwnerCandidateScopeKey(scope), scope);
  }

  return [...merged.values()];
}

function getOwnerCandidateScopeKey(scope: OwnerCandidateScope): string {
  return [
    scope.subscriptionId ?? "",
    scope.subscriptionName ?? "",
    scope.resourceGroup ?? "",
    scope.principalId ?? "",
    scope.scope ?? "",
    scope.roleDefinitionName ?? ""
  ].join(":");
}

async function attachApplicationNotes<T extends { appId: string }>(
  connection: DuckDBConnection,
  servicePrincipals: T[]
): Promise<T[]> {
  const notesByAppId = await readEntraApplicationNotesByAppIds(
    connection,
    servicePrincipals.map((servicePrincipal) => servicePrincipal.appId)
  );

  return servicePrincipals.map((servicePrincipal) => ({
    ...servicePrincipal,
    notes: notesByAppId.get(servicePrincipal.appId.toLowerCase()) ?? null
  }));
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

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

type PrincipalOwnerCandidateSqlRow = {
  principal_id: string;
  subscription_id: string | null;
  subscription_name: string | null;
  resource_group: string | null;
  owner: string;
  owner_type: OwnerType;
  owner_candidate: string;
  evidence_key: string;
  confidence: Exclude<OwnerConfidence, "none">;
  source: OwnerCandidateSource;
  path: OwnershipEvidencePath;
  discovery_source: OwnershipEvidenceDiscoverySource;
  evidence_value: string;
  evidence_date: string | null;
  priority: number;
  scope: string | null;
  role_definition_name: string | null;
};
