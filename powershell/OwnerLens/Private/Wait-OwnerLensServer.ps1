<#
.SYNOPSIS
Waits for the local OwnerLens server to become healthy.

.DESCRIPTION
Polls the local runtime API with the runtime token until the OwnerLens server responds or startup times out.
#>

function Wait-OwnerLensServer {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$ServerUrl,

    [Parameter(Mandatory)]
    [string]$Token,

    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $headers = @{ "X-OwnerLens-Runtime-Token" = $Token }
  $runtimeUrl = "$ServerUrl/api/data/runtime"

  do {
    try {
      Invoke-RestMethod -Uri $runtimeUrl -Headers $headers -Method Get -TimeoutSec 2 | Out-Null
      return
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  throw "OwnerLens server did not become ready at $ServerUrl within $TimeoutSeconds seconds."
}
