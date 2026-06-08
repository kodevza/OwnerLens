import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type JsonDiscoveryCandidate<T extends Record<string, unknown>> = {
  absolutePath: string;
  relativePath: string;
  data: T;
};

export type JsonDiscoveryDescription<T extends Record<string, unknown>> = {
  requiredTopLevelKeys: string[];
  validate?: (value: Record<string, unknown>) => value is T;
  compareCandidates?: (left: JsonDiscoveryCandidate<T>, right: JsonDiscoveryCandidate<T>) => number;
};

export async function discoverJsonFile<T extends Record<string, unknown>>(
  rootDir: string,
  description: JsonDiscoveryDescription<T>
): Promise<JsonDiscoveryCandidate<T> | null> {
  const jsonPaths = await listJsonFiles(rootDir);
  const candidates: JsonDiscoveryCandidate<T>[] = [];

  for (const filePath of jsonPaths) {
    const data = await readJsonDiscoveryCandidate(filePath, description);
    if (!data) {
      continue;
    }

    candidates.push({
      absolutePath: filePath,
      relativePath: toPosixRelativePath(rootDir, filePath),
      data
    });
  }

  return candidates.sort(description.compareCandidates)[0] ?? null;
}

export function compareByNewestDateField<T extends Record<string, unknown>>(
  fieldName: keyof T
): (left: JsonDiscoveryCandidate<T>, right: JsonDiscoveryCandidate<T>) => number {
  return (left, right) => {
    const dateComparison = compareNullableDateStrings(
      toNullableString(right.data[fieldName]),
      toNullableString(left.data[fieldName])
    );

    return dateComparison === 0 ? left.relativePath.localeCompare(right.relativePath) : dateComparison;
  };
}

async function listJsonFiles(rootDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function readJsonDiscoveryCandidate<T extends Record<string, unknown>>(
  filePath: string,
  description: JsonDiscoveryDescription<T>
): Promise<T | null> {
  try {
    const rawJson = stripJsonByteOrderMark(await readFile(filePath, "utf8"));
    if (!containsRequiredJsonKeyNames(rawJson, description.requiredTopLevelKeys)) {
      return null;
    }

    const value = JSON.parse(rawJson) as unknown;
    if (!isPlainObject(value) || !hasRequiredTopLevelKeys(value, description.requiredTopLevelKeys)) {
      return null;
    }

    if (description.validate && !description.validate(value)) {
      return null;
    }

    return value as T;
  } catch {
    return null;
  }
}

function hasRequiredTopLevelKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function containsRequiredJsonKeyNames(value: string, keys: string[]): boolean {
  return keys.every((key) => value.includes(JSON.stringify(key)));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareNullableDateStrings(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }

  if (Number.isNaN(leftTime)) {
    return 1;
  }

  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return leftTime - rightTime;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toPosixRelativePath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function stripJsonByteOrderMark(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
