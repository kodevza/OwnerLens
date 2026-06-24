import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("publish package workflow", () => {
  it.skip("rejects PowerShell files unless their Authenticode signature is valid", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    // TODO: after signing setup
    // expect(workflow).toContain('$sig.Status -ne "Valid"');
    // expect(workflow).toContain("Authenticode signature is not valid");
  });
});
