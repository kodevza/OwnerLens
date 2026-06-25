import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import type { DeleteRuntimeRemediationTasksRequest } from "../../../core/runtime/remediation";
import type { RuntimeRestEndpoint } from "../../../core/runtime/rest";
import type {
  PowerShellScriptCollectionId,
  PowerShellScriptTemplateId
} from "./scripts/PowershellScriptService";
import {
  collectionResponseSchema,
  csvCollectionQuerySchema,
  deleteRemediationTasksBodySchema,
  emptyQuerySchema,
  powershellScriptQuerySchema,
  powershellScriptResponseSchema,
  remediationPackageQuerySchema,
  remediationPackageResponseSchema,
  runtimeInventoryStatsResponseSchema,
  runtimeRowSchema,
  snapshotListResponseSchema
} from "../../../core/runtime/restSchemas";
import { defineEntraLocalReportRuntimeRestEndpoints } from "./entra/localReportRuntimeRest";
import type { LocalReportRuntimeRestRuntime } from "./localReportRuntimeRestRuntime";
import { defineOwnershipLocalReportRuntimeRestEndpoints } from "./ownership/localReportRuntimeRest";
import { defineAzureResourcesLocalReportRuntimeRestEndpoints } from "./resources/localReportRuntimeRest";
import { parseRuntimeCollectionQueryOptions } from "./runtimeRestQuery";
import { defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints } from "./zta/localReportRuntimeRest";

const restBasePath = "/api/data";

export function defineLocalReportRuntimeRestEndpoints(runtime: LocalReportRuntimeRestRuntime): RuntimeRestEndpoint[] {
  return [
    {
      operationId: "listRuntimeSnapshots",
      tags: ["Snapshots"],
      summary: "List local snapshot files available to the runtime.",
      path: restBasePath,
      querySchema: emptyQuerySchema,
      responseSchema: snapshotListResponseSchema,
      handle: () => runtime.listSnapshots()
    },
    ...defineEntraLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineAzureResourcesLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineOwnershipLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    {
      operationId: "generatePowerShellScript",
      tags: ["Scripts"],
      summary: "Generate a PowerShell script from a runtime template and collection selection.",
      path: `${restBasePath}/scripts/powershell`,
      querySchema: powershellScriptQuerySchema,
      responseSchema: powershellScriptResponseSchema,
      handle: ({ url }) =>
        runtime.generatePowerShellScript({
          collectionId: readPowerShellScriptCollectionId(url),
          templateId: readPowerShellScriptTemplateId(url),
          selection: parseRuntimeCollectionQueryOptions(url)
        })
    },
    {
      operationId: "readRuntimeInventoryStats",
      tags: ["Runtime"],
      summary: "Read runtime inventory counters.",
      path: `${restBasePath}/runtime/stats`,
      querySchema: emptyQuerySchema,
      responseSchema: runtimeInventoryStatsResponseSchema,
      handle: () => runtime.readInventoryStats()
    },
    {
      operationId: "readRemediationPackage",
      tags: ["Remediation"],
      summary: "Read a remediation package with its tasks.",
      path: `${restBasePath}/remediationPackages`,
      querySchema: remediationPackageQuerySchema,
      responseSchema: remediationPackageResponseSchema,
      handle: ({ url }) => runtime.readRemediationPackage(url.searchParams.get("id") ?? "")
    },
    {
      operationId: "exportRemediationPackageTasksCsv",
      tags: ["Remediation"],
      summary: "Export remediation package tasks as CSV.",
      method: "GET",
      path: `${restBasePath}/remediationPackages/tasks`,
      producesCsv: true,
      querySchema: csvCollectionQuerySchema,
      responseSchema: collectionResponseSchema("remediationPackage.tasks", runtimeRowSchema),
      handle: ({ url }) => {
        if (!isCsvRequest(url)) {
          throw new RuntimeHttpError("Remediation package tasks only support CSV export.", 400);
        }

        return runtime.exportRemediationPackageTasksCsv(
          readRequiredSearchParam(url, "id"),
          parseRuntimeCollectionQueryOptions(url)
        );
      }
    },
    {
      operationId: "deleteRemediationPackageTasks",
      tags: ["Remediation"],
      summary: "Delete remediation tasks from a package.",
      method: "DELETE",
      path: `${restBasePath}/remediationPackages/tasks`,
      parseJsonBody: true,
      querySchema: emptyQuerySchema,
      bodySchema: deleteRemediationTasksBodySchema,
      responseSchema: remediationPackageResponseSchema,
      handle: ({ body }) => runtime.deleteRemediationTasks(parseDeleteRemediationTasksRequest(body))
    }
  ];
}

function readPowerShellScriptTemplateId(url: URL): PowerShellScriptTemplateId {
  const templateId = readRequiredSearchParam(url, "template");
  if (
    templateId !== "setResourceGroupOwnerTag" &&
    templateId !== "setResourceGroupOwnerGroupTag" &&
    templateId !== "setServicePrincipalOwnerTag"
  ) {
    throw new RuntimeHttpError(`Unsupported PowerShell template: ${templateId}`, 400);
  }

  return templateId;
}

function readPowerShellScriptCollectionId(url: URL): PowerShellScriptCollectionId | undefined {
  const collectionId = url.searchParams.get("collection")?.trim();
  if (!collectionId) {
    return undefined;
  }

  if (
    collectionId !== "azureResources.resourceGroupOwnership" &&
    collectionId !== "entra.servicePrincipals" &&
    collectionId !== "entra.managedIdentities"
  ) {
    throw new RuntimeHttpError(`Unsupported PowerShell collection: ${collectionId}`, 400);
  }

  return collectionId;
}

function parseDeleteRemediationTasksRequest(body: unknown): DeleteRuntimeRemediationTasksRequest {
  if (!isRecord(body) || typeof body.packageId !== "string" || !Array.isArray(body.taskIds)) {
    throw new RuntimeHttpError("Invalid remediation task delete request.", 400);
  }

  return {
    packageId: body.packageId,
    taskIds: body.taskIds as string[]
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
