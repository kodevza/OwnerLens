<#
.SYNOPSIS
Reads Azure Monitor activity logs for OwnerLens resource snapshots.

.DESCRIPTION
Fetches recent activity log records, normalizes caller and claim fields, and caches requests so resource snapshot collection can attach low-confidence activity evidence locally.
#>

if (-not $script:AzureActivityLogCache) {
  $script:AzureActivityLogCache = @{}
}

function Get-ActivityLogValue {
  param(
    [object]$Object,
    [string]$PropertyName
  )

  if (-not $Object) {
    return $null
  }

  $property = $Object.PSObject.Properties[$PropertyName]
  if (-not $property) {
    return $null
  }

  return $property.Value
}

function Get-ActivityLogField {
  param(
    [object]$Entry,
    [string]$PropertyName
  )

  $value = Get-ActivityLogValue $Entry $PropertyName
  if ($null -ne $value) {
    return $value
  }

  $properties = Get-ActivityLogValue $Entry "properties"
  return Get-ActivityLogValue $properties $PropertyName
}

function Get-ActivityLogClaim {
  param(
    [object]$Claims,
    [string[]]$ClaimNames
  )

  if (-not $Claims) {
    return $null
  }

  foreach ($claimName in $ClaimNames) {
    $value = Get-ActivityLogValue $Claims $claimName
    if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
      return $value
    }
  }

  return $null
}

function Get-ActivityLogCacheKey {
  param(
    [string]$SubscriptionId,
    [datetime]$StartTime,
    [int]$MaxRecord
  )

  $normalizedStartTime = $StartTime.ToUniversalTime().ToString("o")
  return "$SubscriptionId|$normalizedStartTime|$MaxRecord"
}

function Get-AzureMonitorActivityLogs {
  param(
    [string]$SubscriptionId,
    [datetime]$StartTime,
    [int]$MaxRecord
  )

  $logs = [System.Collections.Generic.List[object]]::new()
  if ($MaxRecord -le 0) {
    return $logs
  }

  $cacheKey = Get-ActivityLogCacheKey -SubscriptionId $SubscriptionId -StartTime $StartTime -MaxRecord $MaxRecord
  if ($script:AzureActivityLogCache.ContainsKey($cacheKey)) {
    return $script:AzureActivityLogCache[$cacheKey]
  }

  $endTime = Get-Date
  $filter = "eventTimestamp ge '$($StartTime.ToUniversalTime().ToString("o"))' and eventTimestamp le '$($endTime.ToUniversalTime().ToString("o"))'"
  $encodedFilter = [Uri]::EscapeDataString($filter)
  $requestPath = "/subscriptions/$SubscriptionId/providers/microsoft.insights/eventtypes/management/values?api-version=2015-04-01&`$filter=$encodedFilter"

  while ($requestPath -and $logs.Count -lt $MaxRecord) {
    if ($requestPath -match "^https?://") {
      $response = Invoke-AzRestMethod -Method GET -Uri $requestPath
    } else {
      $response = Invoke-AzRestMethod -Method GET -Path $requestPath
    }

    $content = $response.Content | ConvertFrom-Json
    foreach ($entry in @($content.value)) {
      if ($logs.Count -ge $MaxRecord) {
        break
      }

      $operationName = Get-ActivityLogField $entry "operationName"
      $status = Get-ActivityLogField $entry "status"
      $subStatus = Get-ActivityLogField $entry "subStatus"
      $category = Get-ActivityLogField $entry "category"
      $resourceProviderName = Get-ActivityLogField $entry "resourceProviderName"
      $resourceType = Get-ActivityLogField $entry "resourceType"
      $authorization = Get-ActivityLogField $entry "authorization"
      $claims = Get-ActivityLogField $entry "claims"

      $logs.Add([pscustomobject]@{
        eventTimestamp = Get-ActivityLogField $entry "eventTimestamp"
        submissionTimestamp = Get-ActivityLogField $entry "submissionTimestamp"
        caller = Get-ActivityLogField $entry "caller"
        callerUserPrincipalName = Get-ActivityLogClaim $claims @(
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
          "unique_name",
          "upn",
          "preferred_username"
        )
        callerName = Get-ActivityLogClaim $claims @(
          "name",
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
        )
        callerEmail = Get-ActivityLogClaim $claims @(
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
          "email",
          "emails",
          "preferred_username"
        )
        callerObjectId = Get-ActivityLogClaim $claims @(
          "http://schemas.microsoft.com/identity/claims/objectidentifier",
          "oid",
          "objectidentifier"
        )
        callerIdentityType = Get-ActivityLogClaim $claims @("idtyp")
        callerAppId = Get-ActivityLogClaim $claims @("appid", "azp")
        callerIpAddress = Get-ActivityLogClaim $claims @("ipaddr")
        callerTenantId = Get-ActivityLogClaim $claims @(
          "http://schemas.microsoft.com/identity/claims/tenantid",
          "tid"
        )
        operationName = Get-ActivityLogValue $operationName "localizedValue"
        operationNameValue = Get-ActivityLogValue $operationName "value"
        status = Get-ActivityLogValue $status "localizedValue"
        subStatus = Get-ActivityLogValue $subStatus "localizedValue"
        category = Get-ActivityLogValue $category "localizedValue"
        resourceGroupName = Get-ActivityLogField $entry "resourceGroupName"
        resourceId = Get-ActivityLogField $entry "resourceId"
        resourceProviderName = Get-ActivityLogValue $resourceProviderName "localizedValue"
        resourceType = Get-ActivityLogValue $resourceType "localizedValue"
        authorizationAction = Get-ActivityLogValue $authorization "action"
        authorizationScope = Get-ActivityLogValue $authorization "scope"
      }) | Out-Null
    }

    $requestPath = Get-ActivityLogValue $content "nextLink"
  }

  $script:AzureActivityLogCache[$cacheKey] = $logs
  return $script:AzureActivityLogCache[$cacheKey]
}
