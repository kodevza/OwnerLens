import { RuntimeHttpError } from "./localSnapshotFiles";
import type { RuntimeCollectionCsvExport } from "./collectionExport";

export type RuntimeRequest = {
  method?: string;
  url?: string;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
};

export type RuntimeResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
};

export type RuntimeNext = () => void;

export type RuntimeRestEndpoint = {
  method?: string;
  path: string;
  parseJsonBody?: boolean;
  statusCode?: number;
  handle(input: { body?: unknown; req: RuntimeRequest; url: URL }): Promise<unknown> | unknown;
};

export type RuntimeRestMiddlewareOptions = {
  basePath: string;
  endpoints: RuntimeRestEndpoint[];
  getErrorStatusCode(error: unknown): number;
};

export function createRuntimeRestMiddleware(options: RuntimeRestMiddlewareOptions) {
  return async (req: RuntimeRequest, res: RuntimeResponse, next: RuntimeNext): Promise<void> => {
    const url = req.url ? new URL(req.url, "http://localhost") : null;

    if (!url || !isRuntimeApiPath(url.pathname, options.basePath)) {
      next();
      return;
    }

    try {
      const endpoint = options.endpoints.find(
        (candidate) =>
          candidate.path === url.pathname &&
          (!candidate.method || candidate.method.toUpperCase() === (req.method ?? "GET").toUpperCase())
      );

      if (!endpoint) {
        throw new RuntimeHttpError("Runtime API endpoint not found.", 404);
      }

      const body = endpoint.parseJsonBody ? await readJsonBody(req) : undefined;
      sendRuntimeRestResult(res, await endpoint.handle({ body, req, url }), endpoint.statusCode);
    } catch (error) {
      sendJson(
        res,
        { error: error instanceof Error ? error.message : "Unknown error" },
        options.getErrorStatusCode(error)
      );
    }
  };
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

export function sendJson(res: RuntimeResponse, value: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function sendRuntimeRestResult(res: RuntimeResponse, value: unknown, statusCode = 200): void {
  if (isRuntimeCollectionCsvExport(value)) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", value.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${escapeHeaderValue(value.fileName)}"`);
    res.end(value.body);
    return;
  }

  sendJson(res, value, statusCode);
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
