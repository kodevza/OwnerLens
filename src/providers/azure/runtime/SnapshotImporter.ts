import type { SnapshotImportStatus } from "../../../core/runtime/snapshotImportRegistry";
import { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";

export type SnapshotImportRuntime = {
  getStatus(): SnapshotImportStatus;
  importSnapshot(): Promise<void>;
};

export type SnapshotImporterOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  zeroTrustAssessment: SnapshotImportRuntime;
};

export type SnapshotImporterStatus = {
  entra: SnapshotImportStatus;
  azureResources: SnapshotImportStatus;
  zeroTrustAssessment: SnapshotImportStatus;
};

export class SnapshotImporter {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: SnapshotImportRuntime;

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
