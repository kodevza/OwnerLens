import type { ReportColumnHelp } from "../../report/reportTypes";

export const azureOwnerColumnHelp = {
  target: {
    source: "Computed by app from Azure resource snapshot JSON.",
    logic: [
      "Shows Subscription when the row represents a subscription.",
      "Shows the resource group name when the row represents a resource group."
    ]
  },
  subscription: {
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
  }
} satisfies Record<string, ReportColumnHelp>;

export const azureManagedIdentityColumnHelp = {
  displayName: {
    source: "Direct from Entra JSON.",
    field: "displayName",
    logic: ["Displayed as-is, with empty values shown as a dash."]
  },
  resourceGroup: {
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
      "Projects each resource group's owner onto the managed identity.",
      "Shows the distinct resolved owner email addresses separated by commas."
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
  azureRbac: {
    source: "Computed by app from Azure roleAssignments JSON.",
    logic: [
      "Lists matching Azure RBAC assignments for this principal.",
      "Adds risk reasons such as privileged role, write-capable role, read-only role, broad scope, or unclassified role.",
      "Shows no Azure RBAC assignments when no assignment matches."
    ]
  },
  enabled: {
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
  potentialOwner: {
    source: "Computed by app from Entra JSON, Service Principal metadata, and Azure owner report rows.",
    logic: [
      "First uses explicit owner metadata on the Service Principal or Application, including owner-style tag values.",
      "Then uses Entra Application or Service Principal owner records when present in the snapshot.",
      "Finally projects the resolved owner of Azure RBAC target subscription or resource group scopes."
    ]
  },
  ownerConfidence: {
    source: "Computed by app from the Service Principal potential owner source.",
    logic: [
      "Explicit Service Principal or Application owner metadata is high confidence.",
      "Entra Application or Service Principal owners are medium confidence.",
      "Owners inferred from Azure RBAC target scopes are low confidence.",
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
  }
} satisfies Record<string, ReportColumnHelp>;
