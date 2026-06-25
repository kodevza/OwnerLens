import { readFileSync } from "node:fs";
import { join } from "node:path";

const startScript = readFileSync(
  join(process.cwd(), "powershell/OwnerLens/Public/Start-OwnerLens.ps1"),
  "utf8"
);
const statusScript = readFileSync(
  join(process.cwd(), "powershell/OwnerLens/Private/New-OwnerLensStatusObject.ps1"),
  "utf8"
);

test("PowerShell runtime start persists server output to discoverable log files", () => {
  expect(startScript).toContain("$logDirectory");
  expect(startScript).toContain("ownerlens-server.out.log");
  expect(startScript).toContain("ownerlens-server.err.log");
  expect(startScript).toContain("RedirectStandardOutput = $true");
  expect(startScript).toContain("RedirectStandardError = $true");
  expect(startScript).toContain("Register-ObjectEvent -InputObject $process -EventName OutputDataReceived");
  expect(startScript).toContain("Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived");
  expect(startScript).toContain("$process.BeginOutputReadLine()");
  expect(startScript).toContain("$process.BeginErrorReadLine()");
  expect(startScript).toContain("LogDirectory = $logDirectory");
  expect(statusScript).toContain("LogDirectory");
  expect(statusScript).toContain("StdoutLogPath");
  expect(statusScript).toContain("StderrLogPath");
});
