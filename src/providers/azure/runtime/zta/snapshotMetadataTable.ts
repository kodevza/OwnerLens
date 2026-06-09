import type { DuckDBConnection } from "@duckdb/node-api";

import type { ZeroTrustAssessmentReport } from "./types";

export async function insertZeroTrustAssessmentReport(
  connection: DuckDBConnection,
  reportId: string,
  report: ZeroTrustAssessmentReport,
  fileName: string,
  importedAt: string
): Promise<void> {
  await connection.run(
    `
      insert into zta_report (id, file_name, executed_at, imported_at)
      values ($reportId, $fileName, $executedAt, $importedAt)
    `,
    {
      reportId,
      fileName,
      executedAt: report.ExecutedAt ?? null,
      importedAt
    }
  );
}

export async function importZeroTrustAssessmentMetadata(
  connection: DuckDBConnection,
  reportId: string,
  report: ZeroTrustAssessmentReport
): Promise<void> {
  const { Tests, ...metadata } = report;
  const {
    Account,
    CurrentVersion,
    Domain,
    EndOfJson,
    ExecutedAt,
    LatestVersion,
    TenantId,
    TenantInfo,
    TenantName,
    TestResultSummary,
    ...extra
  } = metadata;

  await connection.run(
    `
      insert into zta_report_meta (report_id, data)
      values ($reportId, $meta::json)
    `,
    {
      reportId,
      meta: JSON.stringify({
        Account,
        CurrentVersion,
        Domain,
        EndOfJson,
        ExecutedAt,
        LatestVersion,
        TenantId,
        TenantInfo,
        TenantName,
        TestResultSummary
      })
    }
  );
  await connection.run(
    `
      insert into zta_report_extra (report_id, data)
      values ($reportId, $extra::json)
    `,
    {
      reportId,
      extra: JSON.stringify(extra)
    }
  );
}
