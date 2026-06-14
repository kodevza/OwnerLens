import { useCallback, useMemo, useState } from "react";

import type { RemediationPackage } from "../../core/runtime/remediation";
import type {
  ZtaRelatedObject,
  ZtaReportMeta,
  ZtaReportTest
} from "../../core/azure/ztaReport";
import { formatDate, formatValue } from "../../lib/utils";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import { Button } from "../../report/components/ui/button";
import { Card } from "../../report/components/ui/card";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import {
  createZeroTrustAssessmentRemediationPackage,
  readRemediationPackage,
  readZeroTrustAssessmentReport
} from "./api";
import {
  getRemediationPackageSearchValues,
  ZtaRemediationPackageBadges
} from "./ZtaRemediationPackageBadges";
import {
  getRelatedObjectsWithIds,
  getRelatedObjectSearchValues,
  RelatedObjectBadges,
  ztaRelatedObjectFieldFilter
} from "./ztaRelatedObjects";

type ZtaComponentProps = {
  initialFilters?: ColumnFilters;
  onRemediationPackageCreated?: (remediationPackage: RemediationPackage) => void;
  onRemediationPackageClick?: (remediationPackage: RemediationPackage) => void;
  onRelatedObjectClick?: (relatedObject: ZtaRelatedObject) => void;
};

type ZtaSelection = {
  filters: ColumnFilters;
  selectedRowKeys: string[];
};

const ztaStatusOptions = ["Completed", "Skipped", "Passed", "Failed"];
const ztaRiskOptions = ["High", "Medium", "Low", "None"];

const ztaTestFields: ReportFieldDescriptor<ZtaReportTest>[] = [
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
    filter: { kind: "multiSelect", options: ztaStatusOptions }
  },
  {
    id: "RelatedObjects",
    label: "Related objects",
    valueType: "list",
    getValue: getRelatedObjectSearchValues,
    filter: ztaRelatedObjectFieldFilter
  },
  {
    id: "TestRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (test) => test.TestRisk,
    filter: { kind: "multiSelect", options: ztaRiskOptions }
  },
  {
    id: "TestPillar",
    label: "Pillar",
    valueType: "text",
    getValue: (test) => test.TestPillar,
    filter: { kind: "text" }
  },
  {
    id: "TestCategory",
    label: "Category",
    valueType: "text",
    getValue: (test) => test.TestCategory,
    filter: { kind: "text" }
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
    id: "RemediationPackages",
    label: "Remediation packages",
    valueType: "list",
    getValue: getRemediationPackageSearchValues,
    filter: { kind: "text" }
  }
];

export function ZtaComponent({
  initialFilters,
  onRemediationPackageClick,
  onRemediationPackageCreated,
  onRelatedObjectClick
}: ZtaComponentProps = {}) {
  const [meta, setMeta] = useState<ZtaReportMeta | null>(null);
  const [testCount, setTestCount] = useState(0);
  const [createPackageState, setCreatePackageState] = useState<{
    status: "idle" | "creating" | "error";
    message?: string;
  }>({ status: "idle" });
  const [openPackageState, setOpenPackageState] = useState<{
    status: "idle" | "error";
    message?: string;
  }>({ status: "idle" });
  const openRemediationPackage = useCallback(
    async (packageId: string) => {
      try {
        const remediationPackage = await readRemediationPackage(packageId);

        setOpenPackageState({ status: "idle" });
        onRemediationPackageClick?.(remediationPackage);
      } catch (error) {
        setOpenPackageState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not open remediation package."
        });
      }
    },
    [onRemediationPackageClick]
  );
  const fieldRenderers = useMemo<ReportColumnRenderers<ZtaReportTest>>(
    () => ({
      RelatedObjects: (test) => (
        <RelatedObjectBadges objects={getRelatedObjectsWithIds(test)} onRelatedObjectClick={onRelatedObjectClick} />
      ),
      RemediationPackages: (test) => (
        <ZtaRemediationPackageBadges
          packages={test.RemediationPackages ?? []}
          onRemediationPackageClick={onRemediationPackageClick ? openRemediationPackage : undefined}
        />
      )
    }),
    [onRelatedObjectClick, onRemediationPackageClick, openRemediationPackage]
  );
  const loadPage = useCallback(
    async ({ filters, page, signal }: { filters: ColumnFilters; page: number; signal: AbortSignal }) => {
      const report = await readZeroTrustAssessmentReport({ filters, page, signal });
      const responsePage = report.page;
      const responsePageSize = report.pageSize;
      const rows = report.Tests ?? report.rows ?? [];

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
  const createRemediationPackage = useCallback(
    async ({ filters, selectedRowKeys }: ZtaSelection) => {
      setCreatePackageState({ status: "creating" });

      try {
        const createdPackage = await createZeroTrustAssessmentRemediationPackage({
          filters,
          selectedRowKeys
        });
        const remediationPackage = await readRemediationPackage(createdPackage.id);

        setCreatePackageState({ status: "idle" });
        onRemediationPackageCreated?.(remediationPackage);
      } catch (error) {
        setCreatePackageState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not create remediation package."
        });
      }
    },
    [onRemediationPackageCreated]
  );

  return (
    <section className="flex flex-col gap-4">
      {meta ? <ZtaMetaPanel meta={meta} testCount={testCount} /> : null}
      {openPackageState.status === "error" ? (
        <div className="text-sm text-destructive">{openPackageState.message}</div>
      ) : null}
      <SelectableGenericTable
        emptyMessage="No Zero Trust Assessment tests found."
        fields={ztaTestFields}
        fieldRenderers={fieldRenderers}
        getRowKey={(row) => formatValue(row.TestId)}
        getRowSelectionLabel={(row) => `Select Zero Trust Assessment test ${formatValue(row.TestId)}`}
        initialFilters={initialFilters}
        loadPage={loadPage}
        loadingMessage="Loading Zero Trust Assessment report..."
        minWidthClassName="min-w-[2200px]"
        renderSelectionOverlay={({ filters, selectedRowKeys }) => (
          <ZtaSelectionRemediationBar
            createPackageState={createPackageState}
            filters={filters}
            selectedRowKeys={selectedRowKeys}
            onCreateRemediationPackage={createRemediationPackage}
          />
        )}
      />
    </section>
  );
}

function ZtaSelectionRemediationBar({
  createPackageState,
  filters,
  selectedRowKeys,
  onCreateRemediationPackage
}: ZtaSelection & {
  createPackageState: {
    status: "idle" | "creating" | "error";
    message?: string;
  };
  onCreateRemediationPackage: (selection: ZtaSelection) => void;
}) {
  const isCreating = createPackageState.status === "creating";

  return (
    <div className="fixed bottom-0 left-0 z-50 flex h-[120px] w-full items-center justify-end gap-4 border-t bg-background/95 px-6 shadow-lg backdrop-blur">
      {createPackageState.status === "error" ? (
        <div className="max-w-xl text-sm text-destructive">{createPackageState.message}</div>
      ) : null}
      <Button
        aria-label={`Create remediation package from ${selectedRowKeys.length} selected Zero Trust Assessment tests`}
        disabled={isCreating}
        type="button"
        onClick={() => onCreateRemediationPackage({ filters, selectedRowKeys })}
      >
        {isCreating ? "Creating..." : "Create package"}
      </Button>
    </div>
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
