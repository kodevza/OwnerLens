<#
.SYNOPSIS
Returns local filesystem paths used by the OwnerLens PowerShell module.

.DESCRIPTION
Builds the application data, runtime, bundled runtime, and state-file paths used to install, start, stop, and inspect the local OwnerLens runtime.
#>

function Get-OwnerLensPaths {
  [CmdletBinding()]
  param()

  $appDataRoot = Join-Path $env:LOCALAPPDATA "OwnerLens"

  [pscustomobject]@{
    AppDataRoot = $appDataRoot
    RuntimeRoot = Join-Path $appDataRoot "runtime"
    StatePath = Join-Path $appDataRoot "runtime-state.json"
    ModuleRoot = $PSScriptRoot | Split-Path
    BundledRuntimeRoot = Join-Path ($PSScriptRoot | Split-Path) "bin\win-x64"
  }
}
