import type { DuckDBConnection } from "@duckdb/node-api";

import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import {
  createEmptySnapshotImportStatus,
  prepareSnapshotImportDecision,
  recordSnapshotImport,
  snapshotImportStatusFromRecord,
  type SnapshotImportStatus
} from "../../../../core/runtime/snapshotImportRegistry";
import type {
  ZtaRemediationPackageSummary,
  ZtaRemediationSummary,
  ZtaReport
} from "../../../../core/azure/ztaReport";
import { compareByNewestDateField, discoverJsonFile, type JsonDiscoveryDescription } from "./Discovery";
import {
  importZeroTrustAssessmentReportToDuckDb,
  readZeroTrustAssessmentReportFromDuckDb,
  zeroTrustAssessmentReportFileName
} from "./snapshotStore";
import {
  readZeroTrustAssessmentRemediationPackageSummariesByPrincipalId,
  readZeroTrustAssessmentRemediationPackageSummariesByTestId,
  readZeroTrustAssessmentRemediationSummaries
} from "./tables";
import type { ZeroTrustAssessmentReport } from "./types";
import { toZtaReport } from "./ztaReportMapper";

const zeroTrustAssessmentReportDiscovery: JsonDiscoveryDescription<ZeroTrustAssessmentReport> = {
  requiredTopLevelKeys: ["TestResultSummary", "ExecutedAt", "TenantId"],
  validate: isZeroTrustAssessmentReport,
  compareCandidates: compareByNewestDateField<ZeroTrustAssessmentReport>("ExecutedAt")
};

export type LocalZeroTrustAssessmentReportRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
};

export class LocalZeroTrustAssessmentReportRuntime {
  private readonly dataDir: string;
  private readonly getConnection: () => DuckDBConnection;
  private status = createEmptySnapshotImportStatus(zeroTrustAssessmentReportFileName);
  private readonly importSource = "zeroTrustAssessment";

  constructor(options: LocalZeroTrustAssessmentReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.getConnection = options.getConnection;
  }

  getStatus(): SnapshotImportStatus {
    return this.status;
  }

  async importSnapshot(): Promise<void> {
    const candidate = await discoverJsonFile(this.dataDir, zeroTrustAssessmentReportDiscovery);
    if (!candidate) {
      return;
    }

    const connection = this.getConnection();
    const decision = await prepareSnapshotImportDecision(connection, {
      source: this.importSource,
      filePath: candidate.absolutePath,
      fileName: candidate.relativePath
    });

    if (!decision.shouldImport) {
      const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, true);
      this.status = snapshotImportStatusFromRecord(registry);
      return;
    }

    await importZeroTrustAssessmentReportToDuckDb(connection, candidate.data, candidate.relativePath);
    const registry = await recordSnapshotImport(connection, this.importSource, decision.metadata, false);
    this.status = snapshotImportStatusFromRecord(registry);
  }

  async readReport(): Promise<ZtaReport> {
    this.assertImported();
    return toZtaReport(await readZeroTrustAssessmentReportFromDuckDb(this.getConnection()));
  }

  async readRemediationSummaries(): Promise<Map<string, ZtaRemediationSummary>> {
    this.assertImported();
    return readZeroTrustAssessmentRemediationSummaries(this.getConnection());
  }

  async readRemediationPackageSummariesByTestId(): Promise<Map<string, ZtaRemediationPackageSummary[]>> {
    this.assertImported();
    return readZeroTrustAssessmentRemediationPackageSummariesByTestId(this.getConnection());
  }

  async readRemediationPackageSummariesByPrincipalId(): Promise<Map<string, ZtaRemediationPackageSummary[]>> {
    this.assertImported();
    return readZeroTrustAssessmentRemediationPackageSummariesByPrincipalId(this.getConnection());
  }

  private assertImported(): void {
    if (!this.status.imported) {
      throw new RuntimeHttpError(
        "ZTA report JSON with TestResultSummary, ExecutedAt, and TenantId was not found under ./data.",
        404
      );
    }
  }
}

function isZeroTrustAssessmentReport(value: unknown): value is ZeroTrustAssessmentReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const report = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(report, "TestResultSummary") &&
    Object.prototype.hasOwnProperty.call(report, "ExecutedAt") &&
    Object.prototype.hasOwnProperty.call(report, "TenantId") &&
    Array.isArray(report.Tests)
  );
}
