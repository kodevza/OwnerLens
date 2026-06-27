import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { SortRule } from "../../../../core/collectionControls";
import type {
  AzureActivityLog as CoreAzureActivityLog,
  AzureResource as CoreAzureResource,
  AzureResourceGroup as CoreAzureResourceGroup,
  ResourceGroupOwnershipRow as CoreAzureResourceGroupOwnershipRow,
  AzureRoleAssignment as CoreAzureRoleAssignment,
  AzureSubscription as CoreAzureSubscription,
  AzureUserAssignedManagedIdentity as CoreAzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import type {
  OwnerCandidateSource,
  OwnerConfidence,
  OwnerEvidence,
  OwnerType,
  OwnershipEvidenceDiscoverySource,
  OwnershipEvidencePath
} from "../../../../core/ownership/types";
import type { LocalReportCollectionFilter } from "../../../../core/runtime/collections";
import type { PageOptions } from "../../../../core/runtime/pagination";
import type {
  AzureActivityLog as AzureActivityLogInput,
  AzureResource as AzureResourceInput,
  AzureResourceGroup as AzureResourceGroupInput,
  AzureRoleAssignment as AzureRoleAssignmentInput,
  AzureSubscription as AzureSubscriptionInput,
  AzureUserAssignedManagedIdentity as AzureUserAssignedManagedIdentityInput
} from "../../inputTransferObject/generated/AzureSnapshot";
import { resourceGroupSqlColumns } from "../collectionSqlColumns";
import {
  buildCountSql,
  buildOrderBySql,
  buildPageSql,
  buildWhereSql,
  combineWhereSql,
  type RuntimeSqlFragment
} from "../runtimeSqlCollectionQuery";

export type AzureResourceGroupOwnershipSqlRow = CoreAzureResourceGroup & {
  targetKey: string;
  kind: "resourceGroup";
  owner: string | null;
  ownerCandidate: string | null;
  ownerType: OwnerType | null;
  ownerDisplayName: string | null;
  evidenceKey: string | null;
  principalId: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: OwnerEvidence[];
};

export type AzureResourceGroupOwnershipCollectionQueryOptions = PageOptions & {
  filters?: LocalReportCollectionFilter[];
  sortRules?: SortRule[];
  selectedRowKeys?: string[];
};

export type AzureResourceGroupOwnerCandidateViewRow = {
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  owner: string;
  ownerType: OwnerType;
  ownerCandidate: string;
  evidenceKey: string;
  confidence: Exclude<OwnerConfidence, "none">;
  source: string;
  evidenceValue: string;
  evidenceDate: string | null;
  priority: number;
};

export type AzurePrincipalResourceGroupOwnerCandidateViewRow =
  Omit<AzureResourceGroupOwnerCandidateViewRow, "subscriptionId" | "subscriptionName" | "resourceGroup" | "source"> & {
  principalId: string;
  subscriptionId: string | null;
  subscriptionName: string | null;
  resourceGroup: string | null;
  source: OwnerCandidateSource;
  path: OwnershipEvidencePath;
  discoverySource: OwnershipEvidenceDiscoverySource;
};

export type AzureResourceGroupOwnershipSqlTarget =
  | {
      subscriptionId: string;
      resourceGroup: string;
      principalId?: string;
    }
  | {
      subscriptionIds: string[];
      resourceGroups: string[];
      principalIds?: string[];
    };

export async function insertAzureSubscriptionRows(
  connection: DuckDBConnection,
  subscriptions: AzureSubscriptionInput[]
): Promise<void> {
  for (const [ordinal, row] of subscriptions.entries()) {
    await connection.run(
      `insert into azure_subscriptions values (
        $ordinal, $subscriptionId, $subscriptionName, $tenantId, $state, $tags::json, $normalizedSubscriptionId
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        tenantId: row.tenantId,
        state: row.state,
        tags: JSON.stringify(row.tags ?? null),
        normalizedSubscriptionId: normalizeJoinKey(row.subscriptionId)
      }
    );
  }
}

export async function insertAzureResourceGroupRows(
  connection: DuckDBConnection,
  resourceGroups: AzureResourceGroupInput[]
): Promise<void> {
  for (const [ordinal, row] of resourceGroups.entries()) {
    await connection.run(
      `insert into azure_resource_groups values (
        $ordinal, $subscriptionId, $subscriptionName, $resourceGroup, $location, $tags::json,
        $normalizedSubscriptionId, $normalizedResourceGroup
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceGroup: row.resourceGroup,
        location: row.location,
        tags: JSON.stringify(row.tags ?? null),
        normalizedSubscriptionId: normalizeJoinKey(row.subscriptionId),
        normalizedResourceGroup: normalizeJoinKey(row.resourceGroup)
      }
    );
  }
}

export async function insertAzureResourceRows(connection: DuckDBConnection, resources: AzureResourceInput[]): Promise<void> {
  for (const [ordinal, row] of resources.entries()) {
    await connection.run(
      `insert into azure_resources values (
        $ordinal, $subscriptionId, $subscriptionName, $resourceId, $resourceName, $resourceGroup, $resourceType,
        $kind, $location, $tags::json, $identityType, $identityPrincipalId, $identityTenantId,
        $userAssignedIdentityResourceIds::json, $userAssignedIdentities::json
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceId: row.resourceId,
        resourceName: row.resourceName,
        resourceGroup: row.resourceGroup,
        resourceType: row.resourceType,
        kind: row.kind,
        location: row.location,
        tags: JSON.stringify(row.tags ?? null),
        identityType: row.identityType,
        identityPrincipalId: row.identityPrincipalId,
        identityTenantId: row.identityTenantId,
        userAssignedIdentityResourceIds: JSON.stringify(row.userAssignedIdentityResourceIds ?? []),
        userAssignedIdentities: JSON.stringify(row.userAssignedIdentities ?? null)
      }
    );
  }
}

export async function insertAzureUserAssignedManagedIdentityRows(
  connection: DuckDBConnection,
  identities: AzureUserAssignedManagedIdentityInput[]
): Promise<void> {
  for (const [ordinal, row] of identities.entries()) {
    await connection.run(
      `insert into azure_user_assigned_managed_identities values (
        $ordinal, $subscriptionId, $subscriptionName, $resourceId, $name, $resourceGroup, $location,
        $clientId, $principalId, $tenantId, $tags::json
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceId: row.resourceId,
        name: row.name,
        resourceGroup: row.resourceGroup,
        location: row.location,
        clientId: row.clientId,
        principalId: row.principalId,
        tenantId: row.tenantId,
        tags: JSON.stringify(row.tags ?? null)
      }
    );
  }
}

export async function insertAzureRoleAssignmentRows(
  connection: DuckDBConnection,
  assignments: AzureRoleAssignmentInput[]
): Promise<void> {
  for (const [ordinal, row] of assignments.entries()) {
    await connection.run(
      `insert into azure_role_assignments values (
        $ordinal, $subscriptionId, $subscriptionName, $roleAssignmentId, $scope, $scopeType, $scopeSubscriptionId,
        $scopeResourceGroup, $scopeResourceProvider, $scopeResourceType, $scopeResourceName, $scopeManagementGroup,
        $principalId, $principalType, $principalDisplayName, $signInName, $roleDefinitionId, $roleDefinitionName,
        $canDelegate, $condition, $conditionVersion, $normalizedPrincipalId, $normalizedSubscriptionId,
        $normalizedResourceGroup
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        roleAssignmentId: row.roleAssignmentId,
        scope: row.scope,
        scopeType: row.scopeType ?? null,
        scopeSubscriptionId: row.scopeSubscriptionId ?? null,
        scopeResourceGroup: row.scopeResourceGroup ?? null,
        scopeResourceProvider: row.scopeResourceProvider ?? null,
        scopeResourceType: row.scopeResourceType ?? null,
        scopeResourceName: row.scopeResourceName ?? null,
        scopeManagementGroup: row.scopeManagementGroup ?? null,
        principalId: row.principalId,
        principalType: row.principalType,
        principalDisplayName: row.principalDisplayName,
        signInName: row.signInName,
        roleDefinitionId: row.roleDefinitionId,
        roleDefinitionName: row.roleDefinitionName,
        canDelegate: row.canDelegate,
        condition: row.condition,
        conditionVersion: row.conditionVersion,
        normalizedPrincipalId: normalizeJoinKey(row.principalId),
        normalizedSubscriptionId: firstNormalizedJoinKey([
          row.scopeSubscriptionId,
          row.subscriptionId,
          readAzureScopeSegment(row.scope, "subscriptions")
        ]),
        normalizedResourceGroup: firstNormalizedJoinKey([
          row.scopeResourceGroup,
          readAzureScopeSegment(row.scope, "resourceGroups")
        ])
      }
    );
  }
}

export async function insertAzureActivityLogRows(connection: DuckDBConnection, logs: AzureActivityLogInput[]): Promise<void> {
  for (const [ordinal, row] of logs.entries()) {
    await connection.run(
      `insert into azure_activity_logs values (
        $ordinal, $subscriptionId, $subscriptionName, $eventTimestamp, $submissionTimestamp, $caller,
        $callerUserPrincipalName, $callerName, $callerEmail, $callerObjectId, $callerIdentityType, $callerAppId,
        $callerIpAddress, $callerTenantId, $operationName, $operationNameValue, $status, $subStatus, $category,
        $resourceGroupName, $resourceId, $resourceProviderName, $resourceType, $authorizationAction, $authorizationScope,
        $normalizedSubscriptionId, $normalizedResourceGroup, $normalizedCaller
      )`,
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        eventTimestamp: row.eventTimestamp,
        submissionTimestamp: row.submissionTimestamp,
        caller: row.caller,
        callerUserPrincipalName: row.callerUserPrincipalName ?? null,
        callerName: row.callerName ?? null,
        callerEmail: row.callerEmail ?? null,
        callerObjectId: row.callerObjectId ?? null,
        callerIdentityType: row.callerIdentityType ?? null,
        callerAppId: row.callerAppId ?? null,
        callerIpAddress: row.callerIpAddress ?? null,
        callerTenantId: row.callerTenantId ?? null,
        operationName: row.operationName,
        operationNameValue: row.operationNameValue,
        status: row.status,
        subStatus: row.subStatus,
        category: row.category,
        resourceGroupName: row.resourceGroupName,
        resourceId: row.resourceId,
        resourceProviderName: row.resourceProviderName,
        resourceType: row.resourceType,
        authorizationAction: row.authorizationAction,
        authorizationScope: row.authorizationScope,
        normalizedSubscriptionId: normalizeJoinKey(row.subscriptionId),
        normalizedResourceGroup: firstNormalizedJoinKey([
          row.resourceGroupName,
          readAzureScopeSegment(row.authorizationScope, "resourceGroups")
        ]),
        normalizedCaller: normalizeOptionalJoinKey(row.caller)
      }
    );
  }
}

export async function readAzureSubscriptionRows(connection: DuckDBConnection): Promise<CoreAzureSubscription[]> {
  return (await readRows<AzureSubscriptionRow>(
    connection,
    "select subscription_id, subscription_name, tenant_id, state, tags from azure_subscriptions order by ordinal"
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    tenantId: row.tenant_id,
    state: row.state,
    tags: parseJsonObject(row.tags)
  }));
}

export async function readAzureResourceGroupRows(connection: DuckDBConnection): Promise<CoreAzureResourceGroup[]> {
  return (await readRows<AzureResourceGroupRow>(
    connection,
    "select subscription_id, subscription_name, resource_group, location, tags from azure_resource_groups order by ordinal"
  )).map(mapAzureResourceGroupRow);
}

export async function readAzureResourceGroupOwnershipSqlRows(
  connection: DuckDBConnection,
  target: AzureResourceGroupOwnershipSqlTarget,
  limit = 1
): Promise<AzureResourceGroupOwnershipSqlRow[]> {
  return readAzureResourceGroupOwnershipRows(connection, {
    target: normalizeResourceGroupOwnershipSqlTarget(target),
    limit
  });
}

export async function readAzureResourceGroupOwnershipCollectionSqlRows(
  connection: DuckDBConnection,
  limit = 20
): Promise<AzureResourceGroupOwnershipSqlRow[]> {
  return readAzureResourceGroupOwnershipRows(connection, { limit });
}

export async function queryAzureResourceGroupOwnershipCollectionRows(
  connection: DuckDBConnection,
  options: AzureResourceGroupOwnershipCollectionQueryOptions = {}
): Promise<CoreAzureResourceGroupOwnershipRow[]> {
  const baseQuery = azureResourceGroupOwnershipCollectionRowsSql;
  const where = buildResourceGroupOwnershipCollectionWhereSql(options);
  const page = buildPageSql(options.page, options.pageSize);
  const rows = await readRows<AzureResourceGroupOwnershipCollectionRow>(
    connection,
    `
      select *
      from (
        ${baseQuery}
      ) collection_rows
      ${where.sql}
      ${buildOrderBySql(options.sortRules, resourceGroupSqlColumns, "ordinal asc")}
      ${page.sql}
    `,
    {
      ...where.params,
      ...page.params
    }
  );

  return rows.map(mapAzureResourceGroupOwnershipCollectionRow);
}

export async function countAzureResourceGroupOwnershipCollectionRows(
  connection: DuckDBConnection,
  options: Pick<AzureResourceGroupOwnershipCollectionQueryOptions, "filters" | "selectedRowKeys"> = {}
): Promise<number> {
  const where = buildResourceGroupOwnershipCollectionWhereSql(options);
  const countQuery = buildCountSql(azureResourceGroupOwnershipCollectionRowsSql, where);
  const rows = await readRows<{ count: number | string }>(connection, countQuery.sql, countQuery.params);

  return Number(rows[0]?.count ?? 0);
}

export async function readAzureResourceGroupOwnerCandidateViewRows(
  connection: DuckDBConnection,
  target: { subscriptionId: string; resourceGroup: string },
  limit: number
): Promise<AzureResourceGroupOwnerCandidateViewRow[]> {
  return (await readRows<AzureResourceGroupOwnerCandidateRow>(
    connection,
    `
      select
        subscription_id,
        subscription_name,
        resource_group,
        owner,
        owner_type,
        owner_candidate,
        evidence_key,
        confidence,
        source,
        evidence_value,
        evidence_date,
        priority
      from azure_resource_group_owner_candidates
      where lower(trim(subscription_id)) = lower(trim($subscriptionId))
        and lower(trim(resource_group)) = lower(trim($resourceGroup))
      order by
        case confidence
          when 'high' then 3
          when 'medium' then 2
          when 'low' then 1
          else 0
        end desc,
        priority
      limit $limit
    `,
    {
      subscriptionId: target.subscriptionId,
      resourceGroup: target.resourceGroup,
      limit: Math.max(1, Math.trunc(limit))
    }
  )).map(mapAzureResourceGroupOwnerCandidateRow);
}

export async function readAzurePrincipalResourceGroupOwnerCandidateViewRows(
  connection: DuckDBConnection,
  target: { principalId: string },
  limit: number
): Promise<AzurePrincipalResourceGroupOwnerCandidateViewRow[]> {
  return (await readRows<AzurePrincipalResourceGroupOwnerCandidateRow>(
    connection,
    `
      select
        "principalId" as principal_id,
        "subscriptionId" as subscription_id,
        "subscriptionName" as subscription_name,
        "resourceGroup" as resource_group,
        owner,
        "ownerType" as owner_type,
        "ownerCandidate" as owner_candidate,
        "evidenceKey" as evidence_key,
        confidence,
        source,
        path,
        "discoverySource" as discovery_source,
        "evidenceValue" as evidence_value,
        "evidenceDate" as evidence_date,
        priority
      from runtime_ranked_owner_candidates
      where lower(trim("principalId")) = lower(trim($principalId))
      order by candidate_rank
      limit $limit
    `,
    {
      principalId: target.principalId,
      limit: Math.max(1, Math.trunc(limit))
    }
  )).map(mapAzurePrincipalResourceGroupOwnerCandidateRow);
}

async function readAzureResourceGroupOwnershipRows(
  connection: DuckDBConnection,
  options: {
    target?: { subscriptionIds: string[]; resourceGroups: string[]; principalIds: string[] };
    limit: number;
  }
): Promise<AzureResourceGroupOwnershipSqlRow[]> {
  return (await readRows<AzureResourceGroupOwnershipRow>(
    connection,
    `
      with target_resource_groups as (
        select subscription_id, subscription_name, resource_group, location, tags, ordinal
        from azure_resource_groups
        ${options.target ? `
        where (lower(trim(subscription_id)), lower(trim(resource_group))) in (
          select
            lower(trim(json_extract_string(subscription_entry.value, '$'))),
            lower(trim(json_extract_string(resource_group_entry.value, '$')))
          from json_each($subscriptionIds::json) subscription_entry
          join json_each($resourceGroups::json) resource_group_entry
            on subscription_entry.key = resource_group_entry.key
        )` : ""}
        order by ordinal
      ),
      target_principal_ids as (
        select distinct lower(trim(json_extract_string(value, '$'))) as principal_id
        from json_each($principalIds::json)
        where trim(json_extract_string(value, '$')) <> ''
      ),
      target_principal_scope as (
        select null::varchar as principal_id
        where not exists (select 1 from target_principal_ids)
        union all
        select principal_id
        from target_principal_ids
      ),
      scoped_candidates as (
        select
          candidate.subscription_id,
          candidate.resource_group,
          principal_scope.principal_id,
          candidate.owner,
          candidate.owner_type,
          candidate.owner_candidate,
          candidate.evidence_key,
          candidate.confidence,
          candidate.source,
          candidate.evidence_value,
          candidate.evidence_date,
          candidate.priority
        from azure_resource_group_owner_candidates candidate
        join target_resource_groups rg
          on lower(trim(candidate.subscription_id)) = lower(trim(rg.subscription_id))
          and lower(trim(candidate.resource_group)) = lower(trim(rg.resource_group))
        cross join target_principal_scope principal_scope
      ),
      candidate_records as (
        select
          *,
          case
            when principal_id is null then evidence_key
            else concat(
              'resourceGroup:',
              lower(trim(subscription_id)),
              ':',
              lower(trim(resource_group)),
              ':principal:',
              lower(trim(principal_id)),
              ':',
              owner_candidate
            )
          end as scoped_evidence_key
        from scoped_candidates
      ),
      owner_candidates as (
        select
          candidate.*,
          exists(
            select 1
            from disabled_owner_evidence_keys disabled
            where disabled.provider = 'azure'
              and lower(trim(disabled.owner_key)) = lower(trim(candidate.scoped_evidence_key))
          ) as disabled,
          case
            when exists(
              select 1
              from disabled_owner_evidence_keys disabled
              where disabled.provider = 'azure'
                and lower(trim(disabled.owner_key)) = lower(trim(candidate.scoped_evidence_key))
            ) then to_json([
              struct_pack(user := candidate.evidence_value, date := candidate.evidence_date, key := candidate.scoped_evidence_key, disabled := true)
            ])
            else to_json([
              struct_pack(user := candidate.evidence_value, date := candidate.evidence_date, key := candidate.scoped_evidence_key)
            ])
          end as evidence
        from candidate_records candidate
      ),
      selected_owners as (
        select
          subscription_id,
          resource_group,
          principal_id,
          owner,
          owner_type,
          owner_candidate,
          scoped_evidence_key as evidence_key,
          confidence,
          source,
          evidence,
          priority,
          disabled
        from (
          select
            owner_candidates.*,
            row_number() over (
              partition by subscription_id, resource_group, principal_id
              order by
                case when disabled then 1 else 0 end asc,
                case confidence
                  when 'high' then 3
                  when 'medium' then 2
                  when 'low' then 1
                  else 0
                end desc,
                priority
            ) as owner_rank
          from owner_candidates
        ) ranked_owner_candidates
        where owner_rank <= $limit
      )
      select
        rg.subscription_id,
        rg.subscription_name,
        rg.resource_group,
        rg.location,
        rg.tags,
        'resourceGroup:' || lower(rg.subscription_id) || ':' || lower(rg.resource_group) as target_key,
        case when owner.disabled then null else owner.owner end as owner,
        owner.owner_candidate,
        owner.owner_type,
        owner.owner as owner_display_name,
        owner.evidence_key,
        owner.principal_id,
        case when owner.disabled then 'none' else coalesce(owner.confidence, 'none') end as confidence,
        coalesce(owner.source, 'none') as source,
        coalesce(owner.evidence, '[]') as evidence
      from target_resource_groups rg
      left join selected_owners owner
        on lower(trim(owner.subscription_id)) = lower(trim(rg.subscription_id))
        and lower(trim(owner.resource_group)) = lower(trim(rg.resource_group))
      order by
        rg.ordinal,
        case when owner.disabled then 1 else 0 end asc,
        case owner.confidence
          when 'high' then 3
          when 'medium' then 2
          when 'low' then 1
          else 0
        end desc,
        owner.priority
    `,
    buildResourceGroupOwnershipSqlParams(options)
  )).map(mapAzureResourceGroupOwnershipRow);
}

function buildResourceGroupOwnershipSqlParams(options: {
  target?: { subscriptionIds: string[]; resourceGroups: string[]; principalIds: string[] };
  limit: number;
}): Record<string, DuckDBValue> {
  const params: Record<string, DuckDBValue> = {
    principalIds: JSON.stringify(options.target?.principalIds ?? []),
    limit: Math.max(1, Math.trunc(options.limit))
  };

  if (options.target) {
    params.subscriptionIds = JSON.stringify(options.target.subscriptionIds);
    params.resourceGroups = JSON.stringify(options.target.resourceGroups);
  }

  return params;
}

function normalizeResourceGroupOwnershipSqlTarget(
  target: AzureResourceGroupOwnershipSqlTarget
): { subscriptionIds: string[]; resourceGroups: string[]; principalIds: string[] } {
  if ("subscriptionIds" in target) {
    return {
      subscriptionIds: target.subscriptionIds,
      resourceGroups: target.resourceGroups,
      principalIds: target.principalIds ?? []
    };
  }

  return {
    subscriptionIds: [target.subscriptionId],
    resourceGroups: [target.resourceGroup],
    principalIds: target.principalId ? [target.principalId] : []
  };
}

const azureResourceGroupOwnershipCollectionRowsSql = `
  select *
  from runtime_resource_group_collection_rows
`;

function buildResourceGroupOwnershipCollectionWhereSql(
  options: Pick<AzureResourceGroupOwnershipCollectionQueryOptions, "filters" | "selectedRowKeys">
) {
  return combineWhereSql([
    buildWhereSql(options.filters, resourceGroupSqlColumns),
    buildResourceGroupSelectedRowsWhereSql(options.selectedRowKeys)
  ]);
}

function buildResourceGroupSelectedRowsWhereSql(selectedRowKeys: string[] | undefined): RuntimeSqlFragment {
  const keys = (selectedRowKeys ?? []).map((key) => key.trim()).filter(Boolean);

  if (keys.length === 0) {
    return {
      sql: "",
      params: {}
    };
  }

  return {
    sql: `(
      "targetKey" in (
        select json_extract_string(value, '$')
        from json_each($selectedRowKeys::json)
      )
      or "subscriptionId" || ':' || "resourceGroup" in (
        select json_extract_string(value, '$')
        from json_each($selectedRowKeys::json)
      )
    )`,
    params: {
      selectedRowKeys: JSON.stringify(keys)
    }
  };
}


export async function readAzureResourceRows(connection: DuckDBConnection): Promise<CoreAzureResource[]> {
  return (await readRows<AzureResourceRow>(
    connection,
    `select subscription_id, subscription_name, resource_id, resource_name, resource_group, resource_type, kind, location,
      tags, identity_type, identity_principal_id, identity_tenant_id, user_assigned_identity_resource_ids, user_assigned_identities
    from azure_resources order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceGroup: row.resource_group,
    resourceType: row.resource_type,
    kind: row.kind,
    location: row.location,
    tags: parseJsonObject(row.tags),
    identityType: row.identity_type,
    identityPrincipalId: row.identity_principal_id,
    identityTenantId: row.identity_tenant_id,
    userAssignedIdentityResourceIds: parseJsonArray<string>(row.user_assigned_identity_resource_ids),
    userAssignedIdentities: parseJsonValue(row.user_assigned_identities)
  }));
}

