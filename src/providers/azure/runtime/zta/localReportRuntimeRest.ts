import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { CreateRuntimeRemediationPackageRequest } from "../../../../core/runtime/remediation";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import {
  collectionQuerySchema,
  collectionResponseSchema,
  createRemediationPackageBodySchema,
  createRemediationPackageResponseSchema,
  emptyQuerySchema,
  runtimeRowSchema
} from "../../../../core/runtime/restSchemas";
import type { LocalReportRuntimeRestRuntime } from "../localReportRuntimeRestRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntimeRestRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      operationId: "queryZeroTrustAssessmentReport",
      tags: ["Zero Trust Assessment"],
      summary: "Query Zero Trust Assessment report rows with runtime table controls.",
      path: `${restBasePath}/zeroTrustAssessment/report`,
      producesCsv: true,
      querySchema: collectionQuerySchema,
      responseSchema: {
        allOf: [
          collectionResponseSchema("zeroTrustAssessment.report", runtimeRowSchema),
          {
            type: "object",
            required: ["Meta", "Tests"],
            properties: {
              Meta: {
                type: "object",
                additionalProperties: true
              },
              Tests: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true
                }
              }
            }
          }
        ]
      },
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportZeroTrustAssessmentReportCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryZeroTrustAssessmentReport(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "createZeroTrustAssessmentRemediationPackage",
      tags: ["Zero Trust Assessment", "Remediation"],
      summary: "Create a remediation package from Zero Trust Assessment selections.",
      method: "POST",
      path: `${restBasePath}/zeroTrustAssessment/remediationPackages`,
      parseJsonBody: true,
      statusCode: 201,
      querySchema: emptyQuerySchema,
      bodySchema: createRemediationPackageBodySchema,
      responseSchema: createRemediationPackageResponseSchema,
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
    selectAllMatchingFilters: body.selectAllMatchingFilters === true,
    selectedRowKeys: body.selectedRowKeys
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCsvRequest(url: URL): boolean {
  return url.searchParams.get("format")?.trim().toLowerCase() === "csv";
}
