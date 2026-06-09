import type { AzureRoleAssignment } from "../../../../core/azure/resources";
import type {
  ManagedIdentityPermissionRiskAssignment,
  ManagedIdentityPermissionRiskLevel
} from "../../../../core/azure/identityEnrichment";
import { classifyAzureScope, isBroadAzureScope } from "./azureScopeClassifier.ts";

const HIGH_RISK_ROLES = new Set([
  "owner",
  "user access administrator",
  "role based access control administrator",
  "privileged role administrator",
  "key vault administrator"
]);

const MEDIUM_RISK_ROLE_PATTERNS = [
  /(^|\s)contributor$/,
  /(^|\s)administrator$/,
  /(^|\s)data owner$/,
  /(^|\s)data contributor$/,
  /(^|\s)operator$/
];

export function evaluateAzureRoleAssignmentRisk(
  assignment: AzureRoleAssignment
): ManagedIdentityPermissionRiskAssignment {
  const reasons: string[] = [];
  const roleLevel = getAzureRoleRiskLevel(assignment.roleDefinitionName);
  const broadScope = isBroadAzureScope(assignment);
  const resourceScope = classifyAzureScope(assignment) === "Resource";
  let riskLevel = roleLevel;

  if (broadScope && roleLevel !== "none") {
    reasons.push("broad scope");
  }

  if (isHighRiskAzureRole(assignment.roleDefinitionName)) {
    reasons.push("privileged role");
  } else if (roleLevel === "medium") {
    reasons.push("write-capable role");
  } else if (roleLevel === "low") {
    reasons.push("read-only role");
  } else if (assignment.roleDefinitionName) {
    reasons.push("custom or unclassified role");
  }

  if (broadScope && roleLevel === "medium") {
    riskLevel = "high";
  } else if (resourceScope && roleLevel === "high") {
    riskLevel = "medium";
  }

  return {
    ...assignment,
    riskLevel,
    reasons
  };
}

function getAzureRoleRiskLevel(roleDefinitionName: string | null): ManagedIdentityPermissionRiskLevel {
  const normalizedRole = normalizeAzureRoleName(roleDefinitionName);

  if (!normalizedRole) {
    return "medium";
  }

  if (isHighRiskAzureRole(normalizedRole)) {
    return "high";
  }

  if (normalizedRole === "reader") {
    return "low";
  }

  if (MEDIUM_RISK_ROLE_PATTERNS.some((pattern) => pattern.test(normalizedRole))) {
    return "medium";
  }

  return "medium";
}

function isHighRiskAzureRole(roleDefinitionName: string | null): boolean {
  return HIGH_RISK_ROLES.has(normalizeAzureRoleName(roleDefinitionName));
}

function normalizeAzureRoleName(roleDefinitionName: string | null): string {
  return roleDefinitionName?.trim().toLowerCase() ?? "";
}
