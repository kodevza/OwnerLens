import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { PermissionRiskLevel } from "../../../../../core/risk/types";
import type { LocalReportCollectionFilter } from "../../../../../core/runtime/collections";
import type { PageOptions } from "../../../../../core/runtime/pagination";
import type { EntraServicePrincipal } from "../../../inputTransferObject/generated/EntraSnapshot";

export type EntraServicePrincipalRowsQueryOptions = PageOptions & {
  filters?: LocalReportCollectionFilter[];
  principalKind?: "servicePrincipal" | "managedIdentity";
};

export type EntraServicePrincipalRuntimeRow = EntraServicePrincipal & {
  permissionRisk: PermissionRiskLevel;
  rbacRoleAssignmentCount: number;
  rbacRoleLevel: PermissionRiskLevel;
  oauthPermissionsCount: number;
  appRolesPermissionCount: number;
  entraPermissionCount: number;
  entraPermissionRisk: PermissionRiskLevel;
  managedIdentityHomeSubscriptionId?: string;
  managedIdentityHomeResourceGroup?: string;
  managedIdentityHomeResourceId?: string;
};

export async function insertEntraServicePrincipalRows(
  connection: DuckDBConnection,
  servicePrincipals: EntraServicePrincipal[]
): Promise<void> {
  for (const [ordinal, servicePrincipal] of servicePrincipals.entries()) {
    await connection.run(
      `insert into entra_service_principals values (
        $ordinal,
        lower($id),
        lower($appId),
        $displayName,
        $appDisplayName,
        $servicePrincipalType,
        $publisherName,
        $accountEnabled,
        $appOwnerOrganizationId,
        $homepage,
        $loginUrl,
        $replyUrls::json,
        $servicePrincipalNames::json,
        $tags::json,
        $appRoles::json,
        $servicePrincipalOwners::json,
        $applicationOwners::json,
        $metadata::json
      )`,
      {
        ordinal,
        id: servicePrincipal.id,
        appId: servicePrincipal.appId,
        displayName: servicePrincipal.displayName,
        appDisplayName: servicePrincipal.appDisplayName,
        servicePrincipalType: servicePrincipal.servicePrincipalType,
        publisherName: servicePrincipal.publisherName,
        accountEnabled: servicePrincipal.accountEnabled,
        appOwnerOrganizationId: servicePrincipal.appOwnerOrganizationId,
        homepage: servicePrincipal.homepage,
        loginUrl: servicePrincipal.loginUrl,
        replyUrls: JSON.stringify(servicePrincipal.replyUrls),
        servicePrincipalNames: JSON.stringify(servicePrincipal.servicePrincipalNames),
        tags: JSON.stringify(normalizeImportedTags(servicePrincipal.tags)),
        appRoles: JSON.stringify(servicePrincipal.appRoles ?? []),
        servicePrincipalOwners: JSON.stringify(servicePrincipal.servicePrincipalOwners ?? []),
        applicationOwners: JSON.stringify(servicePrincipal.applicationOwners ?? []),
        metadata: JSON.stringify(servicePrincipal.metadata ?? null)
      }
    );
  }
}

export async function readEntraServicePrincipalRows(
  connection: DuckDBConnection,
  options: EntraServicePrincipalRowsQueryOptions = {}
): Promise<EntraServicePrincipalRuntimeRow[]> {
  const pageSql = getServicePrincipalRowsPageSql(options);
  const query = buildServicePrincipalRowsQuery(options);
  const rows = await readRows<EntraServicePrincipalRow>(
    connection,
    `${servicePrincipalRowsSql}
    ${query.whereSql}
    order by ordinal
    ${pageSql.sql}`,
    {
      ...query.params,
      ...pageSql.params
    }
  );

  return rows.map(mapServicePrincipalRow);
}

export async function countEntraServicePrincipalRows(
  connection: DuckDBConnection,
  options: EntraServicePrincipalRowsQueryOptions = {}
): Promise<number> {
  const query = buildServicePrincipalRowsQuery(options);
  const rows = await readRows<{ count: number | string }>(
    connection,
    `select count(*) as count
    from (
      ${servicePrincipalRowsSql}
    ) principal_rows
    ${query.whereSql}`,
    query.params
  );

  return Number(rows[0]?.count ?? 0);
}

export function getDuckDbServicePrincipalFilters(
  filters: LocalReportCollectionFilter[] = []
): LocalReportCollectionFilter[] {
  return filters.filter(isDuckDbServicePrincipalFilter);
}

