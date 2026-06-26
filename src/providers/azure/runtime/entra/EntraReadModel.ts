import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type { AzureRoleAssignment } from "../../../../core/azure/resources";
import type {
  EntraAppRoleAssignment,
  EntraOAuth2PermissionGrant,
  EntraUserGroupMembershipResponse
} from "../../../../core/azure/entra/types";
import type { PermissionRiskLevel } from "../../../../core/risk/types";
import type { LocalReportCollectionFilter } from "../../../../core/runtime/collections";
import type { PageOptions } from "../../../../core/runtime/pagination";
import {
  OWNER_CONFIDENCE_RANK,
  maxOwnerConfidence,
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
  countEntraPrincipalCollectionRows,
  countEntraServicePrincipalRows,
  queryEntraPrincipalCollectionRows,
  readEntraServicePrincipalRowById,
  readEntraServicePrincipalRows,
  type EntraPrincipalCollectionRow,
  type EntraPrincipalCollectionRowsQueryOptions
} from "./domain/servicePrincipalsTable";

export type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
export type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
export type { EntraUserGroupMembershipResponse } from "../../../../core/azure/entra/types";
export type { EntraPrincipalCollectionRow, EntraPrincipalCollectionRowsQueryOptions };

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

type PrincipalWithRoleAssignments = {
  id: string;
  roleAssignments: AzureRoleAssignment[];
};

type PrincipalResourceGroupOwnerTarget = {
  principalId: string;
  subscriptionId: string;
  resourceGroup: string;
  scope?: string | null;
  roleDefinitionName?: string | null;
  priority: number;
};

type PrincipalOwnerCandidateWithTargetPriority = OwnerCandidate & {
  targetPriority: number;
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
  const projected = toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals))
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(projected),
    buildPrincipalResourceGroupTargetsFromRbac(projected, 10)
  );

  return attachPrincipalOwnerSummaries(projected, ownerCandidatesByPrincipalId);
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

export async function queryPrincipalCollectionRows(
  connection: DuckDBConnection,
  options: EntraPrincipalCollectionRowsQueryOptions
): Promise<EntraPrincipalCollectionRow[]> {
  return queryEntraPrincipalCollectionRows(connection, options);
}

export async function countPrincipalCollectionRows(
  connection: DuckDBConnection,
  options: Omit<EntraPrincipalCollectionRowsQueryOptions, "page" | "pageSize" | "sortRules">
): Promise<number> {
  return countEntraPrincipalCollectionRows(connection, options);
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
  const projected = toServicePrincipals(
    servicePrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(servicePrincipals))
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(projected),
    buildPrincipalResourceGroupTargetsFromRbac(projected, 10)
  );

  return attachPrincipalOwnerSummaries(projected, ownerCandidatesByPrincipalId)[0] ?? null;
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
  const projected = toManagedIdentities(
    managedIdentityPrincipals,
    await readLatestAzureIdentityEnrichment(connection, getPrincipalEnrichmentKeys(managedIdentityPrincipals))
  );
  const ownerCandidatesByPrincipalId = await readPrincipalOwnerCandidateSummary(
    connection,
    getPrincipalIds(projected),
    await buildManagedIdentityResourceGroupTargets(projected)
  );

  return attachPrincipalOwnerSummaries(projected, ownerCandidatesByPrincipalId);
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

function getPrincipalIds(servicePrincipals: Pick<EntraServicePrincipal, "id">[]): string[] {
  return servicePrincipals.map((servicePrincipal) => servicePrincipal.id);
}

