import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("enterprise Windows packaging documentation", () => {
  const doc = readFileSync(
    join(process.cwd(), "docs", "enterprise-windows-packaging.md"),
    "utf8"
  );

  it("states the local/offline runtime security model", () => {
    expect(doc).toContain("OwnerLens runs locally");
    expect(doc).toContain("does not require a SaaS backend");
    expect(doc).toContain("does not upload tenant data by design");
  });

  it("does not claim loose JavaScript files are Authenticode-signed", () => {
    expect(doc).toContain("not individually Authenticode-signed");
    expect(doc).toContain("signed Windows file catalog plus release SHA256 hashes");
  });

  it("documents signature, SBOM, and hash verification", () => {
    expect(doc).toContain("Test-OwnerLensSignatures.ps1");
    expect(doc).toContain("Test-OwnerLensHashManifest.ps1");
    expect(doc).toContain("OwnerLens-sbom.cdx.json");
    expect(doc).toContain("VERIFY.ps1");
    expect(doc).toContain("Test-FileCatalog");
  });

  it("documents PowerShell Gallery deployment instead of MSI deployment", () => {
    expect(doc).toContain("PowerShell Gallery");
    expect(doc).toContain("Install-Module OwnerLens");
    expect(doc).not.toContain("msiexec");
  });
});