export async function readAzureUserAssignedManagedIdentityRows(
  connection: DuckDBConnection
): Promise<CoreAzureUserAssignedManagedIdentity[]> {
  return (await readRows<AzureUserAssignedManagedIdentityRow>(
    connection,
    `select subscription_id, subscription_name, resource_id, name, resource_group, location, client_id, principal_id, tenant_id, tags
    from azure_user_assigned_managed_identities order by ordinal`
  )).map((row) => ({
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceId: row.resource_id,
    name: row.name,
    resourceGroup: row.resource_group,
    location: row.location,
    clientId: row.client_id,
    principalId: row.principal_id,
    tenantId: row.tenant_id,
    tags: parseJsonObject(row.tags)
  }));
}

export async function readAzureRoleAssignmentRows(connection: DuckDBConnection): Promise<CoreAzureRoleAssignment[]> {
  return (await readRows<AzureRoleAssignmentRow>(
    connection,
    `select subscription_id, subscription_name, role_assignment_id, scope, scope_type, scope_subscription_id,
      scope_resource_group, scope_resource_provider, scope_resource_type, scope_resource_name, scope_management_group,
      principal_id, principal_type, principal_display_name, sign_in_name, role_definition_id, role_definition_name,
      can_delegate, condition, condition_version
    from azure_role_assignments order by ordinal`
  )).map(mapAzureRoleAssignmentRow);
}

