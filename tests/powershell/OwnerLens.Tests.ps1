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
  if (req.url === "/api/data") {
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

Describe "OwnerLens module" -Skip:(-not $IsWindows) {
  AfterEach {
    Stop-OwnerLens -ErrorAction SilentlyContinue | Out-Null
  }

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

Describe "Azure Monitor activity log collection" {
  BeforeEach {
    . (Join-Path $PSScriptRoot "..\..\powershell\OwnerLens\Private\Invoke-OwnerLensRestRequestWithRetry.ps1")
    . (Join-Path $PSScriptRoot "..\..\powershell\OwnerLens\Private\Get-AzureMonitorActivityLogs.ps1")
    $script:AzureActivityLogCache = @{}
  }

  It "retries transient failures while following activity log pages" {
    $script:activityLogRequestCount = 0

    function Invoke-AzRestMethod {
      param(
        [string]$Method,
        [string]$Path,
        [string]$Uri
      )

      $script:activityLogRequestCount += 1

      if ($script:activityLogRequestCount -eq 1) {
        return [pscustomobject]@{
          Content = '{"value":[],"nextLink":"https://management.azure.com/subscriptions/test-sub/providers/microsoft.insights/eventtypes/management/values?page=2"}'
        }
      }

      if ($script:activityLogRequestCount -eq 2) {
        throw "Error while copying content to a stream."
      }

      return [pscustomobject]@{
        Content = '{"value":[{"eventTimestamp":"2026-06-25T08:04:57.0000000Z","resourceId":"/subscriptions/test-sub/resourceGroups/rg/providers/Microsoft.Web/sites/app","operationName":{"localizedValue":"Update web app","value":"Microsoft.Web/sites/write"},"status":{"localizedValue":"Succeeded"}}]}'
      }
    }

    $logs = Get-AzureMonitorActivityLogs `
      -SubscriptionId "test-sub" `
      -StartTime ([datetime]"2026-06-25T08:00:00Z") `
      -MaxRecord 10 `
      -RetryDelaySeconds 0

    $logs.Count | Should -Be 1
    $logs[0].resourceId | Should -Be "/subscriptions/test-sub/resourceGroups/rg/providers/Microsoft.Web/sites/app"
    $script:activityLogRequestCount | Should -Be 3
  }
}

Describe "Azure resource snapshot collection" {
  BeforeEach {
    . (Join-Path $PSScriptRoot "..\..\powershell\OwnerLens\Private\Invoke-OwnerLensPrepareResourceSnapshot.ps1")

    function Get-AzContext {
      [pscustomobject]@{
        Subscription = [pscustomobject]@{
          Id = "current-sub"
        }
      }
    }

    function Invoke-AzRestMethod {}

    function Get-AzSubscription {
      @(
        [pscustomobject]@{
          Id = "single-sub"
          Name = "Test subscription"
          TenantId = "tenant-1"
          State = "Enabled"
        }
      )
    }

    function Get-AzUserAssignedIdentity {
      @()
    }

    function Set-AzContext {}
    function Get-AzResourceGroup { @() }
    function Get-AzResource { @() }
    function Get-AzRoleAssignment { @() }
  }

  It "writes requestedSubscriptions as an array for a single subscription filter" {
    $outputPath = Join-Path $TestDrive "snapshot.json"

    Invoke-OwnerLensPrepareResourceSnapshot `
      -OutputPath $outputPath `
      -SubscriptionIds "single-sub" `
      -SkipAuditLogsExport

    $snapshot = Get-Content -LiteralPath $outputPath -Raw | ConvertFrom-Json -AsHashtable

    $requestedSubscriptions = $snapshot.meta.requestedSubscriptions
    $requestedSubscriptions.GetType().FullName | Should -Be "System.Object[]"
    $requestedSubscriptions | Should -Be @("single-sub")
  }
}

Describe "OwnerLens REST request retry" {
  BeforeEach {
    . (Join-Path $PSScriptRoot "..\..\powershell\OwnerLens\Private\Invoke-OwnerLensRestRequestWithRetry.ps1")
  }

  It "uses exponential backoff from a five second base delay by default" {
    $script:restRequestCount = 0
    $script:sleepDelays = @()

    try {
      function Start-Sleep {
        param([int]$Seconds)

        $script:sleepDelays += $Seconds
      }

      $result = Invoke-OwnerLensRestRequestWithRetry `
        -OperationName "Test request" `
        -Request {
          $script:restRequestCount += 1

          if ($script:restRequestCount -le 2) {
            throw "transient"
          }

          return "ok"
        }

      $result | Should -Be "ok"
      $script:restRequestCount | Should -Be 3
      ($script:sleepDelays -join ",") | Should -Be "5,10"
    } finally {
      if (Test-Path function:Start-Sleep) {
        Remove-Item -Path function:Start-Sleep -ErrorAction SilentlyContinue
      }
    }
  }
}
