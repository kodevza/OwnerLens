import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { RuntimeRestEndpoint } from "../../../../core/runtime/rest";
import type { LocalReportRuntime } from "../LocalReportRuntime";
import { queryRuntimeCollection } from "../runtimeRestQuery";

export function defineAzureResourcesLocalReportRuntimeRestEndpoints(
  runtime: LocalReportRuntime,
  restBasePath: string
): RuntimeRestEndpoint[] {
  return [
    {
      path: `${restBasePath}/azureResources/subscriptions`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.subscriptions", url)
    },
    {
      path: `${restBasePath}/azureResources/resourceGroups`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.resourceGroups", url)
    },
    {
      path: `${restBasePath}/azureResources/resourceGroupOwnership`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.resourceGroupOwnership", url)
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
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.resources", url)
    },
    {
      path: `${restBasePath}/azureResources/userAssignedManagedIdentities`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.userAssignedManagedIdentities", url)
    },
    {
      path: `${restBasePath}/azureResources/roleAssignments`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.roleAssignments", url)
    },
    {
      path: `${restBasePath}/azureResources/activityLogs`,
      handle: ({ url }) => queryRuntimeCollection(runtime, "azureResources.activityLogs", url)
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