export async function readAzureActivityLogRows(connection: DuckDBConnection): Promise<CoreAzureActivityLog[]> {
  return (await readRows<AzureActivityLogRow>(
    connection,
    `select subscription_id, subscription_name, event_timestamp, submission_timestamp, caller, caller_user_principal_name,
      caller_name, caller_email, caller_object_id, caller_identity_type, caller_app_id, caller_ip_address, caller_tenant_id,
      operation_name, operation_name_value, status, sub_status, category, resource_group_name, resource_id,
      resource_provider_name, resource_type, authorization_action, authorization_scope
    from azure_activity_logs order by ordinal`
  )).map(mapAzureActivityLogRow);
}

type AzureSubscriptionRow = {
  subscription_id: string;
  subscription_name: string;
  tenant_id: string;
  state: CoreAzureSubscription["state"];
  tags: string | null;
};

type AzureResourceGroupRow = {
  subscription_id: string;
  subscription_name: string;
  resource_group: string;
  location: string;
  tags: string | null;
};

type AzureResourceGroupOwnershipRow = AzureResourceGroupRow & {
  target_key: string;
  owner: string | null;
  owner_candidate: string | null;
  owner_type: OwnerType | null;
  owner_display_name: string | null;
  evidence_key: string | null;
  principal_id: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: string;
};

