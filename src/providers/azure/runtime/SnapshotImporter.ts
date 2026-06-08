import { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type { EntraDuckDbImportStatus } from "./entra/snapshotStore";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import type { AzureResourcesDuckDbImportStatus } from "./resources/snapshotStore";

export type SnapshotImporterOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
};

export type SnapshotImporterStatus = {
  entra: EntraDuckDbImportStatus;
  azureResources: AzureResourcesDuckDbImportStatus;
};

export class SnapshotImporter {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;

  constructor(options: SnapshotImporterOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
  }

  getStatus(): SnapshotImporterStatus {
    return {
      entra: this.entra.getStatus(),
      azureResources: this.azureResources.getStatus()
    };
  }

  async prepareSchema(): Promise<void> {
    await this.entra.prepareSchema();
    await this.azureResources.prepareSchema();
  }

  async importSnapshots(): Promise<void> {
    await this.entra.importSnapshot();
    await this.azureResources.importSnapshot();
  }
}
