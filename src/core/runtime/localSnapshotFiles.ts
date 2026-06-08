import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type LocalSnapshotFile = {
  name: string;
  size: number;
  updatedAt: string;
};

export type LocalSnapshotData = {
  meta?: {
    provider?: string;
    createdAt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export const snapshotNamePattern = /^[\w.-]*snapshot\.json$/i;

export async function listLocalSnapshotFiles(dataDir: string): Promise<LocalSnapshotFile[]> {
  const entries = await readdir(dataDir);
  const files = await Promise.all(
    entries
      .filter((name) => snapshotNamePattern.test(name))
      .map(async (name) => {
        const filePath = path.join(dataDir, name);
        const details = await stat(filePath);
        return {
          name,
          size: details.size,
          updatedAt: details.mtime.toISOString()
        };
      })
  );

  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readLocalSnapshotFile(dataDir: string, name: string): Promise<LocalSnapshotData> {
  validateSnapshotFileName(name);

  const filePath = path.join(dataDir, name);
  if (!(await pathExists(filePath))) {
    throw new RuntimeHttpError(`Snapshot file ./data/${name} was not found.`, 404);
  }

  return JSON.parse(await readFile(filePath, "utf8")) as LocalSnapshotData;
}

export function validateSnapshotFileName(name: string): void {
  if (!snapshotNamePattern.test(name) || path.basename(name) !== name) {
    throw new RuntimeHttpError("Invalid snapshot file name.", 400);
  }
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class RuntimeHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
