create table azure_disabled_resource_group_owner_candidates_v2 (
  subscription_id varchar not null,
  resource_group varchar not null,
  owner_candidate varchar not null,
  principal_id varchar not null default '',
  disabled_at varchar not null,
  primary key (subscription_id, resource_group, owner_candidate, principal_id)
);

insert into azure_disabled_resource_group_owner_candidates_v2 (
  subscription_id,
  resource_group,
  owner_candidate,
  principal_id,
  disabled_at
)
select
  subscription_id,
  resource_group,
  owner_candidate,
  '',
  disabled_at
from azure_disabled_resource_group_owner_candidates;

drop table azure_disabled_resource_group_owner_candidates;

alter table azure_disabled_resource_group_owner_candidates_v2
rename to azure_disabled_resource_group_owner_candidates;
