import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";

import type { ZtaRelatedObject, ZtaRemediationSummary } from "../../../../core/azure/ztaReport";
import type { ZeroTrustAssessmentTest } from "./types";

export async function insertZeroTrustAssessmentTestRows(
  connection: DuckDBConnection,
  reportId: string,
  tests: ZeroTrustAssessmentTest[]
): Promise<void> {
  const servicePrincipalRelatedObjectIds = await readServicePrincipalRelatedObjectIds(connection);

  for (const [ordinal, originalTest] of tests.entries()) {
    const enrichedTest = enrichRelatedObjectsWithServicePrincipalIds(originalTest, servicePrincipalRelatedObjectIds);
    const test = normalizeZeroTrustAssessmentRiskFields(enrichedTest);

    await connection.run(
      `insert into zta_tests values (
        $reportId,
        $ordinal,
        $testId,
        $title,
        $pillar,
        $status,
        $risk,
        $impact,
        $implementationCost,
        $category,
        $sfiPillar,
        $skippedReason,
        $skippedCode,
        $minimumLicense::json,
        $appliesTo::json,
        $tags::json,
        $relatedObjects::json,
        $result,
        $description,
        $data::json
      )`,
      {
        reportId,
        ordinal,
        testId: toNullableString(test.TestId) ?? String(ordinal),
        title: test.TestTitle ?? null,
        pillar: test.TestPillar ?? null,
        status: test.TestStatus ?? null,
        risk: test.TestRisk ?? null,
        impact: test.TestImpact ?? null,
        implementationCost: test.TestImplementationCost ?? null,
        category: test.TestCategory ?? null,
        sfiPillar: test.TestSfiPillar ?? null,
        skippedReason: test.SkippedReason ?? null,
        skippedCode: test.TestSkipped ?? null,
        minimumLicense: JSON.stringify(toJsonArray(test.TestMinimumLicense)),
        appliesTo: JSON.stringify(toJsonArray(test.TestAppliesTo)),
        tags: JSON.stringify(toJsonArray(test.TestTags)),
        relatedObjects: JSON.stringify(test.RelatedObjects ?? []),
        result: test.TestResult ?? null,
        description: test.TestDescription ?? null,
        data: JSON.stringify(test)
      }
    );
  }
}

export async function insertZeroTrustAssessmentRelatedObjectRows(
  connection: DuckDBConnection,
  reportId: string,
  tests: ZeroTrustAssessmentTest[]
): Promise<void> {
  const servicePrincipalRelatedObjectIds = await readServicePrincipalRelatedObjectIds(connection);

  for (const [testOrdinal, test] of tests.entries()) {
    const relatedObjectIds = getRelatedObjectIds(
      enrichRelatedObjectsWithServicePrincipalIds(test, servicePrincipalRelatedObjectIds)
    );

    for (const relatedObjectId of relatedObjectIds) {
      await connection.run(
        `insert into zta_test_related_objects values (
          $reportId,
          $testOrdinal,
          $relatedObjectId
        )`,
        {
          reportId,
          testOrdinal,
          relatedObjectId
        }
      );
    }
  }
}

export async function readZeroTrustAssessmentTestRows(
  connection: DuckDBConnection,
  reportId: string
): Promise<ZeroTrustAssessmentTest[]> {
  const rows = await readRows<{ data: string }>(
    connection,
    "select data from zta_tests where report_id = $reportId order by ordinal",
    { reportId }
  );

  return rows.map((row) => JSON.parse(row.data) as ZeroTrustAssessmentTest);
}

export async function readZeroTrustAssessmentRemediationSummaries(
  connection: DuckDBConnection
): Promise<Map<string, ZtaRemediationSummary>> {
  const rows = await readRows<{
    related_object_id: string;
    remediation_count_all: number;
    remediation_failed_count: number;
    max_risk_rank: number;
  }>(
    connection,
    `
      with latest_report as (
        select id
        from zta_report
        order by executed_at desc nulls last, imported_at desc
        limit 1
      ),
      related_tests as (
        select distinct
          lower(related.related_object_id) as related_object_id,
          related.test_ordinal,
          lower(coalesce(test.status, '')) as status,
          case lower(coalesce(test.risk, ''))
            when 'high' then 3
            when 'medium' then 2
            when 'low' then 1
            else 0
          end as risk_rank
        from zta_test_related_objects related
        join latest_report latest
          on latest.id = related.report_id
        join zta_tests test
          on test.report_id = related.report_id
          and test.ordinal = related.test_ordinal
      ),
      resolved_related_tests as (
        select
          lower(service_principal.id) as principal_id,
          related_tests.test_ordinal,
          related_tests.status,
          related_tests.risk_rank
        from related_tests
        join entra_service_principals service_principal
          on lower(service_principal.id) = related_tests.related_object_id
        union
        select
          lower(service_principal.id) as principal_id,
          related_tests.test_ordinal,
          related_tests.status,
          related_tests.risk_rank
        from related_tests
        join entra_applications application
          on lower(application.id) = related_tests.related_object_id
        join entra_service_principals service_principal
          on lower(service_principal.app_id) = lower(application.app_id)
      )
      select
        principal_id as related_object_id,
        count(*) as remediation_count_all,
        sum(case when status = 'failed' then 1 else 0 end) as remediation_failed_count,
        max(risk_rank) as max_risk_rank
      from resolved_related_tests
      group by principal_id
    `
  );

  return new Map(
    rows.map((row) => [
      row.related_object_id,
      {
        ztaRemediationCountAll: Number(row.remediation_count_all),
        ztaRemediationFailedCount: Number(row.remediation_failed_count),
        ztaMaxRisk: toRiskLevel(Number(row.max_risk_rank))
      }
    ])
  );
}

