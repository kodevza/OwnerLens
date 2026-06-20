import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import entraSnapshotSchema from "../../../../../contracts/entra/snapshot.v0.4.schema.json";
import { pathExists, RuntimeHttpError, type LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import { parseAndValidateSnapshot } from "../../../../core/runtime/snapshotContractValidator";
import {
  createEmptySnapshotImportStatus,
  prepareSnapshotImportDecision,
  recordSnapshotImport,
  snapshotImportStatusFromRecord,
  type SnapshotImportStatus
} from "../../../../core/runtime/snapshotImportRegistry";
import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type {
  EntraAppRoleAssignment,
  EntraOAuth2PermissionGrant,
  EntraUserGroupMembershipResponse
} from "../../../../core/azure/entra/types";
import type { EntraServicePrincipal, EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";
import {
  readAppRoleAssignments,
  readManagedIdentities,
  readOAuth2PermissionGrants,
  readPrincipalPermissions,
  readRawServicePrincipals,
  readServicePrincipals,
  readUserGroupMembership,
  type EntraPrincipalPermissions
} from "./EntraReadModel";
import {
  entraSnapshotFileName,
  importEntraSnapshotToDuckDb,
  readEntraSnapshotFromDuckDb
} from "./snapshotStore";
import { normalizeEntraSnapshot } from "./normalizeEntraSnapshot";

export type LocalEntraReportRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class LocalEntraReportRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptySnapshotImportStatus(entraSnapshotFileName);
  private readonly importSource = "entra";

  constructor(options: LocalEntraReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): SnapshotImportStatus {
    return this.status;
  }

  canReadSnapshot(name: string): boolean {
    return name === entraSnapshotFileName;
  }

  async importSnapshot(): Promise<void> {
    const entraSnapshotPath = path.join(this.dataDir, entraSnapshotFileName);
    if (!(await pathExists(entraSnapshotPath))) {
      return;
    }

    const connection = this.getConnection();
    const decision = await prepareSnapshotImportDecision(connection, {
      source: this.importSource,
      filePath: entraSnapshotPath,
      fileName: entraSnapshotFileName
    });

    if (!decision.shouldImport) {
      const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, true);
      this.status = snapshotImportStatusFromRecord(registry);
      return;
    }

    const snapshot = parseAndValidateSnapshot<EntraSnapshot & LocalSnapshotData>(
      await readFile(entraSnapshotPath, "utf8"),
      {
        fileName: entraSnapshotFileName,
        schema: entraSnapshotSchema
      }
    );
    await importEntraSnapshotToDuckDb(connection, normalizeEntraSnapshot(snapshot));
    const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, false);
    this.status = snapshotImportStatusFromRecord(registry);
  }

  async readSnapshot(): Promise<EntraSnapshot & LocalSnapshotData> {
    this.assertImported();
    return readEntraSnapshotFromDuckDb(this.getConnection());
  }

  async readEntraServicePrincipals(): Promise<EntraServicePrincipal[]> {
    this.assertImported();
    return readRawServicePrincipals(this.getConnection());
  }

  async readServicePrincipals(): Promise<ServicePrincipal[]> {
    this.assertImported();
    return readServicePrincipals(this.getConnection());
  }

  async readManagedIdentities(): Promise<ManagedIdentity[]> {
    this.assertImported();
    return readManagedIdentities(this.getConnection());
  }

  async readEntraOAuth2PermissionGrants(): Promise<EntraOAuth2PermissionGrant[]> {
    this.assertImported();
    return readOAuth2PermissionGrants(this.getConnection());
  }

  async readEntraAppRoleAssignments(): Promise<EntraAppRoleAssignment[]> {
    this.assertImported();
    return readAppRoleAssignments(this.getConnection());
  }

  async readEntraPrincipalPermissions(principalId: string): Promise<EntraPrincipalPermissions> {
    this.assertImported();
    return readPrincipalPermissions(this.getConnection(), principalId);
  }

  async readUserGroupMembership(user: string): Promise<EntraUserGroupMembershipResponse> {
    this.assertImported();
    return readUserGroupMembership(this.getConnection(), user);
  }

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${entraSnapshotFileName} was not found.`, 404);
    }
  }
}
