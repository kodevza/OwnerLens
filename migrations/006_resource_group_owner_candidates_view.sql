create table if not exists azure_owner_tag_config (
  priority integer primary key,
  name text not null,
  confidence text not null,
  owner_type text not null
);

delete from azure_owner_tag_config;

insert into azure_owner_tag_config (priority, name, confidence, owner_type)
values
  (1, 'ownerGroup', 'high', 'ownerGroup'),
  (2, 'costCenter', 'high', 'ownerTag'),
  (3, 'owner', 'medium', 'ownerUser');

create or replace view azure_resource_group_owner_candidates as
with tag_candidates as (
  select
    rg.subscription_id,
    rg.subscription_name,
    rg.resource_group,
    lower(trim(json_extract_string(tag_entry.value, '$'))) as owner,
    tag.owner_type,
    tag.owner_type || ':' || lower(trim(json_extract_string(tag_entry.value, '$'))) as owner_candidate,
    tag.confidence,
    'tag.' || tag.name as source,
    tag.name || '=' || json_extract_string(tag_entry.value, '$') as evidence_value,
    null::varchar as evidence_date,
    tag.priority
  from azure_resource_groups rg
  join azure_owner_tag_config tag on true
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
    latest_log.target_subscription_name as subscription_name,
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
    end as owner_type,
    case
      when lower(coalesce(latest_log.caller_identity_type, '')) = 'app' then 'application'
      when latest_principal.id is not null then 'application'
      when contains(latest_log.normalized_caller, '@') then 'ownerUser'
      else 'unknown'
    end || ':' || lower(trim(latest_log.normalized_caller)) as owner_candidate,
    'low' as confidence,
    'activity.lastModifier' as source,
    coalesce(latest_log.resource_id, latest_log.normalized_caller, '-') as evidence_value,
    latest_log.event_timestamp as evidence_date,
    1000 + latest_log.target_rank as priority
  from ranked_activity latest_log
  left join entra_service_principals latest_principal
    on latest_log.normalized_caller = lower(latest_principal.id)
    or latest_log.normalized_caller = lower(latest_principal.app_id)
)
select
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  concat(
    'resourceGroup:',
    lower(trim(subscription_id)),
    ':',
    lower(trim(resource_group)),
    ':',
    owner_candidate
  ) as evidence_key,
  confidence,
  source,
  evidence_value,
  evidence_date,
  priority
from tag_candidates
union all
select
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  concat(
    'resourceGroup:',
    lower(trim(subscription_id)),
    ':',
    lower(trim(resource_group)),
    ':',
    owner_candidate
  ) as evidence_key,
  confidence,
  source,
  evidence_value,
  evidence_date,
  priority
from activity_candidates;
