import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import azureSnapshotSchema from "../../../../../contracts/azure/snapshot.v0.4.schema.json";
import type {
  AzureActivityLog,
  AzureResource,
  AzureResourceGroup,
  AzureRoleAssignment,
  ResourceGroupOwnershipRow,
  AzureSubscription,
  AzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import { pathExists, RuntimeHttpError, type LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import { parseAndValidateSnapshot } from "../../../../core/runtime/snapshotContractValidator";
import {
  createEmptySnapshotImportStatus,
  prepareSnapshotImportDecision,
  recordSnapshotImport,
  snapshotImportStatusFromRecord,
  type SnapshotImportStatus
} from "../../../../core/runtime/snapshotImportRegistry";
import type { AzureSnapshot } from "../../inputTransferObject/generated/AzureSnapshot";
import { normalizeAzureSnapshot } from "./normalizeAzureSnapshot";
import {
  azureResourcesSnapshotFileName,
  importAzureResourcesSnapshotToDuckDb,
  readAzureResourcesSnapshotFromDuckDb
} from "./snapshotStore";
import {
  readAzureActivityLogRows,
  countAzureResourceGroupOwnershipCollectionRows,
  readAzurePrincipalResourceGroupOwnerCandidateViewRows,
  readAzureResourceGroupOwnershipCollectionSqlRows,
  readAzureResourceGroupOwnerCandidateViewRows,
  readAzureResourceGroupRows,
  readAzureResourceGroupOwnershipSqlRows,
  readAzureResourceRows,
  readAzureRoleAssignmentRows,
  readAzureSubscriptionRows,
  readAzureUserAssignedManagedIdentityRows,
  queryAzureResourceGroupOwnershipCollectionRows,
  type AzureResourceGroupOwnershipCollectionQueryOptions,
  type AzurePrincipalResourceGroupOwnerCandidateViewRow,
  type AzureResourceGroupOwnerCandidateViewRow,
  type AzureResourceGroupOwnershipSqlRow
} from "./tables";

export type LocalAzureResourcesReportRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class LocalAzureResourcesReportRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptySnapshotImportStatus(azureResourcesSnapshotFileName);
  private readonly importSource = "azureResources";

  constructor(options: LocalAzureResourcesReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): SnapshotImportStatus {
    return this.status;
  }

  canReadSnapshot(name: string): boolean {
    return name === azureResourcesSnapshotFileName;
  }

  async importSnapshot(): Promise<void> {
    const snapshotPath = path.join(this.dataDir, azureResourcesSnapshotFileName);
    if (!(await pathExists(snapshotPath))) {
      return;
    }

    const connection = this.getConnection();
    const decision = await prepareSnapshotImportDecision(connection, {
      source: this.importSource,
      filePath: snapshotPath,
      fileName: azureResourcesSnapshotFileName
    });

    if (!decision.shouldImport) {
      const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, true);
      this.status = snapshotImportStatusFromRecord(registry);
      return;
    }

    const snapshot = parseAndValidateSnapshot<AzureSnapshot & LocalSnapshotData>(
      await readFile(snapshotPath, "utf8"),
      {
        fileName: azureResourcesSnapshotFileName,
        schema: azureSnapshotSchema
      }
    );
    await importAzureResourcesSnapshotToDuckDb(connection, normalizeAzureSnapshot(snapshot));
    const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, false);
    this.status = snapshotImportStatusFromRecord(registry);
  }

  async readSnapshot(): Promise<AzureSnapshot & LocalSnapshotData> {
    this.assertImported();
    return readAzureResourcesSnapshotFromDuckDb(this.getConnection());
  }

  async readAzureSubscriptions(): Promise<AzureSubscription[]> {
    this.assertImported();
    return readAzureSubscriptionRows(this.getConnection());
  }

  async readAzureResourceGroups(): Promise<AzureResourceGroup[]> {
    this.assertImported();
    return readAzureResourceGroupRows(this.getConnection());
  }

  async readAzureResources(): Promise<AzureResource[]> {
    this.assertImported();
    return readAzureResourceRows(this.getConnection());
  }

  async readAzureUserAssignedManagedIdentities(): Promise<AzureUserAssignedManagedIdentity[]> {
    this.assertImported();
    return readAzureUserAssignedManagedIdentityRows(this.getConnection());
  }

  async readAzureRoleAssignments(): Promise<AzureRoleAssignment[]> {
    this.assertImported();
    return readAzureRoleAssignmentRows(this.getConnection());
  }

  async readAzureActivityLogs(): Promise<AzureActivityLog[]> {
    this.assertImported();
    return readAzureActivityLogRows(this.getConnection());
  }

  async readAzureResourceGroupOwnershipSqlRows(target: {
    subscriptionIds: string[];
    resourceGroups: string[];
    principalIds?: string[];
  }, limit = 1): Promise<AzureResourceGroupOwnershipSqlRow[]> {
    this.assertImported();
    return readAzureResourceGroupOwnershipSqlRows(this.getConnection(), target, limit);
  }

  async readAzureResourceGroupOwnerCandidateViewRows(target: {
    subscriptionId: string;
    resourceGroup: string;
  }, limit: number): Promise<AzureResourceGroupOwnerCandidateViewRow[]> {
    this.assertImported();
    return readAzureResourceGroupOwnerCandidateViewRows(this.getConnection(), target, limit);
  }

  async readAzurePrincipalResourceGroupOwnerCandidateViewRows(target: {
    principalId: string;
    subscriptionIds: string[];
    resourceGroups: string[];
  }, limit: number): Promise<AzurePrincipalResourceGroupOwnerCandidateViewRow[]> {
    this.assertImported();
    return readAzurePrincipalResourceGroupOwnerCandidateViewRows(this.getConnection(), target, limit);
  }

  async readAzureResourceGroupOwnershipCollectionSqlRows(limit = 20): Promise<AzureResourceGroupOwnershipSqlRow[]> {
    this.assertImported();
    return readAzureResourceGroupOwnershipCollectionSqlRows(this.getConnection(), limit);
  }

  async queryAzureResourceGroupOwnershipCollectionRows(
    options: AzureResourceGroupOwnershipCollectionQueryOptions = {}
  ): Promise<ResourceGroupOwnershipRow[]> {
    this.assertImported();
    return queryAzureResourceGroupOwnershipCollectionRows(this.getConnection(), options);
  }

  async countAzureResourceGroupOwnershipCollectionRows(
    options: Pick<AzureResourceGroupOwnershipCollectionQueryOptions, "filters" | "selectedRowKeys"> = {}
  ): Promise<number> {
    this.assertImported();
    return countAzureResourceGroupOwnershipCollectionRows(this.getConnection(), options);
  }

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${azureResourcesSnapshotFileName} was not found.`, 404);
    }
  }
}
