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
      path: `${restBasePath}/azureResources/subscriptions`,
      handle: ({ url }) => runtime.queryAzureSubscriptions(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/resourceGroups`,
      handle: ({ url }) => runtime.queryAzureResourceGroups(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/resourceGroupOwnership`,
      handle: ({ url }) =>
        isCsvRequest(url)
          ? runtime.exportAzureResourceGroupOwnershipCsv(parseRuntimeCollectionQueryOptions(url))
          : runtime.queryAzureResourceGroupOwnership(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/resourceGroupOwnership/disabledEvidence`,
      handle: async ({ url }) => {
        const key = readRequiredSearchParam(url, "key");
        const disabled = readBooleanSearchParam(url, "disabled");
        const disabledCount = await runtime.setOwnerEvidenceDisabled(key, disabled);

        return {
          key,
          disabled,
          disabledCount
        };
      }
    },
    {
      path: `${restBasePath}/azureResources/resources`,
      handle: ({ url }) => runtime.queryAzureResources(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/userAssignedManagedIdentities`,
      handle: ({ url }) => runtime.queryAzureUserAssignedManagedIdentities(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/roleAssignments`,
      handle: ({ url }) => runtime.queryAzureRoleAssignments(parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureRbac`,
      handle: ({ url }) =>
        runtime.queryAzureRbac(readRequiredSearchParam(url, "servicePrincipalId"), parseRuntimeCollectionQueryOptions(url))
    },
    {
      path: `${restBasePath}/azureResources/activityLogs`,
      handle: ({ url }) => runtime.queryAzureActivityLogs(parseRuntimeCollectionQueryOptions(url))
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

function readBooleanSearchParam(url: URL, name: string): boolean {
  const value = readRequiredSearchParam(url, name).toLowerCase();
  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new RuntimeHttpError(`Invalid boolean query parameter: ${name}`, 400);
}
