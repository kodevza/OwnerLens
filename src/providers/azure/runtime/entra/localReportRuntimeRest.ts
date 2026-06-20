import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import {
  collectionQuerySchema,
  collectionResponseSchema,
  entraPermissionsResponseSchema,
  entraUserGroupsResponseSchema,
  principalIdQuerySchema,
  runtimeRowSchema,
  userGroupsQuerySchema
} from "../../../../core/runtime/restSchemas";
import type { LocalReportRuntimeRestRuntime } from "../localReportRuntimeRestRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineEntraLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntimeRestRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      operationId: "queryEntraServicePrincipals",
      tags: ["Entra"],
      summary: "Query Entra service principals with runtime table controls.",
      path: `${restBasePath}/entra/servicePrincipals`,
      producesCsv: true,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("entra.servicePrincipals", runtimeRowSchema),
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportEntraServicePrincipalsCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryEntraServicePrincipals(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "queryEntraManagedIdentities",
      tags: ["Entra"],
      summary: "Query Entra managed identities with runtime table controls.",
      path: `${restBasePath}/entra/managedIdentities`,
      producesCsv: true,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("entra.managedIdentities", runtimeRowSchema),
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportEntraManagedIdentitiesCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryEntraManagedIdentities(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "readEntraPrincipalPermissions",
      tags: ["Entra"],
      summary: "Read Entra OAuth and app role permissions for a principal.",
      path: `${restBasePath}/entra/permissions`,
      querySchema: principalIdQuerySchema,
      responseSchema: entraPermissionsResponseSchema,
      handle: ({ url }) => runtime.readEntraPrincipalPermissions(readRequiredSearchParam(url, "principalId"))
    },
    {
      operationId: "readEntraUserGroups",
      tags: ["Entra"],
      summary: "Read Entra group memberships for a user.",
      path: `${restBasePath}/entra/userGroups`,
      querySchema: userGroupsQuerySchema,
      responseSchema: entraUserGroupsResponseSchema,
      handle: ({ url }) => runtime.readEntraUserGroups(readRequiredSearchParam(url, "user"))
    },
    {
      operationId: "queryEntraOAuth2PermissionGrants",
      tags: ["Entra"],
      summary: "Query Entra OAuth2 permission grants with runtime table controls.",
      path: `${restBasePath}/entra/oauth2PermissionGrants`,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("entra.oauth2PermissionGrants", runtimeRowSchema),
      handle: ({ url }) => runtime.queryEntraOAuth2PermissionGrants(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "queryEntraAppRoleAssignments",
      tags: ["Entra"],
      summary: "Query Entra app role assignments with runtime table controls.",
      path: `${restBasePath}/entra/appRoleAssignments`,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("entra.appRoleAssignments", runtimeRowSchema),
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