type AzureResourceGroupOwnershipCollectionRow = {
  ordinal: number | string;
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  location: string;
  tags: string | null;
  targetKey: string;
  owner: string | null;
  confidence: OwnerConfidence;
  source: string;
  ownerCandidates: string;
  evidence: string;
  rbacRoleAssignmentCount: number | string | null;
  rbacRoleLevel: CoreAzureResourceGroupOwnershipRow["rbacRoleLevel"];
  roleAssignments: string;
};

type AzureResourceGroupOwnerCandidateRow = {
  subscription_id: string;
  subscription_name: string;
  resource_group: string;
  owner: string;
  owner_type: OwnerType;
  owner_candidate: string;
  evidence_key: string;
  confidence: Exclude<OwnerConfidence, "none">;
  source: string;
  evidence_value: string;
  evidence_date: string | null;
  priority: number;
};

type AzurePrincipalResourceGroupOwnerCandidateRow =
  Omit<AzureResourceGroupOwnerCandidateRow, "subscription_id" | "subscription_name" | "resource_group" | "source"> & {
  principal_id: string;
  subscription_id: string | null;
  subscription_name: string | null;
  resource_group: string | null;
  source: OwnerCandidateSource;
  path: OwnershipEvidencePath;
  discovery_source: OwnershipEvidenceDiscoverySource;
};

