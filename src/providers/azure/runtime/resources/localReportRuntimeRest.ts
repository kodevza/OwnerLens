import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { parseRuntimeCollectionQueryOptions } from "../runtimeRestQuery";

export function defineAzureResourcesLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/azureResources/resourceGroupOwnership`,
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportAzureResourceGroupOwnershipCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryAzureResourceGroupOwnership(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/resources`,
      handle: ({ url }) => runtime.queryAzureResources(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/roleAssignments`,
      handle: ({ url }) => runtime.queryAzureRoleAssignments(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureRbac`,
      handle: ({ url }) =>
        runtime.queryAzureRbac(readRequiredSearchParam(url, "servicePrincipalId"), parseRuntimeCollectionQueryOptions(url))
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
