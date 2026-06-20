import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type {
  AzureActivityLog as CoreAzureActivityLog,
  AzureResource as CoreAzureResource,
  AzureResourceGroup as CoreAzureResourceGroup,
  AzureRoleAssignment as CoreAzureRoleAssignment,
  AzureSubscription as CoreAzureSubscription,
  AzureUserAssignedManagedIdentity as CoreAzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import { appConfig } from "../../../../core/config";
import type { OwnerConfidence, OwnerEvidence } from "../../../../core/ownership/types";
import type {
  AzureActivityLog as AzureActivityLogInput,
  AzureResource as AzureResourceInput,
  AzureResourceGroup as AzureResourceGroupInput,
  AzureRoleAssignment as AzureRoleAssignmentInput,
  AzureSubscription as AzureSubscriptionInput,
  AzureUserAssignedManagedIdentity as AzureUserAssignedManagedIdentityInput
} from "../../inputTransferObject/generated/AzureSnapshot";

export type AzureResourceGroupOwnershipSqlRow = CoreAzureResourceGroup & {
  targetKey: string;
  kind: "resourceGroup";
  owner: string | null;
  ownerCandidate: string | null;
  ownerDisplayName: string | null;
  principalId: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: OwnerEvidence[];
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
    await connection.run("insert into azure_subscriptions values ($ordinal, $subscriptionId, $subscriptionName, $tenantId, $state, $tags::json)", {
      ordinal,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      tenantId: row.tenantId,
      state: row.state,
      tags: JSON.stringify(row.tags ?? null)
    });
  }
}

