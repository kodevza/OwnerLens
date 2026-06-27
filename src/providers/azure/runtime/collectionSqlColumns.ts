import type { RuntimeSqlColumnMap } from "./runtimeSqlCollectionQuery";

export const entraPrincipalSqlColumns: RuntimeSqlColumnMap = {
  id: { expr: "id", type: "text" },
  appId: { expr: "\"appId\"", type: "text" },
  displayName: { expr: "\"displayName\"", type: "text" },
  appDisplayName: { expr: "\"appDisplayName\"", type: "text" },
  servicePrincipalType: { expr: "\"servicePrincipalType\"", type: "text" },
  publisherName: { expr: "\"publisherName\"", type: "text" },
  accountEnabled: { expr: "\"accountEnabled\"", type: "text" },
  appOwnerOrganizationId: { expr: "\"appOwnerOrganizationId\"", type: "text" },
  homepage: { expr: "homepage", type: "text" },
  loginUrl: { expr: "\"loginUrl\"", type: "text" },
  replyUrls: { expr: "\"replyUrls\"", type: "text" },
  servicePrincipalNames: { expr: "\"servicePrincipalNames\"", type: "text" },
  tags: { expr: "tags", type: "text" },
  permissionRisk: { expr: "\"permissionRisk\"", type: "risk" },
  rbacRoleAssignmentCount: { expr: "\"rbacRoleAssignmentCount\"", type: "number" },
  rbacRoleLevel: { expr: "\"rbacRoleLevel\"", type: "risk" },
  oauthPermissionsCount: { expr: "\"oauthPermissionsCount\"", type: "number" },
  appRolesPermissionCount: { expr: "\"appRolesPermissionCount\"", type: "number" },
  entraPermissionCount: { expr: "\"entraPermissionCount\"", type: "number" },
  entraPermissionRisk: { expr: "\"entraPermissionRisk\"", type: "risk" },
  managedIdentityHomeResourceGroup: { expr: "\"managedIdentityHomeResourceGroup\"", type: "text" },
  assignedResourceGroups: { expr: "\"assignedResourceGroups\"", type: "text" },
  resourceGroup: { expr: "\"resourceGroup\"", type: "text" },
  potentialOwners: { expr: "\"potentialOwners\"", type: "text" },
  ownerConfidence: { expr: "\"ownerConfidence\"", type: "risk" },
  "ownerCandidates.displayName": { expr: "\"potentialOwners\"", type: "text" }
};

export const resourceGroupSqlColumns: RuntimeSqlColumnMap = {
  subscriptionId: { expr: "\"subscriptionId\"", type: "text" },
  subscriptionName: { expr: "\"subscriptionName\"", type: "text" },
  resourceGroup: { expr: "\"resourceGroup\"", type: "text" },
  location: { expr: "location", type: "text" },
  tags: { expr: "tags", type: "text" },
  owner: { expr: "owner", type: "text" },
  "ownerCandidates.displayName": { expr: "\"ownerCandidates\"", type: "text" },
  confidence: { expr: "confidence", type: "risk" },
  source: { expr: "source", type: "text" },
  rbacRoleAssignmentCount: { expr: "\"rbacRoleAssignmentCount\"", type: "number" },
  rbacRoleLevel: { expr: "\"rbacRoleLevel\"", type: "risk" },
  roleAssignments: { expr: "\"roleAssignments\"", type: "text" },
  targetKey: { expr: "\"targetKey\"", type: "text" }
};
