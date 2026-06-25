create table if not exists disabled_owner_evidence_keys (
  provider varchar not null,
  owner_key varchar not null,
  disabled_at varchar not null,
  primary key (provider, owner_key)
);

insert into disabled_owner_evidence_keys (
  provider,
  owner_key,
  disabled_at
)
select
  'azure',
  concat(
    'resourceGroup:',
    subscription_id,
    ':',
    resource_group,
    case
      when coalesce(principal_id, '') = '' then ''
      else concat(':principal:', principal_id)
    end,
    ':',
    owner_candidate
  ),
  disabled_at
from azure_disabled_resource_group_owner_candidates
on conflict(provider, owner_key)
do update set disabled_at = excluded.disabled_at;

drop table if exists azure_disabled_resource_group_owner_candidates;
