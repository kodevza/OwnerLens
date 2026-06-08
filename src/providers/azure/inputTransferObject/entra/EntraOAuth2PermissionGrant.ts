export type EntraOAuth2PermissionGrant = {
  id: string;
  clientId: string;
  consentType: "Principal" | "AllPrincipals" | string;
  principalId: string | null;
  resourceId: string;
  scope: string;
};
