create or replace view runtime_external_principal_owner_evidence as
with normalized_external_evidence as (
  select
    *,
    nullif(lower(trim(identity_id)), '') as normalized_identity_id,
    nullif(lower(trim(identity_name)), '') as normalized_identity_name
  from external_ownership_evidence_items
),
matched_external_evidence as (
  select
    external_evidence.*,
    external_evidence.normalized_identity_id as principal_id
  from normalized_external_evidence external_evidence
  where external_evidence.normalized_identity_id is not null
  union all
  select
    external_evidence.*,
    principal.id as principal_id
  from normalized_external_evidence external_evidence
  join runtime_entra_principal_base_source principal
    on external_evidence.normalized_identity_id is null
    and external_evidence.normalized_identity_name is not null
    and lower(trim(principal."displayName")) = external_evidence.normalized_identity_name
)
select
  'principal' as "targetKind",

  principal_id as "principalId",

  null::varchar as "subscriptionId",
  null::varchar as "subscriptionName",
  null::varchar as "resourceGroup",

  trim(owner_id) as owner,

  case lower(trim(owner_type))
    when 'owneruser' then 'ownerUser'
    when 'ownergroup' then 'ownerGroup'
    when 'ownertag' then 'ownerTag'
    when 'application' then 'application'
    else 'unknown'
  end as "ownerType",

  concat(
    case lower(trim(owner_type))
      when 'owneruser' then 'ownerUser'
      when 'ownergroup' then 'ownerGroup'
      when 'ownertag' then 'ownerTag'
      when 'application' then 'application'
      else 'unknown'
    end,
    ':',
    lower(trim(owner_id))
  ) as "ownerCandidate",

  concat(
    'ownerCustom:',
    principal_id,
    ':',
    coalesce(nullif(trim(source_name), ''), 'unknown'),
    ':',
    lower(trim(owner_id))
  ) as "evidenceKey",

  coalesce(nullif(trim(confidence), ''), 'low') as confidence,

  'ownerCustom' as source,

  'direct' as path,

  'ownerCustom' as "discoverySource",

  coalesce(
    nullif(trim(source_ref), ''),
    nullif(trim(evidence_url), ''),
    nullif(trim(source_name), ''),
    'external ownership evidence'
  ) as "evidenceValue",

  observed_at as "evidenceDate",

  case
    when lower(trim(confidence)) = 'high' then 50
    when lower(trim(confidence)) = 'medium' then 200
    else 500
  end as priority,

  0 as "targetPriority",

  null::varchar as scope,
  null::varchar as "roleDefinitionName"
from matched_external_evidence
where
  principal_id is not null
  and nullif(trim(owner_type), '') is not null
  and nullif(trim(owner_id), '') is not null;
