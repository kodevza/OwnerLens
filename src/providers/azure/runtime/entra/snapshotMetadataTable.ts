import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraSnapshot } from "../../inputTransferObject/entra/EntraSnapshot";
import type { LocalSnapshotData } from "../../../../core/runtime/localSnapshotFiles";

export async function prepareEntraSnapshotMetadataTables(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    create table if not exists entra_snapshot_meta (
      data json not null
    )
  `);
  await connection.run(`
    create table if not exists entra_snapshot_extra (
      data json not null
    )
  `);
}

export async function importEntraSnapshotMetadata(
  connection: DuckDBConnection,
  snapshot: EntraSnapshot & LocalSnapshotData
): Promise<void> {
  const { meta, servicePrincipals, applications, oauth2PermissionGrants, appRoleAssignments, ...extra } = snapshot;
  void servicePrincipals;
  void applications;
  void oauth2PermissionGrants;
  void appRoleAssignments;

  await connection.run("insert into entra_snapshot_meta values ($data::json)", { data: JSON.stringify(meta) });
  await connection.run("insert into entra_snapshot_extra values ($data::json)", { data: JSON.stringify(extra) });
}
