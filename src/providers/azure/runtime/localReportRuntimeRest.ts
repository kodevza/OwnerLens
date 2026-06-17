import path from "node:path";

import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import type { DeleteRuntimeRemediationTasksRequest } from "../../../core/runtime/remediation";
import { createRuntimeRestMiddleware, type RuntimeRestEndpoint } from "../../../core/runtime/rest";
import { defineEntraLocalReportRuntimeRestEndpoints } from "./entra/localReportRuntimeRest";
import { LocalReportRuntime } from "./LocalReportRuntime";
import { defineOwnershipLocalReportRuntimeRestEndpoints } from "./ownership/localReportRuntimeRest";
import { defineAzureResourcesLocalReportRuntimeRestEndpoints } from "./resources/localReportRuntimeRest";
import { parseRuntimeCollectionQueryOptions } from "./runtimeRestQuery";
import { defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints } from "./zta/localReportRuntimeRest";

const restBasePath = "/api/data";

export type LocalReportRuntimePluginHost = {
  httpServer?: {
    once(event: "listening" | "close", listener: () => void): void;
  } | null;
  middlewares: {
    use(middleware: ReturnType<typeof createRuntimeRestMiddleware>): void;
  };
};

function createLocalReportRuntime(dataDir: string): LocalReportRuntime {
  return new LocalReportRuntime({ dataDir, databasePath: path.join(dataDir, "runtime.duckdb") });
}

export function defineLocalReportRuntimeRestEndpoints(runtime: LocalReportRuntime): RuntimeRestEndpoint[] {
  return [
    {
      path: restBasePath,
      handle: () => runtime.listSnapshots()
    },
    {
      path: `${restBasePath}/read`,
      handle: ({ url }) => runtime.readSnapshot(url.searchParams.get("name") ?? "")
    },
    ...defineEntraLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineAzureResourcesLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineOwnershipLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    ...defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    {
      path: `${restBasePath}/remediationPackages`,
      handle: ({ url }) => runtime.readRemediationPackage(url.searchParams.get("id") ?? "")
    },
    {
      method: "GET",
      path: `${restBasePath}/remediationPackages/tasks`,
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
      method: "DELETE",
      path: `${restBasePath}/remediationPackages/tasks`,
      parseJsonBody: true,
      handle: ({ body }) => runtime.deleteRemediationTasks(parseDeleteRemediationTasksRequest(body))
    },
    {
      method: "POST",
      path: `${restBasePath}/runtime/enrichment/recalculate`,
      handle: async () => {
        await runtime.recalculateEnrichment();
        return runtime.getStatus().enrichment;
      }
    },
    {
      path: `${restBasePath}/runtime`,
      handle: () => runtime.getStatus()
    }
  ];
}

export function installLocalReportRuntimeRest(host: LocalReportRuntimePluginHost, runtime: LocalReportRuntime): void {
  host.httpServer?.once("listening", () => {
    void runtime.initialize();
  });
  host.httpServer?.once("close", () => {
    void runtime.close();
  });

  host.middlewares.use(
    createRuntimeRestMiddleware({
      basePath: restBasePath,
      endpoints: defineLocalReportRuntimeRestEndpoints(runtime),
      getErrorStatusCode: (error) => (error instanceof RuntimeHttpError ? error.statusCode : 500)
    })
  );
}

export function createDefaultLocalReportRuntime(root: string): LocalReportRuntime {
  return createLocalReportRuntime(path.join(root, "data"));
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