type AzureResourceRow = {
  subscription_id: string;
  subscription_name: string;
  resource_id: string;
  resource_name: string;
  resource_group: string;
  resource_type: string;
  kind: string | null;
  location: string;
  tags: string | null;
  identity_type: string | null;
  identity_principal_id: string | null;
  identity_tenant_id: string | null;
  user_assigned_identity_resource_ids: string;
  user_assigned_identities: string | null;
};

type AzureUserAssignedManagedIdentityRow = {
  subscription_id: string;
  subscription_name: string;
  resource_id: string;
  name: string;
  resource_group: string;
  location: string;
  client_id: string;
  principal_id: string;
  tenant_id: string;
  tags: string | null;
};

type AzureRoleAssignmentRow = {
  subscription_id: string;
  subscription_name: string;
  role_assignment_id: string | null;
  scope: string;
  scope_type: CoreAzureRoleAssignment["scopeType"];
  scope_subscription_id: string | null;
  scope_resource_group: string | null;
  scope_resource_provider: string | null;
  scope_resource_type: string | null;
  scope_resource_name: string | null;
  scope_management_group: string | null;
  principal_id: string;
  principal_type: string | null;
  principal_display_name: string | null;
  sign_in_name: string | null;
  role_definition_id: string | null;
  role_definition_name: string | null;
  can_delegate: boolean | null;
  condition: string | null;
  condition_version: string | null;
};

