import type { DuckDBConnection } from "@duckdb/node-api";

import type { AzureSnapshot } from "../../domain/resources/AzureSnapshot";
import type { LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";

export async function prepareAzureResourcesSnapshotMetadataTables(connection: DuckDBConnection): Promise<void> {
  await connection.run("create table if not exists azure_resources_snapshot_meta (data json not null)");
  await connection.run("create table if not exists azure_resources_snapshot_extra (data json not null)");
}

export async function importAzureResourcesSnapshotMetadata(
  connection: DuckDBConnection,
  snapshot: AzureSnapshot & LocalSnapshotData
): Promise<void> {
  const { meta, subscriptions, resourceGroups, resources, userAssignedManagedIdentities, roleAssignments, activityLogs, ...extra } =
    snapshot;

  await connection.run("insert into azure_resources_snapshot_meta values ($meta::json)", {
    meta: JSON.stringify(meta ?? {})
  });
  await connection.run("insert into azure_resources_snapshot_extra values ($extra::json)", {
    extra: JSON.stringify(extra)
  });
}
