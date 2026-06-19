<#
.SYNOPSIS
Starts the local OwnerLens runtime server.

.DESCRIPTION
Launches the packaged OwnerLens runtime server on loopback, creates a runtime token, persists process state, and returns the runtime status.
#>

function Start-OwnerLens {
  [CmdletBinding()]
  param(
    [ValidateRange(1, 65535)]
    [int]$Port = 0,

    [ValidateNotNullOrEmpty()]
    [string]$DataPath = (Join-Path (Get-Location) "data"),

    [string]$RuntimePath = ""
  )

  $existingState = Read-OwnerLensState
  if ($existingState -and (Test-OwnerLensTrackedProcess -State $existingState)) {
    Write-Verbose "OwnerLens is already running. Runtime token: $($existingState.Token)"
    return Get-OwnerLensStatus
  }

  $runtime = Get-OwnerLensRuntime -RuntimePath $RuntimePath
  $resolvedDataPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DataPath)
  New-Item -ItemType Directory -Path $resolvedDataPath -Force | Out-Null

  $serverPort = if ($Port -gt 0) { $Port } else { Get-OwnerLensFreePort }
  $token = New-OwnerLensRuntimeToken
  $serverUrl = "http://127.0.0.1:$serverPort"

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $runtime.NodePath
  $startInfo.WorkingDirectory = $runtime.AppRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.ArgumentList.Add($runtime.Entrypoint)
  $startInfo.ArgumentList.Add("start")
  $startInfo.ArgumentList.Add("--host")
  $startInfo.ArgumentList.Add("127.0.0.1")
  $startInfo.ArgumentList.Add("--port")
  $startInfo.ArgumentList.Add([string]$serverPort)
  $startInfo.Environment["OWNERLENS_DATA_DIR"] = $resolvedDataPath
  $startInfo.Environment["OWNERLENS_RUNTIME_TOKEN"] = $token

  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) {
    throw "Failed to start OwnerLens server process."
  }

  $state = [pscustomobject]@{
    ProcessId = $process.Id
    Port = $serverPort
    DataPath = $resolvedDataPath
    StartedAt = [datetimeoffset]::UtcNow.ToString("o")
    Token = $token
    ServerUrl = $serverUrl
    RuntimeRoot = $runtime.RuntimeRoot
    NodePath = $runtime.NodePath
    ServerScript = $runtime.ServerScript
  }
  Write-OwnerLensState -State $state

  try {
    Wait-OwnerLensServer -ServerUrl $serverUrl -Token $token
  } catch {
    if (-not $process.HasExited) {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    }
    Remove-OwnerLensState
    throw "OwnerLens server failed to start: $($_.Exception.Message)"
  }

  Write-Verbose "OwnerLens runtime token: $token"
  Get-OwnerLensStatus
}
