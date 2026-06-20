import type { DuckDBConnection } from "@duckdb/node-api";

import {
  readAzureIdentityEnrichmentStatus,
  recalculateAzureIdentityEnrichment,
  type AzureIdentityEnrichmentStatus
} from "./enrichment/azureIdentityEnrichment";

export type LocalReportRuntimeInventoryStats = {
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
