const baseConfig = require("./jest.config.cjs");

/** @type {import("jest").Config} */
module.exports = {
  ...baseConfig,
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  collectCoverageFrom: ["src/**/*.tsx", "!src/main.tsx", "!src/**/*.test.tsx"],
  coverageDirectory: "coverage/components",
  coverageReporters: ["text", "lcov", "html", "json", "json-summary"],
  coverageThreshold: {
    global: {
      branches: 48,
      functions: 60,
      lines: 70,
      statements: 70
    }
  }
};
