import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnershipEvidenceDiscoverySource,
  OwnershipEvidenceItem,
  OwnershipEvidencePath,
  OwnershipEvidenceResponse,
  OwnershipEvidenceTargetKind
} from "../../../../core/ownership/types";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";

export type OwnershipEvidenceRequest =
  | {
      kind: "servicePrincipal" | "managedIdentity";
      principalId: string;
    }
  | {
      kind: "resourceGroup";
      subscriptionId: string;
      resourceGroup: string;
    };

export type OwnershipEvidenceQueryServiceOptions = {
  entraQueries: EntraCollectionQueryService;
  azureResourcesQueries: AzureResourcesCollectionQueryService;
};

export class OwnershipEvidenceQueryService {
  private readonly entraQueries: EntraCollectionQueryService;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;

  constructor(options: OwnershipEvidenceQueryServiceOptions) {
    this.entraQueries = options.entraQueries;
    this.azureResourcesQueries = options.azureResourcesQueries;
  }

  async readOwnershipEvidence(request: OwnershipEvidenceRequest): Promise<OwnershipEvidenceResponse> {
    switch (request.kind) {
      case "servicePrincipal":
        return this.readServicePrincipalEvidence(request.principalId);
      case "managedIdentity":
        return this.readManagedIdentityEvidence(request.principalId);
      case "resourceGroup":
        return this.readResourceGroupEvidence(request.subscriptionId, request.resourceGroup);
      default:
        return assertNever(request);
    }
  }

  private async readServicePrincipalEvidence(principalId: string): Promise<OwnershipEvidenceResponse> {
    const normalizedPrincipalId = normalizeKey(principalId);
    const row = (await this.entraQueries.readServicePrincipalRows()).find(
      (candidate) => normalizeKey(String(candidate.id ?? "")) === normalizedPrincipalId
    ) as ServicePrincipal | undefined;

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "servicePrincipal",
        id: row.id,
        displayName: row.displayName
      },
      evidence: flattenCandidateEvidence(row.ownerCandidates ?? [])
    };
  }

  private async readManagedIdentityEvidence(principalId: string): Promise<OwnershipEvidenceResponse> {
    const normalizedPrincipalId = normalizeKey(principalId);
    const row = (await this.entraQueries.readManagedIdentityRows()).find(
      (candidate) => normalizeKey(String(candidate.id ?? "")) === normalizedPrincipalId
    ) as ManagedIdentity | undefined;

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "managedIdentity",
        id: row.id,
        displayName: row.displayName
      },
      evidence: flattenCandidateEvidence(row.ownerCandidates ?? [])
    };
  }

  private async readResourceGroupEvidence(
    subscriptionId: string,
    resourceGroup: string
  ): Promise<OwnershipEvidenceResponse> {
    const normalizedSubscriptionId = normalizeKey(subscriptionId);
    const normalizedResourceGroup = normalizeKey(resourceGroup);
    const row = (await this.azureResourcesQueries.readResourceGroupOwnershipRows()).find(
      (candidate) =>
        normalizeKey(candidate.subscriptionId) === normalizedSubscriptionId &&
        normalizeKey(candidate.resourceGroup) === normalizedResourceGroup
    );

    if (!row) {
      throw new RuntimeHttpError("Ownership evidence target was not found.", 404);
    }

    return {
      target: {
        kind: "resourceGroup",
        id: row.targetKey,
        displayName: row.resourceGroup,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        resourceGroup: row.resourceGroup
      },
      evidence: flattenResourceGroupCandidateEvidence(row)
    };
  }
}

function flattenResourceGroupCandidateEvidence(
  row: ResourceGroupOwnershipRow
): OwnershipEvidenceItem[] {
  return flattenCandidateEvidence(row.ownerCandidates);
}

function flattenCandidateEvidence(candidates: OwnerCandidate[]): OwnershipEvidenceItem[] {
  return candidates.flatMap((candidate) =>
    candidate.evidence.map((evidence) => {
      const item: OwnershipEvidenceItem = {
        key: getOwnershipEvidenceItemKey(candidate, evidence),
        ownerCandidateKey: candidate.key,
        ownerDisplayName: candidate.displayName,
        ownerType: candidate.type,
        confidence: candidate.confidence,
        source: candidate.source,
        path: inferOwnershipEvidencePath(candidate),
        discoverySource: inferOwnershipEvidenceDiscoverySource(candidate, evidence),
        rank: candidate.rank,
        evidence: evidence.user,
        date: evidence.date,
        relatedScopes: candidate.relatedScopes
      };

      if (evidence.disabled !== undefined) {
        item.disabled = evidence.disabled;
      }

      return item;
    })
  );
}

function getOwnershipEvidenceItemKey(candidate: OwnerCandidate, evidence: OwnerEvidence): string {
  return [candidate.key, evidence.user.trim().toLowerCase(), evidence.date ?? ""].join(":");
}

function inferOwnershipEvidencePath(candidate: OwnerCandidate): OwnershipEvidencePath {
  if (candidate.source === "resourceGroupOwner" || candidate.source === "subscriptionOwner") {
    return "indirect";
  }

  return "direct";
}

function inferOwnershipEvidenceDiscoverySource(
  candidate: OwnerCandidate,
  evidence: OwnerEvidence
): OwnershipEvidenceDiscoverySource {
  switch (candidate.source) {
    case "resourceGroupOwner":
      return inferScopedOwnerDiscoverySource(evidence);
    case "subscriptionOwner":
      return inferScopedOwnerDiscoverySource(evidence);
    case "entraServicePrincipalOwner":
      return "servicePrincipalOwner";
    case "entraApplicationOwner":
      return "applicationOwner";
    case "activity":
      return "activityLog";
    case "tag":
      return "tag";
    default:
      return assertNeverOwnerCandidateSource(candidate.source);
  }
}

function inferScopedOwnerDiscoverySource(evidence: OwnerEvidence): OwnershipEvidenceDiscoverySource {
  if (evidence.user.includes("=")) {
    return "tag";
  }

  return "activityLog";
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported ownership evidence target kind: ${(value as { kind?: OwnershipEvidenceTargetKind }).kind}`);
}

function assertNeverOwnerCandidateSource(value: never): never {
  throw new Error(`Unsupported owner candidate source: ${value as OwnerCandidateSource}`);
}
