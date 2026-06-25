import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installDuckDbHandleCleanup, withDuckDb } from "../../tests/support/duckdb";
import { migrate } from "./migrate";

installDuckDbHandleCleanup();

test("applies pending SQL migrations once and records checksums", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ownerlens-migrations-"));

  try {
    await withDuckDb(async ({ connection }) => {
      await writeFile(
        path.join(tempDir, "001_initial.sql"),
        "create table migration_test (id varchar primary key);"
      );

      await migrate(connection, tempDir, null);
      await migrate(connection, tempDir, null);

      const rows = await connection.runAndReadAll(
        "select version, checksum from schema_migrations order by version"
      );

      expect(rows.getRowObjectsJson()).toEqual([
        {
          version: "001_initial",
          checksum: expect.stringMatching(/^[a-f0-9]{64}$/)
        }
      ]);
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects edited migrations that were already applied", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ownerlens-migrations-"));
  const migrationPath = path.join(tempDir, "001_initial.sql");

  try {
    await withDuckDb(async ({ connection }) => {
      await writeFile(migrationPath, "create table migration_test (id varchar primary key);");
      await migrate(connection, tempDir, null);
      await writeFile(migrationPath, `${await readFile(migrationPath, "utf8")}\n-- edited\n`);

      await expect(migrate(connection, tempDir, null)).rejects.toThrow(
        "Migration checksum mismatch: 001_initial.sql"
      );
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