export async function insertAzureResourceGroupRows(
  connection: DuckDBConnection,
  resourceGroups: AzureResourceGroupInput[]
): Promise<void> {
  for (const [ordinal, row] of resourceGroups.entries()) {
    await connection.run(
      "insert into azure_resource_groups values ($ordinal, $subscriptionId, $subscriptionName, $resourceGroup, $location, $tags::json)",
      {
        ordinal,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceGroup: row.resourceGroup,
        location: row.location,
        tags: JSON.stringify(row.tags ?? null)
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
        $canDelegate, $condition, $conditionVersion
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
        conditionVersion: row.conditionVersion
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
        $resourceGroupName, $resourceId, $resourceProviderName, $resourceType, $authorizationAction, $authorizationScope
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
        authorizationScope: row.authorizationScope
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
        where lower(trim(subscription_id)) in (
          select lower(trim(json_extract_string(value, '$')))
          from json_each($subscriptionIds::json)
        )
          and lower(trim(resource_group)) in (
            select lower(trim(json_extract_string(value, '$')))
            from json_each($resourceGroups::json)
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
      owner_tags(name, confidence, priority) as (
        values ${getOwnerTagSqlValues()}
      ),
      tag_candidates as (
        select
          rg.subscription_id,
          rg.resource_group,
          lower(trim(json_extract_string(tag_entry.value, '$'))) as owner,
          case
            when tag.name = 'ownerGroup' then 'ownerGroup'
            when tag.name = 'ownerUser' then 'ownerUser'
            else 'ownerTag'
          end || ':' || lower(trim(json_extract_string(tag_entry.value, '$'))) as owner_candidate,
          tag.confidence,
          'tag.' || tag.name as source,
          tag.name || '=' || json_extract_string(tag_entry.value, '$') as evidence_value,
          null as evidence_date,
          tag.priority
        from target_resource_groups rg
        join owner_tags tag on true
        join json_each(coalesce(rg.tags, '{}'::json)) tag_entry
          on lower(tag_entry.key) = lower(tag.name)
        where trim(json_extract_string(tag_entry.value, '$')) <> ''
      ),
      owner_activity as (
        select
          rg.subscription_id as target_subscription_id,
          rg.subscription_name as target_subscription_name,
          rg.resource_group as target_resource_group,
          log.*,
          lower(trim(log.caller)) as normalized_caller
        from azure_activity_logs log
        join target_resource_groups rg
          on lower(trim(log.subscription_id)) = lower(trim(rg.subscription_id))
          and lower(trim(coalesce(log.resource_group_name, regexp_extract(log.authorization_scope, '/resourceGroups/([^/]+)', 1)))) =
            lower(trim(rg.resource_group))
        where log.category = 'Administrative'
          and log.status = 'Succeeded'
          and trim(coalesce(log.caller, '')) <> ''
          and (
            contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/write')
            or contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/action')
          )
      ),
      latest_activity_by_caller as (
        select
          *,
          row_number() over (
            partition by target_subscription_id, target_resource_group, normalized_caller
            order by event_timestamp desc
          ) as caller_rank
        from owner_activity
      ),
      ranked_activity as (
        select
          *,
          row_number() over (
            partition by target_subscription_id, target_resource_group
            order by event_timestamp desc
          ) as target_rank
        from latest_activity_by_caller
        where caller_rank = 1
      ),
      activity_candidates as (
        select
          latest_log.target_subscription_id as subscription_id,
          latest_log.target_resource_group as resource_group,
          coalesce(
            latest_principal.display_name || ' (' || latest_log.normalized_caller || ')',
            latest_log.normalized_caller
          ) as owner,
          case
            when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
            when latest_principal.id is not null then 'application'
            when contains(latest_log.normalized_caller, '@') then 'ownerUser'
            else 'unknown'
          end ||
            ':' || lower(trim(latest_log.normalized_caller)) as owner_candidate,
          'low' as confidence,
          'activity.lastModifier' as source,
          coalesce(latest_log.resource_id, '-') as evidence_value,
          latest_log.event_timestamp as evidence_date,
          1000 + latest_log.target_rank as priority
        from ranked_activity latest_log
        left join entra_service_principals latest_principal
          on latest_log.normalized_caller = lower(latest_principal.id)
          or latest_log.normalized_caller = lower(latest_principal.app_id)
      ),
      owner_candidates as (
        select
          candidate.*,
          exists(
            select 1
            from azure_disabled_resource_group_owner_candidates disabled
            where lower(trim(disabled.subscription_id)) = lower(trim(candidate.subscription_id))
              and lower(trim(disabled.resource_group)) = lower(trim(candidate.resource_group))
              and lower(trim(disabled.owner_candidate)) = lower(trim(candidate.owner_candidate))
              and (
                trim(disabled.principal_id) = ''
                or (
                  candidate.principal_id is not null
                  and lower(trim(disabled.principal_id)) = lower(trim(candidate.principal_id))
                )
              )
          ) as disabled,
          case
            when exists(
              select 1
              from azure_disabled_resource_group_owner_candidates disabled
              where lower(trim(disabled.subscription_id)) = lower(trim(candidate.subscription_id))
                and lower(trim(disabled.resource_group)) = lower(trim(candidate.resource_group))
                and lower(trim(disabled.owner_candidate)) = lower(trim(candidate.owner_candidate))
                and (
                  trim(disabled.principal_id) = ''
                  or (
                    candidate.principal_id is not null
                    and lower(trim(disabled.principal_id)) = lower(trim(candidate.principal_id))
                  )
                )
            ) then to_json([
              struct_pack(user := candidate.evidence_value, date := candidate.evidence_date, disabled := true)
            ])
            else to_json([
              struct_pack(user := candidate.evidence_value, date := candidate.evidence_date)
            ])
          end as evidence
        from (
          select
            subscription_id,
            resource_group,
            principal_scope.principal_id,
            owner,
            owner_candidate,
            confidence,
            source,
            evidence_value,
            evidence_date,
            priority
          from tag_candidates
          cross join target_principal_scope principal_scope
          union all
          select
            subscription_id,
            resource_group,
            principal_scope.principal_id,
            owner,
            owner_candidate,
            confidence,
            source,
            evidence_value,
            evidence_date,
            priority
          from activity_candidates
          cross join target_principal_scope principal_scope
        ) candidate
      ),
      selected_owners as (
        select subscription_id, resource_group, principal_id, owner, owner_candidate, confidence, source, evidence, priority, disabled
        from (
          select
            owner_candidates.*,
            row_number() over (
              partition by subscription_id, resource_group, principal_id
              order by case when disabled then 1 else 0 end, priority
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
        owner.owner as owner_display_name,
        owner.principal_id,
        case when owner.disabled then 'none' else coalesce(owner.confidence, 'none') end as confidence,
        coalesce(owner.source, 'none') as source,
        coalesce(owner.evidence, '[]') as evidence
      from target_resource_groups rg
      left join selected_owners owner
        on lower(trim(owner.subscription_id)) = lower(trim(rg.subscription_id))
        and lower(trim(owner.resource_group)) = lower(trim(rg.resource_group))
      order by rg.ordinal, owner.priority
    `,
    {
      subscriptionIds: JSON.stringify(options.target?.subscriptionIds ?? []),
      resourceGroups: JSON.stringify(options.target?.resourceGroups ?? []),
      principalIds: JSON.stringify(options.target?.principalIds ?? []),
      limit: Math.max(1, Math.trunc(options.limit))
    }
  )).map(mapAzureResourceGroupOwnershipRow);
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
  owner_display_name: string | null;
  principal_id: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: string;
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
    ownerDisplayName: row.owner_display_name,
    principalId: row.principal_id,
    confidence: row.confidence,
    source: row.source,
    evidence: parseJsonArray<OwnerEvidence>(row.evidence)
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

function getOwnerTagSqlValues(): string {
  return appConfig.azure.ownership.ownerTags
    .map((tag, index) =>
      `('${escapeSqlString(tag.name)}', '${escapeSqlString(tag.confidence)}', ${index + 1})`
    )
    .join(", ");
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}
