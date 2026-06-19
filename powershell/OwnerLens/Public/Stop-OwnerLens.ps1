<#
.SYNOPSIS
Stops the local OwnerLens runtime server.

.DESCRIPTION
Stops the tracked OwnerLens process when it is still running, removes persisted runtime state, and returns the final local runtime status.
#>

function Stop-OwnerLens {
  [CmdletBinding(SupportsShouldProcess)]
  param()

  $state = Read-OwnerLensState
  if (-not $state) {
    return New-OwnerLensStatusObject -State $null -Running $false -Health "NoState"
  }

  $process = Get-Process -Id ([int]$state.ProcessId) -ErrorAction SilentlyContinue
  if ($process -and -not (Test-OwnerLensTrackedProcess -State $state)) {
    throw "Runtime state points to process $($state.ProcessId), but it does not appear to be the tracked OwnerLens server. Refusing to stop it."
  }

  if ($process -and $PSCmdlet.ShouldProcess("OwnerLens process $($state.ProcessId)", "Stop")) {
    Stop-Process -Id ([int]$state.ProcessId) -ErrorAction Stop
    try {
      Wait-Process -Id ([int]$state.ProcessId) -Timeout 10 -ErrorAction SilentlyContinue
    } catch {
      $process = Get-Process -Id ([int]$state.ProcessId) -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id ([int]$state.ProcessId) -Force -ErrorAction Stop
      }
    }
  }

  Remove-OwnerLensState
  New-OwnerLensStatusObject -State $state -Running $false -Health "Stopped"
}
