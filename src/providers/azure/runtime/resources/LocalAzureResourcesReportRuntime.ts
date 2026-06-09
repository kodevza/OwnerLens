import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import type {
  AzureActivityLog,
  AzureResource,
  AzureResourceGroup,
  AzureRoleAssignment,
  AzureSnapshot,
  AzureSubscription,
  AzureUserAssignedManagedIdentity
} from "../../../../core/azure/resources";
import { pathExists, RuntimeHttpError, type LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import type { AzureSnapshot as AzureSnapshotInput } from "../../inputTransferObject/resources/AzureSnapshot";
import {
  azureResourcesSnapshotFileName,
  createEmptyAzureResourcesImportStatus,
  importAzureResourcesSnapshotToDuckDb,
  readAzureResourcesSnapshotFromDuckDb,
  type AzureResourcesDuckDbImportStatus
} from "./snapshotStore";
import {
  readAzureActivityLogRows,
  readAzureResourceGroupRows,
  readAzureResourceRows,
  readAzureRoleAssignmentRows,
  readAzureSubscriptionRows,
  readAzureUserAssignedManagedIdentityRows
} from "./tables";

export type LocalAzureResourcesReportCollectionId =
  | "azureResources.subscriptions"
  | "azureResources.resourceGroups"
  | "azureResources.resources"
  | "azureResources.userAssignedManagedIdentities"
  | "azureResources.roleAssignments"
  | "azureResources.activityLogs";

export type LocalAzureResourcesReportRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class LocalAzureResourcesReportRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptyAzureResourcesImportStatus();

  constructor(options: LocalAzureResourcesReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): AzureResourcesDuckDbImportStatus {
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

    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as AzureSnapshotInput & LocalSnapshotData;
    this.status = await importAzureResourcesSnapshotToDuckDb(this.getConnection(), snapshot);
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

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${azureResourcesSnapshotFileName} was not found.`, 404);
    }
  }
}
