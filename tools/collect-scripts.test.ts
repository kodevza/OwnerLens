import { readFileSync } from "node:fs";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const cli = readFileSync(join(process.cwd(), "bin/ownerlens.js"), "utf8");
const collectEntra = readFileSync(join(process.cwd(), "tools/collect-entra.ps1"), "utf8");
const collectAzure = readFileSync(join(process.cwd(), "tools/collect-azure.ps1"), "utf8");

test("package exposes OwnerLens collect commands through the npm bin", () => {
  expect(packageJson.bin.ownerlens).toBe("./bin/ownerlens.js");
  expect(packageJson.scripts.start).toBe("node ./bin/ownerlens.js start");
  expect(packageJson.scripts.preview).toBe("node ./bin/ownerlens.js preview");
  expect(packageJson.scripts["collect:entra"]).toBe("node ./bin/ownerlens.js collect:entra");
  expect(packageJson.scripts["collect:azure"]).toBe("node ./bin/ownerlens.js collect:azure");
  expect(cli).not.toContain("runViteDevServer");
  expect(cli).not.toContain("ownerlens dev");
  expect(cli).toContain('command === "start" || command === "preview"');
  expect(cli).toContain('runViteSync(["build"])');
  expect(cli).toContain('"preview", "--host", "127.0.0.1"');
  expect(cli).toContain('require.resolve("vite/package.json")');
  expect(cli).toContain('["collect:entra", "collect-entra.ps1"]');
  expect(cli).toContain('["collect:azure", "collect-azure.ps1"]');
});

test("collect wrappers delegate to the snapshot exporters used by the runtime", () => {
  expect(collectEntra).toContain("prepare-entra-snapshot.ps1");
  expect(collectEntra).toContain('Join-Path $OutputDir "entra-snapshot.json"');
  expect(collectEntra).toContain("[string]$AccessToken");
  expect(collectEntra).toContain("Connect-MgGraph -AccessToken $secureAccessToken -NoWelcome");
  expect(collectAzure).toContain("prepare-resource-snapshot.ps1");
  expect(collectAzure).toContain('Join-Path $OutputDir "snapshot.json"');
});
