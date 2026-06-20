create table if not exists azure_disabled_resource_group_owner_candidates (
  subscription_id varchar not null,
  resource_group varchar not null,
  owner_candidate varchar not null,
  disabled_at varchar not null,
  primary key (subscription_id, resource_group, owner_candidate)
);
