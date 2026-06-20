import type { OwnershipEvidenceItem, OwnershipEvidenceResponse } from "../../../core/ownership/types";

export function getEvidenceStatusLabel(evidence: Pick<OwnershipEvidenceItem, "disabled">): "Active" | "Inactive" {
  return evidence.disabled ? "Inactive" : "Active";
}

export function formatOwnershipEvidenceScope(scope: OwnershipEvidenceItem["relatedScopes"][number]): string {
  const resourceGroup = scope.resourceGroup ? ` / ${scope.resourceGroup}` : "";
  const assignmentScope = scope.scope ? ` on ${scope.scope}` : "";
  const role = scope.roleDefinitionName ? ` as ${scope.roleDefinitionName}` : "";

  return `${scope.subscriptionName ?? scope.subscriptionId ?? "Subscription"}${resourceGroup}${assignmentScope}${role}`;
}

export function formatOwnershipEvidenceTarget(response: OwnershipEvidenceResponse): string {
  const { target } = response;

  if (target.kind === "resourceGroup") {
    return `${target.subscriptionName ?? target.subscriptionId ?? "Subscription"} / ${target.resourceGroup ?? target.id}`;
  }

  return target.id;
}

export function formatOwnershipEvidenceSource(source: OwnershipEvidenceItem["source"]): string {
  switch (source) {
    case "resourceGroupOwner":
      return "Resource group owner";
    case "subscriptionOwner":
      return "Subscription owner";
    case "entraServicePrincipalOwner":
      return "Service principal owner";
    case "entraApplicationOwner":
      return "Application owner";
    case "activity":
      return "Activity";
    case "tag":
      return "Tag";
  }
}

export function formatOwnershipEvidencePath(path: OwnershipEvidenceItem["path"]): string {
  switch (path) {
    case "direct":
      return "Direct";
    case "indirect":
      return "Indirect";
  }
}

export function formatOwnershipEvidenceDiscoverySource(source: OwnershipEvidenceItem["discoverySource"]): string {
  switch (source) {
    case "azureRbac":
      return "Azure RBAC";
    case "activityLog":
      return "Activity log";
    case "tag":
      return "Tag";
    case "applicationOwner":
      return "Application owner";
    case "servicePrincipalOwner":
      return "Service principal owner";
  }
}
