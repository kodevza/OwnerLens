import type { ReportColumnHelp } from "../../report/reportTypes";

export const azureOwnerColumnHelp = {
  resourceGroup: {
    source: "Direct from Azure resourceGroups snapshot, with subscription context from the same Azure snapshot.",
    field: "resourceGroup, subscriptionName, subscriptionId",
    logic: [
      "Shows the Azure resource group name.",
      "Shows the subscription name below the resource group for context.",
      "Action: clicking the resource group badge opens the resource group in the Azure portal."
    ]
  },
  owner: {
    source: "Computed by app from resolved Azure ownership evidence.",
    field: "ownerCandidates, confidence",
    logic: [
      "Shows the highest-ranked owner candidate for the resource group.",
      "Candidate ranking prefers active evidence, stronger confidence, stronger source, lower priority, and stable display-name ordering.",
      "Badge format is owner name plus owner type; +N means there are N additional owner candidates.",
      "Confidence colors: high is green/emerald, medium is amber, low is blue, none is muted grey.",
      "Action: clicking the badge opens ownership evidence for this resource group; evidence status actions in that view activate or deactivate the selected evidence item."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure roleAssignments and Entra service principal data.",
    field: "roleAssignments, rbacRoleAssignmentCount, rbacRoleLevel",
    logic: [
      "Counts Azure RBAC assignments on this resource group where the principal is a service principal or managed identity.",
      "The badge number is rbacRoleAssignmentCount: the number of matching role assignments.",
      "rbacRoleLevel controls the badge color using the highest risk found across the matching assignments.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey.",
      "Action: clicking the badge opens the Azure RBAC assignment details for this resource group."
    ]
  },
  tags: {
    source: "Direct from Azure resourceGroups snapshot.",
    field: "tags",
    logic: [
      "Shows resource group tags as key:value badges.",
      "Configured owner tags use the high-confidence color: green/emerald.",
      "Non-owner tags use the neutral color: muted grey.",
      "Empty tag sets are shown as a dash."
    ]
  }
} satisfies Record<string, ReportColumnHelp>;

export const azureManagedIdentityColumnHelp = {
  displayName: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "displayName, id, appId, accountEnabled",
    logic: [
      "Shows the managed identity service principal displayName.",
      "Shows the Entra object ID below the display name for traceability.",
      "Disabled principals are rendered in muted text when accountEnabled is false.",
      "Action: clicking the display name opens local principal details; clicking the object ID opens the Enterprise Application in the Microsoft Entra admin center."
    ]
  },
  assignedResourceGroups: {
    source: "Computed by app from Azure managed identity home context, managed identity assignment enrichment, and Azure RBAC resource-group targets.",
    field: "managedIdentityHomeResourceGroup, assignedResourceGroups, resourceGroup",
    logic: [
      "For a managed identity with a known home resource, the home resource group is shown first.",
      "When assignment enrichment is available, assignedResourceGroups lists distinct resource groups where the identity is assigned.",
      "When assignment enrichment is missing, the app falls back to distinct resource groups inferred from home context and RBAC scopes.",
      "Empty resource group evidence is shown as a dash."
    ]
  },
  potentialOwners: {
    source: "Computed by app from managed identity home resource group, Azure RBAC resource-group targets, and resolved resource group ownership evidence.",
    field: "ownerCandidates, potentialOwners, ownerConfidence",
    logic: [
      "Builds owner candidates from direct principal ownership evidence and indirect resource group ownership evidence.",
      "For managed identities, home resource group evidence has priority over RBAC-derived resource group evidence.",
      "Only active ownership evidence is used in the list; disabled evidence is excluded.",
      "Badge format is top owner · owner type; +N means there are N additional owner candidates.",
      "Confidence colors: high is green/emerald, medium is amber, low is blue, none is muted grey.",
      "Action: clicking the badge opens ownership evidence for this managed identity; evidence status actions in that view activate or deactivate the selected evidence item."
    ]
  },
  permissionRisk: {
    source: "Computed by app from Azure role assignment risk enrichment.",
    field: "permissionRisk",
    logic: [
      "Shows the highest Azure RBAC risk level calculated for this managed identity.",
      "High means privileged or broad-scope access; medium means write-capable, unclassified, or narrowed privileged access; low means read-only access; none means no matching Azure RBAC risk evidence.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure role assignment enrichment.",
    field: "rbacRoleAssignmentCount, rbacSubscriptionCount, rbacRoleLevel, roleAssignments",
    logic: [
      "Badge format is assignments/subscriptions.",
      "The first number is rbacRoleAssignmentCount: matching Azure RBAC assignments for this managed identity.",
      "The second number is rbacSubscriptionCount: distinct Azure subscriptions touched by those matching assignments.",
      "Example 3/2 means three role assignments across two distinct subscriptions.",
      "rbacRoleLevel controls the badge color using the highest assignment risk.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey.",
      "Action: clicking the badge opens Azure RBAC assignment details for this managed identity."
    ]
  },
  oauthPermissionsCount: {
    source: "Computed by app from Entra OAuth2 permission grants and app role assignments.",
    field: "oauthPermissionsCount, appRolesPermissionCount, entraPermissionCount, entraPermissionRisk",
    logic: [
      "Badge format is delegated/application.",
      "The first number is oauthPermissionsCount: delegated OAuth2 permission scopes counted from oauth2PermissionGrants.scope after splitting the scope string.",
      "The second number is appRolesPermissionCount: application permissions counted from appRoleAssignments where principalId matches this managed identity object ID.",
      "entraPermissionCount is the total of both counts, but the visible badge intentionally shows the split, not the total.",
      "Example 0/1 means zero delegated scopes and one application app role assignment.",
      "entraPermissionRisk controls the badge color: high when any tenant-wide delegated grant has consentType AllPrincipals, medium when any non-tenant-wide delegated or application permission exists, none when no Entra API permissions exist.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey.",
      "Action: clicking the badge opens Entra API permission details for this managed identity."
    ]
  },
  tags: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "tags",
    logic: [
      "Shows Entra service principal tags as badges.",
      "Configured owner tags use the high-confidence color: green/emerald.",
      "Non-owner tags use the neutral color: muted grey.",
      "Empty tag sets are shown as a dash."
    ]
  }
} satisfies Record<string, ReportColumnHelp>;

