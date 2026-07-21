<#
.SYNOPSIS
Builds the Windows OwnerLens runtime, launcher, PowerShell module package, runtime ZIP, and catalogs.

.DESCRIPTION
OwnerLens uses a bundled Node.js runtime folder with a small native Windows launcher instead of Node SEA.
The current runtime loads an ESM server dynamically and depends on packaged assets plus native DuckDB
bindings under node_modules. Keeping those files in a deterministic runtime layout preserves existing
runtime behavior, makes native dependencies visible to SBOM/hash tooling, and leaves PE, catalog, and PowerShell
artifacts for Authenticode signing. Loose JavaScript files are not Authenticode-signed.
#>

param(
  [string]$Version = "",
  [string]$OutputRoot = ".\artifacts\windows",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "Build-OwnerLensWindowsPackage.ps1 is Windows-only because it builds a win-x64 runtime package."
}

function Get-OwnerLensPackageVersion {
  param([string]$RepoRoot)

  $packageJson = Get-Content -LiteralPath (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
  return [string]$packageJson.version
}

function New-OwnerLensLauncher {
  param(
    [string]$PackageRoot,
    [string]$Version
  )

  $dotnet = Get-Command "dotnet" -ErrorAction SilentlyContinue
  if (-not $dotnet) {
    throw "dotnet SDK was not found. Install .NET SDK 8+ to build the OwnerLens launcher."
  }

  $launcherRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ownerlens-launcher-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Path $launcherRoot -Force | Out-Null

  try {
    $sourcePath = Join-Path $launcherRoot "Program.cs"
    $projectPath = Join-Path $launcherRoot "OwnerLens.Launcher.csproj"
    $publishPath = Join-Path $launcherRoot "publish"

    @"
using System;
using System.Diagnostics;
using System.IO;

static string Quote(string value)
{
    return "\"" + value.Replace("\"", "\\\"") + "\"";
}

var executablePath = Environment.ProcessPath ?? throw new InvalidOperationException("Could not resolve launcher path.");
var packageRoot = Path.GetDirectoryName(executablePath) ?? Directory.GetCurrentDirectory();
var nodePath = Path.Combine(packageRoot, "node.exe");
var entrypoint = Path.Combine(packageRoot, "app", "bin", "ownerlens.js");

if (!File.Exists(nodePath))
{
    Console.Error.WriteLine("OwnerLens bundled node.exe was not found: " + nodePath);
    return 1;
}

if (!File.Exists(entrypoint))
{
    Console.Error.WriteLine("OwnerLens entrypoint was not found: " + entrypoint);
    return 1;
}

var startInfo = new ProcessStartInfo
{
    FileName = nodePath,
    WorkingDirectory = packageRoot,
    UseShellExecute = false
};

startInfo.ArgumentList.Add(entrypoint);
foreach (var arg in args)
{
    startInfo.ArgumentList.Add(arg);
}

using var process = Process.Start(startInfo);
if (process is null)
{
    Console.Error.WriteLine("Failed to start OwnerLens runtime.");
    return 1;
}

process.WaitForExit();
return process.ExitCode;
"@ | Set-Content -LiteralPath $sourcePath -Encoding UTF8

    @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RuntimeIdentifier>win-x64</RuntimeIdentifier>
    <SelfContained>true</SelfContained>
    <PublishSingleFile>true</PublishSingleFile>
    <PublishTrimmed>true</PublishTrimmed>
    <AssemblyName>OwnerLens</AssemblyName>
    <Version>$Version</Version>
    <FileVersion>$Version</FileVersion>
    <InformationalVersion>$Version</InformationalVersion>
    <Deterministic>true</Deterministic>
    <ContinuousIntegrationBuild>true</ContinuousIntegrationBuild>
  </PropertyGroup>
</Project>
"@ | Set-Content -LiteralPath $projectPath -Encoding UTF8

    & $dotnet.Source publish $projectPath -c Release -o $publishPath /nologo
    if ($LASTEXITCODE -ne 0) {
      throw "dotnet publish failed for OwnerLens launcher."
    }

    Copy-Item -LiteralPath (Join-Path $publishPath "OwnerLens.exe") -Destination (Join-Path $PackageRoot "OwnerLens.exe") -Force
  } finally {
    Remove-Item -LiteralPath $launcherRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Compress-OwnerLensZip {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  Remove-Item -LiteralPath $DestinationPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $SourcePath "*") -DestinationPath $DestinationPath -CompressionLevel Optimal
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$resolvedOutputRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputRoot)
$versionValue = if ([string]::IsNullOrWhiteSpace($Version)) { Get-OwnerLensPackageVersion -RepoRoot $repoRoot } else { $Version }

if ($versionValue -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$') {
  throw "Version '$versionValue' is not a supported package version."
}

$runtimeRoot = Join-Path $resolvedOutputRoot "package"
$moduleRoot = Join-Path $runtimeRoot "PowerShell\OwnerLens"
$releaseRoot = Join-Path $repoRoot "artifacts\release"
$runtimeZip = Join-Path $releaseRoot "OwnerLens-$versionValue-win-x64-runtime.zip"
$moduleZip = Join-Path $releaseRoot "OwnerLens-$versionValue-powershell.zip"
$releaseExe = Join-Path $releaseRoot "OwnerLens.exe"

New-Item -ItemType Directory -Path $resolvedOutputRoot, $releaseRoot -Force | Out-Null

if (-not $SkipBuild) {
  & (Join-Path $repoRoot "scripts\build-windows-runtime.ps1") -OutputPath $runtimeRoot
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot "app\bin\ownerlens.js"))) {
  throw "Runtime package is incomplete: missing app\bin\ownerlens.js under $runtimeRoot."
}

New-OwnerLensLauncher -PackageRoot $runtimeRoot -Version $versionValue

$ownerLensExe = Join-Path $runtimeRoot "OwnerLens.exe"
& $ownerLensExe --version
if ($LASTEXITCODE -ne 0) {
  throw "OwnerLens.exe --version failed."
}
Copy-Item -LiteralPath $ownerLensExe -Destination $releaseExe -Force

& (Join-Path $repoRoot "scripts\build-powershell-module.ps1") -OutputPath $moduleRoot -RuntimePath $runtimeRoot

& (Join-Path $PSScriptRoot "New-OwnerLensFileCatalog.ps1") -PackageRoot $runtimeRoot -CatalogPath (Join-Path $runtimeRoot "OwnerLens.cat")
& (Join-Path $PSScriptRoot "New-OwnerLensFileCatalog.ps1") -PackageRoot $moduleRoot -CatalogPath (Join-Path $moduleRoot "OwnerLens.cat")

Compress-OwnerLensZip -SourcePath $runtimeRoot -DestinationPath $runtimeZip
Compress-OwnerLensZip -SourcePath $moduleRoot -DestinationPath $moduleZip

Write-Host "Created Windows package root: $runtimeRoot"
Write-Host "Created launcher executable: $releaseExe"
Write-Host "Created runtime ZIP: $runtimeZip"
Write-Host "Created PowerShell module ZIP: $moduleZip"
