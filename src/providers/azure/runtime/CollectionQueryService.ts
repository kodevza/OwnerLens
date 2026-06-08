import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";

import type { LocalEntraReportCollectionId } from "./entra/LocalEntraReportRuntime";
import type { LocalAzureResourcesReportCollectionId } from "./resources/LocalAzureResourcesReportRuntime";
import { buildAzureOwnershipReport } from "../ownership/buildAzureOwnershipReport";
import {
  applyResourceGroupOwnerDisabledEvidence,
  buildResourceGroupOwnershipRows
} from "./resources/resourceGroupOwnership";
import {
  buildPaginatedCollection,
  type LocalReportCollectionQuery,
  type LocalReportPaginatedCollection
} from "./localReportCollections";
import type { LocalEntraReportRuntime } from "./entra/LocalEntraReportRuntime";
import type { LocalAzureResourcesReportRuntime } from "./resources/LocalAzureResourcesReportRuntime";
import type { DisabledEvidenceStore } from "./DisabledEvidenceStore";

export type LocalReportCollectionId =
  | LocalEntraReportCollectionId
  | LocalAzureResourcesReportCollectionId
  | "azureResources.resourceGroupOwnership";

export type CollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  disabledEvidenceStore: DisabledEvidenceStore;
};

export class CollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;

  constructor(options: CollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalReportCollectionId>> {
    if (this.entra.canQueryCollection(query.collectionId)) {
      return this.entra.queryCollection(query);
    }

    if (query.collectionId === "azureResources.resourceGroupOwnership") {
      return buildPaginatedCollection(query.collectionId, await this.readResourceGroupOwnershipRows(), query);
    }

    if (this.azureResources.canQueryCollection(query.collectionId)) {
      return this.azureResources.queryCollection(query);
    }

    throw new RuntimeHttpError(`Unknown report collection: ${query.collectionId}`, 400);
  }

  private async readResourceGroupOwnershipRows(): Promise<Record<string, unknown>[]> {
    const [resourceSnapshot, entraSnapshot, disabledKeys] = await Promise.all([
      this.azureResources.readSnapshot(),
      this.entra.readSnapshot(),
      this.disabledEvidenceStore.readKeys()
    ]);
    const ownerReport = buildAzureOwnershipReport(resourceSnapshot, entraSnapshot);
    const ownerRows = applyResourceGroupOwnerDisabledEvidence(ownerReport.owners, disabledKeys);

    return buildResourceGroupOwnershipRows(resourceSnapshot.resourceGroups, ownerRows) as unknown as Record<
      string,
      unknown
    >[];
  }
}