export function getRuntimeServicePrincipalFilters(
  filters: LocalReportCollectionFilter[] = []
): LocalReportCollectionFilter[] {
  return filters.filter((filter) => !isDuckDbServicePrincipalFilter(filter));
}

export async function readEntraServicePrincipalRowById(
  connection: DuckDBConnection,
  principalId: string
): Promise<EntraServicePrincipalRuntimeRow | null> {
  const rows = await readRows<EntraServicePrincipalRow>(
    connection,
    `${servicePrincipalRowsSql}
    where id = lower(trim($principalId))
    limit 1`,
    { principalId }
  );

  return rows[0] ? mapServicePrincipalRow(rows[0]) : null;
}

type EntraServicePrincipalRow = {
  id: string;
  app_id: string;
  display_name: string;
  app_display_name: string | null;
  service_principal_type: EntraServicePrincipal["servicePrincipalType"];
  publisher_name: string | null;
  account_enabled: boolean;
  app_owner_organization_id: string | null;
  homepage: string | null;
  login_url: string | null;
  reply_urls: string;
  service_principal_names: string;
  tags: string;
  app_roles: string;
  service_principal_owners: string;
  application_owners: string;
  metadata: string | null;
  permissionRisk: PermissionRiskLevel | null;
  rbacRoleAssignmentCount: number | string | null;
  rbacRoleLevel: PermissionRiskLevel | null;
  oauthPermissionsCount: number | string | null;
  appRolesPermissionCount: number | string | null;
  entraPermissionCount: number | string | null;
  entraPermissionRisk: PermissionRiskLevel | null;
  managedIdentityHomeSubscriptionId: string | null;
  managedIdentityHomeResourceGroup: string | null;
  managedIdentityHomeResourceId: string | null;
};

function mapServicePrincipalRow(row: EntraServicePrincipalRow): EntraServicePrincipalRuntimeRow {
  return {
    id: row.id,
    appId: row.app_id,
    displayName: row.display_name,
    appDisplayName: row.app_display_name,
    servicePrincipalType: row.service_principal_type,
    publisherName: row.publisher_name,
    accountEnabled: row.account_enabled,
    appOwnerOrganizationId: row.app_owner_organization_id,
    homepage: row.homepage,
    loginUrl: row.login_url,
    replyUrls: parseJsonArray<string>(row.reply_urls),
    servicePrincipalNames: parseJsonArray<string>(row.service_principal_names),
    tags: parseJsonArray<string>(row.tags),
    appRoles: parseJsonArray(row.app_roles),
    servicePrincipalOwners: parseJsonArray(row.service_principal_owners),
    applicationOwners: parseJsonArray(row.application_owners),
    metadata: row.metadata ? parseJsonObject(row.metadata) : null,
    permissionRisk: row.permissionRisk ?? "none",
    rbacRoleAssignmentCount: readNumber(row.rbacRoleAssignmentCount),
    rbacRoleLevel: row.rbacRoleLevel ?? "none",
    oauthPermissionsCount: readNumber(row.oauthPermissionsCount),
    appRolesPermissionCount: readNumber(row.appRolesPermissionCount),
    entraPermissionCount: readNumber(row.entraPermissionCount),
    entraPermissionRisk: row.entraPermissionRisk ?? "none",
    ...(row.managedIdentityHomeSubscriptionId
      ? { managedIdentityHomeSubscriptionId: row.managedIdentityHomeSubscriptionId }
      : {}),
    ...(row.managedIdentityHomeResourceGroup
      ? { managedIdentityHomeResourceGroup: row.managedIdentityHomeResourceGroup }
      : {}),
    ...(row.managedIdentityHomeResourceId
      ? { managedIdentityHomeResourceId: row.managedIdentityHomeResourceId }
      : {})
  };
}

