export type RuntimeRequest = {
  method?: string;
  url?: string;
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
  handle(input: { req: RuntimeRequest; url: URL }): Promise<unknown> | unknown;
};

export type RuntimeRestMiddlewareOptions = {
  basePath: string;
  endpoints: RuntimeRestEndpoint[];
  getErrorStatusCode(error: unknown): number;
};

export function createRuntimeRestMiddleware(options: RuntimeRestMiddlewareOptions) {
  return async (req: RuntimeRequest, res: RuntimeResponse, next: RuntimeNext): Promise<void> => {
    if (!req.url?.startsWith(options.basePath)) {
      next();
      return;
    }

    try {
      const url = new URL(req.url, "http://localhost");
      const endpoint = options.endpoints.find(
        (candidate) =>
          candidate.path === url.pathname &&
          (!candidate.method || candidate.method.toUpperCase() === (req.method ?? "GET").toUpperCase())
      );

      if (!endpoint) {
        next();
        return;
      }

      sendJson(res, await endpoint.handle({ req, url }));
    } catch (error) {
      sendJson(
        res,
        { error: error instanceof Error ? error.message : "Unknown error" },
        options.getErrorStatusCode(error)
      );
    }
  };
}

export function sendJson(res: RuntimeResponse, value: unknown, statusCode = 200): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}
