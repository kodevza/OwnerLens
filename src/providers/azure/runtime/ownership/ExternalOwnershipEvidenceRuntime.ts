import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DuckDBConnection } from "@duckdb/node-api";

import externalOwnershipEvidenceSchema from "../../../../../contracts/ownership/external-ownership-evidence.v0.1.schema.json";
import type { OwnerType } from "../../../../core/ownership/types";
import { pathExists } from "../../../../core/runtime/localSnapshotFiles";
import { parseAndValidateSnapshot } from "../../../../core/runtime/snapshotContractValidator";
import {
  createEmptySnapshotImportStatus,
  prepareSnapshotImportDecision,
  recordSnapshotImport,
  snapshotImportStatusFromRecord,
  type SnapshotImportStatus
} from "../../../../core/runtime/snapshotImportRegistry";

export const externalOwnershipEvidenceFileName = "external-ownership-evidence.json";

type ValidatedExternalOwnershipEvidenceDocument = {
  sourceType?: unknown;
  sourceName?: unknown;
  items: unknown[];
};

type ExternalOwnershipEvidenceItem = {
  identityId?: string | null;
  identityName?: string | null;
  ownerType: ExternalOwnershipEvidenceOwnerType;
  ownerId: string;
  confidence?: string | null;
  observedAt?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceRef?: string | null;
  evidenceUrl?: string | null;
};

type ExternalOwnershipEvidenceOwnerType = Extract<OwnerType, "ownerCustom" | "ownerCustomLog">;

export type ExternalOwnershipEvidenceRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class ExternalOwnershipEvidenceRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptySnapshotImportStatus(externalOwnershipEvidenceFileName);
  private readonly importSource = "externalOwnership";

  constructor(options: ExternalOwnershipEvidenceRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): SnapshotImportStatus {
    return this.status;
  }

  async importSnapshot(): Promise<void> {
    const filePath = path.join(this.dataDir, externalOwnershipEvidenceFileName);
    if (!(await pathExists(filePath))) {
      return;
    }

    const connection = this.getConnection();
    const decision = await prepareSnapshotImportDecision(connection, {
      source: this.importSource,
      filePath,
      fileName: externalOwnershipEvidenceFileName
    });

    if (!decision.shouldImport) {
      const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, true);
      this.status = snapshotImportStatusFromRecord(registry);
      return;
    }

    const document = parseExternalOwnershipEvidenceDocument(
      await readFile(filePath, "utf8"),
      externalOwnershipEvidenceFileName
    );
    await importExternalOwnershipEvidenceToDuckDb(connection, document);
    const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, false);
    this.status = snapshotImportStatusFromRecord(registry);
  }
}

async function importExternalOwnershipEvidenceToDuckDb(
  connection: DuckDBConnection,
  document: { sourceType: string | null; sourceName: string | null; items: ExternalOwnershipEvidenceItem[] }
): Promise<void> {
  await connection.run("begin transaction");
  try {
    await connection.run("delete from external_ownership_evidence_items");

    for (const [index, item] of document.items.entries()) {
      const sourceType = item.sourceType ?? document.sourceType;
      const sourceName = item.sourceName ?? document.sourceName;
      await connection.run(
        `
          insert into external_ownership_evidence_items (
            ordinal,
            identity_id,
            identity_name,
            owner_type,
            owner_id,
            confidence,
            observed_at,
            source_type,
            source_name,
            source_ref,
            evidence_url,
            raw
          )
          values (
            $ordinal,
            $identityId,
            $identityName,
            $ownerType,
            $ownerId,
            $confidence,
            $observedAt,
            $sourceType,
            $sourceName,
            $sourceRef,
            $evidenceUrl,
            $raw::json
          )
        `,
        {
          ordinal: index,
          identityId: item.identityId ?? null,
          identityName: item.identityName ?? null,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          confidence: item.confidence ?? null,
          observedAt: item.observedAt ?? null,
          sourceType,
          sourceName,
          sourceRef: item.sourceRef ?? null,
          evidenceUrl: item.evidenceUrl ?? null,
          raw: JSON.stringify(item)
        }
      );
    }

    await connection.run("commit");
  } catch (error) {
    await connection.run("rollback");
    throw error;
  }
}

function parseExternalOwnershipEvidenceDocument(
  input: string,
  fileName: string
): { sourceType: string | null; sourceName: string | null; items: ExternalOwnershipEvidenceItem[] } {
  const parsed = parseAndValidateSnapshot<ValidatedExternalOwnershipEvidenceDocument>(input, {
    fileName,
    schema: externalOwnershipEvidenceSchema
  });

  return {
    sourceType: readOptionalString(parsed.sourceType, "sourceType", fileName),
    sourceName: readOptionalString(parsed.sourceName, "sourceName", fileName),
    items: parsed.items.map((item, index) => parseExternalOwnershipEvidenceItem(item, index, fileName))
  };
}

function parseExternalOwnershipEvidenceItem(
  value: unknown,
  index: number,
  fileName: string
): ExternalOwnershipEvidenceItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${fileName}: /items/${index} must be an object.`);
  }

  const item = value as Record<string, unknown>;

  return {
    identityId: readOptionalString(item.identityId, `items/${index}/identityId`, fileName),
    identityName: readOptionalString(item.identityName, `items/${index}/identityName`, fileName),
    ownerType: readExternalOwnershipEvidenceOwnerType(item.ownerType, `items/${index}/ownerType`, fileName),
    ownerId: readRequiredString(item.ownerId, `items/${index}/ownerId`, fileName),
    confidence: readOptionalString(item.confidence, `items/${index}/confidence`, fileName),
    observedAt: readOptionalString(item.observedAt, `items/${index}/observedAt`, fileName),
    sourceType: readOptionalString(item.sourceType, `items/${index}/sourceType`, fileName),
    sourceName: readOptionalString(item.sourceName, `items/${index}/sourceName`, fileName),
    sourceRef: readOptionalString(item.sourceRef, `items/${index}/sourceRef`, fileName),
    evidenceUrl: readOptionalString(item.evidenceUrl, `items/${index}/evidenceUrl`, fileName)
  };
}

function readExternalOwnershipEvidenceOwnerType(
  value: unknown,
  field: string,
  fileName: string
): ExternalOwnershipEvidenceOwnerType {
  if (value === undefined || value === null) {
    return "ownerCustom";
  }

  const ownerType = readRequiredString(value, field, fileName);

  if (ownerType !== "ownerCustom" && ownerType !== "ownerCustomLog") {
    throw new Error(`Invalid ${fileName}: /${field} must be ownerCustom or ownerCustomLog.`);
  }

  return ownerType;
}

function readRequiredString(value: unknown, field: string, fileName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${fileName}: /${field} must be a non-empty string.`);
  }

  return value;
}

function readOptionalString(value: unknown, field: string, fileName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid ${fileName}: /${field} must be a string.`);
  }

  return value;
}
