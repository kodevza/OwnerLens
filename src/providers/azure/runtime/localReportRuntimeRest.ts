import path from "node:path";

import { RuntimeHttpError } from "../../../core/runtime/localSnapshotFiles";
import { createRuntimeRestMiddleware, type RuntimeRestEndpoint } from "../../../core/runtime/rest";
import { defineEntraLocalReportRuntimeRestEndpoints } from "./entra/localReportRuntimeRest";
import { LocalReportRuntime } from "./LocalReportRuntime";
import { defineAzureResourcesLocalReportRuntimeRestEndpoints } from "./resources/localReportRuntimeRest";
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

export function createLocalReportRuntime(dataDir: string): LocalReportRuntime {
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
    ...defineZeroTrustAssessmentLocalReportRuntimeRestEndpoints(runtime, restBasePath),
    {
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
