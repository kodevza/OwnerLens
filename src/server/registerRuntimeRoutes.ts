import type { Hono } from "hono";

import { handleRuntimeRestRequest, type RuntimeRestEndpoint, type RuntimeRestRequestOptions } from "../core/runtime/rest";

export type RegisterRuntimeRoutesOptions = RuntimeRestRequestOptions;

export function registerRuntimeRoutes(app: Hono, options: RegisterRuntimeRoutesOptions): void {
  for (const endpoints of groupEndpointsByPath(options.endpoints)) {
    const path = endpoints[0]?.path;
    if (!path) {
      continue;
    }

    app.all(path, async (c) => runtimeResponse(options, endpoints, c.req.raw));
  }

  app.all(options.basePath, async (c) => runtimeResponse(options, [], c.req.raw));
  app.all(`${options.basePath}/*`, async (c) => runtimeResponse(options, [], c.req.raw));
}

function groupEndpointsByPath(endpoints: RuntimeRestEndpoint[]): RuntimeRestEndpoint[][] {
  const grouped = new Map<string, RuntimeRestEndpoint[]>();

  for (const endpoint of endpoints) {
    const existing = grouped.get(endpoint.path);
    if (existing) {
      existing.push(endpoint);
    } else {
      grouped.set(endpoint.path, [endpoint]);
    }
  }

  return Array.from(grouped.values());
}

async function runtimeResponse(
  options: RegisterRuntimeRoutesOptions,
  endpoints: RuntimeRestEndpoint[],
  request: Request
): Promise<Response> {
  const result = await handleRuntimeRestRequest(
    {
      ...options,
      endpoints
    },
    {
      headers: Object.fromEntries(request.headers.entries()),
      method: request.method,
      readBody: () => request.text(),
      url: request.url
    }
  );

  if (!result) {
    throw new Error("Runtime route handler received a non-runtime request.");
  }

  return new Response(result.body, {
    headers: result.headers,
    status: result.statusCode
  });
}
