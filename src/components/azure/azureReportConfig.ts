import type { ReportColumnHelp } from "../../report/reportTypes";

export const azureOwnerColumnHelp = {
  target: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: [
      "Shows Subscription when the row represents a subscription.",
      "Shows the resource group name when the row represents a resource group."
    ]
  },
  resourceGroup: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: ["Shows the resource group name from the owner row built from the Azure resource snapshot."]
  },
  subscription: {
    source: "Direct from Azure resource snapshot JSON.",
    field: "subscriptionName",
    logic: ["Copied from the subscription or resource group record used to build the owner row."]
  },
  subscriptionName: {
    source: "Direct from Azure resource snapshot JSON.",
    field: "subscriptionName",
    logic: ["Copied from the subscription or resource group record used to build the owner row."]
  },
  owner: {
    source: "Computed by app from Azure tags and activity logs.",
    logic: [
      "First checks configured owner tags on the resource group or subscription.",
      "If no tag owner is found, falls back to the most recent write/delete/action caller in Azure activity logs.",
      "CostCenter tag values are mapped through the configured cost center owner map."
    ]
  },
  confidence: {
    source: "Computed by app during owner resolution.",
    logic: [
      "Tag-derived owners use the configured confidence for that tag.",
      "Activity-log fallback is low confidence.",
      "No usable tag or activity caller returns none."
    ]
  },
  ownerConfidence: {
    source: "Computed by app during owner resolution.",
    logic: [
      "Uses the strongest confidence among resource group owner rows targeted by this principal's Azure RBAC scopes.",
      "No usable owner evidence returns none."
    ]
  },
  source: {
    source: "Computed by app during owner resolution.",
    logic: [
      "tag.<name> means the owner came from that Azure tag.",
      "activity.lastModifier means the owner came from resource group activity.",
      "activity.subscriptionLastModifier means the owner came from subscription activity.",
      "none means no owner evidence was found."
    ]
  },
  evidence: {
    source: "Computed by app from Azure tag values or activity logs.",
    logic: [
      "For tag owners, shows the tag value or CostCenter mapping.",
      "For activity fallback, shows recent distinct callers and event timestamps.",
      "Service principal callers are displayed by Entra display name when known."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure role assignments and Entra service principals.",
    logic: [
      "Counts Azure RBAC assignments scoped to the resource group or resources inside it.",
      "Includes only assignments for service principals and managed identities.",
      "Badge color uses the highest role risk across the matching assignments."
    ]
  }
} satisfies Record<string, ReportColumnHelp>;

