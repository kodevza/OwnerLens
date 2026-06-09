import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";

import { buildAzureOwnershipReport } from "../../ownership/buildAzureOwnershipReport";
import {
  buildPaginatedCollection,
  type LocalReportCollectionQuery,
  type LocalReportPaginatedCollection
} from "../localReportCollections";
import type { DisabledEvidenceStore } from "../DisabledEvidenceStore";
import type { LocalEntraReportRuntime } from "../entra/LocalEntraReportRuntime";
import {
  type LocalAzureResourcesReportCollectionId,
  type LocalAzureResourcesReportRuntime
} from "./LocalAzureResourcesReportRuntime";
import {
  applyResourceGroupOwnerDisabledEvidence,
  buildResourceGroupOwnershipRows
} from "./resourceGroupOwnership";

export type LocalAzureResourcesExtendedCollectionId =
  | LocalAzureResourcesReportCollectionId
  | "azureResources.resourceGroupOwnership";

export type AzureResourcesCollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  disabledEvidenceStore: DisabledEvidenceStore;
};

export class AzureResourcesCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;

  constructor(options: AzureResourcesCollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
  }

  canQueryCollection(collectionId: string): collectionId is LocalAzureResourcesExtendedCollectionId {
    return collectionId === "azureResources.resourceGroupOwnership" || this.azureResources.canQueryCollection(collectionId);
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalAzureResourcesExtendedCollectionId>> {
    if (query.collectionId === "azureResources.resourceGroupOwnership") {
      return buildPaginatedCollection(query.collectionId, await this.readResourceGroupOwnershipRows(), query);
    }

    return this.azureResources.queryCollection(query);
  }

  async readResourceGroupOwnershipRows(): Promise<ResourceGroupOwnershipRow[]> {
    const [resourceSnapshot, entraSnapshot, disabledKeys] = await Promise.all([
      this.azureResources.readSnapshot(),
      this.entra.readSnapshot(),
      this.disabledEvidenceStore.readKeys()
    ]);
    const ownerReport = buildAzureOwnershipReport(resourceSnapshot, entraSnapshot);
    const ownerRows = applyResourceGroupOwnerDisabledEvidence(ownerReport.owners, disabledKeys);

    return buildResourceGroupOwnershipRows(resourceSnapshot.resourceGroups, ownerRows);
  }
}
