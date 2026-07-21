<#
.SYNOPSIS
Validates local OwnerLens release artifacts against a SHA256 JSON manifest.
#>

param(
  [string]$ArtifactRoot = ".\artifacts\release",
  [string]$ManifestPath = ".\artifacts\release\OwnerLens-sha256.json"
)

$ErrorActionPreference = "Stop"

$resolvedArtifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).ProviderPath
$resolvedManifestPath = (Resolve-Path -LiteralPath $ManifestPath).ProviderPath
$entries = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json

if (-not $entries) {
  throw "Hash manifest is empty: $resolvedManifestPath"
}

$failures = @()
foreach ($entry in $entries) {
  $artifactPath = Join-Path $resolvedArtifactRoot ([string]$entry.path)
  if (-not (Test-Path -LiteralPath $artifactPath)) {
    $failures += "Missing artifact: $($entry.path)"
    continue
  }

  $actual = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne [string]$entry.sha256) {
    $failures += "Hash mismatch: $($entry.path) expected $($entry.sha256) actual $actual"
  } else {
    Write-Host "OK $($entry.path)"
  }
}

if ($failures) {
  $failures | ForEach-Object { Write-Error $_ }
  throw "OwnerLens hash manifest validation failed."
}

Write-Host "OwnerLens hash manifest validation passed."
