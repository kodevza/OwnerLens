import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { PermissionRiskLevel } from "../../../../../core/risk/types";
import type { LocalReportCollectionFilter } from "../../../../../core/runtime/collections";
import type { PageOptions } from "../../../../../core/runtime/pagination";
import type { SortRule } from "../../../../../core/collectionControls";
import type { OwnerCandidate, OwnerConfidence } from "../../../../../core/ownership/types";
import type { EntraServicePrincipal } from "../../../inputTransferObject/generated/EntraSnapshot";
import {
  buildCountSql,
  buildOrderBySql,
  buildPageSql,
  buildSelectedRowsWhereSql,
  buildWhereSql,
  combineWhereSql,
  type RuntimeSqlColumnMap
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
      ${buildOrderBySql(options.sortRules, entraPrincipalCollectionColumnMap, "ordinal asc")}
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

type EntraPrincipalCollectionSqlRow = EntraServicePrincipalRow & {
  ordinal: number | string;
  ownerCandidates: string;
  potentialOwners: string;
  ownerConfidence: OwnerConfidence | null;
  notes: string | null;
  roleAssignments: string | null;
  rbacSubscriptionCount: number | string | null;
  resourceGroup: string | null;
  assignedResourceGroups: string | null;
  managedIdentityAssignments: string | null;
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

function buildPrincipalCollectionRowsSql(principalKind: "servicePrincipal" | "managedIdentity"): string {
  const kindWhere = principalKind === "servicePrincipal"
    ? "service_principal_type <> 'ManagedIdentity'"
    : "service_principal_type = 'ManagedIdentity'";

  return `
    with principal_rows as (
      select *
      from (
        ${servicePrincipalRowsSql}
      ) raw_principal_rows
      where ${kindWhere}
    ),
    latest_run as (
      select run_id
      from azure_runtime_enrichment_runs
      where status = 'completed'
      order by completed_at desc
      limit 1
    ),
    principal_rbac_enrichment as (
      select
        role_enrichment.principal_id,
        role_enrichment.role_assignments,
        (
          select count(distinct coalesce(
            nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
            nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
          ))
          from json_each(role_enrichment.role_assignments) role_entry
          where coalesce(
            nullif(json_extract_string(role_entry.value, '$.subscriptionId'), ''),
            nullif(json_extract_string(role_entry.value, '$.scopeSubscriptionId'), '')
          ) is not null
        ) as rbac_subscription_count
      from azure_identity_role_assignment_enrichment role_enrichment
      join latest_run on latest_run.run_id = role_enrichment.run_id
    ),
    managed_identity_enrichment as (
      select
        assignment_enrichment.principal_id,
        assigned_resource_groups,
        managed_identity_assignments
      from azure_managed_identity_assignment_enrichment assignment_enrichment
      join latest_run on latest_run.run_id = assignment_enrichment.run_id
    ),
    rbac_resource_group_targets as (
      select distinct
        principal.id as principal_id,
        coalesce(assignment.scope_subscription_id, assignment.subscription_id, regexp_extract(assignment.scope, '/subscriptions/([^/]+)', 1)) as subscription_id,
        nullif(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1)), '') as resource_group,
        assignment.scope,
        assignment.role_definition_name,
        10 as target_priority
      from principal_rows principal
      join azure_role_assignments assignment
        on lower(trim(assignment.principal_id)) = lower(trim(principal.id))
      where nullif(coalesce(assignment.scope_resource_group, regexp_extract(assignment.scope, '/resourceGroups/([^/]+)', 1)), '') is not null
    ),
    home_resource_group_targets as (
      select distinct
        principal.id as principal_id,
        principal."managedIdentityHomeSubscriptionId" as subscription_id,
        principal."managedIdentityHomeResourceGroup" as resource_group,
        principal."managedIdentityHomeResourceId" as scope,
        null::varchar as role_definition_name,
        0 as target_priority
      from principal_rows principal
      where principal."managedIdentityHomeSubscriptionId" is not null
        and principal."managedIdentityHomeResourceGroup" is not null
        and principal."managedIdentityHomeResourceId" is not null
    ),
    principal_resource_group_targets as (
      select * from home_resource_group_targets
      union all
      select * from rbac_resource_group_targets
    ),
    assigned_resource_groups as (
      select
        principal_id,
        to_json(list(distinct resource_group order by resource_group)) as assigned_resource_groups,
        min(resource_group) as first_resource_group
      from principal_resource_group_targets
      where resource_group is not null
      group by principal_id
    ),
    candidate_records as (
      select
        principal.id as principal_id,
        candidate.subscription_id,
        candidate.subscription_name,
        candidate.resource_group,
        candidate.owner,
        candidate.owner_type,
        candidate.owner_candidate,
        candidate.evidence_key,
        candidate.confidence,
        candidate.source,
        candidate.path,
        candidate.discovery_source,
        candidate.evidence_value,
        candidate.evidence_date,
        candidate.priority,
        0 as target_priority,
        null::varchar as scope,
        null::varchar as role_definition_name
      from principal_rows principal
      join azure_principal_resource_group_owner_candidates candidate
        on candidate.path = 'direct'
        and lower(trim(candidate.principal_id)) = lower(trim(principal.id))
      union all
      select
        target.principal_id,
        candidate.subscription_id,
        candidate.subscription_name,
        candidate.resource_group,
        candidate.owner,
        candidate.owner_type,
        candidate.owner_candidate,
        concat(
          'resourceGroup:',
          lower(trim(candidate.subscription_id)),
          ':',
          lower(trim(candidate.resource_group)),
          ':principal:',
          lower(trim(target.principal_id)),
          ':',
          candidate.owner_candidate
        ) as evidence_key,
        candidate.confidence,
        candidate.source,
        candidate.path,
        candidate.discovery_source,
        candidate.evidence_value,
        candidate.evidence_date,
        candidate.priority,
        target.target_priority,
        target.scope,
        target.role_definition_name
      from principal_resource_group_targets target
      join azure_principal_resource_group_owner_candidates candidate
        on candidate.path = 'indirect'
        and lower(trim(candidate.subscription_id)) = lower(trim(target.subscription_id))
        and lower(trim(candidate.resource_group)) = lower(trim(target.resource_group))
    ),
    active_candidate_records as (
      select candidate.*
      from candidate_records candidate
      where not exists (
        select 1
        from disabled_owner_evidence_keys disabled
        where disabled.provider = 'azure'
          and (
            lower(trim(disabled.owner_key)) = lower(trim(candidate.evidence_key))
            or lower(trim(disabled.owner_key)) = lower(trim(candidate.owner_candidate))
          )
      )
    ),
    candidate_scope as (
      select
        principal_id,
        count(*) filter (where path = 'direct') as direct_count
      from active_candidate_records
      group by principal_id
    ),
    projected_candidate_records as (
      select candidate.*
      from active_candidate_records candidate
      left join candidate_scope scope on scope.principal_id = candidate.principal_id
      where coalesce(scope.direct_count, 0) = 0 or candidate.path = 'direct'
    ),
    deduped_owner_candidates as (
      select *
      from (
        select
          *,
          row_number() over (
            partition by principal_id, owner_candidate
            order by
              target_priority asc,
              case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
              priority asc,
              lower(trim(owner)) asc
          ) as duplicate_rank
        from projected_candidate_records
      ) duplicate_owner_candidates
      where duplicate_rank = 1
    ),
    ranked_owner_candidates as (
      select
        *,
        row_number() over (
          partition by principal_id
          order by
            target_priority asc,
            case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end desc,
            case source
              when 'tag' then 5
              when 'resourceGroupOwner' then 5
              when 'entraApplicationOwner' then 4
              when 'entraServicePrincipalOwner' then 3
              when 'activity' then 1
              else 0
            end desc,
            priority asc,
            lower(trim(owner)) asc
        ) as candidate_rank
      from deduped_owner_candidates
    ),
    owner_summary as (
      select
        principal_id,
        to_json(list(
          struct_pack(
            key := owner_candidate,
            displayName := owner,
            type := owner_type,
            confidence := confidence,
            source := source,
            rank := candidate_rank,
            evidence := [
              struct_pack(user := evidence_value, date := evidence_date, key := evidence_key)
            ],
            relatedScopes := case
              when path = 'indirect' then [
                struct_pack(
                  subscriptionId := subscription_id,
                  subscriptionName := subscription_name,
                  resourceGroup := resource_group,
                  principalId := principal_id,
                  scope := scope,
                  roleDefinitionName := role_definition_name
                )
              ]
              else []
            end
          )
          order by candidate_rank
        )) as owner_candidates,
        to_json(list(owner order by candidate_rank)) as potential_owners,
        case max(case confidence when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end)
          when 3 then 'high'
          when 2 then 'medium'
          when 1 then 'low'
          else 'none'
        end as owner_confidence
      from ranked_owner_candidates
      group by principal_id
    )
    select
      principal.*,
      app.notes as "notes",
      coalesce(principal_rbac_enrichment.role_assignments, '[]') as "roleAssignments",
      coalesce(principal_rbac_enrichment.rbac_subscription_count, 0) as "rbacSubscriptionCount",
      coalesce(owner_summary.owner_candidates, '[]') as "ownerCandidates",
      coalesce(owner_summary.potential_owners, '[]') as "potentialOwners",
      coalesce(owner_summary.owner_confidence, 'none') as "ownerConfidence",
      coalesce(principal."managedIdentityHomeResourceGroup", assigned_resource_groups.first_resource_group) as "resourceGroup",
      coalesce(
        nullif(cast(managed_identity_enrichment.assigned_resource_groups as varchar), '[]'),
        assigned_resource_groups.assigned_resource_groups,
        '[]'
      ) as "assignedResourceGroups",
      coalesce(managed_identity_enrichment.managed_identity_assignments, '[]') as "managedIdentityAssignments"
    from principal_rows principal
    left join entra_applications app on app.app_id = principal.app_id
    left join principal_rbac_enrichment on lower(trim(principal_rbac_enrichment.principal_id)) = lower(trim(principal.id))
    left join managed_identity_enrichment on lower(trim(managed_identity_enrichment.principal_id)) = lower(trim(principal.id))
    left join owner_summary on owner_summary.principal_id = principal.id
    left join assigned_resource_groups on assigned_resource_groups.principal_id = principal.id
  `;
}

function buildPrincipalCollectionWhereSql(
  options: Pick<EntraPrincipalCollectionRowsQueryOptions, "filters" | "selectedRowKeys">
) {
  return combineWhereSql([
    buildWhereSql(options.filters, entraPrincipalCollectionColumnMap),
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

const entraPrincipalCollectionColumnMap: RuntimeSqlColumnMap = {
  id: { expr: "id", type: "text" },
  appId: { expr: "app_id", type: "text" },
  displayName: { expr: "display_name", type: "text" },
  appDisplayName: { expr: "app_display_name", type: "text" },
  servicePrincipalType: { expr: "service_principal_type", type: "text" },
  publisherName: { expr: "publisher_name", type: "text" },
  accountEnabled: { expr: "account_enabled", type: "text" },
  appOwnerOrganizationId: { expr: "app_owner_organization_id", type: "text" },
  homepage: { expr: "homepage", type: "text" },
  loginUrl: { expr: "login_url", type: "text" },
  replyUrls: { expr: "reply_urls", type: "text" },
  servicePrincipalNames: { expr: "service_principal_names", type: "text" },
  tags: { expr: "tags", type: "text" },
  permissionRisk: { expr: "\"permissionRisk\"", type: "risk" },
  rbacRoleAssignmentCount: { expr: "\"rbacRoleAssignmentCount\"", type: "number" },
  rbacRoleLevel: { expr: "\"rbacRoleLevel\"", type: "risk" },
  oauthPermissionsCount: { expr: "\"oauthPermissionsCount\"", type: "number" },
  appRolesPermissionCount: { expr: "\"appRolesPermissionCount\"", type: "number" },
  entraPermissionCount: { expr: "\"entraPermissionCount\"", type: "number" },
  entraPermissionRisk: { expr: "\"entraPermissionRisk\"", type: "risk" },
  managedIdentityHomeResourceGroup: { expr: "\"managedIdentityHomeResourceGroup\"", type: "text" },
  assignedResourceGroups: { expr: "\"assignedResourceGroups\"", type: "text" },
  resourceGroup: { expr: "\"resourceGroup\"", type: "text" },
  potentialOwners: { expr: "\"potentialOwners\"", type: "text" },
  ownerConfidence: { expr: "\"ownerConfidence\"", type: "risk" },
  "ownerCandidates.displayName": { expr: "\"potentialOwners\"", type: "text" }
};
