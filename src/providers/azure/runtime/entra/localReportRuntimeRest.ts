import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineEntraLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/entra/servicePrincipals`,
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportEntraServicePrincipalsCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryEntraServicePrincipals(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/entra/managedIdentities`,
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportEntraManagedIdentitiesCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryEntraManagedIdentities(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/entra/permissions`,
      handle: ({ url }) => runtime.readEntraPrincipalPermissions(readRequiredSearchParam(url, "principalId"))
    },
    {
      path: `${restBasePath}/entra/userGroups`,
      handle: ({ url }) => runtime.readEntraUserGroups(readRequiredSearchParam(url, "user"))
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

function readRequiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new RuntimeHttpError(`Missing required query parameter: ${name}`, 400);
  }

  return value;
}

function isCsvRequest(url: URL): boolean {
  return url.searchParams.get("format")?.trim().toLowerCase() === "csv";
}
