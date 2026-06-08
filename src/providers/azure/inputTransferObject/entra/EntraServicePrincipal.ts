export type ServicePrincipalType = "Application" | "ManagedIdentity" | "SocialIdp" | "Legacy";

export type ServicePrincipalAppRole = {
  id: string;
  value: string | null;
  displayName: string | null;
  description: string | null;
  isEnabled: boolean | null;
  allowedMemberTypes: string[];
};

export type ServicePrincipalOwner = {
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
  tags: string[];
  appRoles?: ServicePrincipalAppRole[];
  owners?: ServicePrincipalOwner[];
  appOwners?: ServicePrincipalOwner[];
  servicePrincipalOwners?: ServicePrincipalOwner[];
  applicationOwners?: ServicePrincipalOwner[];
  metadata?: Record<string, unknown> | null;
};

export type EntraAppRole = ServicePrincipalAppRole;
export type EntraOwner = ServicePrincipalOwner;
