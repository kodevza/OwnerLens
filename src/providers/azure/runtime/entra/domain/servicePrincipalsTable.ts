import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { PermissionRiskLevel } from "../../../../../core/risk/types";
import type { LocalReportCollectionFilter } from "../../../../../core/runtime/collections";
import type { PageOptions } from "../../../../../core/runtime/pagination";
import type { SortRule } from "../../../../../core/collectionControls";
import type { OwnerCandidate, OwnerConfidence } from "../../../../../core/ownership/types";
import type { EntraServicePrincipal } from "../../../inputTransferObject/generated/EntraSnapshot";
import { entraPrincipalSqlColumns } from "../../collectionSqlColumns";
import {
  buildCountSql,
  buildOrderBySql,
  buildPageSql,
  buildSelectedRowsWhereSql,
  buildWhereSql,
  combineWhereSql
} from "../../runtimeSqlCollectionQuery";

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

export type EntraPrincipalCollectionRowsQueryOptions = PageOptions & {
  filters?: LocalReportCollectionFilter[];
  sortRules?: SortRule[];
  principalKind: "servicePrincipal" | "managedIdentity";
  selectedRowKeys?: string[];
};

export type EntraPrincipalCollectionRow = EntraServicePrincipalRuntimeRow & {
  ownerCandidates: OwnerCandidate[];
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
  notes?: string | null;
  roleAssignments?: unknown[];
  rbacSubscriptionCount?: number;
  resourceGroup?: string;
  assignedResourceGroups?: string[];
  managedIdentityAssignments?: unknown[];
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

export async function queryEntraPrincipalCollectionRows(
  connection: DuckDBConnection,
  options: EntraPrincipalCollectionRowsQueryOptions
): Promise<EntraPrincipalCollectionRow[]> {
  const baseQuery = buildPrincipalCollectionRowsSql(options.principalKind);
  const where = buildPrincipalCollectionWhereSql(options);
  const page = buildPageSql(options.page, options.pageSize);
  const rows = await readRows<EntraPrincipalCollectionSqlRow>(
    connection,
    `
      select *
      from (
        ${baseQuery}
      ) collection_rows
      ${where.sql}
      ${buildOrderBySql(options.sortRules, entraPrincipalSqlColumns, "ordinal asc")}
      ${page.sql}
    `,
    {
      ...where.params,
      ...page.params
    }
  );

  return rows.map(mapPrincipalCollectionRow);
}

export async function countEntraPrincipalCollectionRows(
  connection: DuckDBConnection,
  options: Omit<EntraPrincipalCollectionRowsQueryOptions, "page" | "pageSize" | "sortRules">
): Promise<number> {
  const baseQuery = buildPrincipalCollectionRowsSql(options.principalKind);
  const where = buildPrincipalCollectionWhereSql(options);
  const countQuery = buildCountSql(baseQuery, where);
  const rows = await readRows<{ count: number | string }>(connection, countQuery.sql, countQuery.params);

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
  ordinal: number | string;
  id: string;
  appId: string;
  displayName: string;
  appDisplayName: string | null;
  servicePrincipalType: EntraServicePrincipal["servicePrincipalType"];
  publisherName: string | null;
  accountEnabled: boolean;
  appOwnerOrganizationId: string | null;
  homepage: string | null;
  loginUrl: string | null;
  replyUrls: string;
  servicePrincipalNames: string;
  tags: string;
  appRoles: string;
  servicePrincipalOwners: string;
  applicationOwners: string;
  metadata: string | null;
  notes: string | null;
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

type EntraPrincipalCollectionSqlRow = EntraServicePrincipalRow & {
  ownerCandidates: string;
  potentialOwners: string;
  ownerConfidence: OwnerConfidence | null;
  roleAssignments: string | null;
  rbacSubscriptionCount: number | string | null;
  resourceGroup: string | null;
  assignedResourceGroups: string | null;
  managedIdentityAssignments: string | null;
};

function mapServicePrincipalRow(row: EntraServicePrincipalRow): EntraServicePrincipalRuntimeRow {
  return {
    id: row.id,
    appId: row.appId,
    displayName: row.displayName,
    appDisplayName: row.appDisplayName,
    servicePrincipalType: row.servicePrincipalType,
    publisherName: row.publisherName,
    accountEnabled: row.accountEnabled,
    appOwnerOrganizationId: row.appOwnerOrganizationId,
    homepage: row.homepage,
    loginUrl: row.loginUrl,
    replyUrls: parseJsonArray<string>(row.replyUrls),
    servicePrincipalNames: parseJsonArray<string>(row.servicePrincipalNames),
    tags: parseJsonArray<string>(row.tags),
    appRoles: parseJsonArray(row.appRoles),
    servicePrincipalOwners: parseJsonArray(row.servicePrincipalOwners),
    applicationOwners: parseJsonArray(row.applicationOwners),
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

function mapPrincipalCollectionRow(row: EntraPrincipalCollectionSqlRow): EntraPrincipalCollectionRow {
  const base = mapServicePrincipalRow(row);
  const assignedResourceGroups = parseJsonArray<string>(row.assignedResourceGroups);

  return {
    ...base,
    ownerCandidates: parseJsonArray<OwnerCandidate>(row.ownerCandidates),
    potentialOwners: parseJsonArray<string>(row.potentialOwners),
    ownerConfidence: row.ownerConfidence ?? "none",
    notes: row.notes,
    roleAssignments: parseJsonArray(row.roleAssignments),
    rbacSubscriptionCount: readNumber(row.rbacSubscriptionCount),
    ...(row.resourceGroup ? { resourceGroup: row.resourceGroup } : {}),
    ...(base.servicePrincipalType === "ManagedIdentity"
      ? {
          assignedResourceGroups,
          managedIdentityAssignments: parseJsonArray(row.managedIdentityAssignments)
        }
      : {})
  };
}

const servicePrincipalRowsSql = `
  select
    *
  from runtime_entra_principal_base
`;

function buildPrincipalCollectionRowsSql(principalKind: "servicePrincipal" | "managedIdentity"): string {
  const kindWhere = principalKind === "servicePrincipal"
    ? "\"servicePrincipalType\" <> 'ManagedIdentity'"
    : "\"servicePrincipalType\" = 'ManagedIdentity'";

  return `
    select *
    from runtime_entra_principal_collection_rows
    where ${kindWhere}
  `;
}

function buildPrincipalCollectionWhereSql(
  options: Pick<EntraPrincipalCollectionRowsQueryOptions, "filters" | "selectedRowKeys">
) {
  return combineWhereSql([
    buildWhereSql(options.filters, entraPrincipalSqlColumns),
    buildSelectedRowsWhereSql(options.selectedRowKeys, "id")
  ]);
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
    clauses.push("\"servicePrincipalType\" <> 'ManagedIdentity'");
  }

  if (options.principalKind === "managedIdentity") {
    clauses.push("\"servicePrincipalType\" = 'ManagedIdentity'");
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
  appId: "coalesce(\"appId\", '')",
  displayName: "coalesce(\"displayName\", '')",
  appDisplayName: "coalesce(\"appDisplayName\", '')",
  servicePrincipalType: "coalesce(\"servicePrincipalType\", '')",
  publisherName: "coalesce(\"publisherName\", '')",
  accountEnabled: "cast(\"accountEnabled\" as varchar)",
  appOwnerOrganizationId: "coalesce(\"appOwnerOrganizationId\", '')",
  homepage: "coalesce(homepage, '')",
  loginUrl: "coalesce(\"loginUrl\", '')",
  replyUrls: "coalesce(cast(\"replyUrls\" as varchar), '')",
  servicePrincipalNames: "coalesce(cast(\"servicePrincipalNames\" as varchar), '')",
  tags: "coalesce(cast(tags as varchar), '')",
  rbacRoleAssignmentCount: "cast(coalesce(\"rbacRoleAssignmentCount\", 0) as varchar)",
  rbacRoleLevel: "coalesce(\"rbacRoleLevel\", 'none')",
  entraPermissionRisk: "coalesce(\"entraPermissionRisk\", 'none')",
  oauthPermissionsCount: "cast(coalesce(\"oauthPermissionsCount\", 0) as varchar)",
  appRolesPermissionCount: "cast(coalesce(\"appRolesPermissionCount\", 0) as varchar)",
  entraPermissionCount: "cast(coalesce(\"entraPermissionCount\", 0) as varchar)",
  managedIdentityHomeResourceGroup: "coalesce(\"managedIdentityHomeResourceGroup\", '')"
};
