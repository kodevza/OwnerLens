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
  buildPaginatedCollection,
  type LocalReportCollectionQuery,
  type LocalReportPaginatedCollection
} from "../localReportCollections";
import {
  azureResourcesSnapshotFileName,
  createEmptyAzureResourcesImportStatus,
  importAzureResourcesSnapshotToDuckDb,
  prepareAzureResourcesDuckDbSchema,
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

  canQueryCollection(collectionId: string): collectionId is LocalAzureResourcesReportCollectionId {
    return parseAzureResourcesCollectionId(collectionId) !== null;
  }

  async prepareSchema(): Promise<void> {
    await prepareAzureResourcesDuckDbSchema(this.getConnection());
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

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalAzureResourcesReportCollectionId>> {
    const collectionId = parseAzureResourcesCollectionId(query.collectionId);
    if (!collectionId) {
      throw new RuntimeHttpError(`Unknown Azure Resources report collection: ${query.collectionId}`, 400);
    }

    return buildPaginatedCollection(collectionId, await this.readCollectionRows(collectionId), query);
  }

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${azureResourcesSnapshotFileName} was not found.`, 404);
    }
  }

  private async readCollectionRows(
    collectionId: LocalAzureResourcesReportCollectionId
  ): Promise<Record<string, unknown>[]> {
    switch (collectionId) {
      case "azureResources.subscriptions":
        return (await this.readAzureSubscriptions()) as unknown as Record<string, unknown>[];
      case "azureResources.resourceGroups":
        return (await this.readAzureResourceGroups()) as unknown as Record<string, unknown>[];
      case "azureResources.resources":
        return (await this.readAzureResources()) as unknown as Record<string, unknown>[];
      case "azureResources.userAssignedManagedIdentities":
        return (await this.readAzureUserAssignedManagedIdentities()) as unknown as Record<string, unknown>[];
      case "azureResources.roleAssignments":
        return (await this.readAzureRoleAssignments()) as unknown as Record<string, unknown>[];
      case "azureResources.activityLogs":
        return (await this.readAzureActivityLogs()) as unknown as Record<string, unknown>[];
    }
  }
}

export function parseAzureResourcesCollectionId(collectionId: string): LocalAzureResourcesReportCollectionId | null {
  if (
    collectionId === "azureResources.subscriptions" ||
    collectionId === "azureResources.resourceGroups" ||
    collectionId === "azureResources.resources" ||
    collectionId === "azureResources.userAssignedManagedIdentities" ||
    collectionId === "azureResources.roleAssignments" ||
    collectionId === "azureResources.activityLogs"
  ) {
    return collectionId;
  }

  return null;
}
