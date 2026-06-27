import type { DuckDBConnection } from "@duckdb/node-api";

export async function rebuildAzureManagedIdentityHomeContext(connection: DuckDBConnection): Promise<void> {
  await connection.run("delete from azure_managed_identity_home_context");
  await connection.run(`
    insert into azure_managed_identity_home_context (
      principal_id,
      client_id,
      subscription_id,
      resource_group,
      resource_id,
      identity_kind,
      normalized_subscription_id,
      normalized_resource_group
    )
    select
      lower(trim(principal_id)) as principal_id,
      lower(trim(client_id)) as client_id,
      subscription_id,
      resource_group,
      resource_id,
      'UserAssigned' as identity_kind,
      lower(trim(subscription_id)) as normalized_subscription_id,
      lower(trim(resource_group)) as normalized_resource_group
    from azure_user_assigned_managed_identities
    where trim(principal_id) <> ''
      and trim(client_id) <> ''
      and trim(subscription_id) <> ''
      and trim(resource_group) <> ''
      and trim(resource_id) <> ''
    order by lower(trim(principal_id))
  `);
}
