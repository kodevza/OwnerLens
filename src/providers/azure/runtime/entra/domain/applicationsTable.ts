import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraApplication } from "../../../inputTransferObject/generated/EntraSnapshot";

export async function insertEntraApplicationRows(
  connection: DuckDBConnection,
  applications: EntraApplication[] = []
): Promise<void> {
  for (const [ordinal, application] of applications.entries()) {
    await connection.run(
      `insert into entra_applications values (
        $ordinal,
        lower($id),
        lower($appId),
        $displayName,
        $signInAudience,
        $publisherDomain,
        $identifierUris::json,
        $tags::json,
        $appRoles::json,
        $oauth2PermissionScopes::json,
        $requiredResourceAccess::json,
        $web::json,
        $spa::json,
        $publicClient::json,
        $passwordCredentials::json,
        $keyCredentials::json,
        $createdDateTime,
        $deletedDateTime,
        $disabledByMicrosoftStatus,
        $info::json,
        $notes,
        $owners::json
      )`,
      {
        ordinal,
        id: application.id,
        appId: application.appId,
        displayName: application.displayName,
        signInAudience: application.signInAudience,
        publisherDomain: application.publisherDomain,
        identifierUris: JSON.stringify(application.identifierUris ?? []),
        tags: JSON.stringify(application.tags ?? []),
        appRoles: JSON.stringify(application.appRoles ?? []),
        oauth2PermissionScopes: JSON.stringify(application.oauth2PermissionScopes ?? []),
        requiredResourceAccess: JSON.stringify(application.requiredResourceAccess ?? []),
        web: JSON.stringify(application.web ?? null),
        spa: JSON.stringify(application.spa ?? null),
        publicClient: JSON.stringify(application.publicClient ?? null),
        passwordCredentials: JSON.stringify(stripSecretText(application.passwordCredentials ?? [])),
        keyCredentials: JSON.stringify(stripSecretText(application.keyCredentials ?? [])),
        createdDateTime: application.createdDateTime,
        deletedDateTime: application.deletedDateTime,
        disabledByMicrosoftStatus: application.disabledByMicrosoftStatus,
        info: JSON.stringify(application.info ?? null),
        notes: application.notes,
        owners: JSON.stringify(application.owners ?? [])
      }
    );
  }
}

export async function readEntraApplicationRows(connection: DuckDBConnection): Promise<EntraApplication[]> {
  const rows = await readRows<EntraApplicationRow>(
    connection,
    `select
      id,
      app_id,
      display_name,
      sign_in_audience,
      publisher_domain,
      identifier_uris,
      tags,
      app_roles,
      oauth2_permission_scopes,
      required_resource_access,
      web,
      spa,
      public_client,
      password_credentials,
      key_credentials,
      created_date_time,
      deleted_date_time,
      disabled_by_microsoft_status,
      info,
      notes,
      owners
    from entra_applications
    order by ordinal`
  );

  return rows.map(mapApplicationRow);
}

export async function readEntraApplicationNotesByAppIds(
  connection: DuckDBConnection,
  appIds: readonly string[]
): Promise<Map<string, string | null>> {
  const normalizedAppIds = Array.from(new Set(appIds.map((appId) => appId.trim().toLowerCase()).filter(Boolean)));

  if (normalizedAppIds.length === 0) {
    return new Map();
  }

  const params = Object.fromEntries(normalizedAppIds.map((appId, index) => [`appId${index}`, appId]));
  const placeholders = normalizedAppIds.map((_, index) => `$appId${index}`).join(", ");
  const rows = await readRows<Pick<EntraApplicationRow, "app_id" | "notes">>(
    connection,
    `select
      app_id,
      notes
    from entra_applications
    where app_id in (${placeholders})`,
    params
  );

  return new Map(rows.map((row) => [row.app_id.toLowerCase(), row.notes]));
}

type EntraApplicationRow = {
  id: string;
  app_id: string;
  display_name: string;
  sign_in_audience: string | null;
  publisher_domain: string | null;
  identifier_uris: string;
  tags: string;
  app_roles: string;
  oauth2_permission_scopes: string;
  required_resource_access: string;
  web: string | null;
  spa: string | null;
  public_client: string | null;
  password_credentials: string;
  key_credentials: string;
  created_date_time: string | null;
  deleted_date_time: string | null;
  disabled_by_microsoft_status: string | null;
  info: string | null;
  notes: string | null;
  owners: string;
};

function mapApplicationRow(row: EntraApplicationRow): EntraApplication {
  return {
    id: row.id,
    appId: row.app_id,
    displayName: row.display_name,
    signInAudience: row.sign_in_audience,
    publisherDomain: row.publisher_domain,
    identifierUris: parseJsonArray<string>(row.identifier_uris),
    tags: parseJsonArray<string>(row.tags),
    appRoles: parseJsonArray(row.app_roles),
    oauth2PermissionScopes: parseJsonArray(row.oauth2_permission_scopes),
    requiredResourceAccess: parseJsonArray(row.required_resource_access),
    web: parseNullableJsonObject(row.web),
    spa: parseNullableJsonObject(row.spa),
    publicClient: parseNullableJsonObject(row.public_client),
    passwordCredentials: parseJsonArray(row.password_credentials),
    keyCredentials: parseJsonArray(row.key_credentials),
    createdDateTime: row.created_date_time,
    deletedDateTime: row.deleted_date_time,
    disabledByMicrosoftStatus: row.disabled_by_microsoft_status,
    info: parseNullableJsonObject(row.info),
    notes: row.notes,
    owners: parseJsonArray(row.owners)
  };
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, string>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return value ? JSON.parse(value) : [];
}

function parseNullableJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  return value ? JSON.parse(value) : null;
}

function stripSecretText(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSecretText);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.toLowerCase() !== "secrettext")
      .map(([key, entryValue]) => [key, stripSecretText(entryValue)])
  );
}
