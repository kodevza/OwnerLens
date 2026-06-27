create or replace view runtime_latest_enrichment_run as
select run_id
from azure_runtime_enrichment_runs
where status = 'completed'
order by completed_at desc
limit 1;

create or replace view runtime_entra_principal_base as
select
  sp.ordinal,
  sp.id,
  sp.app_id as "appId",
  sp.display_name as "displayName",
  sp.app_display_name as "appDisplayName",
  sp.service_principal_type as "servicePrincipalType",
  sp.publisher_name as "publisherName",
  sp.account_enabled as "accountEnabled",
  sp.app_owner_organization_id as "appOwnerOrganizationId",
  sp.homepage,
  sp.login_url as "loginUrl",
  sp.reply_urls as "replyUrls",
  sp.service_principal_names as "servicePrincipalNames",
  sp.tags,
  sp.app_roles as "appRoles",
  sp.service_principal_owners as "servicePrincipalOwners",
  sp.application_owners as "applicationOwners",
  sp.metadata,
  app.notes,
  coalesce(access_risk.risk_level, 'none') as "permissionRisk",
  coalesce(access_risk.assignment_count, 0) as "rbacRoleAssignmentCount",
  coalesce(access_risk.risk_level, 'none') as "rbacRoleLevel",
  coalesce(permission_summary.oauth_permissions_count, 0) as "oauthPermissionsCount",
  coalesce(permission_summary.app_roles_permission_count, 0) as "appRolesPermissionCount",
  coalesce(permission_summary.entra_permission_count, 0) as "entraPermissionCount",
  coalesce(permission_summary.entra_permission_risk, 'none') as "entraPermissionRisk",
  home_context.subscription_id as "managedIdentityHomeSubscriptionId",
  home_context.resource_group as "managedIdentityHomeResourceGroup",
  home_context.resource_id as "managedIdentityHomeResourceId"
from entra_service_principals sp
left join entra_applications app on app.app_id = sp.app_id
left join runtime_latest_enrichment_run latest_run on true
left join azure_identity_access_risk_enrichment access_risk
  on access_risk.run_id = latest_run.run_id
  and lower(trim(access_risk.principal_id)) = lower(trim(sp.id))
left join entra_principal_permission_summary permission_summary
  on permission_summary.principal_id = lower(trim(sp.id))
left join azure_managed_identity_home_context home_context
  on home_context.principal_id = lower(trim(sp.id))
  or home_context.client_id = lower(trim(sp.app_id));

create or replace view runtime_principal_resource_group_targets as
select distinct
  principal.id as "principalId",
  home_context.subscription_id as "subscriptionId",
  coalesce(rg.subscription_name, subscription.subscription_name, home_context.subscription_id) as "subscriptionName",
  home_context.resource_group as "resourceGroup",
  home_context.resource_id as scope,
  null::varchar as "roleDefinitionName",
  0 as "targetPriority",
  'managedIdentityHome' as "targetSource"
from entra_service_principals principal
join azure_managed_identity_home_context home_context
  on home_context.principal_id = lower(trim(principal.id))
  or home_context.client_id = lower(trim(principal.app_id))
left join azure_resource_groups rg
  on lower(trim(rg.subscription_id)) = lower(trim(home_context.subscription_id))
  and lower(trim(rg.resource_group)) = lower(trim(home_context.resource_group))
left join azure_subscriptions subscription
  on lower(trim(subscription.subscription_id)) = lower(trim(home_context.subscription_id))
where home_context.subscription_id is not null
  and home_context.resource_group is not null
  and home_context.resource_id is not null
union all
select distinct
  principal.id as "principalId",
  coalesce(assignment.scope_subscription_id, assignment.subscription_id, regexp_extract(assignment.scope, '/subscriptions/([^/]+)', 1)) as "subscriptionId",
  coalesce(rg.subscription_name, assignment.subscription_name) as "subscriptionName",
  nullif(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1)), '') as "resourceGroup",
  assignment.scope,
  assignment.role_definition_name as "roleDefinitionName",
  10 as "targetPriority",
  'rbacResourceGroup' as "targetSource"
from entra_service_principals principal
join azure_role_assignments assignment
  on lower(trim(assignment.principal_id)) = lower(trim(principal.id))
