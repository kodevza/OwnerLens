<#
.SYNOPSIS
Generates a CycloneDX SBOM for OwnerLens npm dependencies and packaged Windows runtime artifacts.
#>

param(
  [string]$PackageRoot = ".\artifacts\windows\package",
  [string]$OutputPath = ".\artifacts\release\OwnerLens-sbom.cdx.json"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputPath) -Force | Out-Null

Push-Location $repoRoot
try {
  & npx --no-install cyclonedx-npm --output-format JSON --output-file $resolvedOutputPath --omit dev --spec-version 1.6 --output-reproducible
  if ($LASTEXITCODE -ne 0) {
    throw "CycloneDX SBOM generation failed. Ensure npm ci has installed @cyclonedx/cyclonedx-npm."
  }
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $PackageRoot) {
  $packageRootPath = (Resolve-Path -LiteralPath $PackageRoot).ProviderPath
  $sbom = Get-Content -LiteralPath $resolvedOutputPath -Raw | ConvertFrom-Json
  if (-not $sbom.components) {
    $sbom | Add-Member -NotePropertyName components -NotePropertyValue @()
  }

  $artifactComponents = Get-ChildItem -LiteralPath $packageRootPath -File -Recurse |
    Where-Object {
      $_.Extension -in ".exe", ".dll", ".node", ".ps1", ".psm1", ".psd1", ".js", ".json", ".html", ".css"
    } |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = [System.IO.Path]::GetRelativePath($packageRootPath, $_.FullName).Replace("\", "/")
      $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
      [pscustomobject]@{
        type = "file"
        name = $relativePath
        bomRef = "pkg:generic/ownerlens-runtime/$relativePath"
        hashes = @(
          [pscustomobject]@{
            alg = "SHA-256"
            content = $hash.Hash.ToLowerInvariant()
          }
        )
      }
    }

  $components = @($sbom.components) + @($artifactComponents)
  $sbom.components = $components
  $sbom | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $resolvedOutputPath -Encoding UTF8
}

Write-Host "Created SBOM: $resolvedOutputPath"
