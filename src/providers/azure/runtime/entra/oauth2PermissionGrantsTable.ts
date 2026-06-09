import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraOAuth2PermissionGrant } from "../../inputTransferObject/entra/EntraOAuth2PermissionGrant";

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
  connection: DuckDBConnection
): Promise<EntraOAuth2PermissionGrant[]> {
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