left join azure_resource_groups rg
  on lower(trim(rg.subscription_id)) = lower(trim(coalesce(assignment.scope_subscription_id, assignment.subscription_id, regexp_extract(assignment.scope, '/subscriptions/([^/]+)', 1))))
  and lower(trim(rg.resource_group)) = lower(trim(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1))))
where nullif(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1)), '') is not null;

create or replace view runtime_resource_group_tag_owner_evidence as
select
  'resourceGroup' as "targetKind",
  null::varchar as "principalId",
  rg.subscription_id as "subscriptionId",
  rg.subscription_name as "subscriptionName",
  rg.resource_group as "resourceGroup",
  lower(trim(json_extract_string(tag_entry.value, '$'))) as owner,
  tag.owner_type as "ownerType",
  tag.owner_type || ':' || lower(trim(json_extract_string(tag_entry.value, '$'))) as "ownerCandidate",
  concat(
    'resourceGroup:',
    lower(trim(rg.subscription_id)),
    ':',
    lower(trim(rg.resource_group)),
    ':',
    tag.owner_type,
    ':',
    lower(trim(json_extract_string(tag_entry.value, '$')))
  ) as "evidenceKey",
  tag.confidence,
  'tag.' || tag.name as source,
  'direct' as path,
  'tag' as "discoverySource",
  tag.name || '=' || json_extract_string(tag_entry.value, '$') as "evidenceValue",
  null::varchar as "evidenceDate",
  tag.priority,
  0 as "targetPriority",
  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from azure_resource_groups rg
join azure_owner_tag_config tag on true
join json_each(coalesce(rg.tags, '{}'::json)) tag_entry
  on lower(tag_entry.key) = lower(tag.name)
where trim(json_extract_string(tag_entry.value, '$')) <> '';

create or replace view runtime_owner_activity_logs as
select
  rg.subscription_id as target_subscription_id,
  rg.subscription_name as target_subscription_name,
  rg.resource_group as target_resource_group,
  log.*,
  lower(trim(log.caller)) as normalized_caller
from azure_activity_logs log
join azure_resource_groups rg
  on lower(trim(log.subscription_id)) = lower(trim(rg.subscription_id))
  and lower(trim(coalesce(log.resource_group_name, regexp_extract(log.authorization_scope, '/resourceGroups/([^/]+)', 1)))) =
    lower(trim(rg.resource_group))
where log.category = 'Administrative'
  and log.status = 'Succeeded'
  and trim(coalesce(log.caller, '')) <> ''
  and (
    contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/write')
    or contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/action')
  );

create or replace view runtime_latest_owner_activity_by_caller as
select
  *,
  row_number() over (
    partition by target_subscription_id, target_resource_group, normalized_caller
    order by event_timestamp desc
  ) as caller_rank
from runtime_owner_activity_logs;

create or replace view runtime_ranked_owner_activity as
select
  *,
  row_number() over (
    partition by target_subscription_id, target_resource_group
    order by event_timestamp desc
  ) as target_rank
from runtime_latest_owner_activity_by_caller
where caller_rank = 1;

create or replace view runtime_resource_group_activity_owner_evidence as
select
  'resourceGroup' as "targetKind",
  null::varchar as "principalId",
  latest_log.target_subscription_id as "subscriptionId",
  latest_log.target_subscription_name as "subscriptionName",
  latest_log.target_resource_group as "resourceGroup",
  coalesce(
    latest_principal.display_name || ' (' || latest_log.normalized_caller || ')',
    latest_log.normalized_caller
  ) as owner,
  case
    when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
    when latest_principal.id is not null then 'application'
    when contains(latest_log.normalized_caller, '@') then 'ownerUser'
    else 'unknown'
  end as "ownerType",
  case
    when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
    when latest_principal.id is not null then 'application'
    when contains(latest_log.normalized_caller, '@') then 'ownerUser'
    else 'unknown'
  end || ':' || lower(trim(latest_log.normalized_caller)) as "ownerCandidate",
  concat(
    'resourceGroup:',
    lower(trim(latest_log.target_subscription_id)),
    ':',
    lower(trim(latest_log.target_resource_group)),
    ':',
    case
      when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
      when latest_principal.id is not null then 'application'
      when contains(latest_log.normalized_caller, '@') then 'ownerUser'
      else 'unknown'
    end,
    ':',
    lower(trim(latest_log.normalized_caller))
  ) as "evidenceKey",
  'low' as confidence,
  'activity.lastModifier' as source,
  'direct' as path,
  'activityLog' as "discoverySource",
  coalesce(latest_log.resource_id, latest_log.normalized_caller, '-') as "evidenceValue",
  latest_log.event_timestamp as "evidenceDate",
  1000 + latest_log.target_rank as priority,
  0 as "targetPriority",
  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from runtime_ranked_owner_activity latest_log
