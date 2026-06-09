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
    }
  ];
}
