import type { PermissionRiskLevel } from "../risk/types";

export type ZtaReport = {
  Meta: ZtaReportMeta;
  Tests: ZtaReportTest[];
};

export type ZtaRemediationSummary = {
  ztaRemediationCountAll: number;
  ztaRemediationFailedCount: number;
  ztaMaxRisk: PermissionRiskLevel;
};

export type ZtaRemediationPackageSummary = {
  id: string;
  createdAt: string;
  taskCount: number;
};

export type ZtaReportMeta = {
  Account?: string | null;
  CurrentVersion?: string | null;
  Domain?: string | null;
  EndOfJson?: boolean | null;
  ExecutedAt?: string | null;
  LatestVersion?: string | null;
  TenantId?: string | null;
  TenantInfo?: Record<string, unknown> | null;
  TenantName?: string | null;
  TestResultSummary?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ZtaRelatedObject = {
  id?: string | null;
  object_id?: string | null;
  servicePrincipalId?: string | null;
  tags?: string[] | null;
  applicationId?: string | null;
  displayName?: string | null;
  servicePrincipalType?: string | null;
  userPrincipalName?: string | null;
};

export type ZtaReportTest = {
  TestId?: string | number | null;
  TestTitle?: string | null;
  TestPillar?: string | null;
  SkippedReason?: string | null;
  TestImpact?: string | null;
  TestImplementationCost?: string | null;
  TestMinimumLicense?: string | string[] | null;
  TestStatus?: string | null;
  TestResult?: string | null;
  TestTags?: string[] | null;
  TestSkipped?: string | null;
  TestDescription?: string | null;
  TestCategory?: string | null;
  TestRisk?: string | null;
  TestSfiPillar?: string | null;
  TestAppliesTo?: string[] | null;
  RelatedObjects?: ZtaRelatedObject[] | null;
  RemediationPackages?: ZtaRemediationPackageSummary[] | null;
  [key: string]: unknown;
};
