import { serve, type ServerType } from "@hono/node-server";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalReportRuntime } from "../providers/azure/runtime/localReportRuntimeFactory";
import { createOwnerLensApp } from "./createOwnerLensApp";

const defaultHost = "127.0.0.1";
const defaultPort = 4173;

export type OwnerLensServerOptions = {
  appRoot?: string;
  dataDir: string;
  host?: string;
  port?: number;
  runtimeToken?: string;
};

export type StartedOwnerLensServer = {
  server: ServerType;
  url: string;
  close(): Promise<void>;
};

export async function startOwnerLensServer(options: OwnerLensServerOptions): Promise<StartedOwnerLensServer> {
  const appRoot = options.appRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const distRoot = path.join(appRoot, "dist");
  const runtime = createLocalReportRuntime(options.dataDir, appRoot);
  const app = createOwnerLensApp({
    distRoot,
    runtime,
    runtimeToken: options.runtimeToken
  });
  const host = options.host ?? defaultHost;
  const requestedPort = options.port ?? defaultPort;
  const server = await listen(app.fetch, host, requestedPort);

  try {
    await runtime.initialize();
  } catch (error) {
    await closeServer(server);
    throw error;
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;

  return {
    server,
    url: `http://${host}:${port}`,
    close: async () => {
      await closeServer(server);
      await runtime.close();
    }
  };
}

function listen(fetch: ServeFetch, hostname: string, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch,
        hostname,
        port
      },
      () => {
        server.off("error", onError);
        resolve(server);
      }
    );
    const onError = (error: Error) => {
      reject(error);
    };

    server.once("error", onError);
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

type ServeFetch = Parameters<typeof serve>[0]["fetch"];
