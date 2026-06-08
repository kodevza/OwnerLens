import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import { pathExists, RuntimeHttpError, type LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import { toManagedIdentities, type ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import { toServicePrincipals, type ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type { EntraAppRoleAssignment } from "../../inputTransferObject/entra/EntraAppRoleAssignment";
import type { EntraOAuth2PermissionGrant } from "../../inputTransferObject/entra/EntraOAuth2PermissionGrant";
import type { EntraServicePrincipal } from "../../inputTransferObject/entra/EntraServicePrincipal";
import type { EntraSnapshot } from "../../inputTransferObject/entra/EntraSnapshot";
import {
  buildPaginatedCollection,
  type LocalReportCollectionQuery,
  type LocalReportPaginatedCollection
} from "../localReportCollections";
import { readEntraAppRoleAssignmentRows } from "./appRoleAssignmentsTable";
import { readEntraOAuth2PermissionGrantRows } from "./oauth2PermissionGrantsTable";
import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraServicePrincipalRows } from "./servicePrincipalsTable";
import {
  createEmptyEntraImportStatus,
  entraSnapshotFileName,
  importEntraSnapshotToDuckDb,
  prepareEntraDuckDbSchema,
  readEntraSnapshotFromDuckDb,
  type EntraDuckDbImportStatus
} from "./snapshotStore";
import { mapEntraServicePrincipalsToCore } from "./entraServicePrincipalMapper";

export type LocalEntraReportCollectionId =
  | "entra.servicePrincipals"
  | "entra.managedIdentities"
  | "entra.oauth2PermissionGrants"
  | "entra.appRoleAssignments";

export type LocalEntraReportRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class LocalEntraReportRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptyEntraImportStatus();

  constructor(options: LocalEntraReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): EntraDuckDbImportStatus {
    return this.status;
  }

  canReadSnapshot(name: string): boolean {
    return name === entraSnapshotFileName;
  }

  canQueryCollection(collectionId: string): collectionId is LocalEntraReportCollectionId {
    return parseEntraCollectionId(collectionId) !== null;
  }

  async prepareSchema(): Promise<void> {
    await prepareEntraDuckDbSchema(this.getConnection());
  }

  async importSnapshot(): Promise<void> {
    const entraSnapshotPath = path.join(this.dataDir, entraSnapshotFileName);
    if (!(await pathExists(entraSnapshotPath))) {
      return;
    }

    const snapshot = JSON.parse(await readFile(entraSnapshotPath, "utf8")) as EntraSnapshot & LocalSnapshotData;
    this.status = await importEntraSnapshotToDuckDb(this.getConnection(), snapshot);
  }

  async readSnapshot(): Promise<EntraSnapshot & LocalSnapshotData> {
    this.assertImported();
    return readEntraSnapshotFromDuckDb(this.getConnection());
  }

  async readEntraServicePrincipals(): Promise<EntraServicePrincipal[]> {
    this.assertImported();
    return readEntraServicePrincipalRows(this.getConnection());
  }

  async readServicePrincipals(): Promise<ServicePrincipal[]> {
    this.assertImported();
    const connection = this.getConnection();
    return toServicePrincipals(
      mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
      await readLatestAzureIdentityEnrichment(connection)
    );
  }

  async readManagedIdentities(): Promise<ManagedIdentity[]> {
    this.assertImported();
    const connection = this.getConnection();
    return toManagedIdentities(
      mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
      await readLatestAzureIdentityEnrichment(connection)
    );
  }

  async readEntraOAuth2PermissionGrants(): Promise<EntraOAuth2PermissionGrant[]> {
    this.assertImported();
    return readEntraOAuth2PermissionGrantRows(this.getConnection());
  }

  async readEntraAppRoleAssignments(): Promise<EntraAppRoleAssignment[]> {
    this.assertImported();
    return readEntraAppRoleAssignmentRows(this.getConnection());
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalEntraReportCollectionId>> {
    const collectionId = parseEntraCollectionId(query.collectionId);
    if (!collectionId) {
      throw new RuntimeHttpError(`Unknown Entra report collection: ${query.collectionId}`, 400);
    }

    return buildPaginatedCollection(collectionId, await this.readCollectionRows(collectionId), query);
  }

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${entraSnapshotFileName} was not found.`, 404);
    }
  }

  private async readCollectionRows(collectionId: LocalEntraReportCollectionId): Promise<Record<string, unknown>[]> {
    switch (collectionId) {
      case "entra.servicePrincipals":
        return (await this.readServicePrincipals()) as unknown as Record<string, unknown>[];
      case "entra.managedIdentities":
        return (await this.readManagedIdentities()) as unknown as Record<string, unknown>[];
      case "entra.oauth2PermissionGrants":
        return (await this.readEntraOAuth2PermissionGrants()) as unknown as Record<string, unknown>[];
      case "entra.appRoleAssignments":
        return (await this.readEntraAppRoleAssignments()) as unknown as Record<string, unknown>[];
    }
  }
}

export function parseEntraCollectionId(collectionId: string): LocalEntraReportCollectionId | null {
  if (
    collectionId === "entra.servicePrincipals" ||
    collectionId === "entra.managedIdentities" ||
    collectionId === "entra.oauth2PermissionGrants" ||
    collectionId === "entra.appRoleAssignments"
  ) {
    return collectionId;
  }

  return null;
}
