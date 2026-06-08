export type EntraAppRoleAssignment = {
  id: string;
  appRoleId: string;
  appRoleDisplayName: string | null;
  appRoleValue: string | null;
  principalId: string;
  principalDisplayName: string | null;
  resourceId: string;
  resourceDisplayName: string | null;
};
