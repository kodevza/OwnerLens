import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

export type SnapshotImportSource = string;

export type SnapshotImportFingerprint = {
  fileName: string;
  name: string;
  lastModifiedDate: string;
  sizeBytes: number;
  contentHash: string | null;
};

export type SnapshotImportRecord = SnapshotImportFingerprint & {
  source: SnapshotImportSource;
  importedAt: string;
  skipped: boolean;
};

export type SnapshotImportStatus = {
  imported: boolean;
  fileName: string;
  name: string | null;
  lastModifiedDate: string | null;
  sizeBytes: number | null;
  contentHash: string | null;
  importedAt: string | null;
  skipped: boolean;
};

export type SnapshotImportDecision = {
  shouldImport: boolean;
  metadata: SnapshotImportFingerprint;
  previousImport: SnapshotImportRecord | null;
};

export async function prepareSnapshotImportDecision(
  connection: DuckDBConnection,
  options: {
    source: SnapshotImportSource;
    filePath: string;
    fileName: string;
  }
): Promise<SnapshotImportDecision> {
  const previousImport = await readLatestSnapshotImport(connection, options.source);
  let metadata = await readSnapshotImportFileMetadata(options.filePath, options.fileName);

  if (previousImport && hasMatchingMetadata(metadata, previousImport)) {
    return {
      shouldImport: false,
      metadata: {
        ...metadata,
        contentHash: previousImport.contentHash
      },
      previousImport
    };
  }

  metadata = {
    ...metadata,
    contentHash: await hashFile(options.filePath)
  };

  return {
    shouldImport: shouldImportSnapshot(metadata, previousImport),
    metadata,
    previousImport
  };
}

export async function recordSnapshotImport(
  connection: DuckDBConnection,
  source: SnapshotImportSource,
  metadata: SnapshotImportFingerprint,
  skipped: boolean,
  importedAt = new Date().toISOString()
): Promise<SnapshotImportRecord> {
  await connection.run(
    `
      insert into runtime_snapshot_imports (
        source,
        file_name,
        name,
        last_modified_date,
        size_bytes,
        content_hash,
        imported_at,
        skipped
      )
      values (
        $source,
        $fileName,
        $name,
        $lastModifiedDate,
        $sizeBytes,
        $contentHash,
        $importedAt,
        $skipped
      )
    `,
    {
      source,
      fileName: metadata.fileName,
      name: metadata.name,
      lastModifiedDate: metadata.lastModifiedDate,
      sizeBytes: metadata.sizeBytes,
      contentHash: metadata.contentHash,
      importedAt,
      skipped
    }
  );

  return {
    source,
    ...metadata,
    importedAt,
    skipped
  };
}

export function createEmptySnapshotImportStatus(fileName: string): SnapshotImportStatus {
  return {
    imported: false,
    fileName,
    name: null,
    lastModifiedDate: null,
    sizeBytes: null,
    contentHash: null,
    importedAt: null,
    skipped: false
  };
}

export function snapshotImportStatusFromRecord(record: SnapshotImportRecord): SnapshotImportStatus {
  return {
    imported: true,
    fileName: record.fileName,
    name: record.name,
    lastModifiedDate: record.lastModifiedDate,
    sizeBytes: record.sizeBytes,
    contentHash: record.contentHash,
    importedAt: record.importedAt,
    skipped: record.skipped
  };
}

export async function readLatestSnapshotImport(
  connection: DuckDBConnection,
  source: SnapshotImportSource
): Promise<SnapshotImportRecord | null> {
  const rows = await readRows<SnapshotImportRecordRow>(
    connection,
    `
      select
        source,
        file_name,
        name,
        last_modified_date,
        size_bytes,
        content_hash,
        imported_at,
        skipped
      from runtime_snapshot_imports
      where source = $source
      order by imported_at desc
      limit 1
    `,
    { source }
  );

  return rows[0] ? mapSnapshotImportRecord(rows[0]) : null;
}

export function shouldImportSnapshot(
  metadata: SnapshotImportFingerprint,
  previousImport: SnapshotImportFingerprint | null
): boolean {
  if (!previousImport) {
    return true;
  }

  if (hasMatchingMetadata(metadata, previousImport)) {
    return false;
  }

  return !metadata.contentHash || !previousImport.contentHash || metadata.contentHash !== previousImport.contentHash;
}

async function readSnapshotImportFileMetadata(
  filePath: string,
  fileName: string
): Promise<SnapshotImportFingerprint> {
  const details = await stat(filePath);

  return {
    fileName,
    name: path.basename(fileName),
    lastModifiedDate: details.mtime.toISOString(),
    sizeBytes: details.size,
    contentHash: null
  };
}

function hasMatchingMetadata(
  metadata: SnapshotImportFingerprint,
  previousImport: SnapshotImportFingerprint
): boolean {
  return (
    metadata.fileName === previousImport.fileName &&
    metadata.name === previousImport.name &&
    metadata.lastModifiedDate === previousImport.lastModifiedDate &&
    metadata.sizeBytes === previousImport.sizeBytes
  );
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

type SnapshotImportRecordRow = {
  source: string;
  file_name: string;
  name: string;
  last_modified_date: string;
  size_bytes: number;
  content_hash: string | null;
  imported_at: string;
  skipped: boolean;
};

function mapSnapshotImportRecord(row: SnapshotImportRecordRow): SnapshotImportRecord {
  return {
    source: row.source,
    fileName: row.file_name,
    name: row.name,
    lastModifiedDate: row.last_modified_date,
    sizeBytes: Number(row.size_bytes),
    contentHash: row.content_hash,
    importedAt: row.imported_at,
    skipped: row.skipped
  };
}
