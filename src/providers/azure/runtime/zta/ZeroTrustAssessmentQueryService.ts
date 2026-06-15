import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type {
  ZtaRelatedObject,
  ZtaRemediationPackageSummary,
  ZtaRemediationSummary,
  ZtaReport,
  ZtaReportTest
} from "../../../../core/azure/ztaReport";
import type { CreateRemediationPackageInput } from "../../../../core/runtime/remediation";
import { matchesSearchExpression } from "../../../../core/searchFilterUtils";

import {
  applyRuntimeCollectionFilters,
  buildPaginatedCollection,
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions
} from "../../../../core/runtime/collections";
import { buildRuntimeCollectionCsvExport, type RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { LocalZeroTrustAssessmentReportRuntime } from "./LocalZeroTrustAssessmentReportRuntime";
import { buildZtaRemediationPackageInput } from "./ztaRemediationPackageAdapter";

export type LocalZeroTrustAssessmentReportCollectionId = "zeroTrustAssessment.report";

export type ZeroTrustAssessmentQueryServiceOptions = {
  zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
};

export class ZeroTrustAssessmentQueryService {
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;

  constructor(options: ZeroTrustAssessmentQueryServiceOptions) {
    this.zeroTrustAssessment = options.zeroTrustAssessment;
  }

  async readReport(): Promise<ZtaReport> {
    return this.zeroTrustAssessment.readReport();
  }

  async queryReport(options: LocalReportCollectionQueryOptions) {
    const { report, tests } = await this.readFilteredReportTests(options.filters ?? []);
    const collection = buildPaginatedCollection(
      "zeroTrustAssessment.report",
      tests as Record<string, unknown>[],
      { ...options, filters: [] }
    );

    return {
      ...collection,
      Meta: report.Meta,
      Tests: collection.rows as ZtaReportTest[]
    };
  }

  async exportReportCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"zeroTrustAssessment.report">> {
    const { tests } = await this.readFilteredReportTests(options.filters ?? []);

    return buildRuntimeCollectionCsvExport({
      collectionId: "zeroTrustAssessment.report",
      fileName: "ownerlens-zero-trust-assessment.csv",
      rows: tests as Record<string, unknown>[],
      sortRules: options.sortRules,
      includeBom: true
    });
  }

  async readRemediationSummaries(): Promise<Map<string, ZtaRemediationSummary>> {
    try {
      return await this.zeroTrustAssessment.readRemediationSummaries();
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return new Map();
      }

      throw error;
    }
  }

  async readRemediationPackageSummariesByPrincipalId(): Promise<Map<string, ZtaRemediationPackageSummary[]>> {
    try {
      return await this.zeroTrustAssessment.readRemediationPackageSummariesByPrincipalId();
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return new Map();
      }

      throw error;
    }
  }

  async buildRemediationPackageInput({
    filters,
    selectAllMatchingFilters,
    selectedRowKeys
  }: {
    filters: LocalReportCollectionFilter[];
    selectAllMatchingFilters?: boolean;
    selectedRowKeys: string[];
  }): Promise<CreateRemediationPackageInput> {
    const { tests } = await this.readFilteredReportTests(filters);

    return buildZtaRemediationPackageInput({
      filters,
      selectAllMatchingFilters,
      selectedRowKeys,
      tests: tests.map(stripRuntimeRemediationPackages)
    });
  }

  private async readFilteredReportTests(filters: LocalReportCollectionFilter[]): Promise<{
    report: ZtaReport;
    tests: ZtaReportTest[];
  }> {
    const report = await this.readReport();
    const testsWithRemediationPackages = await this.enrichWithRemediationPackageSummaries(report.Tests ?? []);
    const { relatedObjectFilters, remainingFilters } = splitRelatedObjectFilters(filters);
    const tests = applyRelatedObjectFilters(testsWithRemediationPackages, relatedObjectFilters);
    const columns = buildCollectionColumns(tests as Record<string, unknown>[]);

    return {
      report,
      tests: applyRuntimeCollectionFilters(
        tests as Record<string, unknown>[],
        columns,
        remainingFilters
      ) as ZtaReportTest[]
    };
  }

  private async enrichWithRemediationPackageSummaries(tests: ZtaReportTest[]): Promise<ZtaReportTest[]> {
    const summariesByTestId = await this.zeroTrustAssessment.readRemediationPackageSummariesByTestId();

    if (summariesByTestId.size === 0) {
      return tests;
    }

    return tests.map((test) => {
      const summaries = summariesByTestId.get(formatZtaTestId(test.TestId));

      return summaries ? { ...test, RemediationPackages: summaries } : test;
    });
  }
}

