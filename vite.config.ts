import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";

import { getRuntimeRestErrorStatusCode, handleRuntimeRestRequest } from "./src/core/runtime/rest";
import {
  createLocalReportRuntime,
  createDefaultLocalReportRuntime,
  defineLocalReportRuntimeRestEndpoints
} from "./src/providers/azure/runtime/localReportRuntimeRest";

function localReportRuntimeApi(): Plugin {
  const runtime = process.env.OWNERLENS_DATA_DIR
    ? createLocalReportRuntime(process.env.OWNERLENS_DATA_DIR)
    : createDefaultLocalReportRuntime(process.cwd());

  return {
    name: "ownerlens-local-report-runtime-api",
    configureServer(server) {
      installViteRuntimeRest(server, runtime);
    },
    configurePreviewServer(server) {
      installViteRuntimeRest(server, runtime);
    }
  };
}

export default defineConfig({
  define: {
    __OWNERLENS_VERSION__: JSON.stringify(resolveOwnerLensVersion())
  },
  plugins: [react(), tailwindcss(), localReportRuntimeApi()]
});

function resolveOwnerLensVersion(): string {
  try {
    const gitVersion = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: new URL(".", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    return gitVersion || "dev";
  } catch {
    return "dev";
  }
}

function installViteRuntimeRest(
  server: ViteDevServer | PreviewServer,
  runtime: ReturnType<typeof createLocalReportRuntime>
): void {
  server.httpServer?.once("listening", () => {
    void runtime.initialize();
  });
  server.httpServer?.once("close", () => {
    void runtime.close();
  });

  server.middlewares.use(async (req, res, next) => {
    const result = await handleRuntimeRestRequest(
      {
        basePath: "/api/data",
        endpoints: defineLocalReportRuntimeRestEndpoints(runtime),
        runtimeToken: process.env.OWNERLENS_RUNTIME_TOKEN,
        getErrorStatusCode: getRuntimeRestErrorStatusCode
      },
      req
    );

    if (!result) {
      next();
      return;
    }

    res.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) {
      res.setHeader(name, value);
    }
    res.end(result.body);
  });
}
