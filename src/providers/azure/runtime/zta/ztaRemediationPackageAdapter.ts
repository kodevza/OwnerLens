import type { ZtaRelatedObject, ZtaReportTest } from "../../../../core/azure/ztaReport";
import type {
  CreateRemediationPackageInput,
  JsonValue,
  RemediationTask
} from "../../../../core/runtime/remediation";
import type { LocalReportCollectionFilter } from "../../../../core/runtime/collections";

type ZtaRemediationPackageInputOptions = {
  filters: LocalReportCollectionFilter[];
  selectAllMatchingFilters?: boolean;
  selectedRowKeys: string[];
  tests: ZtaReportTest[];
};

export function buildZtaRemediationPackageInput({
  filters,
  selectAllMatchingFilters,
  selectedRowKeys,
  tests
}: ZtaRemediationPackageInputOptions): CreateRemediationPackageInput {
  const selectedRowKeySet = new Set(selectedRowKeys);
  const selectedTests = tests
    .map((test, index) => ({ index, test }))
    .filter(({ test }) => selectAllMatchingFilters || selectedRowKeySet.has(getZtaTestRowKey(test)));

  return {
    sourceKind: "zeroTrustAssessment",
    sourceLabel: "Zero Trust Assessment",
    sourceQuery: toJsonValue({
      filters,
      ...(selectAllMatchingFilters === undefined ? {} : { selectAllMatchingFilters }),
      selectedRowKeys
    }),
    tasks: selectedTests.flatMap(({ index, test }) => buildZtaRemediationTasks(test, index))
  };
}

function buildZtaRemediationTasks(
  test: ZtaReportTest,
  selectedTestIndex: number
): Omit<RemediationTask, "id" | "packageId" | "createdAt" | "status">[] {
  const relatedObjectTasks = (test.RelatedObjects ?? []).flatMap((relatedObject, relatedObjectIndex) => {
    const relatedObjectId = getRelatedObjectId(relatedObject);

    if (!relatedObjectId) {
      return [];
    }

    return [
      {
        targetKind: relatedObject.servicePrincipalType ?? "relatedObject",
        targetId: relatedObjectId,
        targetLabel: getRelatedObjectLabel(relatedObject, relatedObjectId),
        title: formatZtaTaskTitle(test),
        risk: toNullableString(test.TestRisk),
        sourceEvidence: toJsonValue({
          sourceKind: "zeroTrustAssessment",
          testIndex: selectedTestIndex,
          relatedObjectIndex,
          test,
          relatedObject
        })
      }
    ];
  });

  return relatedObjectTasks.length > 0 ? relatedObjectTasks : [buildZtaFindingRemediationTask(test, selectedTestIndex)];
}

function buildZtaFindingRemediationTask(
  test: ZtaReportTest,
  selectedTestIndex: number
): Omit<RemediationTask, "id" | "packageId" | "createdAt" | "status"> {
  const rowKey = getZtaTestRowKey(test);
  const title = formatZtaTaskTitle(test);

  return {
    targetKind: "zeroTrustAssessmentTest",
    targetId: rowKey,
    targetLabel: title,
    title,
    risk: toNullableString(test.TestRisk),
    sourceEvidence: toJsonValue({
      sourceKind: "zeroTrustAssessment",
      testIndex: selectedTestIndex,
      test
    })
  };
}

function getZtaTestRowKey(test: ZtaReportTest): string {
  return formatRowKeyValue(test.TestId);
}

function formatZtaTaskTitle(test: ZtaReportTest): string {
  const title = toNullableString(test.TestTitle);

  if (title) {
    return title;
  }

  return `Zero Trust Assessment test ${formatRowKeyValue(test.TestId)}`;
}

function getRelatedObjectId(relatedObject: ZtaRelatedObject): string {
  return toNullableString(relatedObject.id) ?? toNullableString(relatedObject.object_id) ?? "";
}

function getRelatedObjectLabel(relatedObject: ZtaRelatedObject, fallback: string): string {
  return (
    toNullableString(relatedObject.displayName) ??
    toNullableString(relatedObject.userPrincipalName) ??
    toNullableString(relatedObject.servicePrincipalId) ??
    fallback
  );
}

function formatRowKeyValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatRowKeyValue).join(", ") : "[]";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
