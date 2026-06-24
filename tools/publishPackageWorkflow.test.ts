import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("publish package workflow", () => {
  it("rejects PowerShell files unless their Authenticode signature is valid", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain('$sig.Status -ne "Valid"');
    expect(workflow).toContain("Authenticode signature is not valid");
  });

  it("validates required Artifact Signing environment secrets before signing", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("Validate Artifact Signing configuration");
    expect(workflow).toContain("ARTIFACT_SIGNING_ENDPOINT");
    expect(workflow).toContain("ARTIFACT_SIGNING_ACCOUNT_NAME");
    expect(workflow).toContain("ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME");
    expect(workflow).toContain("Missing required package-signing environment secret");
  });
});
