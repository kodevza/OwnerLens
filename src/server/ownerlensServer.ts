import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RuntimeHttpError } from "../core/runtime/localSnapshotFiles";
import { createRuntimeRestMiddleware } from "../core/runtime/rest";
import {
  createLocalReportRuntime,
  defineLocalReportRuntimeRestEndpoints
} from "../providers/azure/runtime/localReportRuntimeRest";

const restBasePath = "/api/data";
const defaultHost = "127.0.0.1";

export type OwnerLensServerOptions = {
  appRoot?: string;
  dataDir: string;
  host?: string;
  port?: number;
  runtimeToken?: string;
};

export type StartedOwnerLensServer = {
  server: Server;
  url: string;
  close(): Promise<void>;
};

export async function startOwnerLensServer(options: OwnerLensServerOptions): Promise<StartedOwnerLensServer> {
  const appRoot = options.appRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distRoot = path.join(appRoot, "dist");
  const runtime = createLocalReportRuntime(options.dataDir);
  const runtimeMiddleware = createRuntimeRestMiddleware({
    basePath: restBasePath,
    endpoints: defineLocalReportRuntimeRestEndpoints(runtime),
    runtimeToken: options.runtimeToken,
    getErrorStatusCode: (error) => (error instanceof RuntimeHttpError ? error.statusCode : 500)
  });

  const server = createServer((req, res) => {
    void runtimeMiddleware(req, res, () => {
      serveStaticDist(req, res, distRoot);
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(options.port ?? 4173, options.host ?? defaultHost);
  });

  try {
    await runtime.initialize();
  } catch (error) {
    await closeServer(server);
    throw error;
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port ?? 4173;
  const host = options.host ?? defaultHost;

  return {
    server,
    url: `http://${host}:${port}`,
    close: async () => {
      await closeServer(server);
      await runtime.close();
    }
  };
}

function serveStaticDist(req: IncomingMessage, res: ServerResponse, distRoot: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, "Method Not Allowed", 405);
    return;
  }

  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const filePath = resolveDistFile(distRoot, requestUrl.pathname);
  if (!filePath) {
    sendText(res, "Not Found", 404);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType(filePath));
  if (req.method === "HEAD") {
    res.end("");
    return;
  }

  createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) {
        sendText(res, "Could not read file", 500);
        return;
      }
      res.destroy();
    })
    .pipe(res);
}

function resolveDistFile(distRoot: string, pathname: string): string | null {
  const decodedPath = safeDecodePath(pathname);
  if (!decodedPath) {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const candidate = path.resolve(distRoot, relativePath);

  if (!isInside(distRoot, candidate)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  const indexPath = path.join(distRoot, "index.html");
  return existsSync(indexPath) ? indexPath : null;
}

function safeDecodePath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function sendText(res: ServerResponse, body: string, statusCode: number): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