type AzureActivityLogRow = {
  subscription_id: string;
  subscription_name: string;
  event_timestamp: string;
  submission_timestamp: string | null;
  caller: string | null;
  caller_user_principal_name: string | null;
  caller_name: string | null;
  caller_email: string | null;
  caller_object_id: string | null;
  caller_identity_type: string | null;
  caller_app_id: string | null;
  caller_ip_address: string | null;
  caller_tenant_id: string | null;
  operation_name: string | null;
  operation_name_value: string | null;
  status: string | null;
  sub_status: string | null;
  category: string | null;
  resource_group_name: string | null;
  resource_id: string | null;
  resource_provider_name: string | null;
  resource_type: string | null;
  authorization_action: string | null;
  authorization_scope: string | null;
};

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

function normalizeJoinKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOptionalJoinKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function firstNormalizedJoinKey(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeOptionalJoinKey(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readAzureScopeSegment(scope: string | null | undefined, segment: string): string | null {
  if (!scope) {
    return null;
  }

  const match = scope.match(new RegExp(`/${segment}/([^/]+)`, "i"));
  return match?.[1] ?? null;
}

function mapAzureResourceGroupRow(row: AzureResourceGroupRow): CoreAzureResourceGroup {
  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceGroup: row.resource_group,
    location: row.location,
    tags: parseJsonObject(row.tags)
  };
}

function mapAzureResourceGroupOwnershipRow(
  row: AzureResourceGroupOwnershipRow
): AzureResourceGroupOwnershipSqlRow {
  return {
    ...mapAzureResourceGroupRow(row),
    targetKey: row.target_key,
    kind: "resourceGroup",
    owner: row.owner,
    ownerCandidate: row.owner_candidate,
    ownerType: row.owner_type,
    ownerDisplayName: row.owner_display_name,
    evidenceKey: row.evidence_key,
    principalId: row.principal_id,
    confidence: row.confidence,
    source: row.source,
    evidence: parseJsonArray<OwnerEvidence>(row.evidence)
  };
}

function mapAzureResourceGroupOwnershipCollectionRow(
  row: AzureResourceGroupOwnershipCollectionRow
): CoreAzureResourceGroupOwnershipRow {
  return {
    subscriptionId: row.subscriptionId,
    subscriptionName: row.subscriptionName,
    resourceGroup: row.resourceGroup,
    location: row.location,
    tags: parseJsonObject(row.tags),
    targetKey: row.targetKey,
    ownerCandidates: parseJsonArray(row.ownerCandidates),
    owner: row.owner,
    confidence: row.confidence,
    source: row.source,
    evidence: parseJsonArray<OwnerEvidence>(row.evidence),
    roleAssignments: parseJsonArray<CoreAzureRoleAssignment>(row.roleAssignments),
    rbacRoleAssignmentCount: readInteger(row.rbacRoleAssignmentCount),
    rbacRoleLevel: row.rbacRoleLevel ?? "none"
  };
}

function mapAzureResourceGroupOwnerCandidateRow(
  row: AzureResourceGroupOwnerCandidateRow
): AzureResourceGroupOwnerCandidateViewRow {
  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceGroup: row.resource_group,
    owner: row.owner,
    ownerType: row.owner_type,
    ownerCandidate: row.owner_candidate,
    evidenceKey: row.evidence_key,
    confidence: row.confidence,
    source: row.source,
    evidenceValue: row.evidence_value,
    evidenceDate: row.evidence_date,
    priority: readInteger(row.priority)
  };
}

