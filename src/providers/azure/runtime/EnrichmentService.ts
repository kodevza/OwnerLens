import type { DuckDBConnection } from "@duckdb/node-api";

import {
  readAzureIdentityEnrichmentStatus,
  recalculateAzureIdentityEnrichment,
  type AzureIdentityEnrichmentStatus
} from "./enrichment/azureIdentityEnrichment";

export type LocalReportRuntimeInventoryStats = {
  tenantName: string | null;
  users: number;
  groups: number;
  servicePrincipals: number;
  managedIdentities: number;
  resourceGroups: number;
  rbacAssignments: number;
};

export class EnrichmentService {
  private readonly getConnection: () => DuckDBConnection;
  private status: AzureIdentityEnrichmentStatus = {
    calculated: false,
    latestRunId: null,
    identityRoleAssignmentCount: 0,
    accessRiskIdentityCount: 0,
    managedIdentityAssignmentCount: 0,
    calculatedAt: null
  };

  constructor(getConnection: () => DuckDBConnection) {
    this.getConnection = getConnection;
  }

  getStatus(): AzureIdentityEnrichmentStatus {
    return this.status;
  }

  async recalculate(): Promise<void> {
    this.status = await recalculateAzureIdentityEnrichment(this.getConnection());
  }

  async readStatus(): Promise<void> {
    this.status = await readAzureIdentityEnrichmentStatus(this.getConnection());
  }

  async readInventoryStats(): Promise<LocalReportRuntimeInventoryStats> {
    const reader = await this.getConnection().runAndReadAll(`
      select
        (
          select coalesce(
            (
              select coalesce(
                nullif(trim(json_extract_string(data, '$.tenantDisplayName')), ''),
                nullif(trim(json_extract_string(data, '$.tenantName')), ''),
                nullif(trim(json_extract_string(data, '$.displayName')), ''),
                nullif(trim(json_extract_string(data, '$.tenantId')), '')
              )
              from entra_snapshot_meta
              limit 1
            ),
            (
              select case
                when count(distinct tenant_id) = 1 then min(tenant_id)
                when count(distinct tenant_id) > 1 then count(distinct tenant_id)::varchar || ' tenants'
                else null
              end
              from azure_subscriptions
            )
          )
        ) as tenantName,
        (select count(distinct member_id) from entra_group_members where lower(coalesce(member_type, '')) = 'user') as users,
        (select count(distinct group_id) from entra_group_members) as groups,
        (
          select count(*)
          from entra_service_principals
          where lower(service_principal_type) <> 'managedidentity'
        ) as servicePrincipals,
        (
          select count(*)
          from entra_service_principals
          where lower(service_principal_type) = 'managedidentity'
        ) as managedIdentities,
        (
          select count(distinct subscription_id || ':' || lower(resource_group))
          from azure_resource_groups
        ) as resourceGroups,
        (select count(*) from azure_role_assignments) as rbacAssignments
    `);
    const [row] = reader.getRowObjectsJson() as RuntimeInventoryStatsRow[];

    return {
      tenantName: readOptionalString(row?.tenantName),
      users: readCount(row?.users),
      groups: readCount(row?.groups),
      servicePrincipals: readCount(row?.servicePrincipals),
      managedIdentities: readCount(row?.managedIdentities),
      resourceGroups: readCount(row?.resourceGroups),
      rbacAssignments: readCount(row?.rbacAssignments)
    };
  }
}

type RuntimeInventoryStatsRow = {
  tenantName?: unknown;
  users?: unknown;
  groups?: unknown;
  servicePrincipals?: unknown;
  managedIdentities?: unknown;
  resourceGroups?: unknown;
  rbacAssignments?: unknown;
};

function readCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