left join entra_service_principals latest_principal
  on latest_log.normalized_caller = lower(latest_principal.id)
  or latest_log.normalized_caller = lower(latest_principal.app_id);

create or replace view runtime_service_principal_tag_entries as
select
  sp.id as principal_id,
  case
    when regexp_extract(json_extract_string(tag_entry.value, '$'), '^([^=:]+)[[:space:]]*[=:][[:space:]]*(.*)$', 1) <> ''
      then regexp_extract(json_extract_string(tag_entry.value, '$'), '^([^=:]+)[[:space:]]*[=:][[:space:]]*(.*)$', 1)
    else tag_entry.key
  end as tag_name,
  case
    when regexp_extract(json_extract_string(tag_entry.value, '$'), '^([^=:]+)[[:space:]]*[=:][[:space:]]*(.*)$', 2) <> ''
      then regexp_extract(json_extract_string(tag_entry.value, '$'), '^([^=:]+)[[:space:]]*[=:][[:space:]]*(.*)$', 2)
    else json_extract_string(tag_entry.value, '$')
  end as tag_value
from entra_service_principals sp
join json_each(coalesce(sp.tags, '[]'::json)) tag_entry on true;

create or replace view runtime_principal_tag_owner_evidence as
select
  'principal' as "targetKind",
  lower(trim(tag_entry.principal_id)) as "principalId",
  null::varchar as "subscriptionId",
  null::varchar as "subscriptionName",
  null::varchar as "resourceGroup",
  lower(trim(tag_entry.tag_value)) as owner,
  tag.owner_type as "ownerType",
  tag.owner_type || ':' || lower(trim(tag_entry.tag_value)) as "ownerCandidate",
  concat(
    tag.owner_type,
    ':',
    lower(trim(tag_entry.tag_value)),
    ':',
    tag.name,
    '=',
    trim(tag_entry.tag_value),
    ':'
  ) as "evidenceKey",
  tag.confidence,
  'tag' as source,
  'direct' as path,
  'tag' as "discoverySource",
  tag.name || '=' || trim(tag_entry.tag_value) as "evidenceValue",
  null::varchar as "evidenceDate",
  tag.priority,
  0 as "targetPriority",
  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from runtime_service_principal_tag_entries tag_entry
join azure_owner_tag_config tag
  on lower(tag_entry.tag_name) = lower(tag.name)
where trim(tag_entry.tag_value) <> '';

create or replace view runtime_application_owner_evidence as
select
  'principal' as "targetKind",
  lower(trim(sp.id)) as "principalId",
  null::varchar as "subscriptionId",
  null::varchar as "subscriptionName",
  null::varchar as "resourceGroup",
  owner_value as owner,
  owner_type as "ownerType",
  'entraApplicationOwner:' || owner_type || ':' || owner_key as "ownerCandidate",
  'entraApplicationOwner:' || owner_type || ':' || owner_key || ':' || owner_value || ':' as "evidenceKey",
  'high' as confidence,
  'entraApplicationOwner' as source,
  'direct' as path,
  'applicationOwner' as "discoverySource",
  owner_value as "evidenceValue",
  null::varchar as "evidenceDate",
  100 + row_number() over (partition by sp.id order by owner_key) as priority,
  0 as "targetPriority",
  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from entra_service_principals sp
join json_each(coalesce(sp.application_owners, '[]'::json)) owner_entry on true
cross join lateral (
  select
    coalesce(
      nullif(trim(json_extract_string(owner_entry.value, '$.userPrincipalName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.mail')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.displayName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.id')), '')
    ) as owner_value,
    case
      when lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) = 'user'
        or lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) like '%.user'
        or contains(coalesce(json_extract_string(owner_entry.value, '$.userPrincipalName'), ''), '@')
        or contains(coalesce(json_extract_string(owner_entry.value, '$.mail'), ''), '@') then 'ownerUser'
      when lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) = 'group'
        or lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) like '%.group' then 'ownerGroup'
      else 'unknown'
    end as owner_type,
    lower(trim(coalesce(
      nullif(trim(json_extract_string(owner_entry.value, '$.id')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.userPrincipalName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.mail')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.displayName')), '')
    ))) as owner_key
) owner
where owner_value is not null;

