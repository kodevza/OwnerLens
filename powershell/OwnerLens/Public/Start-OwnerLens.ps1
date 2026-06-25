<#
.SYNOPSIS
Starts the local OwnerLens runtime server.

.DESCRIPTION
Launches the packaged OwnerLens runtime server on loopback, creates a runtime token, persists process state, and returns the runtime status.
#>

function Get-OwnerLensStartupLogTail {
  param(
    [string]$StdoutLogPath,
    [string]$StderrLogPath
  )

  $sections = @()
  foreach ($log in @(
    @{ Label = "stderr"; Path = $StderrLogPath },
    @{ Label = "stdout"; Path = $StdoutLogPath }
  )) {
    if (-not (Test-Path -LiteralPath $log.Path)) {
      continue
    }

    $tail = Get-Content -LiteralPath $log.Path -Tail 20 -ErrorAction SilentlyContinue
    if ($tail) {
      $sections += "`nLast OwnerLens $($log.Label) log lines ($($log.Path)):`n$($tail -join "`n")"
    }
  }

  if ($sections.Count -eq 0) {
    return "`nOwnerLens log files: stdout=$StdoutLogPath stderr=$StderrLogPath"
  }

  return $sections -join "`n"
}

function Unregister-OwnerLensRuntimeLogEvents {
  param(
    [object]$State
  )

  foreach ($sourceIdentifier in @($State.StdoutEventSourceIdentifier, $State.StderrEventSourceIdentifier)) {
    if ([string]::IsNullOrWhiteSpace([string]$sourceIdentifier)) {
      continue
    }

    Unregister-Event -SourceIdentifier ([string]$sourceIdentifier) -ErrorAction SilentlyContinue
    Get-Job |
      Where-Object { $_.Name -eq [string]$sourceIdentifier } |
      Remove-Job -Force -ErrorAction SilentlyContinue
  }
}

function Start-OwnerLens {
  [CmdletBinding()]
  param(
    [ValidateRange(1, 65535)]
    [int]$Port = 0,

    [ValidateNotNullOrEmpty()]
    [string]$DataPath = (Join-Path (Get-Location) "data"),

    [string]$RuntimePath = "",

    [ValidateRange(1, [int]::MaxValue)]
    [int]$StartupTimeoutSeconds = 180
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
  $paths = Get-OwnerLensPaths
  $logDirectory = Join-Path $paths.AppDataRoot "logs"
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logTimestamp = [datetimeoffset]::UtcNow.ToString("yyyyMMdd-HHmmss")
  $stdoutLogPath = Join-Path $logDirectory "ownerlens-server.out.log"
  $stderrLogPath = Join-Path $logDirectory "ownerlens-server.err.log"
  $sessionLogPath = Join-Path $logDirectory "ownerlens-server-$logTimestamp.log"
  "OwnerLens server start $([datetimeoffset]::UtcNow.ToString("o"))" | Set-Content -LiteralPath $sessionLogPath -Encoding UTF8
  "OwnerLens server stdout $([datetimeoffset]::UtcNow.ToString("o"))" | Set-Content -LiteralPath $stdoutLogPath -Encoding UTF8
  "OwnerLens server stderr $([datetimeoffset]::UtcNow.ToString("o"))" | Set-Content -LiteralPath $stderrLogPath -Encoding UTF8

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

  Write-Host "Starting OwnerLens at $serverUrl"
  Write-Host "Server logs:"
  Write-Host "  stdout: $stdoutLogPath"
  Write-Host "  stderr: $stderrLogPath"

  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) {
    throw "Failed to start OwnerLens server process."
  }
  $stdoutEventSourceIdentifier = "OwnerLens.Stdout.$($process.Id)"
  $stderrEventSourceIdentifier = "OwnerLens.Stderr.$($process.Id)"
  Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -SourceIdentifier $stdoutEventSourceIdentifier -MessageData @{ Path = $stdoutLogPath } -Action {
    if ($EventArgs.Data) {
      Add-Content -LiteralPath $Event.MessageData.Path -Value $EventArgs.Data -Encoding UTF8
    }
  } | Out-Null
  Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -SourceIdentifier $stderrEventSourceIdentifier -MessageData @{ Path = $stderrLogPath } -Action {
    if ($EventArgs.Data) {
      Add-Content -LiteralPath $Event.MessageData.Path -Value $EventArgs.Data -Encoding UTF8
    }
  } | Out-Null
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()

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
    LogDirectory = $logDirectory
    StdoutLogPath = $stdoutLogPath
    StderrLogPath = $stderrLogPath
    SessionLogPath = $sessionLogPath
    StdoutEventSourceIdentifier = $stdoutEventSourceIdentifier
    StderrEventSourceIdentifier = $stderrEventSourceIdentifier
  }
  Write-OwnerLensState -State $state

  try {
    Wait-OwnerLensServer -ServerUrl $serverUrl -Token $token -TimeoutSeconds $StartupTimeoutSeconds
  } catch {
    if (-not $process.HasExited) {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    }
    Unregister-OwnerLensRuntimeLogEvents -State $state
    Remove-OwnerLensState
    $logTail = Get-OwnerLensStartupLogTail -StdoutLogPath $stdoutLogPath -StderrLogPath $stderrLogPath
    throw "OwnerLens server failed to start: $($_.Exception.Message)$logTail"
  }

  Write-Verbose "OwnerLens runtime token: $token"
  Get-OwnerLensStatus
}
