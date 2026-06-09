import type { AzureUserAssignedIdentityAssignment } from "../../../core/azure/resources";

export function normalizeUserAssignedIdentityAssignments(
  userAssignedIdentities: unknown
): AzureUserAssignedIdentityAssignment[] {
  if (!isRecord(userAssignedIdentities)) {
    return Array.isArray(userAssignedIdentities)
      ? userAssignedIdentities.map(normalizeExistingAssignment).filter(isAssignment)
      : [];
  }

  return Object.entries(userAssignedIdentities).map(([resourceId, details]) => ({
    resourceId,
    clientId: getStringProperty(details, "clientId"),
    principalId: getStringProperty(details, "principalId")
  }));
}

function normalizeExistingAssignment(value: unknown): AzureUserAssignedIdentityAssignment | null {
  if (!isRecord(value)) {
    return null;
  }

  const resourceId = getStringProperty(value, "resourceId");
  if (!resourceId) {
    return null;
  }

  return {
    resourceId,
    clientId: getStringProperty(value, "clientId"),
    principalId: getStringProperty(value, "principalId")
  };
}

function isAssignment(value: AzureUserAssignedIdentityAssignment | null): value is AzureUserAssignedIdentityAssignment {
  return value !== null;
}

function getStringProperty(value: unknown, propertyName: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const matchingKey = Object.keys(value).find((key) => key.toLowerCase() === propertyName.toLowerCase());
  const propertyValue = matchingKey ? value[matchingKey] : null;
  return typeof propertyValue === "string" && propertyValue.trim() ? propertyValue.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