function mapAzurePrincipalResourceGroupOwnerCandidateRow(
  row: AzurePrincipalResourceGroupOwnerCandidateRow
): AzurePrincipalResourceGroupOwnerCandidateViewRow {
  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    resourceGroup: row.resource_group,
    owner: row.owner,
    ownerType: row.owner_type,
    ownerCandidate: row.owner_candidate,
    evidenceKey: row.evidence_key,
    confidence: row.confidence,
    evidenceValue: row.evidence_value,
    evidenceDate: row.evidence_date,
    priority: readInteger(row.priority),
    principalId: row.principal_id,
    source: row.source,
    path: row.path,
    discoverySource: row.discovery_source
  };
}

function mapAzureRoleAssignmentRow(row: AzureRoleAssignmentRow): CoreAzureRoleAssignment {
  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    roleAssignmentId: row.role_assignment_id,
    scope: row.scope,
    scopeType: row.scope_type,
    scopeSubscriptionId: row.scope_subscription_id,
    scopeResourceGroup: row.scope_resource_group,
    scopeResourceProvider: row.scope_resource_provider,
    scopeResourceType: row.scope_resource_type,
    scopeResourceName: row.scope_resource_name,
    scopeManagementGroup: row.scope_management_group,
    principalId: row.principal_id,
    principalType: row.principal_type,
    principalDisplayName: row.principal_display_name,
    signInName: row.sign_in_name,
    roleDefinitionId: row.role_definition_id,
    roleDefinitionName: row.role_definition_name,
    canDelegate: row.can_delegate,
    condition: row.condition,
    conditionVersion: row.condition_version
  };
}

