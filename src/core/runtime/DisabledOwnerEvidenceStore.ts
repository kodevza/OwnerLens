import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

export type DisabledOwnerEvidenceProvider = string;
export type DisabledOwnerKey = string;

export class DisabledOwnerEvidenceStore {
  private readonly getConnection: () => DuckDBConnection;
  private readonly provider: DisabledOwnerEvidenceProvider;

  constructor(getConnection: () => DuckDBConnection, provider: DisabledOwnerEvidenceProvider) {
    this.getConnection = getConnection;
    this.provider = provider;
  }

  readKeys(): Promise<ReadonlySet<DisabledOwnerKey>> {
    return readDisabledOwnerEvidenceKeys(this.getConnection(), this.provider);
  }

  async setDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    const connection = this.getConnection();
    if (disabled) {
      await disableOwnerEvidenceKey(connection, this.provider, key);
    } else {
      await enableOwnerEvidenceKey(connection, this.provider, key);
    }

    return countDisabledOwnerEvidenceKeys(connection, this.provider);
  }
}

export async function readDisabledOwnerEvidenceKeys(
  connection: DuckDBConnection,
  provider: DisabledOwnerEvidenceProvider
): Promise<Set<DisabledOwnerKey>> {
  const rows = await readRows<DisabledOwnerEvidenceKeyDbRow>(
    connection,
    `select owner_key
    from disabled_owner_evidence_keys
    where provider = $provider
    order by owner_key`,
    { provider }
  );

  return new Set(rows.map((row) => row.owner_key));
}

export async function disableOwnerEvidenceKey(
  connection: DuckDBConnection,
  provider: DisabledOwnerEvidenceProvider,
  key: DisabledOwnerKey
): Promise<void> {
  await connection.run(
    `insert into disabled_owner_evidence_keys values ($provider, $key, $disabledAt)
    on conflict(provider, owner_key)
    do update set disabled_at = excluded.disabled_at`,
    {
      provider,
      key,
      disabledAt: new Date().toISOString()
    }
  );
}

export async function enableOwnerEvidenceKey(
  connection: DuckDBConnection,
  provider: DisabledOwnerEvidenceProvider,
  key: DisabledOwnerKey
): Promise<void> {
  await connection.run(
    `delete from disabled_owner_evidence_keys
    where provider = $provider
      and owner_key = $key`,
    {
      provider,
      key
    }
  );
}

export async function countDisabledOwnerEvidenceKeys(
  connection: DuckDBConnection,
  provider: DisabledOwnerEvidenceProvider
): Promise<number> {
  const rows = await readRows<DisabledOwnerEvidenceKeyCountRow>(
    connection,
    `select count(*) as disabled_count
    from disabled_owner_evidence_keys
    where provider = $provider`,
    { provider }
  );

  return Number(rows[0]?.disabled_count ?? 0);
}

type DisabledOwnerEvidenceKeyDbRow = {
  owner_key: string;
};

type DisabledOwnerEvidenceKeyCountRow = {
  disabled_count: string | number;
};

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = params ? await connection.runAndReadAll(sql, params) : await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson() as Row[];
}
