import type { DuckDBConnection } from "@duckdb/node-api";

import type { EntraServicePrincipal } from "../../inputTransferObject/generated/EntraSnapshot";

export async function insertEntraServicePrincipalRows(
  connection: DuckDBConnection,
  servicePrincipals: EntraServicePrincipal[]
): Promise<void> {
  for (const [ordinal, servicePrincipal] of servicePrincipals.entries()) {
    await connection.run(
      `insert into entra_service_principals values (
        $ordinal,
        lower($id),
        lower($appId),
        $displayName,
        $appDisplayName,
        $servicePrincipalType,
        $publisherName,
        $accountEnabled,
        $appOwnerOrganizationId,
        $homepage,
        $loginUrl,
        $replyUrls::json,
        $servicePrincipalNames::json,
        $tags::json,
        $appRoles::json,
        $servicePrincipalOwners::json,
        $applicationOwners::json,
        $metadata::json
      )`,
      {
        ordinal,
        id: servicePrincipal.id,
        appId: servicePrincipal.appId,
        displayName: servicePrincipal.displayName,
        appDisplayName: servicePrincipal.appDisplayName,
        servicePrincipalType: servicePrincipal.servicePrincipalType,
        publisherName: servicePrincipal.publisherName,
        accountEnabled: servicePrincipal.accountEnabled,
        appOwnerOrganizationId: servicePrincipal.appOwnerOrganizationId,
        homepage: servicePrincipal.homepage,
        loginUrl: servicePrincipal.loginUrl,
        replyUrls: JSON.stringify(servicePrincipal.replyUrls),
        servicePrincipalNames: JSON.stringify(servicePrincipal.servicePrincipalNames),
        tags: JSON.stringify(normalizeImportedTags(servicePrincipal.tags)),
        appRoles: JSON.stringify(servicePrincipal.appRoles ?? []),
        servicePrincipalOwners: JSON.stringify(servicePrincipal.servicePrincipalOwners ?? []),
        applicationOwners: JSON.stringify(servicePrincipal.applicationOwners ?? []),
        metadata: JSON.stringify(servicePrincipal.metadata ?? null)
      }
    );
  }
}

export async function readEntraServicePrincipalRows(connection: DuckDBConnection): Promise<EntraServicePrincipal[]> {
  const rows = await readRows<EntraServicePrincipalRow>(
    connection,
    `select
      id,
      app_id,
      display_name,
      app_display_name,
      service_principal_type,
      publisher_name,
      account_enabled,
      app_owner_organization_id,
      homepage,
      login_url,
      reply_urls,
      service_principal_names,
      tags,
      app_roles,
      service_principal_owners,
      application_owners,
      metadata
    from entra_service_principals
    order by ordinal`
  );

  return rows.map(mapServicePrincipalRow);
}

type EntraServicePrincipalRow = {
  id: string;
  app_id: string;
  display_name: string;
  app_display_name: string | null;
  service_principal_type: EntraServicePrincipal["servicePrincipalType"];
  publisher_name: string | null;
  account_enabled: boolean;
  app_owner_organization_id: string | null;
  homepage: string | null;
  login_url: string | null;
  reply_urls: string;
  service_principal_names: string;
  tags: string;
  app_roles: string;
  service_principal_owners: string;
  application_owners: string;
  metadata: string | null;
};

function mapServicePrincipalRow(row: EntraServicePrincipalRow): EntraServicePrincipal {
  return {
    id: row.id,
    appId: row.app_id,
    displayName: row.display_name,
    appDisplayName: row.app_display_name,
    servicePrincipalType: row.service_principal_type,
    publisherName: row.publisher_name,
    accountEnabled: row.account_enabled,
    appOwnerOrganizationId: row.app_owner_organization_id,
    homepage: row.homepage,
    loginUrl: row.login_url,
    replyUrls: parseJsonArray<string>(row.reply_urls),
    servicePrincipalNames: parseJsonArray<string>(row.service_principal_names),
    tags: parseJsonArray<string>(row.tags),
    appRoles: parseJsonArray(row.app_roles),
    servicePrincipalOwners: parseJsonArray(row.service_principal_owners),
    applicationOwners: parseJsonArray(row.application_owners),
    metadata: row.metadata ? parseJsonObject(row.metadata) : null
  };
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  return value ? JSON.parse(value) : [];
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  return value ? JSON.parse(value) : {};
}

function normalizeImportedTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).map((tag) => tag.replaceAll("=", ":"));
}
