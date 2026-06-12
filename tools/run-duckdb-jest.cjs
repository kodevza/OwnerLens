#!/usr/bin/env node

const { spawn } = require("node:child_process");

const jestArgs = [
  "--expose-gc",
  "./node_modules/jest/bin/jest.js",
  "--runInBand",
  "--config",
  "jest.duckdb.config.cjs",
  ...process.argv.slice(2)
];

const child = spawn(process.execPath, jestArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let successSummarySeen = false;
let settlingTimer = null;
let killTimer = null;
let completedBySupervisor = false;

const maxRuntimeMs = Number.parseInt(process.env.DUCKDB_JEST_TIMEOUT_MS ?? "120000", 10);

const timeoutTimer = setTimeout(() => {
  if (!successSummarySeen) {
    process.stderr.write(`DuckDB Jest worker timed out after ${maxRuntimeMs}ms.\n`);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 3000).unref();
  }
}, maxRuntimeMs);

function updateSuccessState(chunk) {
  output += chunk;

  if (
    /Test Suites:\s+\d+ passed,\s+\d+ total/.test(output) &&
    /Tests:\s+\d+ passed,\s+\d+ total/.test(output) &&
    /Ran all test suites/.test(output) &&
    !/FAIL\s/.test(output)
  ) {
    successSummarySeen = true;

    if (!settlingTimer) {
      settlingTimer = setTimeout(() => {
        completedBySupervisor = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
        killTimer.unref();
      }, 1000);
      settlingTimer.unref();
    }
  }
}

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  updateSuccessState(text);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  updateSuccessState(text);
});

child.on("close", (code, signal) => {
  clearTimeout(timeoutTimer);
  if (settlingTimer) {
    clearTimeout(settlingTimer);
  }
  if (killTimer) {
    clearTimeout(killTimer);
  }

  if (code === 0 || (completedBySupervisor && successSummarySeen)) {
    process.exit(0);
  }

  if (signal) {
    process.stderr.write(`DuckDB Jest worker exited with signal ${signal}.\n`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
