<#
.SYNOPSIS
Removes the persisted OwnerLens runtime state file.

.DESCRIPTION
Deletes the local state file after the runtime is stopped or startup fails, preventing stale process metadata from being reused.
#>

function Remove-OwnerLensState {
  [CmdletBinding()]
  param()

  $statePath = (Get-OwnerLensPaths).StatePath
  if (Test-Path -LiteralPath $statePath) {
    Remove-Item -LiteralPath $statePath -Force
  }
}
