import type { DuckDBConnection } from "@duckdb/node-api";

export type DisabledOwnerKey = string;

export async function readDisabledOwnerEvidenceKeys(
  connection: DuckDBConnection
): Promise<Set<DisabledOwnerKey>> {
  const rows = await readRows<DisabledResourceGroupOwnerCandidateDbRow>(
    connection,
    `select subscription_id, resource_group, owner_candidate, principal_id
    from azure_disabled_resource_group_owner_candidates
    order by subscription_id, resource_group, owner_candidate, principal_id`
  );

  return new Set(rows.map((row) => getResourceGroupOwnerCandidateKey(row)));
}

export async function disableOwnerEvidenceKey(
  connection: DuckDBConnection,
  key: DisabledOwnerKey
): Promise<void> {
  const resourceGroupOwnerCandidate = parseResourceGroupOwnerCandidateKey(key);
  if (!resourceGroupOwnerCandidate) {
    throw new Error(`Invalid disabled resource group owner candidate key: ${key}`);
  }

  await connection.run(
    `insert into azure_disabled_resource_group_owner_candidates values (
      $subscriptionId,
      $resourceGroup,
      $ownerCandidate,
      $principalId,
      $disabledAt
    )
    on conflict(subscription_id, resource_group, owner_candidate, principal_id)
    do update set disabled_at = excluded.disabled_at`,
    {
      subscriptionId: resourceGroupOwnerCandidate.subscriptionId,
      resourceGroup: resourceGroupOwnerCandidate.resourceGroup,
      ownerCandidate: resourceGroupOwnerCandidate.ownerCandidate,
      principalId: resourceGroupOwnerCandidate.principalId ?? "",
      disabledAt: new Date().toISOString()
    }
  );
}

export async function enableOwnerEvidenceKey(
  connection: DuckDBConnection,
  key: DisabledOwnerKey
): Promise<void> {
  const resourceGroupOwnerCandidate = parseResourceGroupOwnerCandidateKey(key);
  if (!resourceGroupOwnerCandidate) {
    throw new Error(`Invalid disabled resource group owner candidate key: ${key}`);
  }

  await connection.run(
    `delete from azure_disabled_resource_group_owner_candidates
    where subscription_id = $subscriptionId
      and resource_group = $resourceGroup
      and owner_candidate = $ownerCandidate
      and principal_id = $principalId`,
    {
      subscriptionId: resourceGroupOwnerCandidate.subscriptionId,
      resourceGroup: resourceGroupOwnerCandidate.resourceGroup,
      ownerCandidate: resourceGroupOwnerCandidate.ownerCandidate,
      principalId: resourceGroupOwnerCandidate.principalId ?? ""
    }
  );
}

export async function countDisabledOwnerEvidenceKeys(connection: DuckDBConnection): Promise<number> {
  const rows = await readRows<DisabledOwnerEvidenceKeyCountRow>(
    connection,
    "select count(*) as disabled_count from azure_disabled_resource_group_owner_candidates"
  );

  return Number(rows[0]?.disabled_count ?? 0);
}

type DisabledResourceGroupOwnerCandidate = {
  subscriptionId: string;
  resourceGroup: string;
  ownerCandidate: string;
  principalId?: string;
};

type DisabledResourceGroupOwnerCandidateDbRow = {
  subscription_id: string;
  resource_group: string;
  owner_candidate: string;
  principal_id: string | null;
};

type DisabledOwnerEvidenceKeyCountRow = {
  disabled_count: string | number;
};

function parseResourceGroupOwnerCandidateKey(key: DisabledOwnerKey): DisabledResourceGroupOwnerCandidate | null {
  const match = key.match(/^resourceGroup:([^:]+):([^:]+)(?::principal:([^:]+))?:(ownerUser|ownerGroup|ownerTag|unknown):(.+)$/);
  if (!match) {
    return null;
  }

  const [, subscriptionId, resourceGroup, principalId, ownerType, ownerValue] = match;
  if (ownerValue.includes(":")) {
    return null;
  }

  return {
    subscriptionId,
    resourceGroup,
    ownerCandidate: `${ownerType}:${ownerValue}`,
    principalId
  };
}

function getResourceGroupOwnerCandidateKey(row: DisabledResourceGroupOwnerCandidateDbRow): DisabledOwnerKey {
  const parts = [
    "resourceGroup",
    row.subscription_id,
    row.resource_group
  ];

  if (row.principal_id) {
    parts.push("principal", row.principal_id);
  }

  return [
    ...parts,
    row.owner_candidate
  ].join(":");
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}
