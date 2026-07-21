<#
.SYNOPSIS
Creates SHA256 manifests for OwnerLens release artifacts.
#>

param(
  [string]$ArtifactRoot = ".\artifacts\release",
  [string]$OutputJson = ".\artifacts\release\OwnerLens-sha256.json",
  [string]$OutputText = ".\artifacts\release\OwnerLens-sha256.txt"
)

$ErrorActionPreference = "Stop"

$resolvedArtifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).ProviderPath
$resolvedOutputJson = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputJson)
$resolvedOutputText = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputText)

$outputFullNames = @($resolvedOutputJson, $resolvedOutputText)
$artifacts = Get-ChildItem -LiteralPath $resolvedArtifactRoot -File -Recurse |
  Where-Object {
    $_.FullName -notin $outputFullNames -and
    $_.Extension -in ".exe", ".zip", ".json", ".xml", ".spdx", ".cdx"
  } |
  Sort-Object FullName

if (-not $artifacts) {
  throw "No release artifacts were found under $resolvedArtifactRoot."
}

$manifest = foreach ($artifact in $artifacts) {
  $relativePath = [System.IO.Path]::GetRelativePath($resolvedArtifactRoot, $artifact.FullName).Replace("\", "/")
  $hash = Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256
  [pscustomobject]@{
    path = $relativePath
    sha256 = $hash.Hash.ToLowerInvariant()
    sizeBytes = $artifact.Length
  }
}

New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputJson), (Split-Path -Parent $resolvedOutputText) -Force | Out-Null
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $resolvedOutputJson -Encoding UTF8

$lines = $manifest | ForEach-Object { "$($_.sha256)  $($_.path)" }
$lines | Set-Content -LiteralPath $resolvedOutputText -Encoding ascii

Write-Host "Created hash manifest: $resolvedOutputJson"
Write-Host "Created hash manifest: $resolvedOutputText"
