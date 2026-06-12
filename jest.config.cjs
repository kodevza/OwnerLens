/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/tools/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/providers/azure/runtime/LocalReportRuntime.duckdb.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json"
      }
    ]
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.tsx?$": "$1"
  }
};