async function readRows<Row extends Record<string, unknown>>(
  connection: DuckDBConnection,
  sql: string,
  params?: Record<string, DuckDBValue>
): Promise<Row[]> {
  const reader = await connection.runAndReadAll(sql, params);
  return reader.getRowObjectsJson() as Row[];
}

type ServicePrincipalRelatedObjectIds = {
  servicePrincipalId: string;
  applicationId: string | null;
  tags: string[];
};

async function readServicePrincipalRelatedObjectIds(
  connection: DuckDBConnection
): Promise<Map<string, ServicePrincipalRelatedObjectIds>> {
  const rows = await readRows<{ service_principal_id: string; application_id: string | null; tags: string | null }>(
    connection,
    `
      select
        lower(service_principal.id) as service_principal_id,
        application.id as application_id,
        service_principal.tags
      from entra_service_principals service_principal
      left join entra_applications application
        on lower(application.app_id) = lower(service_principal.app_id)
    `
  );

  const relatedObjectIds = new Map<string, ServicePrincipalRelatedObjectIds>();

  for (const row of rows) {
    const value = {
      servicePrincipalId: row.service_principal_id,
      applicationId: row.application_id,
      tags: parseJsonArray<string>(row.tags)
    };
    relatedObjectIds.set(row.service_principal_id, value);

    if (row.application_id) {
      relatedObjectIds.set(row.application_id.toLowerCase(), value);
    }
  }

  return relatedObjectIds;
}

function enrichRelatedObjectsWithServicePrincipalIds(
  test: ZeroTrustAssessmentTest,
  servicePrincipalRelatedObjectIds: Map<string, ServicePrincipalRelatedObjectIds>
): ZeroTrustAssessmentTest {
  if (!servicePrincipalRelatedObjectIds.size || !test.RelatedObjects?.length) {
    return test;
  }

  const relatedObjects = test.RelatedObjects.map((relatedObject) => {
    if (!relatedObject || typeof relatedObject !== "object" || Array.isArray(relatedObject)) {
      return relatedObject;
    }

    const ids = resolveRelatedObjectIds(relatedObject, servicePrincipalRelatedObjectIds);
    return ids === undefined
      ? relatedObject
      : {
          ...relatedObject,
          servicePrincipalId: ids.servicePrincipalId,
          tags: ids.tags,
          applicationId: ids.applicationId
        };
  });

  return {
    ...test,
    RelatedObjects: relatedObjects
  };
}

function resolveRelatedObjectIds(
  relatedObject: ZtaRelatedObject,
  servicePrincipalRelatedObjectIds: Map<string, ServicePrincipalRelatedObjectIds>
): ServicePrincipalRelatedObjectIds | undefined {
  for (const id of [
    toNullableString(relatedObject.servicePrincipalId),
    toNullableString(relatedObject.object_id),
    toNullableString(relatedObject.id),
    toNullableString(relatedObject.applicationId)
  ]) {
    const ids = id ? servicePrincipalRelatedObjectIds.get(id.toLowerCase()) : undefined;
    if (ids !== undefined) {
      return ids;
    }
  }

  return undefined;
}

function toJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null || value === "" ? [] : [value];
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function toNullableString(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

function normalizeZeroTrustAssessmentRiskFields(test: ZeroTrustAssessmentTest): ZeroTrustAssessmentTest {
  return {
    ...test,
    TestImpact: normalizeRiskLevel(test.TestImpact),
    TestRisk: normalizeRiskLevel(test.TestRisk)
  };
}

function normalizeRiskLevel(value: string | null | undefined): string | null | undefined {
  if (value == null) {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "high" || normalized === "medium" || normalized === "low" || normalized === "none"
    ? normalized
    : value;
}

function getRelatedObjectIds(test: ZeroTrustAssessmentTest): string[] {
  const ids = new Set<string>();

  for (const relatedObject of test.RelatedObjects ?? []) {
    if (!relatedObject || typeof relatedObject !== "object" || Array.isArray(relatedObject)) {
      continue;
    }

    for (const id of [
      toNullableString(relatedObject.object_id),
      toNullableString(relatedObject.id),
      toNullableString(relatedObject.servicePrincipalId),
      toNullableString(relatedObject.applicationId)
    ]) {
      if (id) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}

function toRiskLevel(rank: number): ZtaRemediationSummary["ztaMaxRisk"] {
  if (rank >= 3) {
    return "high";
  }

  if (rank === 2) {
    return "medium";
  }

  if (rank === 1) {
    return "low";
  }

  return "none";
}
