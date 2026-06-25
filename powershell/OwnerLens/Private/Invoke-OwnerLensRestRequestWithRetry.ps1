function Invoke-OwnerLensRestRequestWithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Request,

    [string]$OperationName = "REST request",

    [int]$MaxRetryCount = 3,

    [int]$RetryDelaySeconds = 5
  )

  $attempt = 0
  while ($true) {
    try {
      return & $Request
    } catch {
      if ($attempt -ge $MaxRetryCount) {
        throw
      }

      $attempt += 1
      $delaySeconds = [Math]::Min(30, [Math]::Pow(2, $attempt - 1) * $RetryDelaySeconds)
      Write-Warning "$OperationName failed ($attempt/$MaxRetryCount): $($_.Exception.Message). Retrying in $delaySeconds seconds."
      if ($delaySeconds -gt 0) {
        Start-Sleep -Seconds $delaySeconds
      }
    }
  }
}
