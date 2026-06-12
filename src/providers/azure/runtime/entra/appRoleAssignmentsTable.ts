import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraAppRoleAssignment } from "../../../../core/azure/entra/types";
import type { InputEntraAppRoleAssignment } from "../../inputTransferObject/entra/InputEntraAppRoleAssignment";

export async function insertEntraAppRoleAssignmentRows(
  connection: DuckDBConnection,
  appRoleAssignments: InputEntraAppRoleAssignment[] = []
): Promise<void> {
  for (const [ordinal, assignment] of appRoleAssignments.entries()) {
    await connection.run(
      `insert into entra_app_role_assignments values (
        $ordinal,
        $id,
        $appRoleId,
        $appRoleDisplayName,
        $appRoleValue,
        $principalId,
        $principalDisplayName,
        $resourceId,
        $resourceDisplayName
      )`,
      { ordinal, ...assignment }
    );
  }
}

export async function readEntraAppRoleAssignmentRows(
  connection: DuckDBConnection
): Promise<EntraAppRoleAssignment[]> {
  return readRows<EntraAppRoleAssignment>(
    connection,
    `select
      id,
      app_role_id as appRoleId,
      app_role_display_name as appRoleDisplayName,
      app_role_value as appRoleValue,
      principal_id as principalId,
      principal_display_name as principalDisplayName,
      resource_id as resourceId,
      resource_display_name as resourceDisplayName
    from entra_app_role_assignments
    order by ordinal`
  );
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}
