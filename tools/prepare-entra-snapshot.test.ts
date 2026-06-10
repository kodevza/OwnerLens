import { readFileSync } from "node:fs";
import { join } from "node:path";

const script = readFileSync(join(process.cwd(), "tools/prepare-entra-snapshot.ps1"), "utf8");

test("Entra snapshot preparation imports Graph modules used for permission grants", () => {
  expect(script).toContain('"Microsoft.Graph.Applications"');
  expect(script).toContain("Import-Module $moduleName -ErrorAction Stop");
});

test("Entra snapshot preparation reads delegated grants per service principal", () => {
  expect(script).toContain("Get-MgServicePrincipalOauth2PermissionGrant");
  expect(script).toContain("Add-OAuth2PermissionGrantSnapshot");
});
