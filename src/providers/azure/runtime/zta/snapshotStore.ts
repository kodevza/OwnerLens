import { randomUUID } from "node:crypto";

import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import {
  insertZeroTrustAssessmentReport,
  importZeroTrustAssessmentMetadata
} from "./snapshotMetadataTable";
import {
  insertZeroTrustAssessmentRelatedObjectRows,
  insertZeroTrustAssessmentTestRows,
  readZeroTrustAssessmentTestRows
} from "./tables";
import type { ZeroTrustAssessmentReport } from "./types";

export const zeroTrustAssessmentReportFileName = "ZeroTrustAssessmentReport.json";

export type ZeroTrustAssessmentDuckDbImportStatus = {
  imported: boolean;
  fileName: string;
  reportId: string | null;
  testCount: number;
  importedAt: string | null;
};

export function createEmptyZeroTrustAssessmentImportStatus(): ZeroTrustAssessmentDuckDbImportStatus {
  return {
    imported: false,
    fileName: zeroTrustAssessmentReportFileName,
    reportId: null,
    testCount: 0,
    importedAt: null
  };
}

export async function importZeroTrustAssessmentReportToDuckDb(
  connection: DuckDBConnection,
  report: ZeroTrustAssessmentReport,
  fileName = zeroTrustAssessmentReportFileName
): Promise<ZeroTrustAssessmentDuckDbImportStatus> {
  await connection.run("begin transaction");
  try {
    const reportId = randomUUID();
    const importedAt = new Date().toISOString();

    await insertZeroTrustAssessmentReport(connection, reportId, report, fileName, importedAt);
    await importZeroTrustAssessmentMetadata(connection, reportId, report);
    await insertZeroTrustAssessmentTestRows(connection, reportId, report.Tests ?? []);
    await insertZeroTrustAssessmentRelatedObjectRows(connection, reportId, report.Tests ?? []);

    await connection.run("commit");
    return {
      imported: true,
      fileName,
      reportId,
      testCount: report.Tests?.length ?? 0,
      importedAt
    };
  } catch (error) {
    await connection.run("rollback");
    throw error;
  }
}

export async function readZeroTrustAssessmentReportFromDuckDb(
  connection: DuckDBConnection
): Promise<ZeroTrustAssessmentReport> {
  const reportRows = await readRows<{ id: string }>(
    connection,
    `
      select id
      from zta_report
      order by executed_at desc nulls last, imported_at desc
      limit 1
    `
  );
  const reportId = reportRows[0]?.id;

  if (!reportId) {
    return { Tests: [] };
  }

  const metaRows = await readRows<{ data: string }>(
    connection,
    "select data from zta_report_meta where report_id = $reportId limit 1",
    { reportId }
  );
  const extraRows = await readRows<{ data: string }>(
    connection,
    "select data from zta_report_extra where report_id = $reportId limit 1",
    { reportId }
  );

  return {
    ...parseJsonObject(extraRows[0]?.data),
    ...parseJsonObject(metaRows[0]?.data),
    Tests: await readZeroTrustAssessmentTestRows(connection, reportId)
  };
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  return value ? JSON.parse(value) : {};
}