function mapAzureActivityLogRow(row: AzureActivityLogRow): CoreAzureActivityLog {
  return {
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    eventTimestamp: row.event_timestamp,
    submissionTimestamp: row.submission_timestamp,
    caller: row.caller,
    callerUserPrincipalName: row.caller_user_principal_name,
    callerName: row.caller_name,
    callerEmail: row.caller_email,
    callerObjectId: row.caller_object_id,
    callerIdentityType: row.caller_identity_type,
    callerAppId: row.caller_app_id,
    callerIpAddress: row.caller_ip_address,
    callerTenantId: row.caller_tenant_id,
    operationName: row.operation_name,
    operationNameValue: row.operation_name_value,
    status: row.status,
    subStatus: row.sub_status,
    category: row.category,
    resourceGroupName: row.resource_group_name,
    resourceId: row.resource_id,
    resourceProviderName: row.resource_provider_name,
    resourceType: row.resource_type,
    authorizationAction: row.authorization_action,
    authorizationScope: row.authorization_scope
  };
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return value ? JSON.parse(value) : [];
}

function parseJsonObject<T extends Record<string, string>>(value: string | null | undefined): T | null {
  return value ? JSON.parse(value) : null;
}

function parseJsonValue(value: string | null | undefined): unknown {
  return value ? JSON.parse(value) : null;
}

function readInteger(value: unknown): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }

  return Math.trunc(Number(value));
}
