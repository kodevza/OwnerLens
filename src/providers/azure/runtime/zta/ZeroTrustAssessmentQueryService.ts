import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { ZtaRemediationSummary, ZtaReport } from "../../../../core/azure/ztaReport";

import type { LocalZeroTrustAssessmentReportRuntime } from "./LocalZeroTrustAssessmentReportRuntime";

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
