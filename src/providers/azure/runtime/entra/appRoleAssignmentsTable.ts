import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { EntraAppRoleAssignment } from "../../../../core/azure/entra/types";
import type { InputEntraAppRoleAssignment } from "../../inputTransferObject/generated/EntraSnapshot";

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
  connection: DuckDBConnection,
  options: { principalId?: string; principalIds?: string[] } = {}
): Promise<EntraAppRoleAssignment[]> {
  const principalIds = normalizePrincipalIds(options.principalIds);
  const filters = [
    options.principalId ? "lower(principal_id) = lower(trim($principalId))" : "",
    principalIds.length > 0
      ? `lower(principal_id) in (
          select lower(trim(json_extract_string(value, '$')))
          from json_each($principalIds::json)
          where trim(json_extract_string(value, '$')) <> ''
        )`
      : ""
  ].filter(Boolean);
  const params = {
    ...(options.principalId ? { principalId: options.principalId } : {}),
    ...(principalIds.length > 0 ? { principalIds: JSON.stringify(principalIds) } : {})
  };

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
    ${filters.length > 0 ? `where ${filters.join(" and ")}` : ""}
    order by ordinal`,
    Object.keys(params).length > 0 ? params : undefined
  );
}

function normalizePrincipalIds(principalIds: string[] = []): string[] {
  return [...new Set(principalIds.map((principalId) => principalId.trim()).filter(Boolean))];
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}
