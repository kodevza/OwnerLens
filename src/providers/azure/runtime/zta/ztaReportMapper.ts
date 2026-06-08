import type { ZtaReport } from "../../../../core/azure/ztaReport";

import type { ZeroTrustAssessmentReport } from "./types";

export function toZtaReport(report: ZeroTrustAssessmentReport): ZtaReport {
  const { Tests, ...Meta } = report;

  return {
    Meta,
    Tests: Tests ?? []
  };
}
