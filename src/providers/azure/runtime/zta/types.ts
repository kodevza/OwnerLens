import type { ZtaReportMeta, ZtaReportTest } from "../../../../core/azure/ztaReport";

export type ZeroTrustAssessmentReport = ZtaReportMeta & {
  Tests: ZeroTrustAssessmentTest[];
};

export type ZeroTrustAssessmentTest = ZtaReportTest;
