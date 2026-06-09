import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import { pathExists, RuntimeHttpError, type LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import { toManagedIdentities, type ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import {
  toServicePrincipals,
  type EntraPrincipalPermissionSummary,
  type ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type { EntraAppRoleAssignment } from "../../inputTransferObject/entra/EntraAppRoleAssignment";
import type { EntraOAuth2PermissionGrant } from "../../inputTransferObject/entra/EntraOAuth2PermissionGrant";
import type { EntraServicePrincipal } from "../../inputTransferObject/entra/EntraServicePrincipal";
import type { EntraSnapshot } from "../../inputTransferObject/entra/EntraSnapshot";
import { readEntraAppRoleAssignmentRows } from "./appRoleAssignmentsTable";
import { readEntraOAuth2PermissionGrantRows } from "./oauth2PermissionGrantsTable";
import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraServicePrincipalRows } from "./servicePrincipalsTable";
import {
  createEmptyEntraImportStatus,
  entraSnapshotFileName,
  importEntraSnapshotToDuckDb,
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
    const permissionsByPrincipalId = await this.readPrincipalPermissionSummary(connection);

    return toServicePrincipals(
      mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
      await readLatestAzureIdentityEnrichment(connection),
      permissionsByPrincipalId
    );
  }

  async readManagedIdentities(): Promise<ManagedIdentity[]> {
    this.assertImported();
    const connection = this.getConnection();
    const permissionsByPrincipalId = await this.readPrincipalPermissionSummary(connection);

    return toManagedIdentities(
      mapEntraServicePrincipalsToCore(await readEntraServicePrincipalRows(connection)),
      await readLatestAzureIdentityEnrichment(connection),
      permissionsByPrincipalId
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

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(`Snapshot file ./data/${entraSnapshotFileName} was not found.`, 404);
    }
  }

  private async readPrincipalPermissionSummary(
    connection: DuckDBConnection
  ): Promise<Map<string, EntraPrincipalPermissionSummary>> {
    const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
      readEntraOAuth2PermissionGrantRows(connection),
      readEntraAppRoleAssignmentRows(connection)
    ]);
    const permissionsByPrincipalId = new Map<string, EntraPrincipalPermissionSummary>();

    for (const grant of oauth2PermissionGrants) {
      const summary = getOrCreatePrincipalPermissionSummary(permissionsByPrincipalId, grant.clientId);
      summary.oauthPemrissionsCount += countOAuthPermissionScopes(grant.scope);
      summary.isAllParticipant = summary.isAllParticipant || grant.consentType === "AllPrincipals";
    }

    for (const assignment of appRoleAssignments) {
      const summary = getOrCreatePrincipalPermissionSummary(permissionsByPrincipalId, assignment.principalId);
      summary.appRolesPermissionCount += 1;
    }

    return permissionsByPrincipalId;
  }
}

function getOrCreatePrincipalPermissionSummary(
  permissionsByPrincipalId: Map<string, EntraPrincipalPermissionSummary>,
  principalId: string
): EntraPrincipalPermissionSummary {
  const normalizedPrincipalId = principalId.toLowerCase();
  const existing = permissionsByPrincipalId.get(normalizedPrincipalId);

  if (existing) {
    return existing;
  }

  const summary = {
    oauthPemrissionsCount: 0,
    appRolesPermissionCount: 0,
    isAllParticipant: false
  };

  permissionsByPrincipalId.set(normalizedPrincipalId, summary);
  return summary;
}

function countOAuthPermissionScopes(scope: string): number {
  return scope.split(/\s+/).filter(Boolean).length;
}
