export type OwnerConfidence = "high" | "medium" | "low" | "none";

export type OwnerEvidence = {
  user: string;
  date: string | null;
  disabled?: boolean;
};

export type OwnerType = "ownerUser" | "ownerGroup" | "ownerTag" | "application" | "unknown";

export type OwnerCandidateSource =
  | "resourceGroupOwner"
  | "subscriptionOwner"
  | "entraServicePrincipalOwner"
  | "entraApplicationOwner"
  | "activity"
  | "tag";

export type OwnershipEvidencePath = "direct" | "indirect";

export type OwnershipEvidenceDiscoverySource =
  | "azureRbac"
  | "activityLog"
  | "tag"
  | "applicationOwner"
  | "servicePrincipalOwner";

export type OwnerCandidateScope = {
  subscriptionId?: string;
  subscriptionName?: string;
  resourceGroup?: string;
  principalId?: string;
  scope?: string;
  roleDefinitionName?: string | null;
};

export type OwnerCandidate = {
  key: string;
  displayName: string;
  type: OwnerType;
  confidence: OwnerConfidence;
  source: OwnerCandidateSource;
  rank: number;
  evidence: OwnerEvidence[];
  relatedScopes: OwnerCandidateScope[];
};

export type OwnerResolution = {
  owner: string | null;
  confidence: OwnerConfidence;
  source: string;
  evidence: OwnerEvidence[];
};

export type OwnershipEvidenceTargetKind = "servicePrincipal" | "managedIdentity" | "resourceGroup";

export type OwnershipEvidenceItem = {
  key: string;
  ownerCandidateKey: string;
  ownerDisplayName: string;
  ownerType: OwnerType;
  confidence: OwnerConfidence;
  source: OwnerCandidateSource;
  path: OwnershipEvidencePath;
  discoverySource: OwnershipEvidenceDiscoverySource;
  rank: number;
  evidence: string;
  date: string | null;
  disabled?: boolean;
  relatedScopes: OwnerCandidateScope[];
};

export type OwnershipEvidenceResponse = {
  target: {
    kind: OwnershipEvidenceTargetKind;
    id: string;
    displayName?: string;
    subscriptionId?: string;
    subscriptionName?: string;
    resourceGroup?: string;
  };
  evidence: OwnershipEvidenceItem[];
};
