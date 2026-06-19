BeforeAll {
  $script:ModulePath = Join-Path $PSScriptRoot "..\..\powershell\OwnerLens\OwnerLens.psd1"
  if ($IsWindows) {
    Import-Module $script:ModulePath -Force
  }

  function New-TestRuntime {
    $root = Join-Path $TestDrive "runtime"
    $app = Join-Path $root "app"
    New-Item -ItemType Directory -Path (Join-Path $app "bin") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $app "dist") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $app "tools") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $app "node_modules\vite\bin") -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $app "package.json") -Value '{"type":"module"}' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $app "bin\ownerlens.js") -Value "console.log('ownerlens test entrypoint');" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $app "node_modules\vite\bin\vite.js") -Encoding UTF8 -Value @'
import http from "node:http";

const portIndex = process.argv.indexOf("--port");
const port = Number(process.argv[portIndex + 1]);
const token = process.env.OWNERLENS_RUNTIME_TOKEN ?? "";

const server = http.createServer((req, res) => {
  if (req.url === "/api/data/runtime") {
    if (token && req.headers["x-ownerlens-runtime-token"] !== token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Runtime API token is missing or invalid." }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!doctype html><title>OwnerLens</title>");
});

server.listen(port, "127.0.0.1");
'@
    return $root
  }
}

AfterEach {
  if ($IsWindows) {
    Stop-OwnerLens -ErrorAction SilentlyContinue | Out-Null
  }
}

Describe "OwnerLens module" -Skip:(-not $IsWindows) {
  It "imports successfully and exports commands" {
    $commands = Get-Command -Module OwnerLens
    $commands.Name | Should -Contain "Start-OwnerLens"
    $commands.Name | Should -Contain "Stop-OwnerLens"
    $commands.Name | Should -Contain "Get-OwnerLensStatus"
    $commands.Name | Should -Contain "Open-OwnerLens"
    $commands.Name | Should -Contain "Invoke-OwnerLensCollectEntra"
    $commands.Name | Should -Contain "Invoke-OwnerLensCollectAzure"
    $commands.Name | Should -Contain "Install-OwnerLensRuntime"
  }

  It "starts, reports status, and stops the tracked process" {
    $runtime = New-TestRuntime
    $dataPath = Join-Path $TestDrive "data"

    $started = Start-OwnerLens -RuntimePath $runtime -DataPath $dataPath
    $started.Running | Should -BeTrue
    $started.ServerUrl | Should -Match "^http://127\.0\.0\.1:\d+$"

    $statePath = Join-Path $env:LOCALAPPDATA "OwnerLens\runtime-state.json"
    Test-Path -LiteralPath $statePath | Should -BeTrue

    $status = Get-OwnerLensStatus
    $status.Running | Should -BeTrue
    $status.ProcessId | Should -Be $started.ProcessId

    $stopped = Stop-OwnerLens
    $stopped.Running | Should -BeFalse
    Test-Path -LiteralPath $statePath | Should -BeFalse
  }

  It "fails clearly for missing runtime path" {
    { Start-OwnerLens -RuntimePath (Join-Path $TestDrive "missing") -DataPath (Join-Path $TestDrive "data") } |
      Should -Throw "*OwnerLens runtime was not found*"
  }
}