function buildCollectionColumns(rows: Record<string, unknown>[]): string[] {
  const columns = new Set<string>();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }

  return [...columns];
}

function splitRelatedObjectFilters(filters: LocalReportCollectionFilter[]): {
  relatedObjectFilters: LocalReportCollectionFilter[];
  remainingFilters: LocalReportCollectionFilter[];
} {
  return {
    relatedObjectFilters: filters.filter(isRelatedObjectFilter),
    remainingFilters: filters.filter((filter) => !isRelatedObjectFilter(filter))
  };
}

function isRelatedObjectFilter(filter: LocalReportCollectionFilter): boolean {
  return filter.column === "RelatedObjects" || filter.column.startsWith("RelatedObjects.");
}

function applyRelatedObjectFilters(
  tests: ZtaReportTest[],
  filters: LocalReportCollectionFilter[]
): ZtaReportTest[] {
  const activeFilters = filters
    .map((filter) => ({
      column: filter.column,
      values: filter.values.map((value) => value.trim()).filter(Boolean)
    }))
    .filter((filter) => filter.values.length > 0);

  if (activeFilters.length === 0) {
    return tests;
  }

  return tests.flatMap((test) => {
    const relatedObjects = test.RelatedObjects ?? [];
    const matchingRelatedObjects = relatedObjects.filter((relatedObject) =>
      matchesRelatedObjectFilters(relatedObject, activeFilters)
    );

    if (matchingRelatedObjects.length === 0) {
      return [];
    }

    return [
      {
        ...test,
        RelatedObjects: matchingRelatedObjects
      }
    ];
  });
}

function formatRelatedObjectsSearchValue(relatedObjects: ZtaRelatedObject[]): string {
  return relatedObjects
    .flatMap((relatedObject) => [
      relatedObject.servicePrincipalId,
      ...(relatedObject.tags ?? []),
      relatedObject.applicationId,
      relatedObject.id,
      relatedObject.displayName
    ])
    .filter(isNonEmptyString)
    .join(" ");
}

function matchesRelatedObjectFilters(
  relatedObject: ZtaRelatedObject,
  filters: LocalReportCollectionFilter[]
): boolean {
  return filters.every((filter) => {
    const pathSegments = getRelatedObjectFilterPathSegments(filter.column);
    const searchableValues =
      pathSegments.length === 0
        ? [formatRelatedObjectsSearchValue([relatedObject])]
        : getRelatedObjectFilterValues(relatedObject, pathSegments).map(formatRelatedObjectFilterValue);

    return filter.values.some((filterValue) =>
      searchableValues.some((searchableValue) => matchesSearchExpression(searchableValue, filterValue))
    );
  });
}

function getRelatedObjectFilterPathSegments(column: string): string[] {
  return column.split(".").slice(1).filter(Boolean);
}

function getRelatedObjectFilterValues(value: unknown, pathSegments: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => getRelatedObjectFilterValues(item, pathSegments));
  }

  if (pathSegments.length === 0) {
    return [value];
  }

  if (!isRecord(value)) {
    return [];
  }

  const [segment, ...remainingSegments] = pathSegments;
  return getRelatedObjectFilterValues(value[segment], remainingSegments);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatRelatedObjectFilterValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatZtaTestId(value: ZtaReportTest["TestId"]): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function stripRuntimeRemediationPackages(test: ZtaReportTest): ZtaReportTest {
  if (!Object.prototype.hasOwnProperty.call(test, "RemediationPackages")) {
    return test;
  }

  const sourceTest = { ...test };
  delete sourceTest.RemediationPackages;
  return sourceTest;
}
