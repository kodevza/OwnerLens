import type { PermissionRiskLevel } from "../../risk/types";
import type { Tags } from "../tags";

export type ServicePrincipalType = "Application" | "ManagedIdentity" | "ServiceIdentity" | "SocialIdp" | "Legacy";

type ServicePrincipalAppRole = {
  id: string;
  value: string | null;
  displayName: string | null;
  description: string | null;
  isEnabled: boolean | null;
  allowedMemberTypes: string[];
};

type ServicePrincipalOwner = {
  id?: string | null;
  displayName?: string | null;
  userPrincipalName?: string | null;
  mail?: string | null;
  ownerType?: string | null;
};

export type EntraServicePrincipal = {
  id: string;
  appId: string;
  displayName: string;
  appDisplayName: string | null;
  servicePrincipalType: ServicePrincipalType;
  publisherName: string | null;
  accountEnabled: boolean;
  appOwnerOrganizationId: string | null;
  homepage: string | null;
  loginUrl: string | null;
  replyUrls: string[];
  servicePrincipalNames: string[];
  tags: Tags;
  appRoles?: ServicePrincipalAppRole[];
  servicePrincipalOwners?: ServicePrincipalOwner[];
  applicationOwners?: ServicePrincipalOwner[];
  metadata?: Record<string, unknown> | null;
};

export type EntraOAuth2PermissionGrant = {
  id: string;
  clientId: string;
  consentType: "Principal" | "AllPrincipals" | string;
  principalId: string | null;
  resourceId: string;
  risk: PermissionRiskLevel;
  scope: string;
};

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

export type EntraAppRole = ServicePrincipalAppRole;
export type EntraServicePrincipalType = ServicePrincipalType;
export type EntraOwner = ServicePrincipalOwner;
export type EntraUserGroupMembershipResponse = {
  user: string;
  groups: Array<{
    groupId: string;
    groupDisplayName: string | null;
  }>;
};
