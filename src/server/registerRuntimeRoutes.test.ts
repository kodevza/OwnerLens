import { Hono } from "hono";

import { RuntimeHttpError } from "../core/runtime/localSnapshotFiles";
import { getRuntimeRestErrorStatusCode } from "../core/runtime/rest";
import { testEndpoint } from "../../tests/support/runtimeRestEndpoint";
import { registerRuntimeRoutes } from "./registerRuntimeRoutes";

test("registers all methods for runtime routes that share a path", async () => {
  const app = new Hono();

  registerRuntimeRoutes(app, {
    basePath: "/api/data",
    endpoints: [
      testEndpoint({
        method: "GET",
        path: "/api/data/items",
        handle: () => ({ method: "GET" })
      }),
      testEndpoint({
        method: "DELETE",
        parseJsonBody: true,
        path: "/api/data/items",
        handle: ({ body }) => ({ body, method: "DELETE" })
      })
    ],
    getErrorStatusCode: getRuntimeRestErrorStatusCode
  });

  const getResponse = await app.request("/api/data/items");
  const deleteResponse = await app.request("/api/data/items", {
    body: JSON.stringify({ id: "item-1" }),
    method: "DELETE"
  });

  expect(getResponse.status).toBe(200);
  expect(await getResponse.json()).toEqual({ method: "GET" });
  expect(deleteResponse.status).toBe(200);
  expect(await deleteResponse.json()).toEqual({ body: { id: "item-1" }, method: "DELETE" });
});

test("returns runtime JSON errors for unknown runtime paths", async () => {
  const app = new Hono();

  registerRuntimeRoutes(app, {
    basePath: "/api/data",
    endpoints: [],
    getErrorStatusCode: getRuntimeRestErrorStatusCode
  });

  const response = await app.request("/api/data/missing");

  expect(response.status).toBe(404);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(await response.json()).toEqual({ error: "Runtime API endpoint not found." });
});

test("checks runtime tokens before invoking registered runtime routes", async () => {
  const app = new Hono();
  const handle = jest.fn(() => ({ ok: true }));

  registerRuntimeRoutes(app, {
    basePath: "/api/data",
    endpoints: [
      testEndpoint({
        path: "/api/data/protected",
        handle
      })
    ],
    runtimeToken: "expected-token",
    getErrorStatusCode: (error) => (error instanceof RuntimeHttpError ? error.statusCode : 500)
  });

  const response = await app.request("/api/data/protected");

  expect(response.status).toBe(401);
  expect(handle).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({ error: "Runtime API token is missing or invalid." });
});

test("validates runtime route query parameters before invoking handlers", async () => {
  const app = new Hono();
  const handle = jest.fn(() => ({ ok: true }));

  registerRuntimeRoutes(app, {
    basePath: "/api/data",
    endpoints: [
      testEndpoint({
        path: "/api/data/validated",
        querySchema: {
          type: "object",
          required: ["id"],
          additionalProperties: true,
          properties: {
            id: { type: "string" }
          }
        },
        handle
      })
    ],
    getErrorStatusCode: getRuntimeRestErrorStatusCode
  });

  const response = await app.request("/api/data/validated");

  expect(response.status).toBe(400);
  expect(handle).not.toHaveBeenCalled();
  expect(await response.json()).toEqual({
    error: "Runtime API validation failed for testGETapidatavalidated query: / must have required property 'id'"
  });
});

test("logs response validation errors without replacing runtime responses", async () => {
  const app = new Hono();
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    registerRuntimeRoutes(app, {
      basePath: "/api/data",
      endpoints: [
        testEndpoint({
          path: "/api/data/invalid-response",
          responseSchema: {
            type: "object",
            required: ["ok"],
            additionalProperties: false,
            properties: {
              ok: { type: "boolean" }
            }
          },
          handle: () => ({ unexpected: true })
        })
      ],
      getErrorStatusCode: getRuntimeRestErrorStatusCode
    });

    const response = await app.request("/api/data/invalid-response");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unexpected: true });
    expect(consoleError).toHaveBeenCalledWith(expect.any(RuntimeHttpError));
  } finally {
    consoleError.mockRestore();
  }
});