async function readPrincipalOwnerCandidateSummary(
  connection: DuckDBConnection,
  principalIds: string[],
  principalResourceGroups: PrincipalResourceGroupOwnerTarget[]
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
      principal_resource_groups as (
        select distinct
          lower(trim(json_extract_string(target_entry.value, '$.principalId'))) as principal_id,
          nullif(trim(json_extract_string(target_entry.value, '$.subscriptionId')), '') as subscription_id,
          nullif(trim(json_extract_string(target_entry.value, '$.resourceGroup')), '') as resource_group,
          nullif(trim(json_extract_string(target_entry.value, '$.scope')), '') as scope,
          nullif(trim(json_extract_string(target_entry.value, '$.roleDefinitionName')), '') as role_definition_name,
          coalesce(try_cast(json_extract_string(target_entry.value, '$.priority') as integer), 0) as target_priority
        from json_each($principalResourceGroups::json) target_entry
        join target_principals target
          on lower(trim(json_extract_string(target_entry.value, '$.principalId'))) = target.principal_id
        where nullif(trim(json_extract_string(target_entry.value, '$.subscriptionId')), '') is not null
          and nullif(trim(json_extract_string(target_entry.value, '$.resourceGroup')), '') is not null
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
          null::integer as target_priority,
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
          target_scope.target_priority,
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
        case path
          when 'indirect' then target_priority
          else 0
        end,
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
    {
      principalIds: JSON.stringify(normalizedPrincipalIds),
      principalResourceGroups: JSON.stringify(principalResourceGroups)
    }
  );

  return buildPrincipalOwnerCandidatesByPrincipalId(rows);
}

function buildPrincipalResourceGroupTargetsFromRbac(
  principals: PrincipalWithRoleAssignments[],
  priority: number
): PrincipalResourceGroupOwnerTarget[] {
  const targets = new Map<string, PrincipalResourceGroupOwnerTarget>();

  for (const principal of principals) {
    for (const roleAssignment of principal.roleAssignments) {
      const subscriptionId = firstNonEmpty([
        roleAssignment.scopeSubscriptionId,
        roleAssignment.subscriptionId,
        extractSubscriptionIdFromScope(roleAssignment.scope)
      ]);
      const resourceGroup = firstNonEmpty([
        roleAssignment.scopeResourceGroup,
        extractResourceGroupFromScope(roleAssignment.scope)
      ]);

      if (!subscriptionId || !resourceGroup) {
        continue;
      }

      const target: PrincipalResourceGroupOwnerTarget = {
        principalId: principal.id,
        subscriptionId,
        resourceGroup,
        scope: roleAssignment.scope || null,
        roleDefinitionName: roleAssignment.roleDefinitionName,
        priority
      };
      addPrincipalResourceGroupOwnerTarget(targets, target);
    }
  }

  return [...targets.values()];
}

async function buildManagedIdentityResourceGroupTargets(
  managedIdentities: ManagedIdentity[]
): Promise<PrincipalResourceGroupOwnerTarget[]> {
  const targets = new Map<string, PrincipalResourceGroupOwnerTarget>();

  for (const target of buildManagedIdentityHomeResourceGroupTargets(managedIdentities)) {
    addPrincipalResourceGroupOwnerTarget(targets, target);
  }

  for (const target of buildPrincipalResourceGroupTargetsFromRbac(managedIdentities, 10)) {
    addPrincipalResourceGroupOwnerTarget(targets, target);
  }

  return [...targets.values()];
}