create or replace view runtime_service_principal_owner_evidence as
select
  'principal' as "targetKind",
  lower(trim(sp.id)) as "principalId",
  null::varchar as "subscriptionId",
  null::varchar as "subscriptionName",
  null::varchar as "resourceGroup",
  owner_value as owner,
  owner_type as "ownerType",
  'entraServicePrincipalOwner:' || owner_type || ':' || owner_key as "ownerCandidate",
  'entraServicePrincipalOwner:' || owner_type || ':' || owner_key || ':' || owner_value || ':' as "evidenceKey",
  'high' as confidence,
  'entraServicePrincipalOwner' as source,
  'direct' as path,
  'servicePrincipalOwner' as "discoverySource",
  owner_value as "evidenceValue",
  null::varchar as "evidenceDate",
  200 + row_number() over (partition by sp.id order by owner_key) as priority,
  0 as "targetPriority",
  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from entra_service_principals sp
join json_each(coalesce(sp.service_principal_owners, '[]'::json)) owner_entry on true
cross join lateral (
  select
    coalesce(
      nullif(trim(json_extract_string(owner_entry.value, '$.userPrincipalName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.mail')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.displayName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.id')), '')
    ) as owner_value,
    case
      when lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) = 'user'
        or lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) like '%.user'
        or contains(coalesce(json_extract_string(owner_entry.value, '$.userPrincipalName'), ''), '@')
        or contains(coalesce(json_extract_string(owner_entry.value, '$.mail'), ''), '@') then 'ownerUser'
      when lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) = 'group'
        or lower(coalesce(json_extract_string(owner_entry.value, '$.ownerType'), '')) like '%.group' then 'ownerGroup'
      else 'unknown'
    end as owner_type,
    lower(trim(coalesce(
      nullif(trim(json_extract_string(owner_entry.value, '$.id')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.userPrincipalName')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.mail')), ''),
      nullif(trim(json_extract_string(owner_entry.value, '$.displayName')), '')
    ))) as owner_key
) owner
where owner_value is not null;

create or replace view runtime_resource_group_owner_evidence as
select * from runtime_resource_group_tag_owner_evidence
union all
select * from runtime_resource_group_activity_owner_evidence;

create or replace view runtime_indirect_principal_owner_evidence as
select
  'principal' as "targetKind",
  target."principalId",
  evidence."subscriptionId",
  evidence."subscriptionName",
  evidence."resourceGroup",
  evidence.owner,
  evidence."ownerType",
  evidence."ownerCandidate",
  concat(
    'resourceGroup:',
    lower(trim(evidence."subscriptionId")),
    ':',
    lower(trim(evidence."resourceGroup")),
    ':principal:',
    lower(trim(target."principalId")),
    ':',
    evidence."ownerCandidate"
  ) as "evidenceKey",
  evidence.confidence,
  'resourceGroupOwner' as source,
  'indirect' as path,
  evidence."discoverySource",
  evidence."evidenceValue",
  evidence."evidenceDate",
  1000 + evidence.priority as priority,
  target."targetPriority",
  target.scope,
  target."roleDefinitionName"
from runtime_principal_resource_group_targets target
join runtime_resource_group_owner_evidence evidence
  on lower(trim(evidence."subscriptionId")) = lower(trim(target."subscriptionId"))
  and lower(trim(evidence."resourceGroup")) = lower(trim(target."resourceGroup"));

create or replace view runtime_owner_evidence as
select * from runtime_resource_group_owner_evidence
union all
select * from runtime_principal_tag_owner_evidence
union all
select * from runtime_application_owner_evidence
union all
select * from runtime_service_principal_owner_evidence
union all
select * from runtime_indirect_principal_owner_evidence;

