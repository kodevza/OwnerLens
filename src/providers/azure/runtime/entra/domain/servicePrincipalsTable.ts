import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { LocalReportCollectionFilter } from "../../../../../core/runtime/collections";
import type { PageOptions } from "../../../../../core/runtime/pagination";
import type { EntraServicePrincipal } from "../../../inputTransferObject/generated/EntraSnapshot";

export type EntraServicePrincipalRowsQueryOptions = PageOptions & {
  filters?: LocalReportCollectionFilter[];
  principalKind?: "servicePrincipal" | "managedIdentity";
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
): Promise<EntraServicePrincipal[]> {
  const lookupLimit = getServicePrincipalRowsLookupLimit(options);
  const query = buildServicePrincipalRowsQuery(options);
  const rows = await readRows<EntraServicePrincipalRow>(
    connection,
    `select
      id,
      app_id,
      display_name,
      app_display_name,
      service_principal_type,
      publisher_name,
      account_enabled,
      app_owner_organization_id,
      homepage,
      login_url,
      reply_urls,
      service_principal_names,
      tags,
      app_roles,
      service_principal_owners,
      application_owners,
      metadata
    from entra_service_principals
    ${query.whereSql}
    order by ordinal
    ${lookupLimit === null ? "" : "limit $limit"}`,
    {
      ...query.params,
      ...(lookupLimit === null ? {} : { limit: lookupLimit })
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
    from entra_service_principals
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
): Promise<EntraServicePrincipal | null> {
  const rows = await readRows<EntraServicePrincipalRow>(
    connection,
    `select
      id,
      app_id,
      display_name,
      app_display_name,
      service_principal_type,
      publisher_name,
      account_enabled,
      app_owner_organization_id,
      homepage,
      login_url,
      reply_urls,
      service_principal_names,
      tags,
      app_roles,
      service_principal_owners,
      application_owners,
      metadata
    from entra_service_principals
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
};

function mapServicePrincipalRow(row: EntraServicePrincipalRow): EntraServicePrincipal {
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
    metadata: row.metadata ? parseJsonObject(row.metadata) : null
  };
}

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

function normalizeImportedTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).map((tag) => tag.replaceAll("=", ":"));
}

function getServicePrincipalRowsLookupLimit(options: PageOptions): number | null {
  if (options.page === undefined || options.pageSize === undefined) {
    return null;
  }

  return Math.max(1, Math.trunc(options.page) * Math.trunc(options.pageSize));
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
  tags: "coalesce(cast(tags as varchar), '')"
};
