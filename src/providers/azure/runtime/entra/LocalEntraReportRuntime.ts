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
import type { EntraPrincipalPermissionSummary, ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type {
  EntraAppRoleAssignment,
  EntraOAuth2PermissionGrant,
  EntraUserGroupMembershipResponse
} from "../../../../core/azure/entra/types";
import type { PermissionRiskLevel } from "../../../../core/risk/types";
import type {
  EntraOAuth2PermissionGrant as InputEntraOAuth2PermissionGrant,
  EntraServicePrincipal,
  EntraSnapshot
} from "../../inputTransferObject/generated/EntraSnapshot";
import { readEntraAppRoleAssignmentRows } from "./appRoleAssignmentsTable";
import { readEntraOAuth2PermissionGrantRows } from "./oauth2PermissionGrantsTable";
import { readLatestAzureIdentityEnrichment } from "../enrichment/azureIdentityEnrichment";
import { readEntraServicePrincipalRows } from "./servicePrincipalsTable";
import { readEntraUserGroupMembership } from "./groupMembersTable";
import {
  entraSnapshotFileName,
  importEntraSnapshotToDuckDb,
  readEntraSnapshotFromDuckDb
} from "./snapshotStore";
import { mapEntraServicePrincipalsToCore } from "./entraServicePrincipalMapper";
import { normalizeEntraSnapshot } from "./normalizeEntraSnapshot";
import { toManagedIdentities, toServicePrincipals } from "./principalProjection";

export type EntraPrincipalPermissions = {
  principalId: string;
  oauth2PermissionGrants: EntraOAuth2PermissionGrant[];
  appRoleAssignments: EntraAppRoleAssignment[];
};

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
    return (await readEntraOAuth2PermissionGrantRows(this.getConnection())).map(toCoreEntraOAuth2PermissionGrant);
  }

  async readEntraAppRoleAssignments(): Promise<EntraAppRoleAssignment[]> {
    this.assertImported();
    return readEntraAppRoleAssignmentRows(this.getConnection());
  }

  async readEntraPrincipalPermissions(principalId: string): Promise<EntraPrincipalPermissions> {
    this.assertImported();
    const normalizedPrincipalId = principalId.toLowerCase();
    const [oauth2PermissionGrants, appRoleAssignments] = await Promise.all([
      readEntraOAuth2PermissionGrantRows(this.getConnection()),
      readEntraAppRoleAssignmentRows(this.getConnection())
    ]);

    return {
      principalId,
      oauth2PermissionGrants: oauth2PermissionGrants.filter(
        (grant) => grant.clientId.toLowerCase() === normalizedPrincipalId
      ).map(toCoreEntraOAuth2PermissionGrant),
      appRoleAssignments: appRoleAssignments.filter(
        (assignment) => assignment.principalId.toLowerCase() === normalizedPrincipalId
      )
    };
  }

  async readUserGroupMembership(user: string): Promise<EntraUserGroupMembershipResponse> {
    this.assertImported();
    return readEntraUserGroupMembership(this.getConnection(), user);
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
      const scopeCount = countOAuthPermissionScopes(grant.scope);
      summary.oauthPermissionsCount += scopeCount;
      if (scopeCount > 0) {
        summary.entraPermissionRisk = maxPermissionRisk(
          summary.entraPermissionRisk,
          grant.consentType === "AllPrincipals" ? "high" : "medium"
        );
      }
    }

    for (const assignment of appRoleAssignments) {
      const summary = getOrCreatePrincipalPermissionSummary(permissionsByPrincipalId, assignment.principalId);
      summary.appRolesPermissionCount += 1;
      summary.entraPermissionRisk = maxPermissionRisk(summary.entraPermissionRisk, "medium");
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
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none" as PermissionRiskLevel
  };

  permissionsByPrincipalId.set(normalizedPrincipalId, summary);
  return summary;
}

function countOAuthPermissionScopes(scope: string): number {
  return scope.split(/\s+/).filter(Boolean).length;
}

function toCoreEntraOAuth2PermissionGrant(grant: InputEntraOAuth2PermissionGrant): EntraOAuth2PermissionGrant {
  return {
    ...grant,
    risk: getOAuth2PermissionGrantRisk(grant)
  };
}

function getOAuth2PermissionGrantRisk(grant: Pick<InputEntraOAuth2PermissionGrant, "consentType">): PermissionRiskLevel {
  if (grant.consentType === "AllPrincipals") {
    return "high";
  }

  if (grant.consentType === "Principal") {
    return "low";
  }

  return "medium";
}

const permissionRiskRank: Record<PermissionRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

function maxPermissionRisk(left: PermissionRiskLevel, right: PermissionRiskLevel): PermissionRiskLevel {
  return permissionRiskRank[left] >= permissionRiskRank[right] ? left : right;
}
