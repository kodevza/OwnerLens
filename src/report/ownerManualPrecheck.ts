import type { ReportCsvRow, ReportExportArtifact, ReportExportFormat } from "./reportTypes";
import type { OwnerEvidence, OwnerReport, OwnerReportRow } from "./types";

export type DisabledOwnerKey = string;

function getOwnerRowKey(row: Pick<OwnerReportRow, "targetKey">): string {
  return row.targetKey;
}

export function getOwnerEvidenceKey(
  row: Pick<OwnerReportRow, "targetKey">,
  evidence: Pick<OwnerEvidence, "user" | "date">
): DisabledOwnerKey {
  return [getOwnerRowKey(row), normalizeEvidencePart(evidence.user), evidence.date ?? ""].join(":");
}

function isActivityOwnerRow(row: Pick<OwnerReportRow, "source">): boolean {
  return row.source.startsWith("activity.");
}

export function disableOwnerCandidate(disabledKeys: ReadonlySet<DisabledOwnerKey>, key: DisabledOwnerKey): Set<DisabledOwnerKey> {
  return new Set([...disabledKeys, key]);
}

export function enableOwnerCandidate(disabledKeys: ReadonlySet<DisabledOwnerKey>, key: DisabledOwnerKey): Set<DisabledOwnerKey> {
  const next = new Set(disabledKeys);
  next.delete(key);
  return next;
}

export function applyOwnerManualPrecheck(report: OwnerReport, disabledKeys: ReadonlySet<DisabledOwnerKey>): OwnerReport {
  return {
    ...report,
    owners: report.owners.map((row) => applyOwnerManualPrecheckToRow(row, disabledKeys))
  };
}

export function buildOwnerManualPrecheckExport(report: OwnerReport): OwnerReport {
  return {
    ...report,
    owners: report.owners.map((row) => {
      const activeEvidence = row.evidence.filter((entry) => !entry.disabled);

      if (isActivityOwnerRow(row) && activeEvidence.length === 0) {
        return {
          ...row,
          owner: null,
          confidence: "none",
          evidence: row.evidence
        };
      }

      return row;
    })
  };
}

export function buildOwnerManualPrecheckExportArtifact(
  report: OwnerReport,
  format: ReportExportFormat,
  fileBaseName: string
): ReportExportArtifact {
  const exportableReport = buildOwnerManualPrecheckExport(report);

  if (format === "csv") {
    return {
      kind: "csv",
      fileName: `${fileBaseName}.csv`,
      rows: buildOwnerCsvRows(exportableReport.owners)
    };
  }

  return {
    kind: "json",
    fileName: `${fileBaseName}.json`,
    data: exportableReport
  };
}

function applyOwnerManualPrecheckToRow(
  row: OwnerReportRow,
  disabledKeys: ReadonlySet<DisabledOwnerKey>
): OwnerReportRow {
  if (!isActivityOwnerRow(row)) {
    return row;
  }

  const evidence = row.evidence.map((entry) => ({
    ...entry,
    disabled: isDefaultDisabledOwnerEvidence(entry) || disabledKeys.has(getOwnerEvidenceKey(row, entry)) || undefined
  }));
  const activeEvidence = evidence.filter((entry) => !entry.disabled);

  if (activeEvidence.length === 0) {
    return {
      ...row,
      owner: null,
      confidence: "none",
      evidence
    };
  }

  return {
    ...row,
    owner: activeEvidence[0].user,
    confidence: "low",
    evidence
  };
}

function normalizeEvidencePart(value: string): string {
  return value.trim().toLowerCase();
}

function isDefaultDisabledOwnerEvidence(evidence: Pick<OwnerEvidence, "user">): boolean {
  return !evidence.user.includes("@");
}

function buildOwnerCsvRows(rows: OwnerReportRow[]): ReportCsvRow[] {
  return rows.map((row) => ({
    kind: row.kind,
    subscriptionId: row.subscriptionId,
    subscriptionName: row.subscriptionName,
    resourceGroup: row.resourceGroup,
    owner: row.owner,
    confidence: row.confidence,
    source: row.source,
    evidence: row.evidence
      .map((entry) => `${entry.user}${entry.date ? ` (${entry.date})` : ""}${entry.disabled ? " [disabled]" : ""}`)
      .join("; ")
  }));
}
