<#
.SYNOPSIS
Installs the bundled OwnerLens runtime for the current user.

.DESCRIPTION
Copies the packaged Windows runtime into the local OwnerLens app data directory so the PowerShell module can start the local server.
#>

function Install-OwnerLensRuntime {
  [CmdletBinding()]
  param(
    [ValidateNotNullOrEmpty()]
    [string]$SourcePath = (Join-Path (Get-OwnerLensPaths).BundledRuntimeRoot "*"),

    [ValidateNotNullOrEmpty()]
    [string]$DestinationPath = (Get-OwnerLensPaths).RuntimeRoot,

    [switch]$Force
  )

  $sourceRoot = Split-Path $SourcePath -Parent
  if (-not (Test-Path -LiteralPath $sourceRoot)) {
    throw "OwnerLens runtime source was not found: $sourceRoot"
  }

  if ((Test-Path -LiteralPath $DestinationPath) -and -not $Force) {
    throw "OwnerLens runtime destination already exists: $DestinationPath. Use -Force to replace it."
  }

  if (Test-Path -LiteralPath $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
  Copy-Item -Path $SourcePath -Destination $DestinationPath -Recurse -Force

  Get-OwnerLensRuntime -RuntimePath $DestinationPath | Out-Null
  [pscustomobject]@{
    RuntimePath = $DestinationPath
    Installed = $true
  }
}
