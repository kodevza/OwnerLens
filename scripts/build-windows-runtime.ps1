<#
.SYNOPSIS
Builds and verifies the Windows runtime bundle for the OwnerLens PowerShell module.

.DESCRIPTION
Runs the web build, prepares the packaged app and Node runtime files, installs production dependencies, and verifies that the local OwnerLens API starts successfully.
#>

param(
  [string]$OutputPath = ".\powershell\OwnerLens\bin\win-x64",
  [int]$VerifyPort = 0
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "build-windows-runtime.ps1 is Windows-only because it prepares the win-x64 PowerShell module runtime."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outputRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$appRoot = Join-Path $outputRoot "app"

Push-Location $repoRoot
try {
  npm ci
  npm run build

  if (Test-Path -LiteralPath $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $appRoot -Force | Out-Null

  foreach ($path in @("bin", "dist", "tools", "migrations", "contracts", "src")) {
    Copy-Item -Path (Join-Path $repoRoot $path) -Destination $appRoot -Recurse -Force
  }

  foreach ($file in @("package.json", "package-lock.json", "index.html", "vite.config.ts", "tsconfig.json")) {
    Copy-Item -Path (Join-Path $repoRoot $file) -Destination $appRoot -Force
  }

  $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    Copy-Item -Path $nodeCommand.Source -Destination (Join-Path $outputRoot "node.exe") -Force
  }

  Push-Location $appRoot
  try {
    npm ci --omit=dev
  } finally {
    Pop-Location
  }

  $verifyDataPath = Join-Path $env:TEMP ("ownerlens-runtime-verify-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Path $verifyDataPath -Force | Out-Null

  if ($VerifyPort -eq 0) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
    try {
      $listener.Start()
      $VerifyPort = $listener.LocalEndpoint.Port
    } finally {
      $listener.Stop()
    }
  }

  $tokenBytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($tokenBytes)
  $token = [Convert]::ToBase64String($tokenBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "node"
  $startInfo.WorkingDirectory = $appRoot
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.ArgumentList.Add("./bin/ownerlens.js")
  $startInfo.ArgumentList.Add("preview")
  $startInfo.ArgumentList.Add("--host")
  $startInfo.ArgumentList.Add("127.0.0.1")
  $startInfo.ArgumentList.Add("--port")
  $startInfo.ArgumentList.Add([string]$VerifyPort)
  $startInfo.Environment["OWNERLENS_DATA_DIR"] = $verifyDataPath
  $startInfo.Environment["OWNERLENS_RUNTIME_TOKEN"] = $token

  $process = [System.Diagnostics.Process]::Start($startInfo)
  try {
    $deadline = (Get-Date).AddSeconds(45)
    do {
      if ($process.HasExited) {
        $stderr = $process.StandardError.ReadToEnd()
        throw "Runtime verification process exited early with code $($process.ExitCode). $stderr"
      }
      try {
        Invoke-RestMethod -Uri "http://127.0.0.1:$VerifyPort/api/data/runtime" -Headers @{ "X-OwnerLens-Runtime-Token" = $token } -TimeoutSec 2 | Out-Null
        Write-Host "Verified OwnerLens runtime at $outputRoot"
        return
      } catch {
        Start-Sleep -Milliseconds 500
      }
    } while ((Get-Date) -lt $deadline)

    throw "Runtime verification timed out on port $VerifyPort."
  } finally {
    if ($process -and -not $process.HasExited) {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    }
    Remove-Item -LiteralPath $verifyDataPath -Recurse -Force -ErrorAction SilentlyContinue
  }
} finally {
  Pop-Location
}
