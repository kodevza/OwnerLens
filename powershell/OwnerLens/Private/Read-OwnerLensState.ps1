<#
.SYNOPSIS
Reads the persisted OwnerLens runtime state.

.DESCRIPTION
Loads the local runtime state file when it exists so module commands can inspect or reuse a previously started OwnerLens server.
#>

function Read-OwnerLensState {
  [CmdletBinding()]
  param()

  $statePath = (Get-OwnerLensPaths).StatePath
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  } catch {
    throw "OwnerLens runtime state file is invalid: $statePath. $($_.Exception.Message)"
  }
}
