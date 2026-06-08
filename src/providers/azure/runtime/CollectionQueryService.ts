import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import type { ManagedIdentity } from "../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../core/azure/entra/servicePrincipal";
import type { AzureRoleAssignment } from "../../../core/azure/resources";
import type { ZtaRemediationSummary } from "../../../core/azure/ztaReport";
import type { OwnerConfidence } from "../../../core/ownership/types";

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
import type { LocalZeroTrustAssessmentReportRuntime } from "./zta/LocalZeroTrustAssessmentReportRuntime";
import type { DisabledEvidenceStore } from "./DisabledEvidenceStore";
import type { AzureUserAssignedManagedIdentity } from "../domain/resources/AzureUserAssignedManagedIdentity";

export type LocalReportCollectionId =
  | LocalEntraReportCollectionId
  | LocalAzureResourcesReportCollectionId
  | "azureResources.resourceGroupOwnership";

export type CollectionQueryServiceOptions = {
  entra: LocalEntraReportRuntime;
  azureResources: LocalAzureResourcesReportRuntime;
  zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  disabledEvidenceStore: DisabledEvidenceStore;
};

export class CollectionQueryService {
  private readonly entra: LocalEntraReportRuntime;
  private readonly azureResources: LocalAzureResourcesReportRuntime;
  private readonly zeroTrustAssessment: LocalZeroTrustAssessmentReportRuntime;
  private readonly disabledEvidenceStore: DisabledEvidenceStore;

  constructor(options: CollectionQueryServiceOptions) {
    this.entra = options.entra;
    this.azureResources = options.azureResources;
    this.zeroTrustAssessment = options.zeroTrustAssessment;
    this.disabledEvidenceStore = options.disabledEvidenceStore;
  }

