import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { DuckDBType, DuckDBValue } from "@duckdb/node-api";

type DuckMigrationReader = {
  getRowObjects?(): Record<string, unknown>[];
  getRowObjectsJson?(): Record<string, unknown>[];
};

export type DuckMigrationConnection = {
  run(
    sql: string,
    params?: DuckDBValue[] | Record<string, DuckDBValue>,
    types?: DuckDBType[] | Record<string, DuckDBType | undefined>
  ): Promise<unknown>;
  runAndReadAll(
    sql: string,
    params?: DuckDBValue[] | Record<string, DuckDBValue>,
    types?: DuckDBType[] | Record<string, DuckDBType | undefined>
  ): Promise<DuckMigrationReader>;
};

type AppliedMigration = {
  version: string;
  checksum: string;
};

export type MigrationLogger = Pick<Console, "log">;

export async function migrate(
  db: DuckMigrationConnection,
  dir = "migrations",
  logger: MigrationLogger | null = console
): Promise<void> {
  await db.run(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      applied_at timestamp default current_timestamp
    )
  `);

  const applied = await readAppliedMigrations(db);
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const sql = await fs.readFile(path.join(dir, file), "utf8");
    const checksum = sha256(sql);
    const appliedMigration = applied.get(version);

    if (appliedMigration) {
      if (appliedMigration.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch: ${file}`);
      }

      continue;
    }

    try {
      await db.run("begin transaction");
      await db.run(sql);
      await db.run("insert into schema_migrations (version, checksum) values ($version, $checksum)", {
        version,
        checksum
      });
      await db.run("commit");
      logger?.log(`Applied migration: ${file}`);
    } catch (error) {
      await db.run("rollback").catch(() => {});
      throw new Error(`Migration failed: ${file}`, { cause: error });
    }
  }
}

async function readAppliedMigrations(db: DuckMigrationConnection): Promise<Map<string, AppliedMigration>> {
  const reader = await db.runAndReadAll("select version, checksum from schema_migrations");
  return new Map(
    readRows(reader).map((row) => [
      String(row.version),
      {
        version: String(row.version),
        checksum: String(row.checksum)
      }
    ])
  );
}

function readRows(reader: DuckMigrationReader): Record<string, unknown>[] {
  if (reader.getRowObjectsJson) {
    return reader.getRowObjectsJson();
  }

  if (reader.getRowObjects) {
    return reader.getRowObjects();
  }

  return [];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
