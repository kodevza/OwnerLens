<#
.SYNOPSIS
Opens OwnerLens in the default browser.

.DESCRIPTION
Starts the local OwnerLens runtime when needed and opens the tracked server URL for reviewing locally collected Azure and Entra ownership evidence.
#>

function Open-OwnerLens {
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

  $state = Read-OwnerLensState
  if (-not $state -or -not (Test-OwnerLensTrackedProcess -State $state)) {
    Start-OwnerLens -Port $Port -DataPath $DataPath -RuntimePath $RuntimePath -StartupTimeoutSeconds $StartupTimeoutSeconds | Out-Null
    $state = Read-OwnerLensState
  }

  if (-not $state) {
    throw "OwnerLens is not running and no runtime state was created."
  }

  Write-Verbose "OwnerLens runtime token: $($state.Token)"
  $openUrl = "$($state.ServerUrl)/#ownerlens_token=$([System.Uri]::EscapeDataString($state.Token))"
  Start-Process $openUrl | Out-Null
  Get-OwnerLensStatus
}
