import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraSnapshot } from "../../inputTransferObject/entra/EntraSnapshot";
import type { LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import {
  insertEntraAppRoleAssignmentRows,
  prepareEntraAppRoleAssignmentsTable,
  readEntraAppRoleAssignmentRows
} from "./appRoleAssignmentsTable";
import {
  insertEntraOAuth2PermissionGrantRows,
  prepareEntraOAuth2PermissionGrantsTable,
  readEntraOAuth2PermissionGrantRows
} from "./oauth2PermissionGrantsTable";
import {
  insertEntraServicePrincipalRows,
  prepareEntraServicePrincipalsTable,
  readEntraServicePrincipalRows
} from "./servicePrincipalsTable";
import { importEntraSnapshotMetadata, prepareEntraSnapshotMetadataTables } from "./snapshotMetadataTable";

export const entraSnapshotFileName = "entra-snapshot.json";

export type EntraDuckDbImportStatus = {
  imported: boolean;
  fileName: string;
  servicePrincipalCount: number;
  oauth2PermissionGrantCount: number;
  appRoleAssignmentCount: number;
  importedAt: string | null;
};

export function createEmptyEntraImportStatus(): EntraDuckDbImportStatus {
  return {
    imported: false,
    fileName: entraSnapshotFileName,
    servicePrincipalCount: 0,
    oauth2PermissionGrantCount: 0,
    appRoleAssignmentCount: 0,
    importedAt: null
  };
}

export async function prepareEntraDuckDbSchema(connection: DuckDBConnection): Promise<void> {
  await prepareEntraSnapshotMetadataTables(connection);
  await prepareEntraServicePrincipalsTable(connection);
  await prepareEntraOAuth2PermissionGrantsTable(connection);
  await prepareEntraAppRoleAssignmentsTable(connection);
}

export async function importEntraSnapshotToDuckDb(
  connection: DuckDBConnection,
  snapshot: EntraSnapshot & LocalSnapshotData
): Promise<EntraDuckDbImportStatus> {
  await connection.run("begin transaction");
  try {
    await connection.run("delete from entra_snapshot_meta");
    await connection.run("delete from entra_snapshot_extra");
    await connection.run("delete from entra_service_principals");
    await connection.run("delete from entra_oauth2_permission_grants");
    await connection.run("delete from entra_app_role_assignments");

    const { servicePrincipals, oauth2PermissionGrants, appRoleAssignments } = snapshot;
    await importEntraSnapshotMetadata(connection, snapshot);

    await insertEntraServicePrincipalRows(connection, servicePrincipals);
    await insertEntraOAuth2PermissionGrantRows(connection, oauth2PermissionGrants);
    await insertEntraAppRoleAssignmentRows(connection, appRoleAssignments);

    await connection.run("commit");
    return {
      imported: true,
      fileName: entraSnapshotFileName,
      servicePrincipalCount: servicePrincipals.length,
      oauth2PermissionGrantCount: oauth2PermissionGrants?.length ?? 0,
      appRoleAssignmentCount: appRoleAssignments?.length ?? 0,
      importedAt: new Date().toISOString()
    };
  } catch (error) {
    await connection.run("rollback");
    throw error;
  }
}

export async function readEntraSnapshotFromDuckDb(
  connection: DuckDBConnection
): Promise<EntraSnapshot & LocalSnapshotData> {
  const metaRows = await readRows<{ data: string }>(connection, "select data from entra_snapshot_meta limit 1");
  const extraRows = await readRows<{ data: string }>(connection, "select data from entra_snapshot_extra limit 1");
  const servicePrincipals = await readEntraServicePrincipalRows(connection);
  const oauth2PermissionGrants = await readEntraOAuth2PermissionGrantRows(connection);
  const appRoleAssignments = await readEntraAppRoleAssignmentRows(connection);

  return {
    ...parseJsonObject(extraRows[0]?.data),
    meta: parseJsonObject(metaRows[0]?.data) as EntraSnapshot["meta"],
    servicePrincipals,
    oauth2PermissionGrants,
    appRoleAssignments
  };
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  return value ? JSON.parse(value) : {};
}
