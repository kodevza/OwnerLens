import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("publish package workflow", () => {
  it("rejects release artifacts unless their Authenticode signature is valid when signing is enabled", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("Test-OwnerLensSignatures.ps1");
    expect(workflow).toContain("-RequireValid -RequireTimestamp");
  });

  it("requires Artifact Signing secrets for tagged releases unless explicitly disabled", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("Validate release signing policy");
    expect(workflow).toContain("ARTIFACT_SIGNING_ENDPOINT");
    expect(workflow).toContain("ARTIFACT_SIGNING_ACCOUNT_NAME");
    expect(workflow).toContain("ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME");
    expect(workflow).toContain("OWNERLENS_ALLOW_UNSIGNED_RELEASE=true");
    expect(workflow).toContain("Tagged OwnerLens releases require Azure Artifact Signing");
  });

  it("generates release SBOM and SHA256 hash artifacts after signing", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("New-OwnerLensSbom.ps1");
    expect(workflow).toContain("New-OwnerLensHashManifest.ps1");
    expect(workflow).toContain("VERIFY.ps1");
    expect(workflow.indexOf("Verify Authenticode signatures")).toBeLessThan(workflow.indexOf("Generate SBOM"));
    expect(workflow.indexOf("Generate SBOM")).toBeLessThan(workflow.indexOf("Generate SHA256 hashes"));
  });

  it("marks emergency unsigned releases in GitHub release notes", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("UNSIGNED EMERGENCY RELEASE");
    expect(workflow).toContain("Signed with Azure Artifact Signing");
  });

  it("signs native binaries and catalogs but does not produce an MSI release", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github", "workflows", "publish-package.yml"),
      "utf8"
    );

    expect(workflow).toContain("files-folder-filter: exe,dll,node,cat,ps1,psm1,psd1");
    expect(workflow).not.toContain("MSI installer");
    expect(workflow).not.toContain(".msi");
  });
});
