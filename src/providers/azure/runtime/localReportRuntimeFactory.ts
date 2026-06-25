import path from "node:path";

import { LocalReportRuntime } from "./LocalReportRuntime";

export function createLocalReportRuntime(dataDir: string, appRoot = process.cwd()): LocalReportRuntime {
  return new LocalReportRuntime({ appRoot, dataDir, databasePath: path.join(dataDir, "runtime.duckdb") });
}

export function createDefaultLocalReportRuntime(root: string): LocalReportRuntime {
  return createLocalReportRuntime(path.join(root, "data"), root);
}
