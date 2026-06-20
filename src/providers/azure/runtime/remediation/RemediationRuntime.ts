import type { DuckDBConnection } from "@duckdb/node-api";

import type { ZtaReport, ZtaReportTest } from "../../../../core/azure/ztaReport";
import type { RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type {
  LocalReportCollectionQueryOptions,
  LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import { RemediationPackageStore } from "../../../../core/runtime/RemediationPackageStore";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest,
  RemediationPackage
} from "../../../../core/runtime/remediation";
import type { SnapshotImportStatus } from "../../../../core/runtime/snapshotImportRegistry";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import { LocalZeroTrustAssessmentReportRuntime } from "../zta/LocalZeroTrustAssessmentReportRuntime";
import { ZeroTrustAssessmentQueryService } from "../zta/ZeroTrustAssessmentQueryService";
import { RemediationPackageService } from "./RemediationPackageService";

export type RemediationRuntimeOptions = {
  dataDir: string;
  getConnection: () => DuckDBConnection;
  getEntraQueries: () => EntraCollectionQueryService;
};

export class RemediationRuntime {
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  private readonly remediationPackageService: RemediationPackageService;

  constructor(options: RemediationRuntimeOptions) {
    this.zeroTrustAssessment = new LocalZeroTrustAssessmentReportRuntime({
      dataDir: options.dataDir,
      getConnection: options.getConnection
    });
    this.zeroTrustAssessmentQueries = new ZeroTrustAssessmentQueryService({
      zeroTrustAssessment: this.zeroTrustAssessment
    });
    this.remediationPackageService = new RemediationPackageService({
      readServicePrincipalRemediationSummaries: (principalIds) =>
        options.getEntraQueries().readServicePrincipalRemediationSummaries(principalIds),
      remediationPackageStore: new RemediationPackageStore(options.getConnection),
      zeroTrustAssessmentQueries: this.zeroTrustAssessmentQueries
    });
  }

  getStatus(): SnapshotImportStatus {
    return this.zeroTrustAssessment.getStatus();
  }

  importSnapshot(): Promise<void> {
    return this.zeroTrustAssessment.importSnapshot();
  }

  async readZeroTrustAssessmentReport(): Promise<ZtaReport> {
    return this.zeroTrustAssessmentQueries.readReport();
  }

  async queryZeroTrustAssessmentReport(
    options: LocalReportCollectionQueryOptions
  ): Promise<
    LocalReportPaginatedCollection<"zeroTrustAssessment.report"> & Pick<ZtaReport, "Meta"> & { Tests: ZtaReportTest[] }
  > {
    return this.zeroTrustAssessmentQueries.queryReport(options);
  }

  async exportZeroTrustAssessmentReportCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"zeroTrustAssessment.report">> {
    return this.zeroTrustAssessmentQueries.exportReportCsv(options);
  }

  async createZeroTrustAssessmentRemediationPackage(
    request: CreateRuntimeRemediationPackageRequest
  ): Promise<RemediationPackage> {
    return this.remediationPackageService.createZeroTrustAssessmentRemediationPackage(request);
  }

  async readRemediationPackage(packageId: string): Promise<RemediationPackage> {
    return this.remediationPackageService.readRemediationPackage(packageId);
  }

  async exportRemediationPackageTasksCsv(
    packageId: string,
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"remediationPackage.tasks">> {
    return this.remediationPackageService.exportRemediationPackageTasksCsv(packageId, options);
  }

  async deleteRemediationTasks(request: DeleteRuntimeRemediationTasksRequest): Promise<RemediationPackage> {
    return this.remediationPackageService.deleteRemediationTasks(request);
  }

  readRemediationSummaries(): ReturnType<ZeroTrustAssessmentQueryService["readRemediationSummaries"]> {
    return this.zeroTrustAssessmentQueries.readRemediationSummaries();
  }

  readRemediationPackageSummariesByPrincipalId(): ReturnType<
    ZeroTrustAssessmentQueryService["readRemediationPackageSummariesByPrincipalId"]
  > {
    return this.zeroTrustAssessmentQueries.readRemediationPackageSummariesByPrincipalId();
  }
}
