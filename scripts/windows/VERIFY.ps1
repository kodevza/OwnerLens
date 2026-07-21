<#
.SYNOPSIS
Verifies OwnerLens Windows release artifacts end to end.
#>

param(
  [string]$PackageRoot = ".\artifacts\windows\package",
  [string]$ReleaseRoot = ".\artifacts\release",
  [string]$HashManifestPath = ".\artifacts\release\OwnerLens-sha256.json",
  [string]$CatalogPath = "",
  [switch]$RequireValidSignatures,
  [switch]$RequireTimestamp
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "VERIFY.ps1 is Windows-only because it verifies Authenticode signatures and Windows catalogs."
}

$resolvedPackageRoot = (Resolve-Path -LiteralPath $PackageRoot).ProviderPath
$resolvedReleaseRoot = (Resolve-Path -LiteralPath $ReleaseRoot).ProviderPath

Write-Host "Verifying Authenticode signatures..."
& (Join-Path $PSScriptRoot "Test-OwnerLensSignatures.ps1") `
  -Path $resolvedPackageRoot, $resolvedReleaseRoot `
  -RequireValid:$RequireValidSignatures `
  -RequireTimestamp:$RequireTimestamp

Write-Host "Verifying signed file catalog..."
$catalogs = if ([string]::IsNullOrWhiteSpace($CatalogPath)) {
  Get-ChildItem -LiteralPath $resolvedPackageRoot -Filter "OwnerLens.cat" -File -Recurse | Sort-Object FullName
} else {
  @(Get-Item -LiteralPath $CatalogPath)
}

if (-not $catalogs) {
  throw "No OwnerLens.cat file catalog was found under $resolvedPackageRoot."
}

foreach ($catalog in $catalogs) {
  $catalogRoot = Split-Path -Parent $catalog.FullName
  Write-Host "Verifying catalog $($catalog.FullName) against $catalogRoot"
  $catalogSignature = Get-AuthenticodeSignature -FilePath $catalog.FullName
  if ($RequireValidSignatures -and $catalogSignature.Status -ne "Valid") {
    throw "OwnerLens catalog signature is not valid: $($catalogSignature.Status) - $($catalogSignature.StatusMessage)"
  }

  $catalogStatus = Test-FileCatalog -Path $catalogRoot -CatalogFilePath $catalog.FullName -Detailed
  $invalidCatalogFiles = @($catalogStatus | Where-Object { $_.Status -ne "Valid" })
  if ($invalidCatalogFiles) {
    $invalidCatalogFiles | Format-Table Path, Status -AutoSize
    throw "OwnerLens file catalog validation failed for $($catalog.FullName)."
  }
}

Write-Host "Verifying release hashes..."
& (Join-Path $PSScriptRoot "Test-OwnerLensHashManifest.ps1") -ArtifactRoot $resolvedReleaseRoot -ManifestPath $HashManifestPath

Write-Host "Verifying OwnerLens.exe version command..."
$ownerLensExe = Join-Path $resolvedPackageRoot "OwnerLens.exe"
& $ownerLensExe --version
if ($LASTEXITCODE -ne 0) {
  throw "OwnerLens.exe --version failed."
}

Write-Host "OwnerLens Windows release verification passed."