export const azureManagedIdentityColumnHelp = {
  displayName: {
    source: "Direct from Entra JSON.",
    field: "displayName",
    logic: [
      "Display name is shown as-is, with empty values shown as a dash.",
      "Object ID from the same Entra object is shown below the display name for traceability."
    ]
  },
  resourceGroup: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: [
      "For user-assigned managed identities, uses the managed identity resource group captured in userAssignedManagedIdentities.",
      "For system-assigned managed identities, uses the resource group of the assigned Azure resource.",
      "When the same identity appears in multiple groups, shows each distinct resource group."
    ]
  },
  assignedResourceGroups: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: [
      "For user-assigned managed identities, uses the managed identity resource group captured in userAssignedManagedIdentities.",
      "For system-assigned managed identities, uses the resource group of the assigned Azure resource.",
      "When the same identity appears in multiple groups, shows each distinct resource group."
    ]
  },
  potentialOwners: {
    source: "Computed by app from the Owner Report resource group rows.",
    logic: [
      "Looks up the resource group shown for the managed identity in the resolved owner report.",
      "Projects each resource group's owner as an owner candidate for the managed identity.",
      "Shows the top candidate with type and confidence, plus a count of additional candidates."
    ]
  },
  ownerConfidence: {
    source: "Computed by app from the matching resource group owner rows.",
    logic: [
      "Uses the strongest confidence among resource group owner rows assigned to this managed identity.",
      "No usable owner evidence returns none."
    ]
  },
  miAssignment: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: [
      "Scans Azure resources for system-assigned and user-assigned managed identities.",
      "Matches assignments to this Entra service principal by object ID or client/app ID.",
      "Shows assigned resource name, type, and resource group."
    ]
  },
  permissionRisk: {
    source: "Computed by app from Azure roleAssignments JSON.",
    logic: [
      "Finds Azure RBAC assignments whose principalId matches this Entra object ID, case-insensitively.",
      "Owner, User Access Administrator, Role Based Access Control Administrator, Privileged Role Administrator, and Key Vault Administrator start as high risk.",
      "Reader starts as low risk; missing, custom, unclassified, Contributor, Administrator, Data Owner, Data Contributor, and Operator-style roles start as medium risk.",
      "Management group and subscription scopes are broad: a medium role at a broad scope is raised to high.",
      "Resource scopes are narrow: a high role at a single resource is lowered to medium.",
      "Column shows the highest adjusted risk across all matching assignments; no assignments returns none."
    ]
  },
  RemediationPackages: {
    source: "Computed by app from local runtime remediation packages.",
    logic: [
      "Finds Zero Trust Assessment remediation package tasks whose target matches this Entra service principal object ID.",
      "Also resolves tasks targeting an application object ID back to the matching service principal by appId.",
      "Shows each matching package by creation time; clicking opens the local remediation package tab."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure roleAssignments JSON.",
    logic: [
      "Lists matching Azure RBAC assignments for this principal.",
      "Adds risk reasons such as privileged role, write-capable role, read-only role, broad scope, or unclassified role.",
      "Shows no Azure RBAC assignments when no assignment matches."
    ]
  },
  oauthPermissionsCount: {
    source: "Computed by app from Entra OAuth2 permission grants and app role assignments JSON.",
    field: "oauth2PermissionGrants[].scope and appRoleAssignments[].principalId",
    logic: [
      "Finds OAuth2 permission grants whose clientId matches this Entra object ID, case-insensitively.",
      "Counts individual delegated permission scopes split from the grant scope string.",
      "Finds app role assignments whose principalId matches this Entra object ID and counts each matching application permission.",
      "Badge format is delegated/application, for example 0/1 means no delegated scopes and one application app role assignment.",
      "Badge risk is high when any matching OAuth2 permission grant has tenant-wide AllPrincipals consent, medium when any non-tenant-wide delegated or application permission exists, and none when no permissions exist.",
      "For Directory.Read.All on a managed identity, resolve the managed identity service principal by Object ID, resolve Microsoft Graph by appId 00000003-0000-0000-c000-000000000000, select the Directory.Read.All application app role, then create the service principal app role assignment with ServicePrincipalId and PrincipalId set to the managed identity service principal Id."
    ]
  },
  appRolesPermissionCount: {
    source: "Computed by app from Entra app role assignments JSON.",
    field: "appRoleAssignments[].principalId",
    logic: [
      "Finds app role assignments whose principalId matches this Entra object ID, case-insensitively.",
      "Counts each matching app role assignment.",
      "No matching assignments returns zero."
    ]
  },
  entraPermissionRisk: {
    source: "Computed by app from Entra OAuth2 permission grants and app role assignments JSON.",
    field: "oauth2PermissionGrants[].consentType and appRoleAssignments[].principalId",
    logic: [
      "Returns high when any matching OAuth2 permission grant has consentType equal to AllPrincipals.",
      "Returns medium when matching delegated scopes or app role assignments exist without tenant-wide delegated consent.",
      "Returns none when no matching Entra API permissions exist."
    ]
  },
  enabled: {
    source: "Direct from Entra JSON.",
    field: "accountEnabled"
  },
  accountEnabled: {
    source: "Direct from Entra JSON.",
    field: "accountEnabled"
  },
  objectId: {
    source: "Direct from Entra JSON.",
    field: "id"
  },
  appId: {
    source: "Direct from Entra JSON.",
    field: "appId"
  },
  appDisplayName: {
    source: "Direct from Entra JSON.",
    field: "appDisplayName",
    logic: ["Displayed as-is, with empty values shown as a dash."]
  },
  servicePrincipalNames: {
    source: "Direct from Entra JSON.",
    field: "servicePrincipalNames",
    logic: ["Array values are joined with commas; empty arrays are shown as a dash."]
  },
  tags: {
    source: "Direct from Entra JSON.",
    field: "tags",
    logic: ["Array values are joined with commas; empty arrays are shown as a dash."]
  }
} satisfies Record<string, ReportColumnHelp>;

export const azureServicePrincipalColumnHelp = {
  ...azureManagedIdentityColumnHelp,
  ownership: {
    source: "Computed by app from Entra JSON.",
    logic: [
      "ManagedIdentity service principals are treated as Tenant owned.",
      "Application service principals are Tenant owned when appOwnerOrganizationId equals the snapshot tenantId.",
      "A different appOwnerOrganizationId is External; a missing value is Unknown."
    ]
  },
  servicePrincipalOwners: {
    source: "Direct from Entra JSON.",
    field: "servicePrincipals[].servicePrincipalOwners",
    logic: [
      "Exported from the Microsoft Graph Service Principal owners relationship.",
      "Owner mail is preferred, then userPrincipalName, displayName, and object ID.",
      "Multiple owners are shown as a comma-separated list."
    ]
  },
  potentialOwners: {
    source: "Computed by app from Service Principal Azure RBAC assignments and Azure owner report rows.",
    logic: [
      "Finds Azure RBAC assignments for this Service Principal.",
      "Collects resource groups targeted by those RBAC scopes.",
      "Subscription-scoped RBAC expands to every resource group in the assigned subscription.",
      "Projects distinct owner candidates from those resource group owner rows with related scope context."
    ]
  },
  ownerConfidence: {
    source: "Computed by app from the matching resource group owner rows.",
    logic: [
      "Uses the strongest confidence among resource group owner rows targeted by this Service Principal's Azure RBAC scopes.",
      "No usable owner evidence returns none."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure roleAssignments JSON.",
    logic: [
      "Lists matching Azure RBAC assignments for this principal.",
      "For managed identity permission summaries, includes risk reasons such as broad scope or privileged role.",
      "When no permission summary exists, lists direct role assignments by role and formatted scope."
    ]
  },
  type: {
    source: "Direct from Entra JSON.",
    field: "servicePrincipalType",
    logic: ["Displayed as-is, with empty values shown as a dash."]
  },
  servicePrincipalType: {
    source: "Direct from Entra JSON.",
    field: "servicePrincipalType",
    logic: ["Displayed as-is, with empty values shown as a dash."]
  }
} satisfies Record<string, ReportColumnHelp>;
