<#
.SYNOPSIS
Creates a Windows catalog for OwnerLens script and web runtime files.

.DESCRIPTION
The catalog covers files that are not individually Authenticode-signed, such as
JavaScript, JSON, CSS, HTML, and source maps. The catalog itself is later
Authenticode-signed and verified with Test-FileCatalog.
#>

param(
  [string]$PackageRoot = ".\artifacts\windows\package",
  [string]$CatalogPath = ".\artifacts\windows\package\OwnerLens.cat"
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "New-OwnerLensFileCatalog.ps1 is Windows-only because New-FileCatalog is Windows-only."
}

$resolvedPackageRoot = (Resolve-Path -LiteralPath $PackageRoot).ProviderPath
$resolvedCatalogPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($CatalogPath)
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ownerlens-catalog-" + [guid]::NewGuid().ToString("n"))
$catalogExtensions = @(".js", ".json", ".css", ".html", ".map", ".md", ".txt")

try {
  New-Item -ItemType Directory -Path $stageRoot, (Split-Path -Parent $resolvedCatalogPath) -Force | Out-Null

  $catalogFiles = Get-ChildItem -LiteralPath $resolvedPackageRoot -Recurse -File |
    Where-Object {
      $_.Extension -in $catalogExtensions -and
      $_.FullName -ne $resolvedCatalogPath
    } |
    Sort-Object FullName

  if (-not $catalogFiles) {
    throw "No OwnerLens files were found for catalog signing under $resolvedPackageRoot."
  }

  foreach ($file in $catalogFiles) {
    $relativePath = [System.IO.Path]::GetRelativePath($resolvedPackageRoot, $file.FullName)
    $destination = Join-Path $stageRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }

  Remove-Item -LiteralPath $resolvedCatalogPath -Force -ErrorAction SilentlyContinue
  $temporaryCatalog = Join-Path $stageRoot "OwnerLens.cat"
  New-FileCatalog -Path $stageRoot -CatalogFilePath $temporaryCatalog -CatalogVersion 2.0 | Out-Null
  Copy-Item -LiteralPath $temporaryCatalog -Destination $resolvedCatalogPath -Force
} finally {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Created OwnerLens file catalog: $resolvedCatalogPath"
