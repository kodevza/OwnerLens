import { useCallback, useMemo, useState } from "react";

import type { ZtaRelatedObject, ZtaReportMeta, ZtaReportTest } from "../../core/azure/ztaReport";
import { formatDate, formatValue } from "../../lib/utils";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import { Badge } from "../../report/components/ui/badge";
import { Card } from "../../report/components/ui/card";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { readZeroTrustAssessmentReport } from "./api";

type ZtaTestRow = ZtaReportTest & {
  rowIndex: number;
};

type ZtaComponentProps = {
  initialFilters?: ColumnFilters;
  onRelatedObjectClick?: (relatedObject: ZtaRelatedObject) => void;
};

const ztaTestFields: ReportFieldDescriptor<ZtaTestRow>[] = [
  {
    id: "TestId",
    label: "Test ID",
    valueType: "text",
    getValue: (test) => test.TestId,
    filter: { kind: "text" }
  },
  {
    id: "TestTitle",
    label: "Title",
    valueType: "text",
    getValue: (test) => test.TestTitle,
    filter: { kind: "text" }
  },
  {
    id: "TestStatus",
    label: "Status",
    valueType: "text",
    getValue: (test) => test.TestStatus,
    filter: { kind: "multiSelect" }
  },
  {
    id: "RelatedObjects",
    label: "Related objects",
    valueType: "list",
    getValue: getRelatedObjectSearchValues,
    filter: { kind: "text" }
  },
  {
    id: "TestRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (test) => test.TestRisk,
    filter: { kind: "multiSelect" }
  },
  {
    id: "TestPillar",
    label: "Pillar",
    valueType: "text",
    getValue: (test) => test.TestPillar,
    filter: { kind: "multiSelect" }
  },
  {
    id: "TestCategory",
    label: "Category",
    valueType: "text",
    getValue: (test) => test.TestCategory,
    filter: { kind: "multiSelect" }
  },
  {
    id: "TestImpact",
    label: "Impact",
    valueType: "riskLevel",
    getValue: (test) => test.TestImpact,
    filter: { kind: "text" }
  },
  {
    id: "TestImplementationCost",
    label: "Implementation cost",
    valueType: "text",
    getValue: (test) => test.TestImplementationCost,
    filter: { kind: "text" }
  },
  {
    id: "TestMinimumLicense",
    label: "Minimum license",
    valueType: "list",
    getValue: (test) => test.TestMinimumLicense,
    filter: { kind: "text" }
  },
  {
    id: "TestTags",
    label: "Tags",
    valueType: "list",
    getValue: (test) => test.TestTags,
    filter: { kind: "text" }
  },
  {
    id: "SkippedReason",
    label: "Skipped reason",
    valueType: "text",
    getValue: (test) => test.SkippedReason,
    filter: { kind: "text" }
  }
];

export function ZtaComponent({ initialFilters, onRelatedObjectClick }: ZtaComponentProps = {}) {
  const [meta, setMeta] = useState<ZtaReportMeta | null>(null);
  const [testCount, setTestCount] = useState(0);
  const fieldRenderers = useMemo<ReportColumnRenderers<ZtaTestRow>>(
    () => ({
      RelatedObjects: (test) => (
        <RelatedObjectBadges objects={getRelatedObjectsWithIds(test)} onRelatedObjectClick={onRelatedObjectClick} />
      )
    }),
    [onRelatedObjectClick]
  );
  const loadPage = useCallback(
    async ({ filters, page, signal }: { filters: ColumnFilters; page: number; signal: AbortSignal }) => {
      const report = await readZeroTrustAssessmentReport({ filters, page, signal });
      const responsePage = report.page;
      const responsePageSize = report.pageSize;
      const rows = (report.Tests ?? report.rows ?? []).map((test, rowIndex) => ({
        ...test,
        rowIndex: (responsePage - 1) * responsePageSize + rowIndex
      }));

      setMeta(report.Meta);
      setTestCount(report.count);

      return {
        rows,
        page: responsePage,
        pageSize: responsePageSize,
        count: report.count
      };
    },
    []
  );

  return (
    <section className="flex flex-col gap-4">
      {meta ? <ZtaMetaPanel meta={meta} testCount={testCount} /> : null}
      <GenericTable
        emptyMessage="No Zero Trust Assessment tests found."
        fields={ztaTestFields}
        fieldRenderers={fieldRenderers}
        getRowKey={(row) => `${formatValue(row.TestId)}:${row.rowIndex}`}
        initialFilters={initialFilters}
        loadPage={loadPage}
        loadingMessage="Loading Zero Trust Assessment report..."
        minWidthClassName="min-w-[2200px]"
      />
    </section>
  );
}

function ZtaMetaPanel({ meta, testCount }: { meta: ZtaReportMeta; testCount: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <SummaryCard label="Tenant" value={meta.TenantName ?? meta.TenantId} />
      <SummaryCard label="Executed" value={formatDate(meta.ExecutedAt)} />
      <SummaryCard label="Tests" value={testCount} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: unknown }) {
  return (
    <Card className="flex min-h-24 flex-col gap-2 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="[overflow-wrap:anywhere] text-xl leading-tight">{formatValue(value)}</strong>
    </Card>
  );
}

function RelatedObjectBadges({
  objects,
  onRelatedObjectClick
}: {
  objects: ZtaRelatedObject[];
  onRelatedObjectClick?: (relatedObject: ZtaRelatedObject) => void;
}) {
  if (objects.length === 0) {
    return formatValue(null);
  }

  return (
    <div className="flex max-w-96 flex-wrap gap-1">
      {objects.map((object) => {
        const id = getRelatedObjectId(object);
        const title = object.servicePrincipalType ? `${id} (${object.servicePrincipalType})` : id;

        if (!onRelatedObjectClick) {
          return (
            <Badge key={id} className="max-w-full font-mono font-medium" title={title} variant="outline">
              <span className="truncate">{id}</span>
            </Badge>
          );
        }

        return (
          <button
            key={id}
            aria-label={`Open related object ${id}`}
            className="inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={title}
            type="button"
            onClick={() => onRelatedObjectClick(object)}
          >
            <span className="truncate">{id}</span>
          </button>
        );
      })}
    </div>
  );
}

function getRelatedObjectSearchValues(test: ZtaReportTest): string[] {
  return getRelatedObjectsWithIds(test).flatMap(getRelatedObjectSearchValuesForObject);
}

function getRelatedObjectSearchValuesForObject(object: ZtaRelatedObject): string[] {
  return [
    object.id,
    object.object_id,
    object.applicationId,
    object.displayName,
    object.servicePrincipalType,
    object.userPrincipalName,
    ...(object.tags ?? [])
  ].filter(isNonEmptyString);
}

function getRelatedObjectsWithIds(test: ZtaReportTest): ZtaRelatedObject[] {
  return (test.RelatedObjects ?? []).filter((object): object is ZtaRelatedObject & ({ id: string } | { object_id: string }) =>
    isNonEmptyString(getRelatedObjectId(object))
  );
}

function getRelatedObjectId(object: ZtaRelatedObject): string {
  return object.id ?? object.object_id ?? "";
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
