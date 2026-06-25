import type { RuntimeRestEndpoint } from "../../src/core/runtime/rest";
import { emptyQuerySchema, runtimeRowSchema } from "../../src/core/runtime/restSchemas";

type TestRuntimeRestEndpoint = Omit<
  RuntimeRestEndpoint,
  "operationId" | "tags" | "summary" | "querySchema" | "responseSchema"
> &
  Partial<Pick<RuntimeRestEndpoint, "querySchema" | "responseSchema">>;

export function testEndpoint(endpoint: TestRuntimeRestEndpoint): RuntimeRestEndpoint {
  return {
    operationId: `test${endpoint.method ?? "GET"}${endpoint.path.replace(/\W+/g, "")}`,
    tags: ["Test"],
    summary: "Test endpoint.",
    querySchema: emptyQuerySchema,
    responseSchema: runtimeRowSchema,
    ...endpoint
  };
}
