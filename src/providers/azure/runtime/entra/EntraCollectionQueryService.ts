import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type {
  EntraPrincipalAzureRemediationSummary,
  ServicePrincipal
} from "../../../../core/azure/entra/servicePrincipal";

import {
  buildPaginatedCollection,
  type LocalReportCollectionQueryOptions,
  type LocalReportPaginatedCollection
} from "../../../../core/runtime/collections";
import type { RuntimeCollectionCsvExport } from "../../../../core/runtime/collectionExport";
import type { DisabledOwnerEvidenceStore } from "../../../../core/runtime/DisabledOwnerEvidenceStore";
import type { ExportService } from "../ExportService";
import type { LocalEntraReportRuntime } from "./LocalEntraReportRuntime";
import { getRuntimeServicePrincipalFilters } from "./domain/servicePrincipalsTable";
import { maxOwnerConfidence } from "../../../../core/ownership/ownerCandidateRanking";
import type { OwnerCandidate, OwnerConfidence } from "../../../../core/ownership/types";

export type EntraCollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  disabledEvidenceStore: Pick<DisabledOwnerEvidenceStore, "readKeys">;
  exportService: ExportService;
};

export class EntraCollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly disabledEvidenceStore: Pick<DisabledOwnerEvidenceStore, "readKeys">;
  private readonly exportService: ExportService;

  constructor(options: EntraCollectionQueryServiceOptions) {
    this.entra = options.entra;
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
      getRuntimePrincipalCollectionOptions(options, rows.length)
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
      getRuntimePrincipalCollectionOptions(options, rows.length)
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
        roleAssignments: [],
        oauthPermissionsCount: 0,
        appRolesPermissionCount: 0,
        entraPermissionCount: 0,
        entraPermissionRisk: "none",
        rbacRoleAssignmentCount: 0,
        rbacRoleLevel: "none",
        rbacSubscriptionCount: 0,
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
    const managedIdentities = await this.entra.readManagedIdentities(ownershipPageOptions);

    return applyActiveOwnerProjectionToPrincipalRows(
      managedIdentities,
      await this.disabledEvidenceStore.readKeys()
    ) as unknown as Record<string, unknown>[];
  }

  async countManagedIdentityRows(options: LocalReportCollectionQueryOptions = {}): Promise<number> {
    return this.entra.countManagedIdentities({
      filters: options.filters
    });
  }

  async readServicePrincipalRows(options: LocalReportCollectionQueryOptions = {}): Promise<Record<string, unknown>[]> {
    const ownershipPageOptions = getPrincipalSourceReadOptions(options);
    const servicePrincipals = await this.entra.readServicePrincipals(ownershipPageOptions);

    return applyActiveOwnerProjectionToPrincipalRows(
      servicePrincipals,
      await this.disabledEvidenceStore.readKeys()
    ) as unknown as Record<string, unknown>[];
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

    return applyActiveOwnerProjectionToPrincipalRows(
      [servicePrincipal],
      await this.disabledEvidenceStore.readKeys()
    )[0] ?? null;
  }
}

function getRuntimePrincipalCollectionOptions(
  options: LocalReportCollectionQueryOptions,
  rowCount?: number
): LocalReportCollectionQueryOptions {
  if (rowCount !== undefined && canUseDuckDbLookupLimit(options)) {
    return {
      ...options,
      page: 1,
      pageSize: Math.max(1, rowCount),
      filters: getRuntimeServicePrincipalFilters(options.filters ?? [])
    };
  }

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
    page: options.page ?? collection.page,
    pageSize: options.pageSize ?? collection.pageSize,
    count: duckDbCount
  };
}

function canUseDuckDbLookupLimit(options: LocalReportCollectionQueryOptions): boolean {
  return (
    getRuntimeServicePrincipalFilters(options.filters ?? []).length === 0 &&
    (options.sortRules ?? []).filter((rule) => rule.columnId.trim()).length === 0
  );
}

function applyActiveOwnerProjectionToPrincipalRows<Row extends ServicePrincipal | ManagedIdentity>(
  rows: Row[],
  disabledKeys: ReadonlySet<string>
): Row[] {
  return rows.map((row) => {
    const activeOwnerCandidates = filterActiveOwnerCandidates(row.ownerCandidates ?? [], disabledKeys);
    const directOwnerCandidates = activeOwnerCandidates.filter((candidate) => candidate.relatedScopes.length === 0);
    const resourceGroup = "managedIdentityAssignments" in row
      ? row.resourceGroup ?? readFirstCandidateResourceGroup(activeOwnerCandidates)
      : undefined;

    return {
      ...row,
      ...(resourceGroup ? { resourceGroup } : {}),
      ...buildOwnerProjection(
        directOwnerCandidates.length > 0 ? directOwnerCandidates : activeOwnerCandidates
      )
    };
  });
}

function readFirstCandidateResourceGroup(candidates: OwnerCandidate[]): string | undefined {
  for (const candidate of candidates) {
    const resourceGroup = candidate.relatedScopes.find((scope) => scope.resourceGroup)?.resourceGroup;
    if (resourceGroup) {
      return resourceGroup;
    }
  }

  return undefined;
}

function buildOwnerProjection(ownerCandidates: OwnerCandidate[]): {
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

function filterActiveOwnerCandidates(
  candidates: OwnerCandidate[],
  disabledKeys: ReadonlySet<string>
): OwnerCandidate[] {
  if (disabledKeys.size === 0) {
    return candidates;
  }

  return candidates.filter((candidate) => !isOwnerCandidateDisabled(candidate, disabledKeys));
}

function isOwnerCandidateDisabled(candidate: OwnerCandidate, disabledKeys: ReadonlySet<string>): boolean {
  return (
    isDirectOwnerCandidateDisabled(candidate, disabledKeys) ||
    isScopedResourceGroupOwnerCandidateDisabled(candidate, disabledKeys)
  );
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

function isScopedResourceGroupOwnerCandidateDisabled(
  candidate: OwnerCandidate,
  disabledKeys: ReadonlySet<string>
): boolean {
  for (const scope of candidate.relatedScopes) {
    if (!scope.subscriptionId || !scope.resourceGroup) {
      continue;
    }

    const resourceGroupKey = normalizeOwnerKey([
      "resourceGroup",
      scope.subscriptionId,
      scope.resourceGroup,
      candidate.key
    ].join(":"));

    if (hasNormalizedOwnerKey(disabledKeys, resourceGroupKey)) {
      return true;
    }

    if (!scope.principalId) {
      continue;
    }

    const principalScopedKey = normalizeOwnerKey([
      "resourceGroup",
      scope.subscriptionId,
      scope.resourceGroup,
      "principal",
      scope.principalId,
      candidate.key
    ].join(":"));

    if (hasNormalizedOwnerKey(disabledKeys, principalScopedKey)) {
      return true;
    }
  }

  return false;
}

function hasNormalizedOwnerKey(disabledKeys: ReadonlySet<string>, key: string): boolean {
  for (const disabledKey of disabledKeys) {
    if (normalizeOwnerKey(disabledKey) === key) {
      return true;
    }
  }

  return false;
}

function normalizeOwnerKey(value: string): string {
  return value.trim().toLowerCase();
}
