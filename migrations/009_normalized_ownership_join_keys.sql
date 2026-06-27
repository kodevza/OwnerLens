alter table azure_subscriptions add column if not exists normalized_subscription_id varchar;
alter table azure_resource_groups add column if not exists normalized_subscription_id varchar;
alter table azure_resource_groups add column if not exists normalized_resource_group varchar;
alter table azure_role_assignments add column if not exists normalized_principal_id varchar;
alter table azure_role_assignments add column if not exists normalized_subscription_id varchar;
alter table azure_role_assignments add column if not exists normalized_resource_group varchar;
alter table azure_activity_logs add column if not exists normalized_subscription_id varchar;
alter table azure_activity_logs add column if not exists normalized_resource_group varchar;
alter table azure_activity_logs add column if not exists normalized_caller varchar;
alter table azure_managed_identity_home_context add column if not exists normalized_subscription_id varchar;
alter table azure_managed_identity_home_context add column if not exists normalized_resource_group varchar;
alter table runtime_principal_resource_group_targets_materialized add column if not exists normalized_subscription_id varchar;
alter table runtime_principal_resource_group_targets_materialized add column if not exists normalized_resource_group varchar;

update azure_subscriptions
set normalized_subscription_id = lower(trim(subscription_id));

update azure_resource_groups
set
  normalized_subscription_id = lower(trim(subscription_id)),
  normalized_resource_group = lower(trim(resource_group));

update azure_role_assignments
set
  normalized_principal_id = lower(trim(principal_id)),
  normalized_subscription_id = lower(trim(coalesce(
    nullif(scope_subscription_id, ''),
    nullif(subscription_id, ''),
    nullif(regexp_extract(scope, '/subscriptions/([^/]+)', 1), '')
  ))),
  normalized_resource_group = lower(trim(coalesce(
    nullif(scope_resource_group, ''),
    nullif(regexp_extract(scope, '/resourceGroups/([^/]+)', 1), '')
  )));

update azure_activity_logs
set
  normalized_subscription_id = lower(trim(subscription_id)),
  normalized_resource_group = lower(trim(coalesce(
    nullif(resource_group_name, ''),
    nullif(regexp_extract(authorization_scope, '/resourceGroups/([^/]+)', 1), '')
  ))),
  normalized_caller = lower(trim(caller));

update azure_managed_identity_home_context
set
  normalized_subscription_id = lower(trim(subscription_id)),
  normalized_resource_group = lower(trim(resource_group));

create or replace view runtime_principal_home_context_source as
select * exclude match_rank
from (
  select
    match.principal_id,
    match.subscription_id,
    match.resource_group,
    match.resource_id,
    match.identity_kind,
    match.normalized_subscription_id,
    match.normalized_resource_group,
    row_number() over (
      partition by match.principal_id
      order by match.match_priority, match.resource_id
    ) as match_rank
  from (
    select
      principal.id as principal_id,
      home_context.subscription_id,
      home_context.resource_group,
      home_context.resource_id,
      home_context.identity_kind,
      home_context.normalized_subscription_id,
      home_context.normalized_resource_group,
      0 as match_priority
    from entra_service_principals principal
    join azure_managed_identity_home_context home_context
      on home_context.principal_id = principal.id
    union all
    select
      principal.id as principal_id,
      home_context.subscription_id,
      home_context.resource_group,
      home_context.resource_id,
      home_context.identity_kind,
      home_context.normalized_subscription_id,
      home_context.normalized_resource_group,
      1 as match_priority
    from entra_service_principals principal
    join azure_managed_identity_home_context home_context
      on home_context.client_id = principal.app_id
  ) match
) ranked_match
where match_rank = 1;

create or replace view runtime_entra_principal_base_source as
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
  and access_risk.principal_id = sp.id
left join entra_principal_permission_summary permission_summary
  on permission_summary.principal_id = sp.id
left join runtime_principal_home_context_source home_context
  on home_context.principal_id = sp.id;

create or replace view runtime_principal_resource_group_targets_source as
select distinct
  principal.id as "principalId",
  home_context.subscription_id as "subscriptionId",
  coalesce(rg.subscription_name, subscription.subscription_name, home_context.subscription_id) as "subscriptionName",
  home_context.resource_group as "resourceGroup",
  home_context.resource_id as scope,
  null::varchar as "roleDefinitionName",
  0 as "targetPriority",
  'managedIdentityHome' as "targetSource",
  home_context.normalized_subscription_id,
  home_context.normalized_resource_group
