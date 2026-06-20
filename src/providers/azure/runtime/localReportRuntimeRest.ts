import path from "node:path";

import { LocalReportRuntime } from "./LocalReportRuntime";
export { defineLocalReportRuntimeRestEndpoints } from "./localReportRuntimeRestEndpoints";

export function createLocalReportRuntime(dataDir: string): LocalReportRuntime {
  return new LocalReportRuntime({ dataDir, databasePath: path.join(dataDir, "runtime.duckdb") });
}

export function createDefaultLocalReportRuntime(root: string): LocalReportRuntime {
  return createLocalReportRuntime(path.join(root, "data"));
}
