import { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type { EntraDuckDbImportStatus } from "./entra/snapshotStore";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import type { AzureResourcesDuckDbImportStatus } from "./resources/snapshotStore";
import { LocalZeroTrustAssessmentReportRuntime } from "./zta/LocalZeroTrustAssessmentReportRuntime";
import type { ZeroTrustAssessmentDuckDbImportStatus } from "./zta/snapshotStore";

export type SnapshotImporterOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
};

export type SnapshotImporterStatus = {
  entra: EntraDuckDbImportStatus;
  azureResources: AzureResourcesDuckDbImportStatus;
  zeroTrustAssessment: ZeroTrustAssessmentDuckDbImportStatus;
};

export class SnapshotImporter {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;

  constructor(options: SnapshotImporterOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.zeroTrustAssessment = options.zeroTrustAssessment;
  }

  getStatus(): SnapshotImporterStatus {
    return {
      entra: this.entra.getStatus(),
      azureResources: this.azureResources.getStatus(),
      zeroTrustAssessment: this.zeroTrustAssessment.getStatus()
    };
  }

  async importSnapshots(): Promise<void> {
    await this.entra.importSnapshot();
    await this.azureResources.importSnapshot();
    await this.zeroTrustAssessment.importSnapshot();
  }
}
