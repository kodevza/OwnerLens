import fs from "node:fs";
import path from "node:path";

import {
  defaultAppConfig,
  isAppConfig,
  setAppConfig,
  type AppConfig
} from "../../../core/config";

export function loadRuntimeAppConfig(dataDir: string): AppConfig {
  const configPath = path.join(dataDir, "config.json");

  if (!fs.existsSync(configPath)) {
    writeDefaultConfigIfDataDirExists(dataDir, configPath);
    setAppConfig(defaultAppConfig);
    return defaultAppConfig;
  }

  const parsedConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  if (!isAppConfig(parsedConfig)) {
    throw new Error(`Invalid OwnerLens config file: ${configPath}`);
  }

  setAppConfig(parsedConfig);
  return parsedConfig;
}

function writeDefaultConfigIfDataDirExists(dataDir: string, configPath: string): void {
  if (!fs.existsSync(dataDir)) {
    return;
  }

  fs.writeFileSync(configPath, `${JSON.stringify(defaultAppConfig, null, 2)}\n`, "utf8");
}
