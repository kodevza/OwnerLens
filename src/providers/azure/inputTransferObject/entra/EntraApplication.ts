import type { EntraOwner, EntraAppRole } from "./EntraServicePrincipal";

export type EntraApplicationCredential = Record<string, unknown>;

export type EntraApplication = {
  id: string;
  appId: string;
  displayName: string;
  signInAudience: string | null;
  publisherDomain: string | null;
  identifierUris: string[];
  tags: string[];
  appRoles: EntraAppRole[];
  oauth2PermissionScopes: Record<string, unknown>[];
  requiredResourceAccess: Record<string, unknown>[];
  web: Record<string, unknown> | null;
  spa: Record<string, unknown> | null;
  publicClient: Record<string, unknown> | null;
  passwordCredentials: EntraApplicationCredential[];
  keyCredentials: EntraApplicationCredential[];
  createdDateTime: string | null;
  deletedDateTime: string | null;
  disabledByMicrosoftStatus: string | null;
  info: Record<string, unknown> | null;
  notes: string | null;
  owners: EntraOwner[];
};
