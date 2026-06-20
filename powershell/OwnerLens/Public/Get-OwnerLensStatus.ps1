<#
.SYNOPSIS
Gets the current OwnerLens runtime status.

.DESCRIPTION
Returns process, health, URL, port, runtime, and data-path information for the local OwnerLens server tracked by the PowerShell module.
#>

function Get-OwnerLensStatus {
  [CmdletBinding()]
  param()

  $state = Read-OwnerLensState
  if (-not $state) {
    return New-OwnerLensStatusObject -State $null -Running $false -Health "NoState"
  }

  $running = Test-OwnerLensTrackedProcess -State $state
  $health = if ($running) { "ProcessOnly" } else { "Stopped" }

  if ($running) {
    try {
      Invoke-RestMethod -Uri "$($state.ServerUrl)/api/data" -Headers @{ "X-OwnerLens-Runtime-Token" = $state.Token } -Method Get -TimeoutSec 2 | Out-Null
      $health = "Healthy"
    } catch {
      $health = "RuntimeUnavailable"
    }
  }

  New-OwnerLensStatusObject -State $state -Running $running -Health $health
}
