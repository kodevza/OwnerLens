import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";

import type { LocalEntraReportCollectionId } from "./entra/LocalEntraReportRuntime";
import type { LocalReportCollectionQuery, LocalReportPaginatedCollection } from "./localReportCollections";
import { EntraCollectionQueryService } from "./entra/EntraCollectionQueryService";
import type {
  AzureResourcesCollectionQueryService,
  LocalAzureResourcesExtendedCollectionId
} from "./resources/AzureResourcesCollectionQueryService";

export type LocalReportCollectionId =
  | LocalEntraReportCollectionId
  | LocalAzureResourcesExtendedCollectionId;

export type CollectionQueryServiceOptions = {
  entraQueries: EntraCollectionQueryService;
  azureResourcesQueries: AzureResourcesCollectionQueryService;
};

export class CollectionQueryService {
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;

  constructor(options: CollectionQueryServiceOptions) {
    this.entraQueries = options.entraQueries;
    this.azureResourcesQueries = options.azureResourcesQueries;
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalReportCollectionId>> {
    if (this.entraQueries.canQueryCollection(query.collectionId)) {
      return this.entraQueries.queryCollection(query);
    }

    if (this.azureResourcesQueries.canQueryCollection(query.collectionId)) {
      return this.azureResourcesQueries.queryCollection(query);
    }

    throw new RuntimeHttpError(`Unknown report collection: ${query.collectionId}`, 400);
  }
}
