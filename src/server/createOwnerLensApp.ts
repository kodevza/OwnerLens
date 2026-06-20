import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import { getRuntimeRestErrorStatusCode } from "../core/runtime/rest";
import { defineLocalReportRuntimeRestEndpoints } from "../providers/azure/runtime/localReportRuntimeRest";
import type { LocalReportRuntime } from "../providers/azure/runtime/LocalReportRuntime";
import { registerRuntimeRoutes } from "./registerRuntimeRoutes";
import { runtimeErrorResponse } from "./runtimeErrorHandler";

const restBasePath = "/api/data";

export type CreateOwnerLensAppOptions = {
  distRoot: string;
  runtime: LocalReportRuntime;
  runtimeToken?: string;
};

export function createOwnerLensApp(options: CreateOwnerLensAppOptions): Hono {
  const app = new Hono();

  registerRuntimeRoutes(app, {
    basePath: restBasePath,
    endpoints: defineLocalReportRuntimeRestEndpoints(options.runtime),
    runtimeToken: options.runtimeToken,
    getErrorStatusCode: getRuntimeRestErrorStatusCode
  });

  app.onError((error) => runtimeErrorResponse(error));
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return c.text("Method Not Allowed", 405);
    }

    await next();
  });
  app.use("*", serveStatic({ root: options.distRoot }));
  app.use("*", serveStatic({ root: options.distRoot, path: "index.html" }));
  app.notFound((c) => c.text("Not Found", 404));

  return app;
}
