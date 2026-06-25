import type { DuckDBConnection } from "@duckdb/node-api";

import type { SnapshotImportStatus } from "../../../core/runtime/snapshotImportRegistry";
import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import { migrate, MigrationCompatibilityError } from "../../../db/migrate";
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
  logger?: Pick<Console, "log"> | null;
};

export type SnapshotImporterStatus = {
  entra: SnapshotImportStatus;
  azureResources: SnapshotImportStatus;
  zeroTrustAssessment: SnapshotImportStatus;
};

export async function prepareRuntimeSqlSchema(connection: DuckDBConnection): Promise<void> {
  try {
    await migrate(connection, "migrations", process.env.NODE_ENV === "test" ? null : console);
  } catch (error) {
    if (error instanceof MigrationCompatibilityError) {
      throw new RuntimeHttpError(error.message, 409, "runtime.schemaVersionIncompatible");
    }

    throw error;
  }
}

export class SnapshotImporter {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: SnapshotImportRuntime;
  private readonly logger: Pick<Console, "log"> | null;

  constructor(options: SnapshotImporterOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.zeroTrustAssessment = options.zeroTrustAssessment;
    this.logger = options.logger ?? (process.env.NODE_ENV === "test" ? null : console);
  }

  getStatus(): SnapshotImporterStatus {
    return {
      entra: this.entra.getStatus(),
      azureResources: this.azureResources.getStatus(),
      zeroTrustAssessment: this.zeroTrustAssessment.getStatus()
    };
  }

  async importSnapshots(): Promise<void> {
    await this.importSnapshotWithLogging("Entra", this.entra);
    await this.importSnapshotWithLogging("Azure resources", this.azureResources);
    await this.importSnapshotWithLogging("Zero Trust Assessment", this.zeroTrustAssessment);
  }

  private async importSnapshotWithLogging(label: string, runtime: SnapshotImportRuntime): Promise<void> {
    const previousStatus = runtime.getStatus();
    this.logger?.log(
      previousStatus.imported
        ? `Checking ${label} snapshot...`
        : `Importing ${label} snapshot...`
    );

    await runtime.importSnapshot();

    const status = runtime.getStatus();
    if (!status.imported) {
      this.logger?.log(`No ${label} snapshot found.`);
      return;
    }

    if (status.skipped) {
      this.logger?.log(`${label} snapshot is already current.`);
      return;
    }

    this.logger?.log(`Imported ${label} snapshot.`);
  }
}
