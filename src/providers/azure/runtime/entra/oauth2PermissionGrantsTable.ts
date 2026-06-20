import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { EntraOAuth2PermissionGrant } from "../../inputTransferObject/generated/EntraSnapshot";

export async function insertEntraOAuth2PermissionGrantRows(
  connection: DuckDBConnection,
  oauth2PermissionGrants: EntraOAuth2PermissionGrant[] = []
): Promise<void> {
  for (const [ordinal, grant] of oauth2PermissionGrants.entries()) {
    await connection.run(
      `insert into entra_oauth2_permission_grants values (
        $ordinal,
        $id,
        $clientId,
        $consentType,
        $principalId,
        $resourceId,
        $scope
      )`,
      { ordinal, ...grant }
    );
  }
}

export async function readEntraOAuth2PermissionGrantRows(
  connection: DuckDBConnection,
  options: { clientId?: string; clientIds?: string[] } = {}
): Promise<EntraOAuth2PermissionGrant[]> {
  const clientIds = normalizePrincipalIds(options.clientIds);
  const filters = [
    options.clientId ? "lower(client_id) = lower(trim($clientId))" : "",
    clientIds.length > 0
      ? `lower(client_id) in (
          select lower(trim(json_extract_string(value, '$')))
          from json_each($clientIds::json)
          where trim(json_extract_string(value, '$')) <> ''
        )`
      : ""
  ].filter(Boolean);
  const params = {
    ...(options.clientId ? { clientId: options.clientId } : {}),
    ...(clientIds.length > 0 ? { clientIds: JSON.stringify(clientIds) } : {})
  };

  return readRows<EntraOAuth2PermissionGrant>(
    connection,
    `select
      id,
      client_id as clientId,
      consent_type as consentType,
      principal_id as principalId,
      resource_id as resourceId,
      scope
    from entra_oauth2_permission_grants
    ${filters.length > 0 ? `where ${filters.join(" and ")}` : ""}
    order by ordinal`,
    Object.keys(params).length > 0 ? params : undefined
  );
}

function normalizePrincipalIds(principalIds: string[] = []): string[] {
  return [...new Set(principalIds.map((principalId) => principalId.trim()).filter(Boolean))];
}

async function readRows<Row extends object>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}
