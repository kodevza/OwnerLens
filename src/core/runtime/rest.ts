import { RuntimeHttpError, type RuntimeErrorResponse } from "./localSnapshotFiles";
import type { RuntimeCollectionCsvExport } from "./collectionExport";
import { validateRuntimeRestPayload, type RuntimeRestJsonSchema } from "./restValidation";

export type RuntimeRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  readBody?: () => Promise<string>;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
};

export type RuntimeRestEndpoint = {
  operationId: string;
  tags: string[];
  summary: string;
  method?: string;
  path: string;
  parseJsonBody?: boolean;
  querySchema: RuntimeRestJsonSchema;
  bodySchema?: RuntimeRestJsonSchema;
  responseSchema: RuntimeRestJsonSchema;
  producesCsv?: boolean;
  statusCode?: number;
  handle(input: { body?: unknown; req: RuntimeRequest; url: URL }): Promise<unknown> | unknown;
};

export type RuntimeRestRequestOptions = {
  basePath: string;
  endpoints: RuntimeRestEndpoint[];
  runtimeToken?: string;
  getErrorStatusCode(error: unknown): number;
};

export type RuntimeRestResult = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

export async function handleRuntimeRestRequest(
  options: RuntimeRestRequestOptions,
  req: RuntimeRequest
): Promise<RuntimeRestResult | null> {
  const url = req.url ? new URL(req.url, "http://localhost") : null;

  if (!url || !isRuntimeApiPath(url.pathname, options.basePath)) {
    return null;
  }

  try {
    validateRuntimeToken(req, options.runtimeToken);

    const endpoint = options.endpoints.find(
      (candidate) =>
        candidate.path === url.pathname &&
        (!candidate.method || candidate.method.toUpperCase() === (req.method ?? "GET").toUpperCase())
    );

    if (!endpoint) {
      throw new RuntimeHttpError("Runtime API endpoint not found.", 404);
    }

    validateRuntimeRestPayload(endpoint.querySchema, readRuntimeQuery(url), `${endpoint.operationId} query`);

    const body = endpoint.parseJsonBody ? await readJsonBody(req) : undefined;
    if (endpoint.bodySchema) {
      validateRuntimeRestPayload(endpoint.bodySchema, body, `${endpoint.operationId} body`);
    }

    const value = await endpoint.handle({ body, req, url });
    validateRuntimeRestResponse(endpoint, value);
    return formatRuntimeRestResult(value, endpoint.statusCode);
  } catch (error) {
    const statusCode = options.getErrorStatusCode(error);
    return formatJsonResult(formatRuntimeError(error, statusCode), statusCode);
  }
}

function formatRuntimeError(error: unknown, statusCode: number): RuntimeErrorResponse {
  return {
    error: {
      code: error instanceof RuntimeHttpError ? error.code : defaultRuntimeErrorCode(statusCode),
      message: error instanceof Error ? error.message : "Unknown error"
    }
  };
}

function defaultRuntimeErrorCode(statusCode: number): string {
  if (statusCode === 400) {
    return "runtime.badRequest";
  }

  if (statusCode === 401) {
    return "runtime.unauthorized";
  }

  if (statusCode === 404) {
    return "runtime.notFound";
  }

  if (statusCode === 409) {
    return "runtime.conflict";
  }

  return "runtime.internalError";
}

function readRuntimeQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  for (const [key, value] of url.searchParams) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }

  return query;
}

function validateRuntimeRestResponse(endpoint: RuntimeRestEndpoint, value: unknown): void {
  if (isRuntimeCollectionCsvExport(value)) {
    return;
  }

  try {
    validateRuntimeRestPayload(endpoint.responseSchema, value, `${endpoint.operationId} response`);
  } catch (error) {
    console.error(error);
  }
}

export function getRuntimeRestErrorStatusCode(error: unknown): number {
  return error instanceof RuntimeHttpError ? error.statusCode : 500;
}

function validateRuntimeToken(req: RuntimeRequest, runtimeToken: string | undefined): void {
  if (!runtimeToken) {
    return;
  }

  const providedToken = readHeader(req, "x-ownerlens-runtime-token");
  if (providedToken !== runtimeToken) {
    throw new RuntimeHttpError("Runtime API token is missing or invalid.", 401);
  }
}

function readHeader(req: RuntimeRequest, name: string): string | undefined {
  const headers = req.headers;
  if (!headers) {
    return undefined;
  }

  const headerName = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  const header = headerName ? headers[headerName] : undefined;
  if (Array.isArray(header)) {
    return header[0];
  }

  return header;
}

function isRuntimeApiPath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

async function readJsonBody(req: RuntimeRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      return parseJson(req.body);
    }

    return req.body;
  }

  if (req.readBody) {
    const rawBody = await req.readBody();
    return rawBody.trim() ? parseJson(rawBody) : undefined;
  }

  const iterator = req[Symbol.asyncIterator]?.();

  if (!iterator) {
    return undefined;
  }

  let rawBody = "";
  let result = await iterator.next();
  while (!result.done) {
    const chunk = result.value;
    rawBody += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    result = await iterator.next();
  }

  return rawBody.trim() ? parseJson(rawBody) : undefined;
}

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new RuntimeHttpError("Malformed JSON request body.", 400);
  }
}

function formatJsonResult(value: unknown, statusCode = 200): RuntimeRestResult {
  return {
    body: JSON.stringify(value),
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    statusCode
  };
}

function formatRuntimeRestResult(value: unknown, statusCode = 200): RuntimeRestResult {
  if (isRuntimeCollectionCsvExport(value)) {
    return {
      body: value.body,
      headers: {
        "Content-Type": value.contentType,
        "Content-Disposition": `attachment; filename="${escapeHeaderValue(value.fileName)}"`
      },
      statusCode
    };
  }

  return formatJsonResult(value, statusCode);
}

function isRuntimeCollectionCsvExport(value: unknown): value is RuntimeCollectionCsvExport {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<RuntimeCollectionCsvExport>).kind === "csv" &&
    typeof (value as Partial<RuntimeCollectionCsvExport>).body === "string" &&
    typeof (value as Partial<RuntimeCollectionCsvExport>).contentType === "string"
  );
}

function escapeHeaderValue(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}
