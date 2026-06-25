import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type {
  EntraPrincipalAzureRemediationSummary,
  ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";
import type {
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../../core/azure/resources";
import type {
  ZtaRemediationPackageSummary,
  ZtaRemediationSummary
} from "../../../../core/azure/ztaReport";

import {
  buildPaginatedCollection,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import type { RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { DisabledOwnerEvidenceStore } from "../../../../core/runtime/DisabledOwnerEvidenceStore";
import type { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";
import type { LocalAzureResourcesReportRuntime } from "../resources/LocalAzureResourcesReportRuntime";
import type { ExportService } from "../ExportService";
import type { LocalEntraReportRuntime } from "./LocalEntraReportRuntime";
import { getRuntimeServicePrincipalFilters } from "./domain/servicePrincipalsTable";
import {
  projectManagedIdentityOwners,
  projectServicePrincipalOwners
} from "../ownership/principalOwnerProjection";
import { readEntraPrincipalDirectOwnerCandidates } from "../ownership/OwnershipEvidenceHelper";
import { maxOwnerConfidence } from "../../../../core/ownership/ownerCandidateRanking";
import type { OwnerCandidate, OwnerConfidence } from "../../../../core/ownership/types";

export type EntraZeroTrustAssessmentQueries = {
  readRemediationSummaries(): Promise<Map<string, ZtaRemediationSummary>>;
  readRemediationPackageSummariesByPrincipalId(): Promise<Map<string, ZtaRemediationPackageSummary[]>>;
};

export type EntraCollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  azureResourcesQueries: AzureResourcesCollectionQueryService;
  zeroTrustAssessmentQueries: EntraZeroTrustAssessmentQueries;
  disabledEvidenceStore: Pick<DisabledOwnerEvidenceStore, "readKeys">;
  exportService: ExportService;
};

export class EntraCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly zeroTrustAssessmentQueries: EntraZeroTrustAssessmentQueries;
  private readonly disabledEvidenceStore: Pick<DisabledOwnerEvidenceStore, "readKeys">;
  private readonly exportService: ExportService;

  constructor(options: EntraCollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.azureResourcesQueries = options.azureResourcesQueries;
    this.zeroTrustAssessmentQueries = options.zeroTrustAssessmentQueries;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
    this.exportService = options.exportService;
  }

  async queryServicePrincipals(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.servicePrincipals">> {
    const rows = await this.readServicePrincipalRows(options);
    const collection = buildPaginatedCollection(
      "entra.servicePrincipals",
      rows,
      getRuntimePrincipalCollectionOptions(options)
    );

    return withDuckDbCount(collection, await this.countServicePrincipalRows(options), options);
  }

  async exportServicePrincipalsCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.servicePrincipals">> {
    return this.exportService.exportEntraServicePrincipalsCsv(
      await this.readServicePrincipalRows(options),
      getRuntimePrincipalCollectionOptions(options)
    );
  }

  async queryManagedIdentities(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.managedIdentities">> {
    const rows = await this.readManagedIdentityRows(options);
    const collection = buildPaginatedCollection(
      "entra.managedIdentities",
      rows,
      getRuntimePrincipalCollectionOptions(options)
    );

    return withDuckDbCount(collection, await this.countManagedIdentityRows(options), options);
  }

  async exportManagedIdentitiesCsv(
    options: LocalReportCollectionQueryOptions
  ): Promise<RuntimeCollectionCsvExport<"entra.managedIdentities">> {
    return this.exportService.exportEntraManagedIdentitiesCsv(
      await this.readManagedIdentityRows(options),
      getRuntimePrincipalCollectionOptions(options)
    );
  }

  async readServicePrincipalRemediationSummaries(
    principalIds: string[]
  ): Promise<Map<string, EntraPrincipalAzureRemediationSummary>> {
    const principalIdSet = new Set(principalIds.map((principalId) => principalId.trim().toLowerCase()).filter(Boolean));
    const summaries = new Map<string, EntraPrincipalAzureRemediationSummary>();

    if (principalIdSet.size === 0) {
      return summaries;
    }

    for (const row of await this.readServicePrincipalRows()) {
      const servicePrincipal = row as unknown as ServicePrincipal;
      const normalizedPrincipalId = servicePrincipal.id.toLowerCase();

      if (!principalIdSet.has(normalizedPrincipalId)) {
        continue;
      }

      summaries.set(normalizedPrincipalId, {
        id: servicePrincipal.id,
        displayName: servicePrincipal.displayName,
        roleAssignments: servicePrincipal.roleAssignments,
        oauthPermissionsCount: servicePrincipal.oauthPermissionsCount,
        appRolesPermissionCount: servicePrincipal.appRolesPermissionCount,
        entraPermissionRisk: servicePrincipal.entraPermissionRisk,
        rbacRoleAssignmentCount: servicePrincipal.rbacRoleAssignmentCount,
        rbacRoleLevel: servicePrincipal.rbacRoleLevel,
        rbacSubscriptionCount: servicePrincipal.rbacSubscriptionCount,
        potentialOwners: servicePrincipal.potentialOwners ?? [],
        ownerConfidence: servicePrincipal.ownerConfidence ?? "none"
      });
    }

    return summaries;
  }

  async queryOAuth2PermissionGrants(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.oauth2PermissionGrants">> {
    return buildPaginatedCollection(
      "entra.oauth2PermissionGrants",
      (await this.entra.readEntraOAuth2PermissionGrants()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async queryAppRoleAssignments(
    options: LocalReportCollectionQueryOptions
  ): Promise<LocalReportPaginatedCollection<"entra.appRoleAssignments">> {
    return buildPaginatedCollection(
      "entra.appRoleAssignments",
      (await this.entra.readEntraAppRoleAssignments()) as unknown as Record<string, unknown>[],
      options
    );
  }

  async readManagedIdentityRows(options: LocalReportCollectionQueryOptions = {}): Promise<Record<string, unknown>[]> {
    const ownershipPageOptions = getPrincipalSourceReadOptions(options);
    const managedIdentities = await this.enrichWithZtaRemediationSummaries(
      await this.entra.readManagedIdentities(ownershipPageOptions)
    );

    try {
      const [resourceGroupOwnershipRows, userAssignedManagedIdentities] = await Promise.all([
        this.azureResourcesQueries.readResourceGroupOwnershipRows(ownershipPageOptions),
        this.azureResources.readAzureUserAssignedManagedIdentities()
      ]);

      return enrichManagedIdentitiesWithResourceGroupOwners(
        managedIdentities,
        resourceGroupOwnershipRows,
        userAssignedManagedIdentities,
        await this.disabledEvidenceStore.readKeys()
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return managedIdentities as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  async countManagedIdentityRows(options: LocalReportCollectionQueryOptions = {}): Promise<number> {
    return this.entra.countManagedIdentities({
      filters: options.filters
    });
  }

  async readServicePrincipalRows(options: LocalReportCollectionQueryOptions = {}): Promise<Record<string, unknown>[]> {
    const ownershipPageOptions = getPrincipalSourceReadOptions(options);
    const servicePrincipals = await this.enrichWithZtaRemediationSummaries(
      await this.entra.readServicePrincipals(ownershipPageOptions)
    );

    try {
      return enrichServicePrincipalsWithResourceGroupOwners(
        servicePrincipals,
        await this.azureResourcesQueries.readResourceGroupOwnershipRows(ownershipPageOptions),
        await this.disabledEvidenceStore.readKeys()
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return servicePrincipals as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  async countServicePrincipalRows(options: LocalReportCollectionQueryOptions = {}): Promise<number> {
    return this.entra.countServicePrincipals({
      filters: options.filters
    });
  }

  async findServicePrincipalById(principalId: string): Promise<ServicePrincipal | null> {
    const servicePrincipal = await this.entra.findServicePrincipalById(principalId);

    if (!servicePrincipal) {
      return null;
    }

    const [enrichedServicePrincipal] = await this.enrichWithZtaRemediationSummaries([servicePrincipal]);

    try {
      return enrichServicePrincipalsWithResourceGroupOwners(
        [enrichedServicePrincipal],
        await this.azureResourcesQueries.readResourceGroupOwnershipRows(),
        await this.disabledEvidenceStore.readKeys()
      )[0] ?? null;
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return enrichedServicePrincipal;
      }

      throw error;
    }
  }

  private async enrichWithZtaRemediationSummaries<Row extends ServicePrincipal | ManagedIdentity>(rows: Row[]): Promise<Row[]> {
    const [summariesByPrincipalId, packagesByPrincipalId] = await Promise.all([
      this.zeroTrustAssessmentQueries.readRemediationSummaries(),
      this.zeroTrustAssessmentQueries.readRemediationPackageSummariesByPrincipalId()
    ]);

    return rows.map((row) => ({
      ...row,
      ...(summariesByPrincipalId.get(row.id.toLowerCase()) ?? {}),
      RemediationPackages: packagesByPrincipalId.get(row.id.toLowerCase()) ?? []
    }));
  }
}

function getRuntimePrincipalCollectionOptions(
  options: LocalReportCollectionQueryOptions
): LocalReportCollectionQueryOptions {
  return {
    ...options,
    filters: getRuntimeServicePrincipalFilters(options.filters ?? [])
  };
}

function getPrincipalSourceReadOptions(
  options: LocalReportCollectionQueryOptions
): LocalReportCollectionQueryOptions {
  if (!canUseDuckDbLookupLimit(options)) {
    return {
      filters: options.filters
    };
  }

  return {
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 50000,
    filters: options.filters
  };
}

function withDuckDbCount<CollectionId extends string>(
  collection: LocalReportPaginatedCollection<CollectionId>,
  duckDbCount: number,
  options: LocalReportCollectionQueryOptions
): LocalReportPaginatedCollection<CollectionId> {
  if (!canUseDuckDbLookupLimit(options)) {
    return collection;
  }

  return {
    ...collection,
    count: duckDbCount
  };
}

function canUseDuckDbLookupLimit(options: LocalReportCollectionQueryOptions): boolean {
  return (
    getRuntimeServicePrincipalFilters(options.filters ?? []).length === 0 &&
    (options.sortRules ?? []).filter((rule) => rule.columnId.trim()).length === 0
  );
}

function enrichManagedIdentitiesWithResourceGroupOwners(
  managedIdentities: ManagedIdentity[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[],
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[],
  disabledKeys: ReadonlySet<string>
): ManagedIdentity[] {
  return managedIdentities.map((identity) => {
    const resourceGroupProjection = projectManagedIdentityOwners(
      identity.id,
      identity.appId,
      resourceGroupOwnershipRows,
      userAssignedManagedIdentities
    );
    const directOwnerCandidates = filterActiveDirectOwnerCandidates(
      readEntraPrincipalDirectOwnerCandidates(identity),
      disabledKeys
    );

    return {
      ...identity,
      ...resourceGroupProjection,
      ...(directOwnerCandidates.length > 0
        ? buildDirectOwnerProjection(directOwnerCandidates)
        : {})
    };
  });
}

function buildDirectOwnerProjection(ownerCandidates: OwnerCandidate[]): {
  ownerCandidates: OwnerCandidate[];
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
} {
  return {
    ownerCandidates,
    potentialOwners: ownerCandidates.map((candidate) => candidate.displayName),
    ownerConfidence: ownerCandidates.reduce<OwnerConfidence>(
      (confidence, candidate) => maxOwnerConfidence(confidence, candidate.confidence),
      "none"
    )
  };
}

function enrichServicePrincipalsWithResourceGroupOwners(
  servicePrincipals: ServicePrincipal[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[],
  disabledKeys: ReadonlySet<string>
): ServicePrincipal[] {
  return servicePrincipals.map((servicePrincipal) => {
    const resourceGroupProjection = projectServicePrincipalOwners(
      servicePrincipal.roleAssignments,
      resourceGroupOwnershipRows
    );
    const directOwnerCandidates = filterActiveDirectOwnerCandidates(
      readEntraPrincipalDirectOwnerCandidates(servicePrincipal),
      disabledKeys
    );

    return {
      ...servicePrincipal,
      ...resourceGroupProjection,
      ...(directOwnerCandidates.length > 0
        ? buildDirectOwnerProjection(directOwnerCandidates)
        : {})
    };
  });
}

function filterActiveDirectOwnerCandidates(
  candidates: OwnerCandidate[],
  disabledKeys: ReadonlySet<string>
): OwnerCandidate[] {
  if (disabledKeys.size === 0) {
    return candidates;
  }

  return candidates.filter((candidate) => !isDirectOwnerCandidateDisabled(candidate, disabledKeys));
}

function isDirectOwnerCandidateDisabled(
  candidate: OwnerCandidate,
  disabledKeys: ReadonlySet<string>
): boolean {
  const candidateKey = normalizeOwnerKey(candidate.key);

  for (const disabledKey of disabledKeys) {
    const normalizedDisabledKey = normalizeOwnerKey(disabledKey);
    if (normalizedDisabledKey === candidateKey || normalizedDisabledKey.startsWith(`${candidateKey}:`)) {
      return true;
    }
  }

  return false;
}

function normalizeOwnerKey(value: string): string {
  return value.trim().toLowerCase();
}
