import type { DuckDBConnection } from "@duckdb/node-api";

export async function rebuildEntraPrincipalPermissionSummary(connection: DuckDBConnection): Promise<void> {
  await connection.run("delete from entra_principal_permission_summary");
  await connection.run(`
    insert into entra_principal_permission_summary
    with oauth_permissions as (
      select
        lower(trim(client_id)) as principal_id,
        sum(case
          when trim(scope) = '' then 0
          else array_length(regexp_split_to_array(trim(scope), '\\s+'))
        end) as oauth_permissions_count,
        max(case
          when consent_type = 'AllPrincipals' and trim(scope) <> '' then 3
          when trim(scope) <> '' then 2
          else 0
        end) as risk_rank
      from entra_oauth2_permission_grants
      where trim(client_id) <> ''
      group by lower(trim(client_id))
    ),
    app_role_permissions as (
      select
        lower(trim(principal_id)) as principal_id,
        count(*) as app_roles_permission_count,
        case when count(*) > 0 then 2 else 0 end as risk_rank
      from entra_app_role_assignments
      where trim(principal_id) <> ''
      group by lower(trim(principal_id))
    ),
    principals as (
      select principal_id from oauth_permissions
      union
      select principal_id from app_role_permissions
    )
    select
      principals.principal_id,
      cast(coalesce(oauth_permissions.oauth_permissions_count, 0) as integer) as oauth_permissions_count,
      cast(coalesce(app_role_permissions.app_roles_permission_count, 0) as integer) as app_roles_permission_count,
      cast(
        coalesce(oauth_permissions.oauth_permissions_count, 0) +
        coalesce(app_role_permissions.app_roles_permission_count, 0)
        as integer
      ) as entra_permission_count,
      case greatest(
        coalesce(oauth_permissions.risk_rank, 0),
        coalesce(app_role_permissions.risk_rank, 0)
      )
        when 3 then 'high'
        when 2 then 'medium'
        when 1 then 'low'
        else 'none'
      end as entra_permission_risk
    from principals
    left join oauth_permissions using (principal_id)
    left join app_role_permissions using (principal_id)
    order by principals.principal_id
  `);
}
