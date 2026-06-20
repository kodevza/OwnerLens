import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import {
  azureRbacQuerySchema,
  collectionQuerySchema,
  collectionResponseSchema,
  runtimeRowSchema
} from "../../../../core/runtime/restSchemas";
import type { LocalReportRuntimeRestRuntime } from "../localReportRuntimeRestRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineAzureResourcesLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntimeRestRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      operationId: "queryAzureResourceGroupOwnership",
      tags: ["Azure Resources"],
      summary: "Query Azure resource group ownership evidence with runtime table controls.",
      path: `${restBasePath}/azureResources/resourceGroupOwnership`,
      producesCsv: true,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("azureResources.resourceGroupOwnership", runtimeRowSchema),
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportAzureResourceGroupOwnershipCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryAzureResourceGroupOwnership(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "queryAzureResources",
      tags: ["Azure Resources"],
      summary: "Query Azure resources with runtime table controls.",
      path: `${restBasePath}/azureResources/resources`,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("azureResources.resources", runtimeRowSchema),
      handle: ({ url }) => runtime.queryAzureResources(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "queryAzureRoleAssignments",
      tags: ["Azure Resources"],
      summary: "Query Azure role assignments with runtime table controls.",
      path: `${restBasePath}/azureResources/roleAssignments`,
      querySchema: collectionQuerySchema,
      responseSchema: collectionResponseSchema("azureResources.roleAssignments", runtimeRowSchema),
      handle: ({ url }) => runtime.queryAzureRoleAssignments(parseRuntimeCollectionQueryOptions(url))
    },
    {
      operationId: "queryAzureRbac",
      tags: ["Azure RBAC"],
      summary: "Query Azure RBAC assignments for a service principal or resource group.",
      path: `${restBasePath}/azureRbac`,
      querySchema: azureRbacQuerySchema,
      responseSchema: collectionResponseSchema("azureRbac", runtimeRowSchema),
      handle: ({ url }) =>
        readAzureRbacRestTarget(url).kind === "servicePrincipal"
          ? runtime.queryAzureRbac(
              readRequiredSearchParam(url, "servicePrincipalId"),
              parseRuntimeCollectionQueryOptions(url)
            )
          : runtime.queryAzureRbacForResourceGroup(
              {
                subscriptionId: readRequiredSearchParam(url, "subscriptionId"),
                resourceGroup: readRequiredSearchParam(url, "resourceGroup")
              },
              parseRuntimeCollectionQueryOptions(url)
            )
    }
  ];
}

function isCsvRequest(url: URL): boolean {
  return url.searchParams.get("format")?.trim().toLowerCase() === "csv";
}

function readRequiredSearchParam(url: URL, name: string): string {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new RuntimeHttpError(`Missing required query parameter: ${name}`, 400);
  }

  return value;
}

function readAzureRbacRestTarget(url: URL): { kind: "servicePrincipal" } | { kind: "resourceGroup" } {
  return url.searchParams.get("servicePrincipalId")?.trim()
    ? { kind: "servicePrincipal" }
    : { kind: "resourceGroup" };
}
