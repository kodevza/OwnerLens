create or replace view azure_principal_resource_group_owner_candidates as
with configured_owner_tags as (
  select *
  from (
    values
      (1, 'ownerGroup', 'high', 'ownerGroup'),
      (2, 'costCenter', 'high', 'ownerTag'),
      (3, 'owner', 'medium', 'ownerUser')
  ) as tags(priority, name, confidence, owner_type)
),
service_principal_tag_entries as (
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
  join json_each(coalesce(sp.tags, '[]'::json)) tag_entry on true
),
direct_tag_candidates as (
  select
    lower(trim(tag_entry.principal_id)) as principal_id,
    null::varchar as subscription_id,
    null::varchar as subscription_name,
    null::varchar as resource_group,
    lower(trim(tag_entry.tag_value)) as owner,
    tag.owner_type,
    tag.owner_type || ':' || lower(trim(tag_entry.tag_value)) as owner_candidate,
    concat(
      tag.owner_type,
      ':',
      lower(trim(tag_entry.tag_value)),
      ':',
      tag.name,
      '=',
      trim(tag_entry.tag_value),
      ':'
    ) as evidence_key,
    tag.confidence,
    'tag' as source,
    'direct' as path,
    'tag' as discovery_source,
    tag.name || '=' || trim(tag_entry.tag_value) as evidence_value,
    null::varchar as evidence_date,
    tag.priority
  from service_principal_tag_entries tag_entry
  join configured_owner_tags tag
    on lower(tag_entry.tag_name) = lower(tag.name)
  where trim(tag_entry.tag_value) <> ''
),
direct_application_owner_candidates as (
  select
    lower(trim(sp.id)) as principal_id,
    null::varchar as subscription_id,
    null::varchar as subscription_name,
    null::varchar as resource_group,
    owner_value as owner,
    owner_type,
    'entraApplicationOwner:' || owner_type || ':' || owner_key as owner_candidate,
    'entraApplicationOwner:' || owner_type || ':' || owner_key || ':' || owner_value || ':' as evidence_key,
    'high' as confidence,
    'entraApplicationOwner' as source,
    'direct' as path,
    'applicationOwner' as discovery_source,
    owner_value as evidence_value,
    null::varchar as evidence_date,
    100 + row_number() over (partition by sp.id order by owner_key) as priority
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
  where owner_value is not null
),
direct_service_principal_owner_candidates as (
  select
    lower(trim(sp.id)) as principal_id,
    null::varchar as subscription_id,
    null::varchar as subscription_name,
    null::varchar as resource_group,
    owner_value as owner,
    owner_type,
    'entraServicePrincipalOwner:' || owner_type || ':' || owner_key as owner_candidate,
    'entraServicePrincipalOwner:' || owner_type || ':' || owner_key || ':' || owner_value || ':' as evidence_key,
    'high' as confidence,
    'entraServicePrincipalOwner' as source,
    'direct' as path,
    'servicePrincipalOwner' as discovery_source,
    owner_value as evidence_value,
    null::varchar as evidence_date,
    200 + row_number() over (partition by sp.id order by owner_key) as priority
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
  where owner_value is not null
),
indirect_resource_group_candidates as (
  select
    null::varchar as principal_id,
    subscription_id,
    subscription_name,
    resource_group,
    owner,
    owner_type,
    owner_candidate,
    evidence_key,
    confidence,
    'resourceGroupOwner' as source,
    'indirect' as path,
    case
      when source like 'activity.%' then 'activityLog'
      else 'tag'
    end as discovery_source,
    evidence_value,
    evidence_date,
    1000 + priority as priority
  from azure_resource_group_owner_candidates
)
select
  principal_id,
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  evidence_key,
  confidence,
  source,
  path,
  discovery_source,
  evidence_value,
  evidence_date,
  priority
from direct_tag_candidates
union all
select
  principal_id,
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  evidence_key,
  confidence,
  source,
  path,
  discovery_source,
  evidence_value,
  evidence_date,
  priority
from direct_application_owner_candidates
union all
select
  principal_id,
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  evidence_key,
  confidence,
  source,
  path,
  discovery_source,
  evidence_value,
  evidence_date,
  priority
from direct_service_principal_owner_candidates
union all
select
  principal_id,
  subscription_id,
  subscription_name,
  resource_group,
  owner,
  owner_type,
  owner_candidate,
  evidence_key,
  confidence,
  source,
  path,
  discovery_source,
  evidence_value,
  evidence_date,
  priority
from indirect_resource_group_candidates;
