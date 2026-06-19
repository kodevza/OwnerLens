<#
.SYNOPSIS
Persists OwnerLens runtime state.

.DESCRIPTION
Writes process, port, URL, token, runtime, and data-path metadata so later module commands can inspect or stop the local OwnerLens server.
#>

function Write-OwnerLensState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [pscustomobject]$State
  )

  $paths = Get-OwnerLensPaths
  New-Item -ItemType Directory -Path $paths.AppDataRoot -Force | Out-Null
  $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $paths.StatePath -Encoding UTF8
}