const servicePrincipalRowsSql = `
  with latest_run as (
    select run_id
    from azure_runtime_enrichment_runs
    where status = 'completed'
    order by completed_at desc
    limit 1
  )
  select
    sp.ordinal,
    sp.id,
    sp.app_id,
    sp.display_name,
    sp.app_display_name,
    sp.service_principal_type,
    sp.publisher_name,
    sp.account_enabled,
    sp.app_owner_organization_id,
    sp.homepage,
    sp.login_url,
    sp.reply_urls,
    sp.service_principal_names,
    sp.tags,
    sp.app_roles,
    sp.service_principal_owners,
    sp.application_owners,
    sp.metadata,
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
  left join latest_run on true
  left join azure_identity_access_risk_enrichment access_risk
    on access_risk.run_id = latest_run.run_id
    and lower(trim(access_risk.principal_id)) = lower(trim(sp.id))
  left join entra_principal_permission_summary permission_summary
    on permission_summary.principal_id = lower(trim(sp.id))
  left join azure_managed_identity_home_context home_context
    on home_context.principal_id = lower(trim(sp.id))
    or home_context.client_id = lower(trim(sp.app_id))
`;

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return value ? JSON.parse(value) : [];
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  return value ? JSON.parse(value) : {};
}

function readNumber(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeImportedTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).map((tag) => tag.replaceAll("=", ":"));
}

function getServicePrincipalRowsPageSql(options: PageOptions): {
  sql: string;
  params: Record<string, DuckDBValue>;
} {
  if (options.page === undefined || options.pageSize === undefined) {
    return {
      sql: "",
      params: {}
    };
  }

  const page = Math.max(1, Math.trunc(options.page));
  const pageSize = Math.max(1, Math.trunc(options.pageSize));

  return {
    sql: "limit $limit offset $offset",
    params: {
      limit: pageSize,
      offset: (page - 1) * pageSize
    }
  };
}

function buildServicePrincipalRowsQuery(options: EntraServicePrincipalRowsQueryOptions): {
  whereSql: string;
  params: Record<string, DuckDBValue>;
} {
  const clauses: string[] = [];
  const params: Record<string, DuckDBValue> = {};

  if (options.principalKind === "servicePrincipal") {
    clauses.push("service_principal_type <> 'ManagedIdentity'");
  }

  if (options.principalKind === "managedIdentity") {
    clauses.push("service_principal_type = 'ManagedIdentity'");
  }

  for (const [filterIndex, filter] of getDuckDbServicePrincipalFilters(options.filters).entries()) {
    const values = filter.values.map((value) => value.trim()).filter(Boolean);

    if (values.length === 0) {
      continue;
    }

    const columnSql = duckDbServicePrincipalFilterColumns[filter.column];
    const valueClauses = values.map((value, valueIndex) => {
      const paramName = `filter_${filterIndex}_${valueIndex}`;
      params[paramName] = value;
      return `regexp_matches(${columnSql}, $${paramName}, 'i')`;
    });

    clauses.push(`(${valueClauses.join(" or ")})`);
  }

  return {
    whereSql: clauses.length > 0 ? `where ${clauses.join(" and ")}` : "",
    params
  };
}

function isDuckDbServicePrincipalFilter(filter: LocalReportCollectionFilter): boolean {
  return Object.prototype.hasOwnProperty.call(duckDbServicePrincipalFilterColumns, filter.column);
}

const duckDbServicePrincipalFilterColumns: Record<string, string> = {
  id: "coalesce(id, '')",
  appId: "coalesce(app_id, '')",
  displayName: "coalesce(display_name, '')",
  appDisplayName: "coalesce(app_display_name, '')",
  servicePrincipalType: "coalesce(service_principal_type, '')",
  publisherName: "coalesce(publisher_name, '')",
  accountEnabled: "cast(account_enabled as varchar)",
  appOwnerOrganizationId: "coalesce(app_owner_organization_id, '')",
  homepage: "coalesce(homepage, '')",
  loginUrl: "coalesce(login_url, '')",
  replyUrls: "coalesce(cast(reply_urls as varchar), '')",
  servicePrincipalNames: "coalesce(cast(service_principal_names as varchar), '')",
  tags: "coalesce(cast(tags as varchar), '')",
  rbacRoleAssignmentCount: "cast(coalesce(\"rbacRoleAssignmentCount\", 0) as varchar)",
  rbacRoleLevel: "coalesce(\"rbacRoleLevel\", 'none')",
  entraPermissionRisk: "coalesce(\"entraPermissionRisk\", 'none')",
  oauthPermissionsCount: "cast(coalesce(\"oauthPermissionsCount\", 0) as varchar)",
  appRolesPermissionCount: "cast(coalesce(\"appRolesPermissionCount\", 0) as varchar)",
  entraPermissionCount: "cast(coalesce(\"entraPermissionCount\", 0) as varchar)",
  managedIdentityHomeResourceGroup: "coalesce(\"managedIdentityHomeResourceGroup\", '')"
};