create or replace view runtime_ranked_owner_candidates as
with deduped_owner_evidence as (
  select * exclude evidence_rank
  from (
    select
      candidate.*,
      row_number() over (
        partition by "principalId", lower(trim("evidenceKey"))
        order by
          "targetPriority" asc,
          priority asc,
          lower(trim(owner)) asc,
          lower(trim("ownerCandidate")) asc
      ) as evidence_rank
    from runtime_owner_evidence candidate
    where candidate."targetKind" = 'principal'
  ) ranked_owner_evidence
  where evidence_rank = 1
)
select
  *,
  row_number() over (
    partition by "principalId"
    order by
      "targetPriority" asc,
      case confidence
        when 'high' then 3
        when 'medium' then 2
        when 'low' then 1
        else 0
      end desc,      
      case "ownerType"
        when 'ownerGroup' then 5
        when 'ownerTag' then 4
        when 'ownerUser' then 3
        when 'application' then 2
        when 'unknown' then 1
        else 0
      end desc,
      priority asc,
      lower(trim(owner)) asc,
      lower(trim("evidenceKey")) asc
  ) as candidate_rank
from deduped_owner_evidence;

create or replace view runtime_entra_principal_collection_rows as
with principal_rbac_enrichment as (
  select
    role_enrichment.principal_id,
    role_enrichment.role_assignments,
    (
      select count(distinct coalesce(
        nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
        nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
      ))
      from json_each(role_enrichment.role_assignments) role_entry
      where coalesce(
        nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
        nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
      ) is not null
    ) as rbac_subscription_count
  from azure_identity_role_assignment_enrichment role_enrichment
  join runtime_latest_enrichment_run latest_run on latest_run.run_id = role_enrichment.run_id
),
managed_identity_enrichment as (
  select
    assignment_enrichment.principal_id,
    managed_identity_assignments
  from azure_managed_identity_assignment_enrichment assignment_enrichment
  join runtime_latest_enrichment_run latest_run on latest_run.run_id = assignment_enrichment.run_id
),
assigned_resource_groups as (
  select
    "principalId",
    to_json(list(distinct "resourceGroup" order by "resourceGroup")) as assigned_resource_groups,
    min("resourceGroup") as first_resource_group
  from runtime_principal_resource_group_targets
  where "resourceGroup" is not null
  group by "principalId"
),
active_candidate_records as (
  select candidate.*
  from runtime_ranked_owner_candidates candidate
  where not exists (
      select 1
      from disabled_owner_evidence_keys disabled
      where disabled.provider = 'azure'
        and (
          lower(trim(disabled.owner_key)) = lower(trim(candidate."evidenceKey"))
          or lower(trim(disabled.owner_key)) = lower(trim(candidate."ownerCandidate"))
        )
    )
),
candidate_scope as (
  select
    "principalId",
    count(*) filter (where path = 'direct') as direct_count
  from active_candidate_records
  group by "principalId"
),
projected_candidate_records as (
  select candidate.*
  from active_candidate_records candidate
  left join candidate_scope scope on scope."principalId" = candidate."principalId"
  where coalesce(scope.direct_count, 0) = 0 or candidate.path = 'direct'
),
deduped_owner_candidates as (
  select * exclude duplicate_rank
  from (
    select
      *,
      row_number() over (
        partition by "principalId", "ownerCandidate"
        order by
          candidate_rank asc
      ) as duplicate_rank
    from projected_candidate_records
  ) duplicate_owner_candidates
  where duplicate_rank = 1
),
selected_owner_candidates as (
  select
    * exclude candidate_rank,
    row_number() over (
      partition by "principalId"
      order by candidate_rank
    ) as candidate_rank
  from deduped_owner_candidates
),
owner_summary as (
  select
    "principalId",
    to_json(list(
      struct_pack(
        key := "ownerCandidate",
        displayName := owner,
        type := "ownerType",
        confidence := confidence,
        source := source,
        rank := candidate_rank,
        evidence := [
          struct_pack(user := "evidenceValue", date := "evidenceDate", key := "evidenceKey")
        ],
        relatedScopes := case
          when path = 'indirect' then [
            struct_pack(
              subscriptionId := "subscriptionId",
              subscriptionName := "subscriptionName",
              resourceGroup := "resourceGroup",
              principalId := "principalId",
              scope := scope,
              roleDefinitionName := "roleDefinitionName"
            )
          ]
          else []
        end
      )
      order by candidate_rank
    )) as owner_candidates,
    to_json(list(owner order by candidate_rank)) as potential_owners,
    case max(case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
      when 3 then 'high'
      when 2 then 'medium'
      when 1 then 'low'
      else 'none'
    end as owner_confidence
  from selected_owner_candidates
  group by "principalId"
)
select
  principal.ordinal,
  principal.id,
  principal."appId",
  principal."displayName",
  principal."appDisplayName",
  principal."servicePrincipalType",
  principal."publisherName",
  principal."accountEnabled",
  principal."appOwnerOrganizationId",
  principal.homepage,
  principal."loginUrl",
  principal."replyUrls",
  principal."servicePrincipalNames",
  principal.tags,
  principal."appRoles",
  principal."servicePrincipalOwners",
  principal."applicationOwners",
  principal.metadata,
  principal.notes,
  principal."permissionRisk",
  principal."rbacRoleAssignmentCount",
  principal."rbacRoleLevel",
  principal."oauthPermissionsCount",
  principal."appRolesPermissionCount",
  principal."entraPermissionCount",
  principal."entraPermissionRisk",
  principal."managedIdentityHomeSubscriptionId",
  principal."managedIdentityHomeResourceGroup",
  principal."managedIdentityHomeResourceId",
  coalesce(principal_rbac_enrichment.role_assignments, '[]') as "roleAssignments",
  coalesce(principal_rbac_enrichment.rbac_subscription_count, 0) as "rbacSubscriptionCount",
  coalesce(principal."managedIdentityHomeResourceGroup", assigned_resource_groups.first_resource_group) as "resourceGroup",
  coalesce(assigned_resource_groups.assigned_resource_groups, '[]') as "assignedResourceGroups",
  coalesce(managed_identity_enrichment.managed_identity_assignments, '[]') as "managedIdentityAssignments",
  coalesce(owner_summary.owner_candidates, '[]') as "ownerCandidates",
  coalesce(owner_summary.potential_owners, '[]') as "potentialOwners",
  coalesce(owner_summary.owner_confidence, 'none') as "ownerConfidence"
from runtime_entra_principal_base principal
left join principal_rbac_enrichment on lower(trim(principal_rbac_enrichment.principal_id)) = lower(trim(principal.id))
left join managed_identity_enrichment on lower(trim(managed_identity_enrichment.principal_id)) = lower(trim(principal.id))
left join assigned_resource_groups on assigned_resource_groups."principalId" = principal.id
left join owner_summary on owner_summary."principalId" = principal.id;

create or replace view runtime_resource_group_collection_rows as
with base_rg as (
  select
    ordinal,
    subscription_id as "subscriptionId",
    subscription_name as "subscriptionName",
    resource_group as "resourceGroup",
    location,
    tags,
    'resourceGroup:' || lower(subscription_id) || ':' || lower(resource_group) as "targetKey"
  from azure_resource_groups
),
service_principal_ids as (
  select lower(trim(id)) as principal_id
  from entra_service_principals
),
role_assignment_rows as (
  select
    rg."targetKey",
    assignment.*,
    case
      when lower(coalesce(assignment.role_definition_name, '')) in (
        'owner',
        'user access administrator',
        'role based access control administrator',
        'privileged role administrator',
        'key vault administrator'
      ) then 'high'
      when lower(coalesce(assignment.role_definition_name, '')) = 'reader' then 'low'
      when assignment.role_definition_name is null then 'medium'
      else 'medium'
    end as role_risk
  from base_rg rg
  join azure_role_assignments assignment
    on lower(trim(coalesce(assignment.scope_subscription_id, assignment.subscription_id, regexp_extract(assignment.scope, '/subscriptions/([^/]+)', 1)))) =
      lower(trim(rg."subscriptionId"))
    and lower(trim(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1)))) =
      lower(trim(rg."resourceGroup"))
  left join service_principal_ids principal_ids
    on lower(trim(assignment.principal_id)) = principal_ids.principal_id
  where lower(coalesce(assignment.principal_type, '')) = 'serviceprincipal'
    or principal_ids.principal_id is not null
),
rbac_summary as (
  select
    "targetKey",
    count(*) as rbac_role_assignment_count,
    case max(case role_risk when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
      when 3 then 'high'
      when 2 then 'medium'
      when 1 then 'low'
      else 'none'
    end as rbac_role_level,
    to_json(list(
      struct_pack(
        subscriptionId := subscription_id,
        subscriptionName := subscription_name,
        roleAssignmentId := role_assignment_id,
        scope := scope,
        scopeType := scope_type,
        scopeSubscriptionId := scope_subscription_id,
        scopeResourceGroup := scope_resource_group,
        scopeResourceProvider := scope_resource_provider,
        scopeResourceType := scope_resource_type,
        scopeResourceName := scope_resource_name,
        scopeManagementGroup := scope_management_group,
        principalId := principal_id,
        principalType := principal_type,
        principalDisplayName := principal_display_name,
        signInName := sign_in_name,
        roleDefinitionId := role_definition_id,
        roleDefinitionName := role_definition_name,
        canDelegate := can_delegate,
        condition := condition,
        conditionVersion := condition_version
      )
      order by lower(coalesce(principal_display_name, principal_id)), lower(coalesce(role_definition_name, '')), lower(scope)
    )) as role_assignments
  from role_assignment_rows
  group by "targetKey"
),
owner_candidates as (
  select
    rg."targetKey",
    candidate.owner,
    candidate."ownerType",
    candidate."ownerCandidate",
    candidate."evidenceKey",
    candidate.confidence,
    candidate.source,
    candidate."evidenceValue",
    candidate."evidenceDate",
    candidate.priority,
    exists (
      select 1
      from disabled_owner_evidence_keys disabled
      where disabled.provider = 'azure'
        and lower(trim(disabled.owner_key)) = lower(trim(candidate."evidenceKey"))
    ) as disabled
  from base_rg rg
  join runtime_owner_evidence candidate
    on candidate."targetKind" = 'resourceGroup'
    and lower(trim(candidate."subscriptionId")) = lower(trim(rg."subscriptionId"))
    and lower(trim(candidate."resourceGroup")) = lower(trim(rg."resourceGroup"))
),
selected_owner as (
  select *
  from (
    select
      owner_candidates.*,
      row_number() over (
        partition by "targetKey"
        order by
          case when disabled then 1 else 0 end asc,
          case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
          priority asc,
          lower(trim(owner)) asc
      ) as owner_rank
    from owner_candidates
  ) ranked_owner_candidates
  where owner_rank = 1
)
select
  rg.ordinal,
  rg."subscriptionId",
  rg."subscriptionName",
  rg."resourceGroup",
  rg.location,
  rg.tags,
  rg."targetKey",
  case when owner.disabled then null else owner.owner end as owner,
  case when owner.disabled then 'none' else coalesce(owner.confidence, 'none') end as confidence,
  coalesce(owner.source, 'none') as source,
  case
    when owner.owner is null or owner.disabled then '[]'
    else to_json([
      struct_pack(
        key := owner."ownerCandidate",
        displayName := owner.owner,
        type := owner."ownerType",
        confidence := owner.confidence,
        source := case
          when owner.source like 'tag.%' then 'tag'
          when owner.source like 'activity.%' then 'activity'
          else owner.source
        end,
        rank := 1,
        evidence := [
          struct_pack(user := owner."evidenceValue", date := owner."evidenceDate", key := owner."evidenceKey")
        ],
        relatedScopes := [
          struct_pack(
            subscriptionId := rg."subscriptionId",
            subscriptionName := rg."subscriptionName",
            resourceGroup := rg."resourceGroup"
          )
        ]
      )
    ])
  end as "ownerCandidates",
  case
    when owner.owner is null then '[]'
    when owner.disabled then to_json([
      struct_pack(user := owner."evidenceValue", date := owner."evidenceDate", key := owner."evidenceKey", disabled := true)
    ])
    else to_json([
      struct_pack(user := owner."evidenceValue", date := owner."evidenceDate", key := owner."evidenceKey")
    ])
  end as evidence,
  coalesce(rbac.rbac_role_assignment_count, 0) as "rbacRoleAssignmentCount",
  coalesce(rbac.rbac_role_level, 'none') as "rbacRoleLevel",
  coalesce(rbac.role_assignments, '[]') as "roleAssignments"
from base_rg rg
left join selected_owner owner on owner."targetKey" = rg."targetKey"
left join rbac_summary rbac on rbac."targetKey" = rg."targetKey";