export const azureServicePrincipalColumnHelp = {
  displayName: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "displayName, id, appId, accountEnabled",
    logic: [
      "Shows the service principal displayName.",
      "Shows the Entra object ID below the display name for traceability.",
      "Disabled principals are rendered in muted text when accountEnabled is false.",
      "Action: clicking the display name opens local principal details; clicking the object ID opens the Enterprise Application in the Microsoft Entra admin center."
    ]
  },
  servicePrincipalType: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "servicePrincipalType",
    logic: [
      "Shows the Entra service principal type.",
      "The Service Principal table excludes ManagedIdentity rows; managed identities are shown in the separate Managed Identity table.",
      "Current filter options are Application, ServiceIdentity, SocialIdp, and Legacy."
    ]
  },
  potentialOwners: {
    source: "Computed by app from direct principal ownership evidence, Azure RBAC resource-group targets, and resolved resource group ownership evidence.",
    field: "ownerCandidates, potentialOwners, ownerConfidence",
    logic: [
      "Finds direct ownership evidence for the service principal when available.",
      "Also finds Azure RBAC assignments for the service principal, maps those scopes to resource groups, and projects resource group owner candidates back to the service principal.",
      "Subscription-scoped RBAC is expanded to related resource group ownership evidence when available.",
      "Only active ownership evidence is used in the list; disabled evidence is excluded.",
      "Badge format is top owner · owner type; +N means there are N additional owner candidates.",
      "Confidence colors: high is green/emerald, medium is amber, low is blue, none is muted grey.",
      "Action: clicking the badge opens ownership evidence for this service principal; evidence status actions in that view activate or deactivate the selected evidence item."
    ]
  },
  permissionRisk: {
    source: "Computed by app from Azure role assignment risk enrichment.",
    field: "permissionRisk",
    logic: [
      "Shows the highest Azure RBAC risk level calculated for this service principal.",
      "High means privileged or broad-scope access; medium means write-capable, unclassified, or narrowed privileged access; low means read-only access; none means no matching Azure RBAC risk evidence.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey."
    ]
  },
  azureRbac: {
    source: "Computed by app from Azure role assignment enrichment.",
    field: "rbacRoleAssignmentCount, rbacSubscriptionCount, rbacRoleLevel, roleAssignments",
    logic: [
      "Badge format is assignments/subscriptions.",
      "The first number is rbacRoleAssignmentCount: matching Azure RBAC assignments for this service principal.",
      "The second number is rbacSubscriptionCount: distinct Azure subscriptions touched by those matching assignments.",
      "Example 3/2 means three role assignments across two distinct subscriptions.",
      "rbacRoleLevel controls the badge color using the highest assignment risk.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey.",
      "Action: clicking the badge opens Azure RBAC assignment details for this service principal."
    ]
  },
  oauthPermissionsCount: {
    source: "Computed by app from Entra OAuth2 permission grants and app role assignments.",
    field: "oauthPermissionsCount, appRolesPermissionCount, entraPermissionCount, entraPermissionRisk",
    logic: [
      "Badge format is delegated/application.",
      "The first number is oauthPermissionsCount: delegated OAuth2 permission scopes counted from oauth2PermissionGrants.scope after splitting the scope string.",
      "The second number is appRolesPermissionCount: application permissions counted from appRoleAssignments where principalId matches this service principal object ID.",
      "entraPermissionCount is the total of both counts, but the visible badge intentionally shows the split, not the total.",
      "Example 0/1 means zero delegated scopes and one application app role assignment.",
      "entraPermissionRisk controls the badge color: high when any tenant-wide delegated grant has consentType AllPrincipals, medium when any non-tenant-wide delegated or application permission exists, none when no Entra API permissions exist.",
      "Risk colors: high is red, medium is amber, low is green/emerald, none is muted grey.",
      "Action: clicking the badge opens Entra API permission details for this service principal."
    ]
  },
  publisherName: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "publisherName",
    logic: [
      "Shows the publisherName from the Entra service principal record.",
      "Empty values are shown as a dash."
    ]
  },
  tags: {
    source: "Direct from Entra servicePrincipals snapshot.",
    field: "tags",
    logic: [
      "Shows Entra service principal tags as badges.",
      "Configured owner tags use the high-confidence color: green/emerald.",
      "Non-owner tags use the neutral color: muted grey.",
      "Empty tag sets are shown as a dash."
    ]
  }
} satisfies Record<string, ReportColumnHelp>;
