import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflow = readFileSync(join(process.cwd(), ".github/workflows/validation-e2e.yml"), "utf8");

test("validation workflow uses the supported Graph access token parameter set", () => {
  const graphConnectLine = workflow
    .split(/\r?\n/)
    .find((line) => line.includes("Connect-MgGraph -AccessToken"));

  expect(graphConnectLine).toBeDefined();
  expect(graphConnectLine).toContain("-NoWelcome");
  expect(graphConnectLine).not.toContain("-Scopes");
  expect(graphConnectLine).not.toContain("-ContextScope");
  expect(workflow).toContain("GRAPH_ACCESS_TOKEN=$plainToken");
  expect(workflow).toContain('-AccessToken "$GRAPH_ACCESS_TOKEN" -SkipLogin');
});
