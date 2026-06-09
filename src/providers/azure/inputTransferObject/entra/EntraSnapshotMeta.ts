export type EntraSnapshotMeta = {
  provider: "entra";
  snapshotVersion: string;
  createdAt: string;
  tenantId: string;
  account: string;
  scopes: string[];
  servicePrincipalCount: number;
  applicationCount?: number;
  oauth2PermissionGrantCount?: number;
  appRoleAssignmentCount?: number;
};
