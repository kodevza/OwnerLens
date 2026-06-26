import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { appConfig, defaultAppConfig, setAppConfig, type AppConfig } from "../../../core/config";
import { loadRuntimeAppConfig } from "./appConfigLoader";

afterEach(() => {
  setAppConfig(defaultAppConfig);
});

test("loads runtime app config from data/config.json when present", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ownerlens-config-"));
  const config: AppConfig = {
    features: {
      zeroTrustAssessment: true
    },
    azure: {
      ownership: {
        ownerTags: [
          {
            name: "businessOwner",
            confidence: "high",
            type: "ownerUser"
          }
        ]
      }
    }
  };

  try {
    await writeFile(path.join(dataDir, "config.json"), JSON.stringify(config), "utf8");

    expect(loadRuntimeAppConfig(dataDir)).toEqual(config);
    expect(appConfig).toEqual(config);
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
});

test("does not rewrite data/config.json when present", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ownerlens-config-"));
  const configPath = path.join(dataDir, "config.json");
  const config: AppConfig = {
    features: {
      zeroTrustAssessment: true
    },
    azure: {
      ownership: {
        ownerTags: [
          {
            name: "existingOwner",
            confidence: "medium",
            type: "ownerGroup"
          }
        ]
      }
    }
  };
  const originalContent = `${JSON.stringify(config)}\n`;

  try {
    await writeFile(configPath, originalContent, "utf8");

    expect(loadRuntimeAppConfig(dataDir)).toEqual(config);
    await expect(readFile(configPath, "utf8")).resolves.toBe(originalContent);
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
});

test("creates data/config.json with source default config when missing", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ownerlens-config-"));

  try {
    expect(loadRuntimeAppConfig(dataDir)).toEqual(defaultAppConfig);
    expect(appConfig).toEqual(defaultAppConfig);
    await expect(readFile(path.join(dataDir, "config.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(defaultAppConfig, null, 2)}\n`
    );
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
});

test("rejects invalid data/config.json", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ownerlens-config-"));

  try {
    await writeFile(path.join(dataDir, "config.json"), JSON.stringify({ features: {} }), "utf8");

    expect(() => loadRuntimeAppConfig(dataDir)).toThrow("Invalid OwnerLens config file");
  } finally {
    await rm(dataDir, { force: true, recursive: true });
  }
});
