#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const libCoverage = require("istanbul-lib-coverage");
const libReport = require("istanbul-lib-report");
const reports = require("istanbul-reports");

const coverageRoot = path.resolve(process.cwd(), "coverage");
const defaultInputs = ["node", "duckdb", "components"].map((name) =>
  path.join(coverageRoot, name, "coverage-final.json")
);

const args = process.argv.slice(2);
const outFlagIndex = args.indexOf("--out");
const outDir =
  outFlagIndex >= 0 && args[outFlagIndex + 1]
    ? path.resolve(process.cwd(), args[outFlagIndex + 1])
    : path.join(coverageRoot, "merged");

const explicitInputs = args.filter((arg, index) => index !== outFlagIndex && index !== outFlagIndex + 1);
const inputFiles = (explicitInputs.length > 0 ? explicitInputs : defaultInputs)
  .map((file) => path.resolve(process.cwd(), file))
  .filter((file) => fs.existsSync(file));

if (inputFiles.length === 0) {
  console.error("No coverage-final.json files found to merge.");
  console.error(`Checked: ${defaultInputs.map((file) => path.relative(process.cwd(), file)).join(", ")}`);
  process.exit(1);
}

const coverageMap = libCoverage.createCoverageMap({});

for (const file of inputFiles) {
  const coverage = JSON.parse(fs.readFileSync(file, "utf8"));
  coverageMap.merge(coverage);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const context = libReport.createContext({
  dir: outDir,
  coverageMap
});

for (const reporter of ["html", "lcovonly", "json", "json-summary", "text-summary"]) {
  reports.create(reporter).execute(context);
}

const summary = coverageMap.getCoverageSummary().toJSON();
const pct = (metric) => `${summary[metric].pct}%`;

console.log("");
console.log("Merged coverage report");
console.log(`  Inputs: ${inputFiles.map((file) => path.relative(process.cwd(), file)).join(", ")}`);
console.log(`  Files: ${coverageMap.files().length}`);
console.log(`  HTML: ${path.relative(process.cwd(), path.join(outDir, "index.html"))}`);
console.log(
  `  Total: statements ${pct("statements")}, branches ${pct("branches")}, functions ${pct("functions")}, lines ${pct("lines")}`
);
