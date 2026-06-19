<#
.SYNOPSIS
Builds the distributable OwnerLens PowerShell module.

.DESCRIPTION
Copies the OwnerLens module files and prepared Windows runtime into an artifact directory, optionally runs PSScriptAnalyzer, and verifies exported commands.
#>

param(
  [string]$OutputPath = ".\artifacts\OwnerLens",
  [string]$RuntimePath = ".\powershell\OwnerLens\bin\win-x64"
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "build-powershell-module.ps1 is Windows-only because the module is Windows-only."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$moduleSource = Join-Path $repoRoot "powershell\OwnerLens"
$moduleOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$preparedRuntime = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($RuntimePath)

if (-not (Test-Path -LiteralPath (Join-Path $preparedRuntime "app\bin\ownerlens.js"))) {
  throw "Prepared Windows runtime bundle was not found at '$preparedRuntime'. Run scripts/build-windows-runtime.ps1 first."
}

if (Test-Path -LiteralPath $moduleOutput) {
  Remove-Item -LiteralPath $moduleOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $moduleOutput -Force | Out-Null

foreach ($path in @("OwnerLens.psd1", "OwnerLens.psm1", "Public", "Private", "README.md")) {
  Copy-Item -Path (Join-Path $moduleSource $path) -Destination $moduleOutput -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $moduleOutput "bin") -Force | Out-Null
Copy-Item -Path $preparedRuntime -Destination (Join-Path $moduleOutput "bin") -Recurse -Force

$scriptAnalyzer = Get-Command Invoke-ScriptAnalyzer -ErrorAction SilentlyContinue
if ($scriptAnalyzer) {
  $findings = Invoke-ScriptAnalyzer -Path $moduleOutput -Recurse
  if ($findings) {
    $findings | Format-Table -AutoSize
    Write-Warning "PSScriptAnalyzer reported issues."
  }
} else {
  Write-Host "PSScriptAnalyzer not found; skipping analysis."
}

Import-Module (Join-Path $moduleOutput "OwnerLens.psd1") -Force
Get-Command -Module OwnerLens | Format-Table -AutoSize
