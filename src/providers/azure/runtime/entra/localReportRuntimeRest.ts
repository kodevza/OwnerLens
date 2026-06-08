import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { queryRuntimeCollection } from "../runtimeRestQuery";

export function defineEntraLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/entra/servicePrincipals`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "entra.servicePrincipals", url)
    },
    {
      path: `${restBasePath}/entra/managedIdentities`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "entra.managedIdentities", url)
    },
    {
      path: `${restBasePath}/entra/oauth2PermissionGrants`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "entra.oauth2PermissionGrants", url)
    },
    {
      path: `${restBasePath}/entra/appRoleAssignments`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "entra.appRoleAssignments", url)
    }
  ];
}
