<#
.SYNOPSIS
Checks whether the persisted OwnerLens runtime process is still running.

.DESCRIPTION
Validates the process ID stored in module state and verifies that it still refers to the expected local OwnerLens runtime process.
#>

function Test-OwnerLensTrackedProcess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [object]$State
  )

  $process = Get-Process -Id ([int]$State.ProcessId) -ErrorAction SilentlyContinue
  if (-not $process) {
    return $false
  }

  if ($State.NodePath) {
    try {
      $expectedNodePath = [System.IO.Path]::GetFullPath([string]$State.NodePath)
      $actualPath = [System.IO.Path]::GetFullPath([string]$process.Path)
      if ($actualPath -eq $expectedNodePath) {
        return $true
      }
    } catch {
      # Fall back to authenticated health check below when process path is unavailable.
    }
  }

  try {
    Invoke-RestMethod -Uri "$($State.ServerUrl)/api/data/runtime" -Headers @{ "X-OwnerLens-Runtime-Token" = $State.Token } -Method Get -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}
