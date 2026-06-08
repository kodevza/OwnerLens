import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";

export function defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/zeroTrustAssessment/report`,
      handle: () => runtime.readZeroTrustAssessmentReport()
    }
  ];
}
