#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const invocationRoot = process.cwd();
const [, , command = "help", ...args] = process.argv;
let dataDir;

const commands = new Map([
  ["collect:entra", { root: "powershell", script: join("OwnerLens", "Public", "Invoke-OwnerLensCollectEntra.ps1") }],
  ["collect-azure", { root: "powershell", script: join("OwnerLens", "Public", "Invoke-OwnerLensCollectAzure.ps1") }],
  ["collect:azure", { root: "powershell", script: join("OwnerLens", "Public", "Invoke-OwnerLensCollectAzure.ps1") }],
  ["collect-entra", { root: "powershell", script: join("OwnerLens", "Public", "Invoke-OwnerLensCollectEntra.ps1") }]
]);

if (command === "--version" || command === "-v" || command === "version") {
  printVersion();
  process.exit(0);
}

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

dataDir = resolveDataDirectory(invocationRoot);
printDataDirectorySummary(dataDir);

if (commands.has(command)) {
  runPowerShellScript(commands.get(command), args);
} else if (command === "start") {
  runOwnerLensServer(args);
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

function runPowerShellScript(script, args, options = {}) {
  const pwsh = resolvePowerShell();
  const scriptPath = join(packageRoot, script.root, script.script);
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

function runOwnerLensServer(args) {
  assertBuiltApp();
  assertBuiltServer();
  const { host, port } = parseServerArgs(args);
  const serverModulePath = join(packageRoot, "dist-server", "ownerlens-server.js");

  process.chdir(packageRoot);
  import(pathToFileURL(serverModulePath).href)
    .then(async ({ startOwnerLensServer }) => {
      const started = await startOwnerLensServer({
        appRoot: packageRoot,
        dataDir,
        host,
        port,
        runtimeToken: process.env.OWNERLENS_RUNTIME_TOKEN
      });
      console.log(`OwnerLens running at ${started.url}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

function assertBuiltApp() {
  const indexPath = join(packageRoot, "dist", "index.html");
  if (existsSync(indexPath)) {
    return;
  }

  console.error("OwnerLens build output was not found at ./dist.");
  console.error("Run `npm run build` before `ownerlens start`, or use a packaged OwnerLens release that includes dist.");
  process.exit(1);
}

function assertBuiltServer() {
  const serverPath = join(packageRoot, "dist-server", "ownerlens-server.js");
  if (existsSync(serverPath)) {
    return;
  }

  console.error("OwnerLens runtime server build was not found at ./dist-server.");
  console.error("Use a packaged OwnerLens release that includes dist-server.");
  process.exit(1);
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

function resolveDataDirectory(rootDir) {
  const configuredDataDir = process.env.OWNERLENS_DATA_DIR?.trim();
  const dataDir = configuredDataDir
    ? resolvePath(rootDir, configuredDataDir)
    : join(rootDir, "data");

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
  const displayPath = dataDir === join(invocationRoot, "data") ? "./data" : dataDir;
  console.log(`Working data directory: ${displayPath}`);
  console.log("Depth 1 data files:");

  const entries = readdirSync(dataDir, { withFileTypes: true })
    .map((entry) => `${entry.isDirectory() ? "d" : "f"} ${displayPath}/${entry.name}`)
    .sort();

  if (entries.length === 0) {
    console.log("  (empty)");
  } else {
    for (const entry of entries) {
      console.log(`  ${entry}`);
    }
  }

  console.log(`OwnerLens will read local snapshots and runtime state from ${displayPath}.`);
  console.log("");
}

function parseServerArgs(args) {
  const parsed = {
    host: "127.0.0.1",
    port: 4173
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--host") {
      parsed.host = readRequiredArg(args, index, "--host");
      index += 1;
    } else if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      parsed.port = parsePort(readRequiredArg(args, index, "--port"));
      index += 1;
    } else if (arg.startsWith("--port=")) {
      parsed.port = parsePort(arg.slice("--port=".length));
    } else {
      console.error(`Unknown start argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return parsed;
}

function readRequiredArg(args, index, name) {
  const value = args[index + 1];
  if (!value) {
    console.error(`Missing value for ${name}.`);
    process.exit(1);
  }
  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${value}`);
    process.exit(1);
  }
  return port;
}

function resolvePath(rootDir, candidate) {
  return isAbsolute(candidate) ? candidate : resolve(rootDir, candidate);
}

function printHelp() {
  console.log(`OwnerLens

Usage:
  ownerlens --version
  ownerlens start [--host 127.0.0.1] [--port 4173]
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

function printVersion() {
  const packageJsonPath = join(packageRoot, "package.json");
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    console.log(packageJson.version);
  } catch (error) {
    console.error(`Could not read OwnerLens package version: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
