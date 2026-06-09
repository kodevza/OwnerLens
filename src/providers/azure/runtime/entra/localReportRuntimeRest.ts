import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineEntraLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/entra/servicePrincipals`,
      handle: ({ url }) => runtime.queryEntraServicePrincipals(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/entra/managedIdentities`,
      handle: ({ url }) => runtime.queryEntraManagedIdentities(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/entra/oauth2PermissionGrants`,
      handle: ({ url }) => runtime.queryEntraOAuth2PermissionGrants(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/entra/appRoleAssignments`,
      handle: ({ url }) => runtime.queryEntraAppRoleAssignments(parseRuntimeCollectionQueryOptions(url))
    }
  ];
}
