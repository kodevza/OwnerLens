import type {
  EntraAppRole as CoreEntraAppRole,
  EntraOwner as CoreEntraOwner,
  EntraServicePrincipal as CoreEntraServicePrincipal
} from "../../../../core/azure/entra/types";
import type {
  EntraServicePrincipal,
  ServicePrincipalAppRole as EntraAppRole,
  ServicePrincipalOwner as EntraOwner
} from "../../inputTransferObject/generated/EntraSnapshot";
import { buildTags } from "../../../../core/azure/tags";

function mapEntraServicePrincipalToCore<T extends EntraServicePrincipal>(
  servicePrincipal: T
): CoreEntraServicePrincipal & Omit<T, keyof CoreEntraServicePrincipal> {
  return {
    ...servicePrincipal,
    id: servicePrincipal.id,
    appId: servicePrincipal.appId,
    displayName: servicePrincipal.displayName,
    appDisplayName: servicePrincipal.appDisplayName,
    servicePrincipalType: servicePrincipal.servicePrincipalType,
    publisherName: servicePrincipal.publisherName,
    accountEnabled: servicePrincipal.accountEnabled,
    appOwnerOrganizationId: servicePrincipal.appOwnerOrganizationId,
    homepage: servicePrincipal.homepage,
    loginUrl: servicePrincipal.loginUrl,
    replyUrls: [...servicePrincipal.replyUrls],
    servicePrincipalNames: [...servicePrincipal.servicePrincipalNames],
    tags: buildTags(servicePrincipal.tags),
    appRoles: servicePrincipal.appRoles?.map(mapEntraAppRoleToCore),
    servicePrincipalOwners: servicePrincipal.servicePrincipalOwners?.map(mapEntraOwnerToCore),
    applicationOwners: servicePrincipal.applicationOwners?.map(mapEntraOwnerToCore),
    metadata: servicePrincipal.metadata ? { ...servicePrincipal.metadata } : servicePrincipal.metadata
  } as CoreEntraServicePrincipal & Omit<T, keyof CoreEntraServicePrincipal>;
}

export function mapEntraServicePrincipalsToCore<T extends EntraServicePrincipal>(
  servicePrincipals: T[]
): Array<CoreEntraServicePrincipal & Omit<T, keyof CoreEntraServicePrincipal>> {
  return servicePrincipals.map(mapEntraServicePrincipalToCore);
}

function mapEntraAppRoleToCore(appRole: EntraAppRole): CoreEntraAppRole {
  return {
    id: appRole.id,
    value: appRole.value,
    displayName: appRole.displayName,
    description: appRole.description,
    isEnabled: appRole.isEnabled,
    allowedMemberTypes: [...appRole.allowedMemberTypes]
  };
}

function mapEntraOwnerToCore(owner: EntraOwner): CoreEntraOwner {
  return {
    id: owner.id,
    displayName: owner.displayName,
    userPrincipalName: owner.userPrincipalName,
    mail: owner.mail,
    ownerType: owner.ownerType
  };
}
