import path from "node:path";

import { LocalReportRuntime } from "./LocalReportRuntime";
import { loadRuntimeAppConfig } from "./appConfigLoader";

export function createLocalReportRuntime(dataDir: string, appRoot = process.cwd()): LocalReportRuntime {
  return new LocalReportRuntime({
    appRoot,
    config: loadRuntimeAppConfig(dataDir),
    dataDir,
    databasePath: path.join(dataDir, "runtime.duckdb")
  });
}

export function createDefaultLocalReportRuntime(root: string): LocalReportRuntime {
  return createLocalReportRuntime(path.join(root, "data"), root);
}
