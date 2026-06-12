import type { EntraApplication } from "./EntraApplication";
import type { EntraOAuth2PermissionGrant } from "./EntraOAuth2PermissionGrant";
import type { EntraServicePrincipal } from "./EntraServicePrincipal";
import type { EntraSnapshotMeta } from "./EntraSnapshotMeta";
import type { InputEntraAppRoleAssignment } from "./InputEntraAppRoleAssignment";

export type EntraSnapshot = {
  meta: EntraSnapshotMeta;
  servicePrincipals: EntraServicePrincipal[];
  applications?: EntraApplication[];
  oauth2PermissionGrants?: EntraOAuth2PermissionGrant[];
  appRoleAssignments?: InputEntraAppRoleAssignment[];
};
