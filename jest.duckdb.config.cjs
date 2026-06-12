const baseConfig = require("./jest.config.cjs");

/** @type {import("jest").Config} */
module.exports = {
  ...baseConfig,
  testMatch: ["<rootDir>/src/providers/azure/runtime/LocalReportRuntime.duckdb.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"]
};
