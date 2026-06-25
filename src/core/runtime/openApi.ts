import type { RuntimeRestEndpoint } from "./rest";
import { runtimeErrorResponseSchema } from "./restSchemas";
import type { RuntimeRestJsonSchema } from "./restValidation";

type OpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, Record<string, unknown>>;
};

export function generateRuntimeOpenApiDocument(options: {
  title: string;
  version: string;
  endpoints: RuntimeRestEndpoint[];
}): OpenApiDocument {
  const document: OpenApiDocument = {
    openapi: "3.1.0",
    info: {
      title: options.title,
      version: options.version
    },
    paths: {}
  };

  for (const endpoint of options.endpoints) {
    const pathItem = document.paths[endpoint.path] ?? {};
    const method = (endpoint.method ?? "GET").toLowerCase();
    pathItem[method] = toOpenApiOperation(endpoint);
    document.paths[endpoint.path] = pathItem;
  }

  return document;
}

function toOpenApiOperation(endpoint: RuntimeRestEndpoint): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: endpoint.operationId,
    tags: endpoint.tags,
    summary: endpoint.summary,
    parameters: toOpenApiQueryParameters(endpoint.querySchema),
    responses: {
      [String(endpoint.statusCode ?? 200)]: {
        description: "Successful runtime response",
        content: {
          "application/json": {
            schema: endpoint.responseSchema
          },
          ...(isCsvEndpoint(endpoint)
            ? {
                "text/csv": {
                  schema: {
                    type: "string"
                  }
                }
              }
            : {})
        }
      },
      "400": errorResponse,
      "401": errorResponse,
      "404": errorResponse,
      "409": errorResponse,
      "500": errorResponse
    }
  };

  if (endpoint.bodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: endpoint.bodySchema
        }
      }
    };
  }

  return operation;
}

function toOpenApiQueryParameters(schema: RuntimeRestJsonSchema): unknown[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return [];
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: required.includes(name),
    schema: propertySchema
  }));
}

function isCsvEndpoint(endpoint: RuntimeRestEndpoint): boolean {
  return endpoint.producesCsv === true;
}

const errorResponse = {
  description: "Runtime error response",
  content: {
    "application/json": {
      schema: runtimeErrorResponseSchema
    }
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
