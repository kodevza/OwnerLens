import type { EntraOwner } from "../../../../core/azure/entra/types";
import type { Tags } from "../../../../core/azure/tags";
import { appConfig } from "../../../../core/config";
import { rankOwnerCandidates } from "../../../../core/ownership/ownerCandidateRanking";
import type {
  OwnerCandidate,
  OwnerCandidateSource,
  OwnerEvidence,
  OwnerType,
  OwnershipEvidenceDiscoverySource,
  OwnershipEvidenceItem,
  OwnershipEvidencePath
} from "../../../../core/ownership/types";

type EntraPrincipalDirectOwnerSource = {
  tags: Tags | string[];
  servicePrincipalOwners?: EntraOwner[];
  applicationOwners?: EntraOwner[];
};

export function readEntraPrincipalDirectOwnerCandidates(row: EntraPrincipalDirectOwnerSource): OwnerCandidate[] {
  return rankOwnerCandidates([
    ...readEntraPrincipalTagOwnerCandidates(row),
    ...mapEntraOwnersToOwnerCandidates(row.applicationOwners ?? [], "entraApplicationOwner"),
    ...mapEntraOwnersToOwnerCandidates(row.servicePrincipalOwners ?? [], "entraServicePrincipalOwner")
  ]);
}

export function flattenCandidateEvidence(candidates: OwnerCandidate[]): OwnershipEvidenceItem[] {
  return candidates.flatMap((candidate) =>
    candidate.evidence.map((evidence) => {
      const item: OwnershipEvidenceItem = {
        key: evidence.key ?? getOwnershipEvidenceItemKey(candidate, evidence),
        statusKey: null,
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

function readEntraPrincipalTagOwnerCandidates(row: EntraPrincipalDirectOwnerSource): OwnerCandidate[] {
  const candidates: OwnerCandidate[] = [];

  for (const tag of readConfiguredEntraPrincipalOwnerTags(row.tags)) {
    candidates.push({
      key: getServicePrincipalTagOwnerCandidateKey(tag.type, tag.value),
      displayName: tag.value,
      type: tag.type,
      confidence: tag.confidence,
      source: "tag",
      rank: 0,
      evidence: [
        {
          user: `${tag.name}=${tag.value}`,
          date: null
        }
      ],
      relatedScopes: []
    });
  }

  return candidates;
}

function readConfiguredEntraPrincipalOwnerTags(
  tags: EntraPrincipalDirectOwnerSource["tags"]
): Array<{ name: string; value: string; confidence: Exclude<OwnerCandidate["confidence"], "none">; type: OwnerType }> {
  const tagEntries = readEntraPrincipalTagEntries(tags);
  const ownerTags: Array<{
    name: string;
    value: string;
    confidence: Exclude<OwnerCandidate["confidence"], "none">;
    type: OwnerType;
  }> = [];

  for (const tagConfig of appConfig.azure.ownership.ownerTags) {
    const entry = tagEntries.find((candidate) => normalizeKey(candidate.name) === normalizeKey(tagConfig.name));
    const value = entry?.value.trim();

    if (value) {
      ownerTags.push({
        name: tagConfig.name,
        value,
        confidence: tagConfig.confidence,
        type: tagConfig.type
      });
    }
  }

  return ownerTags;
}

function readEntraPrincipalTagEntries(tags: EntraPrincipalDirectOwnerSource["tags"]): Array<{ name: string; value: string }> {
  if (Array.isArray(tags)) {
    return tags.flatMap(readServicePrincipalTagStringEntry);
  }

  return Object.entries(tags ?? {}).flatMap(([name, value]) => {
    const stringValue = value.trim();
    if (stringValue) {
      return [{ name, value: stringValue }];
    }

    return readServicePrincipalTagStringEntry(name);
  });
}

function readServicePrincipalTagStringEntry(tag: string): Array<{ name: string; value: string }> {
  const separatorIndex = findServicePrincipalTagSeparatorIndex(tag);

  if (separatorIndex <= 0) {
    return [];
  }

  const name = tag.slice(0, separatorIndex).trim();
  const value = tag.slice(separatorIndex + 1).trim();

  return name && value ? [{ name, value }] : [];
}

function findServicePrincipalTagSeparatorIndex(tag: string): number {
  const equalsIndex = tag.indexOf("=");
  const colonIndex = tag.indexOf(":");

  if (equalsIndex < 0) {
    return colonIndex;
  }

  if (colonIndex < 0) {
    return equalsIndex;
  }

  return Math.min(equalsIndex, colonIndex);
}

function getServicePrincipalTagOwnerCandidateKey(ownerType: OwnerType, owner: string): string {
  return `${ownerType}:${owner.trim().toLowerCase()}`;
}

function mapEntraOwnersToOwnerCandidates(
  owners: EntraOwner[],
  source: Extract<OwnerCandidateSource, "entraApplicationOwner" | "entraServicePrincipalOwner">
): OwnerCandidate[] {
  const candidates = new Map<string, OwnerCandidate>();

  for (const owner of owners) {
    const ownerValue = getEntraOwnerValue(owner);
    if (!ownerValue) {
      continue;
    }

    const ownerType = inferEntraOwnerType(owner);
    const key = getEntraOwnerCandidateKey(source, ownerType, owner, ownerValue);
    const existing = candidates.get(key);
    const evidence: OwnerEvidence = {
      user: ownerValue,
      date: null
    };

    if (existing) {
      existing.evidence.push(evidence);
      continue;
    }

    candidates.set(key, {
      key,
      displayName: ownerValue,
      type: ownerType,
      confidence: "high",
      source,
      rank: 0,
      evidence: [evidence],
      relatedScopes: []
    });
  }

  return [...candidates.values()];
}

function getEntraOwnerValue(owner: EntraOwner): string | null {
  return firstNonEmpty([
    owner.userPrincipalName,
    owner.mail,
    owner.displayName,
    owner.id
  ]);
}

function getEntraOwnerCandidateKey(
  source: Extract<OwnerCandidateSource, "entraApplicationOwner" | "entraServicePrincipalOwner">,
  ownerType: OwnerType,
  owner: EntraOwner,
  ownerValue: string
): string {
  const keyValue = firstNonEmpty([
    owner.id,
    owner.userPrincipalName,
    owner.mail,
    owner.displayName,
    ownerValue
  ]) ?? ownerValue;

  return `${source}:${ownerType}:${keyValue.trim().toLowerCase()}`;
}

function inferEntraOwnerType(owner: EntraOwner): OwnerType {
  const ownerType = owner.ownerType?.trim().toLowerCase() ?? "";

  if (ownerType === "user" || ownerType.endsWith(".user")) {
    return "ownerUser";
  }

  if (ownerType === "group" || ownerType.endsWith(".group")) {
    return "ownerGroup";
  }

  if (
    ownerType === "application" ||
    ownerType === "serviceprincipal" ||
    ownerType.endsWith(".application") ||
    ownerType.endsWith(".serviceprincipal")
  ) {
    return "application";
  }

  if (owner.userPrincipalName?.includes("@") || owner.mail?.includes("@")) {
    return "ownerUser";
  }

  return "unknown";
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
    case "ownerCustom":
      return "ownerCustom";
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

function firstNonEmpty(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertNeverOwnerCandidateSource(value: never): never {
  throw new Error(`Unsupported owner candidate source: ${value as OwnerCandidateSource}`);
}
