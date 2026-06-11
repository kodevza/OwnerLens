import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type {
  ZtaRelatedObject,
  ZtaRemediationSummary,
  ZtaReport,
  ZtaReportTest
} from "../../../../core/azure/ztaReport";

import {
  buildPaginatedCollection,
  type LocalReportCollectionFilter,
  type LocalReportCollectionQueryOptions
} from "../localReportCollections";
import type { LocalZeroTrustAssessmentReportRuntime } from "./LocalZeroTrustAssessmentReportRuntime";

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
    const report = await this.readReport();
    const { relatedObjectFilters, remainingFilters } = splitRelatedObjectFilters(options.filters ?? []);
    const tests = applyRelatedObjectFilters(report.Tests ?? [], relatedObjectFilters);
    const collection = buildPaginatedCollection(
      "zeroTrustAssessment.report",
      tests as Record<string, unknown>[],
      { ...options, filters: remainingFilters }
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
