const baseConfig = require("./jest.config.cjs");

/** @type {import("jest").Config} */
module.exports = {
  ...baseConfig,
  testMatch: [
    "<rootDir>/src/db/migrate.test.ts",
    "<rootDir>/src/providers/azure/runtime/LocalReportRuntime.duckdb.test.ts",
    "<rootDir>/src/providers/azure/runtime/resources/tables.duckdb.test.ts"
  ],
  testPathIgnorePatterns: ["/node_modules/"]
};
