import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type {
  ZtaRelatedObject,
  ZtaRemediationSummary,
  ZtaReport,
  ZtaReportTest
} from "../../../../core/azure/ztaReport";
import type { CreateRemediationPackageInput } from "../../../../core/runtime/remediation";

import {
  applyRuntimeCollectionFilters,
  buildPaginatedCollection,
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions
} from "../localReportCollections";
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

  async buildRemediationPackageInput({
    filters,
    selectedRowKeys
  }: {
    filters: LocalReportCollectionFilter[];
    selectedRowKeys: string[];
  }): Promise<CreateRemediationPackageInput> {
    const { tests } = await this.readFilteredReportTests(filters);

    return buildZtaRemediationPackageInput({
      filters,
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
    relatedObjectFilters: filters.filter((filter) => filter.column === "RelatedObjects"),
    remainingFilters: filters.filter((filter) => filter.column !== "RelatedObjects")
  };
}

function applyRelatedObjectFilters(
  tests: ZtaReportTest[],
  filters: LocalReportCollectionFilter[]
): ZtaReportTest[] {
  const activeFilters = filters
    .map((filter) => filter.values.map((value) => value.trim()).filter(Boolean))
    .filter((values) => values.length > 0);

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

function matchesRelatedObjectFilters(relatedObject: ZtaRelatedObject, filters: string[][]): boolean {
  const searchableValue = formatRelatedObjectsSearchValue([relatedObject]).toLocaleLowerCase();
  return filters.every((values) => values.some((value) => searchableValue.includes(value.toLocaleLowerCase())));
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
