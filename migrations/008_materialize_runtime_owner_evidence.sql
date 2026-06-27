create or replace view runtime_owner_evidence_source as
select * from runtime_resource_group_owner_evidence
union all
select * from runtime_principal_tag_owner_evidence
union all
select * from runtime_application_owner_evidence
union all
select * from runtime_service_principal_owner_evidence
union all
select * from runtime_indirect_principal_owner_evidence;

create table if not exists runtime_owner_evidence_materialized as
select *
from runtime_owner_evidence_source
where false;

create or replace view runtime_owner_evidence as
select *
from runtime_owner_evidence_materialized;

create or replace view runtime_ranked_owner_candidates_source as
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

create table if not exists runtime_ranked_owner_candidates_materialized as
select *
from runtime_ranked_owner_candidates_source
where false;

create or replace view runtime_ranked_owner_candidates as
select *
from runtime_ranked_owner_candidates_materialized;

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
  and lower(trim(access_risk.principal_id)) = lower(trim(sp.id))
left join entra_principal_permission_summary permission_summary
  on permission_summary.principal_id = lower(trim(sp.id))
left join azure_managed_identity_home_context home_context
  on home_context.principal_id = lower(trim(sp.id))
  or home_context.client_id = lower(trim(sp.app_id));

create table if not exists runtime_entra_principal_base_materialized as
select *
from runtime_entra_principal_base_source
where false;

create or replace view runtime_entra_principal_base as
select *
from runtime_entra_principal_base_materialized;

create or replace view runtime_principal_resource_group_targets_source as
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

create table if not exists runtime_principal_resource_group_targets_materialized as
select *
from runtime_principal_resource_group_targets_source
where false;

create or replace view runtime_principal_resource_group_targets as
select *
from runtime_principal_resource_group_targets_materialized;
