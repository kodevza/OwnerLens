import type { DuckDBConnection } from "@duckdb/node-api";

import {
  readAzureIdentityEnrichmentStatus,
  recalculateAzureIdentityEnrichment,
  type AzureIdentityEnrichmentStatus
} from "./enrichment/azureIdentityEnrichment";

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
}
