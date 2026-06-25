import type { DuckDBConnection } from "@duckdb/node-api";

import type { OwnershipEvidenceResponse } from "../../../../core/ownership/types";
import {
  DisabledOwnerEvidenceStore,
  type DisabledOwnerKey
} from "../../../../core/runtime/DisabledOwnerEvidenceStore";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type { LocalAzureResourcesReportRuntime } from "../resources/LocalAzureResourcesReportRuntime";
import {
  OwnershipEvidenceQueryService,
  type OwnershipEvidenceRequest
} from "./OwnershipEvidenceQueryService";

export type { DisabledOwnerKey } from "../../../../core/runtime/DisabledOwnerEvidenceStore";
export type { OwnershipEvidenceRequest } from "./OwnershipEvidenceQueryService";
export type { OwnershipEvidenceResponse } from "../../../../core/ownership/types";

export type OwnershipRuntimeOptions = {
  getConnection: () => DuckDBConnection;
  getEntraQueries: () => EntraCollectionQueryService;
  azureResources: LocalAzureResourcesReportRuntime;
};

export class OwnershipRuntime {
  private readonly getEntraQueries: () => EntraCollectionQueryService;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly disabledEvidenceStore: DisabledOwnerEvidenceStore;
  private evidenceQueries: OwnershipEvidenceQueryService | null = null;

  constructor(options: OwnershipRuntimeOptions) {
    this.getEntraQueries = options.getEntraQueries;
    this.azureResources = options.azureResources;
    this.disabledEvidenceStore = new DisabledOwnerEvidenceStore(options.getConnection, "azure");
  }

  getDisabledEvidenceStore(): DisabledOwnerEvidenceStore {
    return this.disabledEvidenceStore;
  }

  async setOwnerCandidateDisabled(key: DisabledOwnerKey, disabled: boolean): Promise<number> {
    return this.disabledEvidenceStore.setDisabled(key, disabled);
  }

  async readOwnershipEvidence(request: OwnershipEvidenceRequest): Promise<OwnershipEvidenceResponse> {
    return this.getEvidenceQueries().readOwnershipEvidence(request);
  }

  private getEvidenceQueries(): OwnershipEvidenceQueryService {
    this.evidenceQueries ??= new OwnershipEvidenceQueryService({
      entraQueries: this.getEntraQueries(),
      azureResources: this.azureResources,
      disabledEvidenceStore: this.disabledEvidenceStore
    });

    return this.evidenceQueries;
  }
}
