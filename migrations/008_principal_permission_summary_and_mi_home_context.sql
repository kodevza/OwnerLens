create table if not exists entra_principal_permission_summary (
  principal_id varchar primary key,
  oauth_permissions_count integer not null,
  app_roles_permission_count integer not null,
  entra_permission_count integer not null,
  entra_permission_risk varchar not null
);

create table if not exists azure_managed_identity_home_context (
  principal_id varchar primary key,
  client_id varchar not null,
  subscription_id varchar not null,
  resource_group varchar not null,
  resource_id varchar not null,
  identity_kind varchar not null
);
