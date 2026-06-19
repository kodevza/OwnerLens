<#
.SYNOPSIS
Packages the Windows-only OwnerLens PowerShell module release ZIP.

.DESCRIPTION
Builds the Windows runtime and PowerShell module with the existing build scripts,
updates the packaged module manifest version, creates a clean release ZIP, and
writes a SHA256 checksum file under artifacts/release.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "package-powershell-module.ps1 is Windows-only because the OwnerLens PowerShell module is Windows-only."
}

if ($Version -notmatch '^(?<BaseVersion>\d+\.\d+\.\d+(?:\.\d+)?)(?:-(?<Prerelease>[0-9A-Za-z][0-9A-Za-z.-]*))?$') {
  throw "Version '$Version' is not a supported semantic version for PowerShell module packaging."
}

$moduleVersion = [version]$Matches.BaseVersion
$prerelease = $Matches.Prerelease
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimePath = Join-Path $repoRoot "powershell\OwnerLens\bin\win-x64"
$stagingRoot = Join-Path $repoRoot "artifacts\powershell-package"
$moduleOutput = Join-Path $stagingRoot "OwnerLens"
$releaseRoot = Join-Path $repoRoot "artifacts\release"
$zipPath = Join-Path $releaseRoot "OwnerLens-$Version-win-x64.zip"
$checksumPath = "$zipPath.sha256"

$runtimeBuildScript = Join-Path $PSScriptRoot "build-windows-runtime.ps1"
if (Test-Path -LiteralPath $runtimeBuildScript) {
  & $runtimeBuildScript -OutputPath $runtimePath
}

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

$moduleBuildScript = Join-Path $PSScriptRoot "build-powershell-module.ps1"
if (Test-Path -LiteralPath $moduleBuildScript) {
  & $moduleBuildScript -OutputPath $moduleOutput -RuntimePath $runtimePath
} else {
  $moduleSource = Join-Path $repoRoot "powershell\OwnerLens"
  Copy-Item -Path $moduleSource -Destination $moduleOutput -Recurse -Force
}

$manifestPath = Join-Path $moduleOutput "OwnerLens.psd1"
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "PowerShell module manifest was not found in packaged module: $manifestPath"
}

$manifestUpdate = @{
  Path = $manifestPath
  ModuleVersion = $moduleVersion
}
if ($prerelease) {
  $manifestUpdate.Prerelease = $prerelease
}
Update-ModuleManifest @manifestUpdate

$manifestData = Import-PowerShellDataFile -LiteralPath $manifestPath
if ([string]$manifestData.ModuleVersion -ne [string]$moduleVersion) {
  throw "OwnerLens.psd1 ModuleVersion '$($manifestData.ModuleVersion)' does not match expected '$moduleVersion'."
}
if ($prerelease -and $manifestData.PrivateData.PSData.Prerelease -ne $prerelease) {
  throw "OwnerLens.psd1 prerelease '$($manifestData.PrivateData.PSData.Prerelease)' does not match expected '$prerelease'."
}
Test-ModuleManifest -Path $manifestPath -ErrorAction Stop | Out-Null

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
Remove-Item -LiteralPath $zipPath, $checksumPath -Force -ErrorAction SilentlyContinue

Compress-Archive -Path $moduleOutput -DestinationPath $zipPath -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $containsManifest = $zip.Entries | Where-Object { $_.FullName -eq "OwnerLens/OwnerLens.psd1" } | Select-Object -First 1
  if (-not $containsManifest) {
    throw "Release ZIP does not contain OwnerLens/OwnerLens.psd1."
  }
} finally {
  $zip.Dispose()
}

$hash = Get-FileHash -Path $zipPath -Algorithm SHA256
Set-Content -Path $checksumPath -Value "$($hash.Hash.ToLowerInvariant())  $(Split-Path -Leaf $zipPath)" -Encoding ascii

Write-Host "Created $zipPath"
Write-Host "Created $checksumPath"
