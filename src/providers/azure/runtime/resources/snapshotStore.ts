import type { DuckDBConnection } from "@duckdb/node-api";

import type { AzureSnapshot } from "../../../../core/azure/resources";
import type { LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";
import type { AzureSnapshot as AzureSnapshotInput } from "../../inputTransferObject/resources/AzureSnapshot";
import { prepareDisabledOwnerEvidenceTable } from "./disabledOwnerEvidenceTable";
import { importAzureResourcesSnapshotMetadata, prepareAzureResourcesSnapshotMetadataTables } from "./snapshotMetadataTable";
import {
  insertAzureActivityLogRows,
  insertAzureResourceGroupRows,
  insertAzureResourceRows,
  insertAzureRoleAssignmentRows,
  insertAzureSubscriptionRows,
  insertAzureUserAssignedManagedIdentityRows,
  prepareAzureResourcesTables,
  readAzureActivityLogRows,
  readAzureResourceGroupRows,
  readAzureResourceRows,
  readAzureRoleAssignmentRows,
  readAzureSubscriptionRows,
  readAzureUserAssignedManagedIdentityRows
} from "./tables";

export const azureResourcesSnapshotFileName = "snapshot.json";

export type AzureResourcesDuckDbImportStatus = {
  imported: boolean;
  fileName: string;
  subscriptionCount: number;
  resourceGroupCount: number;
  resourceCount: number;
  userAssignedManagedIdentityCount: number;
  roleAssignmentCount: number;
  activityLogCount: number;
  importedAt: string | null;
};

export function createEmptyAzureResourcesImportStatus(): AzureResourcesDuckDbImportStatus {
  return {
    imported: false,
    fileName: azureResourcesSnapshotFileName,
    subscriptionCount: 0,
    resourceGroupCount: 0,
    resourceCount: 0,
    userAssignedManagedIdentityCount: 0,
    roleAssignmentCount: 0,
    activityLogCount: 0,
    importedAt: null
  };
}

export async function prepareAzureResourcesDuckDbSchema(connection: DuckDBConnection): Promise<void> {
  await prepareAzureResourcesSnapshotMetadataTables(connection);
  await prepareAzureResourcesTables(connection);
  await prepareDisabledOwnerEvidenceTable(connection);
}

export async function importAzureResourcesSnapshotToDuckDb(
  connection: DuckDBConnection,
  snapshot: AzureSnapshotInput & LocalSnapshotData
): Promise<AzureResourcesDuckDbImportStatus> {
  await connection.run("begin transaction");
  try {
    await connection.run("delete from azure_resources_snapshot_meta");
    await connection.run("delete from azure_resources_snapshot_extra");
    await connection.run("delete from azure_subscriptions");
    await connection.run("delete from azure_resource_groups");
    await connection.run("delete from azure_resources");
    await connection.run("delete from azure_user_assigned_managed_identities");
    await connection.run("delete from azure_role_assignments");
    await connection.run("delete from azure_activity_logs");

    const {
      subscriptions,
      resourceGroups,
      resources,
      userAssignedManagedIdentities,
      roleAssignments = [],
      activityLogs
    } = snapshot;

    await importAzureResourcesSnapshotMetadata(connection, snapshot);
    await insertAzureSubscriptionRows(connection, subscriptions);
    await insertAzureResourceGroupRows(connection, resourceGroups);
    await insertAzureResourceRows(connection, resources);
    await insertAzureUserAssignedManagedIdentityRows(connection, userAssignedManagedIdentities);
    await insertAzureRoleAssignmentRows(connection, roleAssignments);
    await insertAzureActivityLogRows(connection, activityLogs);

    await connection.run("commit");
    return {
      imported: true,
      fileName: azureResourcesSnapshotFileName,
      subscriptionCount: subscriptions.length,
      resourceGroupCount: resourceGroups.length,
      resourceCount: resources.length,
      userAssignedManagedIdentityCount: userAssignedManagedIdentities.length,
      roleAssignmentCount: roleAssignments.length,
      activityLogCount: activityLogs.length,
      importedAt: new Date().toISOString()
    };
  } catch (error) {
    await connection.run("rollback");
    throw error;
  }
}

export async function readAzureResourcesSnapshotFromDuckDb(
  connection: DuckDBConnection
): Promise<AzureSnapshot & LocalSnapshotData> {
  const metaRows = await readRows<{ data: string }>(connection, "select data from azure_resources_snapshot_meta limit 1");
  const extraRows = await readRows<{ data: string }>(connection, "select data from azure_resources_snapshot_extra limit 1");

  return {
    ...parseJsonObject(extraRows[0]?.data),
    meta: parseJsonObject(metaRows[0]?.data) as AzureSnapshot["meta"],
    subscriptions: await readAzureSubscriptionRows(connection),
    resourceGroups: await readAzureResourceGroupRows(connection),
    resources: await readAzureResourceRows(connection),
    userAssignedManagedIdentities: await readAzureUserAssignedManagedIdentityRows(connection),
    roleAssignments: await readAzureRoleAssignmentRows(connection),
    activityLogs: await readAzureActivityLogRows(connection)
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
