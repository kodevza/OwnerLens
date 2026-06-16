#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const invocationRoot = process.cwd();
const require = createRequire(import.meta.url);
const [, , command = "help", ...args] = process.argv;

const dataDir = ensureDataDirectory(invocationRoot);
printDataDirectorySummary(dataDir);

const commands = new Map([
  ["collect:entra", "collect-entra.ps1"],
  ["collect-azure", "collect-azure.ps1"],
  ["collect:azure", "collect-azure.ps1"],
  ["collect-entra", "collect-entra.ps1"]
]);

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (commands.has(command)) {
  runPowerShellScript(commands.get(command), args);
} else if (command === "start" || command === "preview") {
  runViteProductionServer(args);
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function runPowerShellScript(scriptName, args, options = {}) {
  const pwsh = resolvePowerShell();
  const scriptPath = join(packageRoot, "tools", scriptName);
  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    ...args
  ];

  if (options.wait) {
    return spawnSync(pwsh, psArgs, { stdio: "inherit" });
  }

  const child = spawn(pwsh, psArgs, { stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  return child;
}

function runViteProductionServer(args) {
  const build = runViteSync(["build"]);

  if (build.signal) {
    process.kill(process.pid, build.signal);
    return build;
  }

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  return runVite(["preview", "--host", "127.0.0.1", ...args]);
}

function runVite(args) {
  return runNodeScript([resolveViteScript(), ...args]);
}

function runViteSync(args) {
  return spawnSync(process.execPath, [resolveViteScript(), ...args], {
    cwd: packageRoot,
    env: viteEnv(),
    stdio: "inherit"
  });
}

function resolveViteScript() {
  return join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
}

function runNodeScript(args) {
  const child = spawn(process.execPath, args, { cwd: packageRoot, env: viteEnv(), stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  return child;
}

function viteEnv() {
  return { ...process.env, OWNERLENS_DATA_DIR: dataDir };
}

function resolvePowerShell() {
  if (commandExists("pwsh")) {
    return "pwsh";
  }

  if (process.platform === "win32" && commandExists("powershell.exe")) {
    return "powershell.exe";
  }

  console.error("PowerShell was not found. Install PowerShell 7, then retry.");
  process.exit(1);
}

function commandExists(name) {
  const result = spawnSync(name, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
    stdio: "ignore"
  });

  return result.status === 0;
}

function ensureDataDirectory(rootDir) {
  const dataDir = join(rootDir, "data");

  try {
    if (statSync(dataDir, { throwIfNoEntry: false })?.isDirectory()) {
      return dataDir;
    }

    mkdirSync(dataDir, { recursive: true });
    return dataDir;
  } catch (error) {
    console.error(`Could not create ./data directory: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

function printDataDirectorySummary(dataDir) {
  console.log(`Working data directory: ./data`);
  console.log("Depth 1 data files:");

  const entries = readdirSync(dataDir, { withFileTypes: true })
    .map((entry) => `${entry.isDirectory() ? "d" : "f"} ./data/${entry.name}`)
    .sort();

  if (entries.length === 0) {
    console.log("  (empty)");
  } else {
    for (const entry of entries) {
      console.log(`  ${entry}`);
    }
  }

  console.log("OwnerLens will read local snapshots and runtime state from ./data.");
  console.log("");
}

function printHelp() {
  console.log(`OwnerLens

Usage:
  ownerlens start [Vite preview args]
  ownerlens preview [Vite preview args]
  ownerlens collect:entra [PowerShell args]
  ownerlens collect:azure [PowerShell args]

Examples:
  ownerlens start
  ownerlens start --port 4174
  ownerlens collect:entra -TenantId "<tenant-id>"
  ownerlens collect:azure -SubscriptionIds "sub-id-1,sub-id-2" -ActivityDays 30
  ownerlens collect:azure -SkipAuditLogsExport
`);
}
