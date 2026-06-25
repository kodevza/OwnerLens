<#
.SYNOPSIS
Builds a status object for the OwnerLens runtime.

.DESCRIPTION
Normalizes runtime state, health, process status, port, URL, data path, and startup metadata into the object returned by public status commands.
#>

function New-OwnerLensStatusObject {
  [CmdletBinding()]
  param(
    [object]$State,
    [bool]$Running,
    [string]$Health = "Unknown"
  )

  [pscustomobject]@{
    Running = $Running
    ProcessId = if ($State) { [int]$State.ProcessId } else { $null }
    Port = if ($State) { [int]$State.Port } else { $null }
    ServerUrl = if ($State) { [string]$State.ServerUrl } else { $null }
    DataPath = if ($State) { [string]$State.DataPath } else { $null }
    StartedAt = if ($State) { [datetimeoffset]::Parse([string]$State.StartedAt) } else { $null }
    Health = $Health
    LogDirectory = if ($State -and $State.LogDirectory) { [string]$State.LogDirectory } else { $null }
    StdoutLogPath = if ($State -and $State.StdoutLogPath) { [string]$State.StdoutLogPath } else { $null }
    StderrLogPath = if ($State -and $State.StderrLogPath) { [string]$State.StderrLogPath } else { $null }
  }
}
