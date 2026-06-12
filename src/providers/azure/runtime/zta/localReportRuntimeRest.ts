import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { CreateRuntimeRemediationPackageRequest } from "../../../../core/runtime/remediation";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/zeroTrustAssessment/report`,
      handle: ({ url }) => runtime.queryZeroTrustAssessmentReport(parseRuntimeCollectionQueryOptions(url))
    },
    {
      method: "POST",
      path: `${restBasePath}/zeroTrustAssessment/remediationPackages`,
      parseJsonBody: true,
      statusCode: 201,
      handle: async ({ body }) => {
        const remediationPackage = await runtime.createZeroTrustAssessmentRemediationPackage(parseCreateRequest(body));
        return { id: remediationPackage.id };
      }
    }
  ];
}

function parseCreateRequest(body: unknown): CreateRuntimeRemediationPackageRequest {
  if (!isRecord(body) || !isRecord(body.filters) || !Array.isArray(body.selectedRowKeys)) {
    throw new RuntimeHttpError("Invalid Zero Trust Assessment remediation package request.", 400);
  }

  return {
    filters: body.filters as CreateRuntimeRemediationPackageRequest["filters"],
    selectedRowKeys: body.selectedRowKeys
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
