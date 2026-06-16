import type { DuckDBConnection } from "@duckdb/node-api";

import type { LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import type { EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";
import { insertEntraApplicationRows, readEntraApplicationRows } from "./applicationsTable";
import { insertEntraAppRoleAssignmentRows, readEntraAppRoleAssignmentRows } from "./appRoleAssignmentsTable";
import { insertEntraGroupMemberRows, readEntraGroupMemberRows } from "./groupMembersTable";
import { insertEntraOAuth2PermissionGrantRows, readEntraOAuth2PermissionGrantRows } from "./oauth2PermissionGrantsTable";
import { insertEntraServicePrincipalRows, readEntraServicePrincipalRows } from "./servicePrincipalsTable";
import { importEntraSnapshotMetadata } from "./snapshotMetadataTable";
import type { NormalizedEntraSnapshot } from "./normalizeEntraSnapshot";

export const entraSnapshotFileName = "entra-snapshot.json";

export async function importEntraSnapshotToDuckDb(
  connection: DuckDBConnection,
  snapshot: NormalizedEntraSnapshot & LocalSnapshotData
): Promise<void> {
  await connection.run("begin transaction");
  try {
    await connection.run("delete from entra_snapshot_meta");
    await connection.run("delete from entra_snapshot_extra");
    await connection.run("delete from entra_service_principals");
    await connection.run("delete from entra_applications");
    await connection.run("delete from entra_oauth2_permission_grants");
    await connection.run("delete from entra_app_role_assignments");
    await connection.run("delete from entra_group_members");

    const { servicePrincipals, applications, oauth2PermissionGrants, appRoleAssignments, groupMembers } = snapshot;
    await importEntraSnapshotMetadata(connection, snapshot);

    await insertEntraServicePrincipalRows(connection, servicePrincipals);
    await insertEntraApplicationRows(connection, applications);
    await insertEntraOAuth2PermissionGrantRows(connection, oauth2PermissionGrants);
    await insertEntraAppRoleAssignmentRows(connection, appRoleAssignments);
    await insertEntraGroupMemberRows(connection, groupMembers);

    await connection.run("commit");
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
  const applications = await readEntraApplicationRows(connection);
  const oauth2PermissionGrants = await readEntraOAuth2PermissionGrantRows(connection);
  const appRoleAssignments = await readEntraAppRoleAssignmentRows(connection);
  const groupMembers = await readEntraGroupMemberRows(connection);

  return {
    ...parseJsonObject(extraRows[0]?.data),
    meta: parseJsonObject(metaRows[0]?.data) as unknown as EntraSnapshot["meta"],
    servicePrincipals,
    applications,
    oauth2PermissionGrants,
    appRoleAssignments,
    groupMembers
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