function buildManagedIdentityHomeResourceGroupTargets(
  managedIdentities: ManagedIdentity[]
): PrincipalResourceGroupOwnerTarget[] {
  const targets: PrincipalResourceGroupOwnerTarget[] = [];

  for (const managedIdentity of managedIdentities) {
    if (
      !managedIdentity.managedIdentityHomeSubscriptionId ||
      !managedIdentity.managedIdentityHomeResourceGroup ||
      !managedIdentity.managedIdentityHomeResourceId
    ) {
      continue;
    }

    targets.push({
      principalId: managedIdentity.id,
      subscriptionId: managedIdentity.managedIdentityHomeSubscriptionId,
      resourceGroup: managedIdentity.managedIdentityHomeResourceGroup,
      scope: managedIdentity.managedIdentityHomeResourceId,
      roleDefinitionName: null,
      priority: 0
    });
  }

  return targets;
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
  const ownerCandidatesByPrincipalId = new Map<string, Map<string, PrincipalOwnerCandidateWithTargetPriority>>();

  for (const row of rows) {
    const principalId = row.principal_id.toLowerCase();
    const candidateKey = getPrincipalOwnerCandidateKey(row);
    const candidates = ownerCandidatesByPrincipalId.get(principalId) ??
      new Map<string, PrincipalOwnerCandidateWithTargetPriority>();
    const existing = candidates.get(candidateKey);
    const evidence = toOwnerEvidence(row);
    const relatedScope = toOwnerCandidateScope(row);

    if (existing) {
      existing.confidence = maxOwnerConfidence(existing.confidence, row.confidence);
      existing.targetPriority = Math.min(existing.targetPriority, row.target_priority ?? 0);
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
      targetPriority: row.target_priority ?? 0,
      evidence: [evidence],
      relatedScopes: relatedScope ? [relatedScope] : []
    });
    ownerCandidatesByPrincipalId.set(principalId, candidates);
  }

  return new Map(
    [...ownerCandidatesByPrincipalId.entries()].map(([principalId, candidates]) => [
      principalId,
      rankPrincipalOwnerCandidates([...candidates.values()])
    ])
  );
}

function rankPrincipalOwnerCandidates(candidates: PrincipalOwnerCandidateWithTargetPriority[]): OwnerCandidate[] {
  return [...candidates]
    .sort(comparePrincipalOwnerCandidates)
    .map(({ targetPriority: _targetPriority, ...candidate }, index) => ({
      ...candidate,
      rank: index + 1
    }));
}

function comparePrincipalOwnerCandidates(
  left: PrincipalOwnerCandidateWithTargetPriority,
  right: PrincipalOwnerCandidateWithTargetPriority
): number {
  return (
    compareAscending(left.targetPriority, right.targetPriority) ||
    compareDescending(getActiveEvidenceRank(left), getActiveEvidenceRank(right)) ||
    compareDescending(OWNER_CONFIDENCE_RANK[left.confidence], OWNER_CONFIDENCE_RANK[right.confidence]) ||
    compareDescending(ownerCandidateSourceWeight[left.source], ownerCandidateSourceWeight[right.source]) ||
    compareDescending(left.relatedScopes.length, right.relatedScopes.length) ||
    compareDescending(left.evidence.length, right.evidence.length) ||
    left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" })
  );
}

function getActiveEvidenceRank(candidate: OwnerCandidate): number {
  return candidate.evidence.length === 0 || candidate.evidence.some((evidence) => !evidence.disabled) ? 1 : 0;
}

function compareAscending(left: number, right: number): number {
  return left - right;
}

function compareDescending(left: number, right: number): number {
  return right - left;
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

function getPrincipalResourceGroupOwnerTargetKey(target: PrincipalResourceGroupOwnerTarget): string {
  return [
    target.principalId.trim().toLowerCase(),
    target.subscriptionId.trim().toLowerCase(),
    target.resourceGroup.trim().toLowerCase()
  ].join(":");
}

function addPrincipalResourceGroupOwnerTarget(
  targets: Map<string, PrincipalResourceGroupOwnerTarget>,
  target: PrincipalResourceGroupOwnerTarget
): void {
  const key = getPrincipalResourceGroupOwnerTargetKey(target);
  const existing = targets.get(key);

  if (!existing || target.priority < existing.priority) {
    targets.set(key, target);
  }
}

function extractSubscriptionIdFromScope(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function extractResourceGroupFromScope(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
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

const ownerCandidateSourceWeight: Record<OwnerCandidateSource, number> = {
  activity: 1,
  subscriptionOwner: 2,
  entraServicePrincipalOwner: 3,
  entraApplicationOwner: 4,
  resourceGroupOwner: 5,
  tag: 5
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
  target_priority: number | null;
  scope: string | null;
  role_definition_name: string | null;
};