from entra_service_principals principal
join runtime_principal_home_context_source home_context
  on home_context.principal_id = principal.id
left join azure_resource_groups rg
  on rg.normalized_subscription_id = home_context.normalized_subscription_id
  and rg.normalized_resource_group = home_context.normalized_resource_group
left join azure_subscriptions subscription
  on subscription.normalized_subscription_id = home_context.normalized_subscription_id
where home_context.subscription_id is not null
  and home_context.resource_group is not null
  and home_context.resource_id is not null
union all
select distinct
  principal.id as "principalId",
  coalesce(assignment.scope_subscription_id, assignment.subscription_id) as "subscriptionId",
  coalesce(rg.subscription_name, assignment.subscription_name) as "subscriptionName",
  coalesce(assignment.scope_resource_group, assignment.normalized_resource_group) as "resourceGroup",
  assignment.scope,
  assignment.role_definition_name as "roleDefinitionName",
  10 as "targetPriority",
  'rbacResourceGroup' as "targetSource",
  assignment.normalized_subscription_id,
  assignment.normalized_resource_group
from entra_service_principals principal
join azure_role_assignments assignment
  on assignment.normalized_principal_id = principal.id
left join azure_resource_groups rg
  on rg.normalized_subscription_id = assignment.normalized_subscription_id
  and rg.normalized_resource_group = assignment.normalized_resource_group
where assignment.normalized_resource_group is not null;

create or replace view runtime_owner_activity_logs as
select
  rg.subscription_id as target_subscription_id,
  rg.subscription_name as target_subscription_name,
  rg.resource_group as target_resource_group,
  log.*
from azure_activity_logs log
join azure_resource_groups rg
  on log.normalized_subscription_id = rg.normalized_subscription_id
  and log.normalized_resource_group = rg.normalized_resource_group
where log.category = 'Administrative'
  and log.status = 'Succeeded'
  and log.normalized_caller is not null
  and log.normalized_caller <> ''
  and (
    contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/write')
    or contains(lower(coalesce(log.authorization_action, '') || ' ' || coalesce(log.operation_name_value, '')), '/action')
  );

create or replace view runtime_entra_principal_lookup as
select * exclude lookup_rank
from (
  select
    lookup.*,
    row_number() over (
      partition by lookup.match_key
      order by lookup.match_priority, lookup.principal_id
    ) as lookup_rank
  from (
    select id as match_key, id as principal_id, display_name, 0 as match_priority
    from entra_service_principals
    union all
    select app_id as match_key, id as principal_id, display_name, 1 as match_priority
    from entra_service_principals
  ) lookup
) ranked_lookup
where lookup_rank = 1;

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
    when latest_principal.principal_id is not null then 'application'
    when contains(latest_log.normalized_caller, '@') then 'ownerUser'
    else 'unknown'
  end as "ownerType",
  case
    when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
    when latest_principal.principal_id is not null then 'application'
    when contains(latest_log.normalized_caller, '@') then 'ownerUser'
    else 'unknown'
  end || ':' || latest_log.normalized_caller as "ownerCandidate",
  concat(
    'resourceGroup:',
    latest_log.normalized_subscription_id,
    ':',
    latest_log.normalized_resource_group,
    ':',
    case
      when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
      when latest_principal.principal_id is not null then 'application'
      when contains(latest_log.normalized_caller, '@') then 'ownerUser'
      else 'unknown'
    end,
    ':',
    latest_log.normalized_caller
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
left join runtime_entra_principal_lookup latest_principal
  on latest_log.normalized_caller = latest_principal.match_key;

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
    target.normalized_subscription_id,
    ':',
    target.normalized_resource_group,
    ':principal:',
    target."principalId",
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
join azure_resource_groups rg
  on rg.normalized_subscription_id = target.normalized_subscription_id
  and rg.normalized_resource_group = target.normalized_resource_group
join runtime_resource_group_owner_evidence evidence
  on evidence."subscriptionId" = rg.subscription_id
  and evidence."resourceGroup" = rg.resource_group;
