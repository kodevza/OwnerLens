import type { DuckDBConnection } from "@duckdb/node-api";

import {
  listLocalSnapshotFiles,
  pathExists,
  readLocalSnapshotFile,
  validateSnapshotFileName,
  type LocalSnapshotData,
  type LocalSnapshotFile
} from "../../../core/runtime/localSnapshotFiles";
import type { ManagedIdentity } from "../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../core/azure/entra/servicePrincipal";
import type { ZtaReport } from "../../../core/azure/ztaReport";
import type { AzureIdentityEnrichmentStatus } from "./enrichment/azureIdentityEnrichment";
import { EntraCollectionQueryService } from "./entra/EntraCollectionQueryService";
import { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type { EntraDuckDbImportStatus } from "./entra/snapshotStore";
import { AzureResourcesCollectionQueryService } from "./resources/AzureResourcesCollectionQueryService";
import { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import type { AzureResourcesDuckDbImportStatus } from "./resources/snapshotStore";
import { LocalZeroTrustAssessmentReportRuntime } from "./zta/LocalZeroTrustAssessmentReportRuntime";
import type {
  ZeroTrustAssessmentDuckDbImportStatus
} from "./zta/snapshotStore";
import { ZeroTrustAssessmentQueryService } from "./zta/ZeroTrustAssessmentQueryService";
import {
  type LocalReportCollectionQuery,
  type LocalReportPaginatedCollection
} from "./localReportCollections";
import { RuntimeHost } from "./RuntimeHost";
import { SnapshotImporter } from "./SnapshotImporter";
import { EnrichmentService } from "./EnrichmentService";
import { DisabledEvidenceStore, type DisabledOwnerKey } from "./DisabledEvidenceStore";
import { CollectionQueryService, type LocalReportCollectionId } from "./CollectionQueryService";

export type LocalReportRuntimeOptions = {
  dataDir: string;
  databasePath?: string;
};

export type LocalReportRuntimeStatus = {
  initialized: boolean;
  databasePath: string;
  entra: EntraDuckDbImportStatus;
  azureResources: AzureResourcesDuckDbImportStatus;
  zeroTrustAssessment: ZeroTrustAssessmentDuckDbImportStatus;
  enrichment: AzureIdentityEnrichmentStatus;
};

export { type LocalReportCollectionId };

export class LocalReportRuntime {
  private readonly dataDir: string;
  private readonly host: RuntimeHost;
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  private readonly zeroTrustAssessmentQueries: ZeroTrustAssessmentQueryService;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly snapshotImporter: SnapshotImporter;
  private readonly enrichmentService: EnrichmentService;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;
  private readonly collectionQueryService: CollectionQueryService;
  private initializePromise: Promise<void> | null = null;

  constructor(options: LocalReportRuntimeOptions) {
    this.dataDir = options.dataDir;
    this.host = new RuntimeHost({ databasePath: options.databasePath ?? ":memory:" });
    this.entra = new LocalEntraReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.azureResources = new LocalAzureResourcesReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.zeroTrustAssessment = new LocalZeroTrustAssessmentReportRuntime({
      dataDir: this.dataDir,
      getConnection: () => this.requireConnection()
    });
    this.zeroTrustAssessmentQueries = new ZeroTrustAssessmentQueryService({
      zeroTrustAssessment: this.zeroTrustAssessment
    });
    this.snapshotImporter = new SnapshotImporter({
      entra: this.entra,
      azureResources: this.azureResources,
      zeroTrustAssessment: this.zeroTrustAssessment
    });
    this.enrichmentService = new EnrichmentService(() => this.requireConnection());
    this.disabledEvidenceStore = new DisabledEvidenceStore(() => this.requireConnection());
    this.azureResourcesQueries = new AzureResourcesCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      disabledEvidenceStore: this.disabledEvidenceStore
    });
    this.entraQueries = new EntraCollectionQueryService({
      entra: this.entra,
      azureResources: this.azureResources,
      azureResourcesQueries: this.azureResourcesQueries,
      zeroTrustAssessmentQueries: this.zeroTrustAssessmentQueries
    });
    this.collectionQueryService = new CollectionQueryService({
      entraQueries: this.entraQueries,
      azureResourcesQueries: this.azureResourcesQueries
    });
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.initializeInternal();
    return this.initializePromise;
  }

  async listSnapshots(): Promise<{ files: LocalSnapshotFile[]; error?: string }> {
    await this.initialize();

    if (!(await pathExists(this.dataDir))) {
      return {
        files: [],
        error:
          "Snapshot directory ./data was not found. Run the snapshot scripts to create ./data/snapshot.json and ./data/entra-snapshot.json."
      };
    }

    return { files: await listLocalSnapshotFiles(this.dataDir) };
  }

  async readSnapshot(name: string): Promise<LocalSnapshotData> {
    await this.initialize();
    validateSnapshotFileName(name);

    if (this.entra.canReadSnapshot(name)) {
      return this.entra.readSnapshot();
    }

    if (this.azureResources.canReadSnapshot(name)) {
      return this.azureResources.readSnapshot();
    }

    return readLocalSnapshotFile(this.dataDir, name);
  }

  getStatus(): LocalReportRuntimeStatus {
    const importStatus = this.snapshotImporter.getStatus();

    return {
      initialized: this.host.isInitialized(),
      databasePath: this.host.getDatabasePath(),
      entra: importStatus.entra,
      azureResources: importStatus.azureResources,
      zeroTrustAssessment: importStatus.zeroTrustAssessment,
      enrichment: this.enrichmentService.getStatus()
    };
  }

  async readServicePrincipals(): Promise<ServicePrincipal[]> {
    await this.initialize();
    return this.entra.readServicePrincipals();
  }

  async readManagedIdentities(): Promise<ManagedIdentity[]> {
    await this.initialize();
    return this.entra.readManagedIdentities();
  }

  async readZeroTrustAssessmentReport(): Promise<ZtaReport> {
    await this.initialize();
    return this.zeroTrustAssessmentQueries.readReport();
  }

  async recalculateEnrichment(): Promise<void> {
    await this.initialize();
    await this.enrichmentService.recalculate();
  }

  async setOwnerEvidenceDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    await this.initialize();
    return this.disabledEvidenceStore.setDisabled(key, disabled);
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalReportCollectionId>> {
    await this.initialize();
    return this.collectionQueryService.queryCollection(query);
  }

  async close(): Promise<void> {
    await this.host.close();
    this.initializePromise = null;
  }

  private async initializeInternal(): Promise<void> {
    await this.host.initialize();
    await this.snapshotImporter.prepareSchema();
    await this.enrichmentService.prepareSchema();
    await this.snapshotImporter.importSnapshots();
    await this.enrichmentService.recalculate();
    await this.enrichmentService.readStatus();
  }

  private requireConnection(): DuckDBConnection {
    return this.host.requireConnection();
  }
}
