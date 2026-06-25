import { readFileSync } from "node:fs";
import { join } from "node:path";

const startScript = readFileSync(
  join(process.cwd(), "powershell/OwnerLens/Public/Start-OwnerLens.ps1"),
  "utf8"
);
const openScript = readFileSync(
  join(process.cwd(), "powershell/OwnerLens/Public/Open-OwnerLens.ps1"),
  "utf8"
);
const waitScript = readFileSync(
  join(process.cwd(), "powershell/OwnerLens/Private/Wait-OwnerLensServer.ps1"),
  "utf8"
);

test("PowerShell runtime startup timeout defaults to 180 seconds and is configurable", () => {
  expect(waitScript).toContain("[int]$TimeoutSeconds = 180");
  expect(startScript).toContain("[int]$StartupTimeoutSeconds = 180");
  expect(startScript).toContain("-TimeoutSeconds $StartupTimeoutSeconds");
  expect(openScript).toContain("[int]$StartupTimeoutSeconds = 180");
  expect(openScript).toContain("-StartupTimeoutSeconds $StartupTimeoutSeconds");
});
