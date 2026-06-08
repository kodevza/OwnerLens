import type { DuckDBConnection } from "@duckdb/node-api";

export type DisabledOwnerKey = string;

export async function prepareDisabledOwnerEvidenceTable(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    create table if not exists azure_disabled_owner_evidence_keys (
      owner_key varchar primary key,
      disabled_at varchar not null
    )
  `);
}

export async function readDisabledOwnerEvidenceKeys(
  connection: DuckDBConnection
): Promise<Set<DisabledOwnerKey>> {
  const rows = await readRows<DisabledOwnerEvidenceDbRow>(
    connection,
    "select owner_key from azure_disabled_owner_evidence_keys order by owner_key"
  );

  return new Set(rows.map((row) => row.owner_key));
}

export async function disableOwnerEvidenceKey(
  connection: DuckDBConnection,
  key: DisabledOwnerKey
): Promise<void> {
  await connection.run(
    `insert into azure_disabled_owner_evidence_keys values ($key, $disabledAt)
    on conflict(owner_key) do update set disabled_at = excluded.disabled_at`,
    {
      key,
      disabledAt: new Date().toISOString()
    }
  );
}

export async function enableOwnerEvidenceKey(
  connection: DuckDBConnection,
  key: DisabledOwnerKey
): Promise<void> {
  await connection.run("delete from azure_disabled_owner_evidence_keys where owner_key = $key", { key });
}

export async function countDisabledOwnerEvidenceKeys(connection: DuckDBConnection): Promise<number> {
  const rows = await readRows<DisabledOwnerEvidenceKeyCountRow>(
    connection,
    "select count(*) as disabled_count from azure_disabled_owner_evidence_keys"
  );

  return Number(rows[0]?.disabled_count ?? 0);
}

type DisabledOwnerEvidenceDbRow = {
  owner_key: DisabledOwnerKey;
};

type DisabledOwnerEvidenceKeyCountRow = {
  disabled_count: string | number;
};

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}
