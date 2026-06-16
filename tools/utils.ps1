function Get-DirectoryObjectSnapshotValue {
  param(
    [Parameter(Mandatory = $true)]
    $DirectoryObject,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $value = $DirectoryObject.$Name

  if ($null -ne $value) {
    return $value
  }

  $camelName = $Name.Substring(0, 1).ToLowerInvariant() + $Name.Substring(1)
  if (-not $DirectoryObject.AdditionalProperties) {
    return $null
  }

  return $DirectoryObject.AdditionalProperties[$camelName]
}

function ConvertTo-OwnerSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    $Owner
  )

  [pscustomobject]@{
    id = Get-DirectoryObjectSnapshotValue -DirectoryObject $Owner -Name "Id"
    displayName = Get-DirectoryObjectSnapshotValue -DirectoryObject $Owner -Name "DisplayName"
    userPrincipalName = Get-DirectoryObjectSnapshotValue -DirectoryObject $Owner -Name "UserPrincipalName"
    mail = Get-DirectoryObjectSnapshotValue -DirectoryObject $Owner -Name "Mail"
    ownerType = if ($Owner.AdditionalProperties) { $Owner.AdditionalProperties["@odata.type"] } else { $null }
  }
}

function Get-ExpandedOwnerSnapshots {
  param(
    [Parameter(Mandatory = $true)]
    $DirectoryObject
  )

  $owners = $DirectoryObject.Owners

  if ($null -eq $owners -and $DirectoryObject.AdditionalProperties) {
    $owners = $DirectoryObject.AdditionalProperties["owners"]
  }

  return @(
    foreach ($owner in @($owners)) {
      if ($owner) {
        ConvertTo-OwnerSnapshot -Owner $owner
      }
    }
  )
}

function ConvertTo-GroupMemberType {
  param(
    [string]$ODataType
  )

  switch -Regex ($ODataType) {
    "servicePrincipal$" { return "servicePrincipal" }
    "user$" { return "user" }
    "group$" { return "group" }
    "device$" { return "device" }
    default { return "unknown" }
  }
}

function Get-DirectoryObjectODataType {
  param(
    [Parameter(Mandatory = $true)]
    $DirectoryObject
  )

  if ($DirectoryObject.AdditionalProperties) {
    $odataType = $DirectoryObject.AdditionalProperties["@odata.type"]

    if ($odataType) {
      return $odataType
    }
  }

  $odataTypeProperty = $DirectoryObject.PSObject.Properties["@odata.type"]

  if ($odataTypeProperty) {
    return $odataTypeProperty.Value
  }

  return $null
}

function ConvertTo-GroupMemberSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    $Group,

    [Parameter(Mandatory = $true)]
    $Member,

    [hashtable]$ServicePrincipalById = @{}
  )

  $memberId = Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "Id"
  $servicePrincipal = if ($memberId -and $ServicePrincipalById.ContainsKey($memberId)) { $ServicePrincipalById[$memberId] } else { $null }
  $odataType = Get-DirectoryObjectODataType -DirectoryObject $Member

  [pscustomobject]@{
    groupId = $Group.Id
    groupDisplayName = $Group.DisplayName
    memberId = $memberId
    memberDisplayName = Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "DisplayName"
    memberType = ConvertTo-GroupMemberType -ODataType $odataType
    memberUserPrincipalName = Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "UserPrincipalName"
    memberMail = Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "Mail"
    memberAppId = if ($servicePrincipal) { $servicePrincipal.AppId } else { Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "AppId" }
    memberServicePrincipalType = if ($servicePrincipal) { $servicePrincipal.ServicePrincipalType } else { Get-DirectoryObjectSnapshotValue -DirectoryObject $Member -Name "ServicePrincipalType" }
  }
}

function ConvertTo-SnapshotPropertyName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($Name.Length -le 1) {
    return $Name.ToLowerInvariant()
  }

  return $Name.Substring(0, 1).ToLowerInvariant() + $Name.Substring(1)
}

function ConvertTo-SafeSnapshotValue {
  param(
    $Value
  )

  if ($null -eq $Value) {
    return $null
  }

  if (
    $Value -is [string] -or
    $Value -is [bool] -or
    $Value -is [byte] -or
    $Value -is [int] -or
    $Value -is [long] -or
    $Value -is [decimal] -or
    $Value -is [double] -or
    $Value -is [single]
  ) {
    return $Value
  }

  if ($Value -is [datetime]) {
    return $Value.ToUniversalTime().ToString("o")
  }

  if ($Value -is [datetimeoffset]) {
    return $Value.ToUniversalTime().ToString("o")
  }

  if ($Value -is [guid]) {
    return $Value.ToString()
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $converted = [ordered]@{}

    foreach ($key in $Value.Keys) {
      if ([string]$key -ieq "secretText") {
        continue
      }

      $converted[$key] = ConvertTo-SafeSnapshotValue -Value $Value[$key]
    }

    return [pscustomobject]$converted
  }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    return @(
      foreach ($item in $Value) {
        ConvertTo-SafeSnapshotValue -Value $item
      }
    )
  }

  $convertedObject = [ordered]@{}

  foreach ($property in $Value.PSObject.Properties) {
    if ($property.Name -ieq "secretText") {
      continue
    }

    $convertedObject[(ConvertTo-SnapshotPropertyName -Name $property.Name)] = ConvertTo-SafeSnapshotValue -Value $property.Value
  }

  return [pscustomobject]$convertedObject
}

function ConvertTo-EntraSnapshotTags {
  param(
    [AllowNull()]
    $Tags
  )

  if ($null -eq $Tags) {
    return @()
  }

  return @($Tags)
}

function ConvertTo-ApplicationAppRoleSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    $AppRole
  )

  [pscustomobject]@{
    id = $AppRole.Id
    value = $AppRole.Value
    displayName = $AppRole.DisplayName
    description = $AppRole.Description
    isEnabled = $AppRole.IsEnabled
    allowedMemberTypes = $AppRole.AllowedMemberTypes
  }
}

function Merge-OwnerSnapshots {
  param(
    [array]$OwnerSets = @()
  )

  $seenOwnerIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $mergedOwners = @()

  foreach ($ownerSet in $OwnerSets) {
    foreach ($owner in @($ownerSet)) {
      if (-not $owner) {
        continue
      }

      $ownerId = [string]$owner.id

      if (-not [string]::IsNullOrWhiteSpace($ownerId)) {
        if (-not $seenOwnerIds.Add($ownerId)) {
          continue
        }
      }

      $mergedOwners += $owner
    }
  }

  return $mergedOwners
}

function New-ApplicationOwnerIndex {
  param(
    [array]$Applications = @()
  )

  $ownersByAppId = @{}

  foreach ($app in @($Applications)) {
    if (-not $app.AppId) {
      continue
    }

    $ownersByAppId[[string]$app.AppId] = Get-ExpandedOwnerSnapshots -DirectoryObject $app
  }

  return $ownersByAppId
}

function Get-ApplicationOwnersByAppId {
  param(
    [string]$AppId,

    [hashtable]$ApplicationOwnersByAppId = @{}
  )

  if ([string]::IsNullOrWhiteSpace($AppId)) {
    return @()
  }

  if (-not $ApplicationOwnersByAppId.ContainsKey($AppId)) {
    return @()
  }

  return @($ApplicationOwnersByAppId[$AppId])
}
