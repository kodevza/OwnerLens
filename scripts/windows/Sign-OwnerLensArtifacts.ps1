<#
.SYNOPSIS
Signs OwnerLens Windows artifacts with Authenticode.

.DESCRIPTION
Supports local certificate store signing and PFX-based CI signing. GitHub release builds prefer
Azure Artifact Signing through azure/artifact-signing-action; this script remains useful for
developer machines, private build agents, and validation of required-signing policy.
#>

param(
  [string[]]$Path = @(".\artifacts\windows\package", ".\artifacts\release"),
  [switch]$RequireSigning,
  [switch]$SkipZipRefresh,
  [string]$CertificateThumbprint = $env:OWNERLENS_SIGN_CERT_THUMBPRINT,
  [string]$CertificateSubject = $env:OWNERLENS_SIGN_CERT_SUBJECT,
  [string]$PfxPath = $env:OWNERLENS_SIGN_PFX_PATH,
  [string]$PfxPassword = $env:OWNERLENS_SIGN_PFX_PASSWORD,
  [string]$TimestampUrl = $(if ($env:OWNERLENS_SIGN_TIMESTAMP_URL) { $env:OWNERLENS_SIGN_TIMESTAMP_URL } else { "http://timestamp.acs.microsoft.com" })
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "Sign-OwnerLensArtifacts.ps1 is Windows-only because Authenticode signing is Windows-only."
}

function Get-SignableFiles {
  param([string[]]$Roots)

  foreach ($root in $Roots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    $item = Get-Item -LiteralPath $root
    if ($item.PSIsContainer) {
      Get-ChildItem -LiteralPath $item.FullName -Recurse -File |
        Where-Object { $_.Extension -in ".exe", ".dll", ".node", ".cat", ".ps1", ".psm1", ".psd1" }
    } elseif ($item.Extension -in ".exe", ".dll", ".node", ".cat", ".ps1", ".psm1", ".psd1") {
      $item
    }
  }
}

function Get-SigningCertificate {
  if ($PfxPath) {
    if (-not (Test-Path -LiteralPath $PfxPath)) {
      throw "PFX signing certificate was not found: $PfxPath"
    }

    $securePassword = if ($PfxPassword) {
      ConvertTo-SecureString -String $PfxPassword -AsPlainText -Force
    } else {
      ConvertTo-SecureString -String "" -AsPlainText -Force
    }
    return [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($PfxPath, $securePassword, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
  }

  $certificates = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My -CodeSigningCert -ErrorAction SilentlyContinue
  if ($CertificateThumbprint) {
    $normalizedThumbprint = $CertificateThumbprint -replace '\s', ''
    return $certificates |
      Where-Object { ($_.Thumbprint -replace '\s', '') -ieq $normalizedThumbprint } |
      Sort-Object NotAfter -Descending |
      Select-Object -First 1
  }

  if ($CertificateSubject) {
    return $certificates |
      Where-Object { $_.Subject -like "*$CertificateSubject*" } |
      Sort-Object NotAfter -Descending |
      Select-Object -First 1
  }

  return $null
}

function Update-OwnerLensSignedZips {
  $packageRoot = Join-Path (Resolve-Path ".").ProviderPath "artifacts\windows\package"
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot "app\package.json"))) {
    return
  }

  $runtimePackage = Get-Content -LiteralPath (Join-Path $packageRoot "app\package.json") -Raw | ConvertFrom-Json
  $version = [string]$runtimePackage.version
  if ([string]::IsNullOrWhiteSpace($version)) {
    return
  }

  $releaseRoot = Join-Path (Resolve-Path ".").ProviderPath "artifacts\release"
  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
  $runtimeZip = Join-Path $releaseRoot "OwnerLens-$version-win-x64-runtime.zip"
  $moduleZip = Join-Path $releaseRoot "OwnerLens-$version-powershell.zip"

  Remove-Item -LiteralPath $runtimeZip, $moduleZip -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $runtimeZip -CompressionLevel Optimal

  $moduleRoot = Join-Path $packageRoot "PowerShell\OwnerLens"
  if (Test-Path -LiteralPath $moduleRoot) {
    Compress-Archive -Path (Join-Path $moduleRoot "*") -DestinationPath $moduleZip -CompressionLevel Optimal
  }
}

$files = @(Get-SignableFiles -Roots $Path | Sort-Object FullName -Unique)
if (-not $files) {
  throw "No signable OwnerLens files were found."
}

$certificate = Get-SigningCertificate
if (-not $certificate) {
  if ($RequireSigning) {
    throw "Signing is required but no signing certificate was found. Set OWNERLENS_SIGN_CERT_THUMBPRINT, OWNERLENS_SIGN_CERT_SUBJECT, or OWNERLENS_SIGN_PFX_PATH."
  }

  Write-Warning "No signing certificate configured; leaving artifacts unsigned for local development."
  return
}

foreach ($file in $files) {
  Write-Host "Signing $($file.FullName)"
  $signature = Set-AuthenticodeSignature -FilePath $file.FullName -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampUrl
  if ($signature.Status -ne "Valid") {
    throw "Signing failed for $($file.FullName): $($signature.Status) - $($signature.StatusMessage)"
  }
}

& (Join-Path $PSScriptRoot "Test-OwnerLensSignatures.ps1") -Path $Path -RequireValid -RequireTimestamp:$RequireSigning

if (-not $SkipZipRefresh) {
  Update-OwnerLensSignedZips
}