  async queryCollection(
    query: LocalReportCollectionQuery
  ): Promise<LocalReportPaginatedCollection<LocalReportCollectionId>> {
    if (query.collectionId === "entra.servicePrincipals") {
      return buildPaginatedCollection(query.collectionId, await this.readServicePrincipalRows(), query);
    }

    if (query.collectionId === "entra.managedIdentities") {
      return buildPaginatedCollection(query.collectionId, await this.readManagedIdentityRows(), query);
    }

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

  private async readManagedIdentityRows(): Promise<Record<string, unknown>[]> {
    const managedIdentities = await this.enrichWithZtaRemediationSummaries(await this.entra.readManagedIdentities());

    try {
      const [resourceGroupOwnershipRows, userAssignedManagedIdentities] = await Promise.all([
        this.readResourceGroupOwnershipRows(),
        this.azureResources.readAzureUserAssignedManagedIdentities()
      ]);

      return enrichManagedIdentitiesWithResourceGroupOwners(
        managedIdentities,
        resourceGroupOwnershipRows as unknown as ResourceGroupOwnershipRow[],
        userAssignedManagedIdentities
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return managedIdentities as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  private async readServicePrincipalRows(): Promise<Record<string, unknown>[]> {
    const servicePrincipals = await this.enrichWithZtaRemediationSummaries(await this.entra.readServicePrincipals());

    try {
      return enrichServicePrincipalsWithResourceGroupOwners(
        servicePrincipals,
        (await this.readResourceGroupOwnershipRows()) as unknown as ResourceGroupOwnershipRow[]
      ) as unknown as Record<string, unknown>[];
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return servicePrincipals as unknown as Record<string, unknown>[];
      }

      throw error;
    }
  }

  private async enrichWithZtaRemediationSummaries<Row extends ServicePrincipal | ManagedIdentity>(rows: Row[]): Promise<Row[]> {
    let summariesByPrincipalId: Map<string, ZtaRemediationSummary>;

    try {
      summariesByPrincipalId = await this.zeroTrustAssessment.readRemediationSummaries();
    } catch (error) {
      if (error instanceof RuntimeHttpError && error.statusCode === 404) {
        return rows;
      }

      throw error;
    }

    return rows.map((row) => ({
      ...row,
      ...(summariesByPrincipalId.get(row.id.toLowerCase()) ?? {})
    }));
  }
}

type ResourceGroupOwnershipRow = {
  subscriptionId: string;
  resourceGroup: string;
  owner: string | null;
  confidence: OwnerConfidence;
};

type ManagedIdentityOwnerProjection = {
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
};

type ServicePrincipalOwnerProjection = {
  potentialOwners: string[];
  ownerConfidence: OwnerConfidence;
};

type ResourceGroupOwnershipIndex = {
  byResourceGroup: Map<string, ResourceGroupOwnershipRow>;
  bySubscription: Map<string, ResourceGroupOwnershipRow[]>;
};

function enrichManagedIdentitiesWithResourceGroupOwners(
  managedIdentities: ManagedIdentity[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[],
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[]
): ManagedIdentity[] {
  const ownershipByResourceGroup = buildResourceGroupOwnershipIndex(resourceGroupOwnershipRows).byResourceGroup;
  const locationsByPrincipal = buildManagedIdentityLocationIndex(userAssignedManagedIdentities);

  return managedIdentities.map((identity) => {
    const userAssignedIdentity =
      locationsByPrincipal.get(identity.id.toLowerCase()) ?? locationsByPrincipal.get(identity.appId.toLowerCase());
    const projection = projectManagedIdentityOwner(userAssignedIdentity, ownershipByResourceGroup);

    return {
      ...identity,
      ...projection
    };
  });
}

function enrichServicePrincipalsWithResourceGroupOwners(
  servicePrincipals: ServicePrincipal[],
  resourceGroupOwnershipRows: ResourceGroupOwnershipRow[]
): ServicePrincipal[] {
  const ownershipIndex = buildResourceGroupOwnershipIndex(resourceGroupOwnershipRows);

  return servicePrincipals.map((servicePrincipal) => ({
    ...servicePrincipal,
    ...projectServicePrincipalOwners(servicePrincipal.roleAssignments, ownershipIndex)
  }));
}

function buildResourceGroupOwnershipIndex(rows: ResourceGroupOwnershipRow[]): ResourceGroupOwnershipIndex {
  const byResourceGroup = new Map<string, ResourceGroupOwnershipRow>();
  const bySubscription = new Map<string, ResourceGroupOwnershipRow[]>();

  for (const row of rows) {
    byResourceGroup.set(getResourceGroupKey(row.subscriptionId, row.resourceGroup), row);

    const subscriptionKey = row.subscriptionId.toLowerCase();
    const subscriptionRows = bySubscription.get(subscriptionKey) ?? [];
    subscriptionRows.push(row);
    bySubscription.set(subscriptionKey, subscriptionRows);
  }

  return { byResourceGroup, bySubscription };
}

function buildManagedIdentityLocationIndex(
  userAssignedManagedIdentities: AzureUserAssignedManagedIdentity[]
): Map<string, AzureUserAssignedManagedIdentity> {
  const index = new Map<string, AzureUserAssignedManagedIdentity>();

  for (const identity of userAssignedManagedIdentities) {
    addManagedIdentityLocation(index, identity.principalId, identity);
    addManagedIdentityLocation(index, identity.clientId, identity);
  }

  return index;
}

function addManagedIdentityLocation(
  index: Map<string, AzureUserAssignedManagedIdentity>,
  key: string,
  identity: AzureUserAssignedManagedIdentity
): void {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) {
    return;
  }

  index.set(normalizedKey, identity);
}

function projectManagedIdentityOwner(
  identity: AzureUserAssignedManagedIdentity | undefined,
  ownershipByResourceGroup: Map<string, ResourceGroupOwnershipRow>
): ManagedIdentityOwnerProjection {
  if (!identity) {
    return {
      potentialOwners: [],
      ownerConfidence: "none"
    };
  }

  const ownership = ownershipByResourceGroup.get(getResourceGroupKey(identity.subscriptionId, identity.resourceGroup));

  return {
    potentialOwners: ownership?.owner ? [ownership.owner] : [],
    ownerConfidence: ownership?.confidence ?? "none"
  };
}

function projectServicePrincipalOwners(
  roleAssignments: AzureRoleAssignment[],
  ownershipIndex: ResourceGroupOwnershipIndex
): ServicePrincipalOwnerProjection {
  const resourceGroups = new Map<string, ResourceGroupOwnershipRow>();

  for (const assignment of roleAssignments) {
    for (const row of getRoleAssignmentResourceGroupOwners(assignment, ownershipIndex)) {
      resourceGroups.set(getResourceGroupKey(row.subscriptionId, row.resourceGroup), row);
    }
  }

  const ownerRows = [...resourceGroups.values()].filter((row) => row.owner);

  return {
    potentialOwners: uniqueSorted(ownerRows.map((row) => row.owner).filter(isString)),
    ownerConfidence: ownerRows.reduce<OwnerConfidence>(
      (confidence, row) => maxOwnerConfidence(confidence, row.confidence),
      "none"
    )
  };
}

function getRoleAssignmentResourceGroupOwners(
  assignment: AzureRoleAssignment,
  ownershipIndex: ResourceGroupOwnershipIndex
): ResourceGroupOwnershipRow[] {
  const scope = assignment.scope;
  const subscriptionId = getScopeSubscriptionId(scope) ?? assignment.subscriptionId;
  const resourceGroup = getScopeResourceGroup(scope);

  if (subscriptionId && resourceGroup) {
    const row = ownershipIndex.byResourceGroup.get(getResourceGroupKey(subscriptionId, resourceGroup));
    return row ? [row] : [];
  }

  if (isSubscriptionScope(scope) && subscriptionId) {
    return ownershipIndex.bySubscription.get(subscriptionId.toLowerCase()) ?? [];
  }

  return [];
}

function getScopeSubscriptionId(scope: string): string | null {
  return scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? null;
}

function getScopeResourceGroup(scope: string): string | null {
  return scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null;
}

function isSubscriptionScope(scope: string): boolean {
  return /^\/subscriptions\/[^/]+\/?$/i.test(scope);
}

function getResourceGroupKey(subscriptionId: string, resourceGroup: string): string {
  return `${subscriptionId.toLowerCase()}:${resourceGroup.toLowerCase()}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function maxOwnerConfidence(left: OwnerConfidence, right: OwnerConfidence): OwnerConfidence {
  return OWNER_CONFIDENCE_RANK[left] >= OWNER_CONFIDENCE_RANK[right] ? left : right;
}

const OWNER_CONFIDENCE_RANK: Record<OwnerConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};
