param(
  [string]$OutputPath = ".\data\entra-snapshot.json"
)

if (-not (Get-Command Get-MgContext -ErrorAction SilentlyContinue)) {
  throw "Microsoft Graph PowerShell module missing. Install: Install-Module Microsoft.Graph -Scope CurrentUser"
}

$context = Get-MgContext

if (-not $context) {
  throw 'Not connected. Run: Connect-MgGraph -TenantId "<tenant-id>" -Scopes "Application.Read.All","Group.Read.All","Directory.Read.All"'
}

$snapshot = [ordered]@{
  meta = [ordered]@{
    provider = "entra"
    snapshotVersion = "0.4"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    tenantId = $context.TenantId
    account = $context.Account
    scopes = $context.Scopes
  }
  servicePrincipals = @()
  applications = @()
  oauth2PermissionGrants = @()
  appRoleAssignments = @()
  groups = @()
}

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

$servicePrincipals = Get-MgServicePrincipal `
  -All `
  -Property Id,AppId,DisplayName,ServicePrincipalType,PublisherName,AccountEnabled,AppOwnerOrganizationId,AppDisplayName,Homepage,LoginUrl,ReplyUrls,ServicePrincipalNames,Tags,AppRoles

$servicePrincipalById = @{}

foreach ($sp in $servicePrincipals) {
  $servicePrincipalById[$sp.Id] = $sp
}

foreach ($sp in $servicePrincipals) {
  $servicePrincipalOwners = @(
    Get-MgServicePrincipalOwner `
      -ServicePrincipalId $sp.Id `
      -All `
      -Property Id,DisplayName,UserPrincipalName,Mail |
      ForEach-Object { ConvertTo-OwnerSnapshot -Owner $_ }
  )

  $snapshot.servicePrincipals += [pscustomobject]@{
    id = $sp.Id
    appId = $sp.AppId
    displayName = $sp.DisplayName
    appDisplayName = $sp.AppDisplayName
    servicePrincipalType = $sp.ServicePrincipalType
    publisherName = $sp.PublisherName
    accountEnabled = $sp.AccountEnabled
    appOwnerOrganizationId = $sp.AppOwnerOrganizationId
    homepage = $sp.Homepage
    loginUrl = $sp.LoginUrl
    replyUrls = $sp.ReplyUrls
    servicePrincipalNames = $sp.ServicePrincipalNames
    tags = $sp.Tags
    servicePrincipalOwners = $servicePrincipalOwners
    appRoles = @(
      $sp.AppRoles | ForEach-Object {
        [pscustomobject]@{
          id = $_.Id
          value = $_.Value
          displayName = $_.DisplayName
          description = $_.Description
          isEnabled = $_.IsEnabled
          allowedMemberTypes = $_.AllowedMemberTypes
        }
      }
    )
  }
}

$applications = Get-MgApplication `
  -All `
  -Property Id,AppId,DisplayName,SignInAudience,PublisherDomain,IdentifierUris,Tags,AppRoles,Api,RequiredResourceAccess,Web,Spa,PublicClient,PasswordCredentials,KeyCredentials,CreatedDateTime,DeletedDateTime,DisabledByMicrosoftStatus,Info,Notes

foreach ($app in $applications) {
  $applicationOwners = @(
    Get-MgApplicationOwner `
      -ApplicationId $app.Id `
      -All `
      -Property Id,DisplayName,UserPrincipalName,Mail |
      ForEach-Object { ConvertTo-OwnerSnapshot -Owner $_ }
  )

  $snapshot.applications += [pscustomobject]@{
    id = $app.Id
    appId = $app.AppId
    displayName = $app.DisplayName
    signInAudience = $app.SignInAudience
    publisherDomain = $app.PublisherDomain
    identifierUris = $app.IdentifierUris
    tags = $app.Tags
    appRoles = @($app.AppRoles | ForEach-Object { ConvertTo-ApplicationAppRoleSnapshot -AppRole $_ })
    oauth2PermissionScopes = @($app.Api.Oauth2PermissionScopes | ForEach-Object { ConvertTo-SafeSnapshotValue -Value $_ })
    requiredResourceAccess = @($app.RequiredResourceAccess | ForEach-Object { ConvertTo-SafeSnapshotValue -Value $_ })
    web = ConvertTo-SafeSnapshotValue -Value $app.Web
    spa = ConvertTo-SafeSnapshotValue -Value $app.Spa
    publicClient = ConvertTo-SafeSnapshotValue -Value $app.PublicClient
    passwordCredentials = @($app.PasswordCredentials | ForEach-Object { ConvertTo-SafeSnapshotValue -Value $_ })
    keyCredentials = @($app.KeyCredentials | ForEach-Object { ConvertTo-SafeSnapshotValue -Value $_ })
    createdDateTime = if ($app.CreatedDateTime) { $app.CreatedDateTime.ToUniversalTime().ToString("o") } else { $null }
    deletedDateTime = if ($app.DeletedDateTime) { $app.DeletedDateTime.ToUniversalTime().ToString("o") } else { $null }
    disabledByMicrosoftStatus = $app.DisabledByMicrosoftStatus
    info = ConvertTo-SafeSnapshotValue -Value $app.Info
    notes = $app.Notes
    owners = $applicationOwners
  }
}

$oauth2PermissionGrants = Get-MgOauth2PermissionGrant -All

foreach ($grant in $oauth2PermissionGrants) {
  $snapshot.oauth2PermissionGrants += [pscustomobject]@{
    id = $grant.Id
    clientId = $grant.ClientId
    consentType = $grant.ConsentType
    principalId = $grant.PrincipalId
    resourceId = $grant.ResourceId
    scope = $grant.Scope
  }
}

foreach ($sp in $servicePrincipals) {
  $assignments = Get-MgServicePrincipalAppRoleAssignment `
    -ServicePrincipalId $sp.Id `
    -All

  foreach ($assignment in $assignments) {
    $resourceServicePrincipal = $servicePrincipalById[$assignment.ResourceId]
    $appRole = $null

    if ($resourceServicePrincipal -and $resourceServicePrincipal.AppRoles) {
      $appRole = $resourceServicePrincipal.AppRoles | Where-Object { [string]$_.Id -eq [string]$assignment.AppRoleId } | Select-Object -First 1
    }

    $snapshot.appRoleAssignments += [pscustomobject]@{
      id = $assignment.Id
      appRoleId = $assignment.AppRoleId
      appRoleDisplayName = if ($appRole) { $appRole.DisplayName } else { $null }
      appRoleValue = if ($appRole) { $appRole.Value } else { $null }
      principalId = $assignment.PrincipalId
      principalDisplayName = $assignment.PrincipalDisplayName
      resourceId = $assignment.ResourceId
      resourceDisplayName = $assignment.ResourceDisplayName
    }
  }
}

$groups = Get-MgGroup `
  -All `
  -Property Id,DisplayName,Description,Mail,MailEnabled,SecurityEnabled,GroupTypes,ProxyAddresses,Visibility

foreach ($group in $groups) {
  $members = Get-MgGroupMember `
    -GroupId $group.Id `
    -All

  $memberEmails = @(
    $members | ForEach-Object {
      $mail = $_.AdditionalProperties["mail"]
      $userPrincipalName = $_.AdditionalProperties["userPrincipalName"]

      if ($mail) {
        $mail
      } elseif ($userPrincipalName) {
        $userPrincipalName
      }
    } | Where-Object { $_ } | Select-Object -Unique
  )

  $snapshot.groups += [pscustomobject]@{
    id = $group.Id
    displayName = $group.DisplayName
    description = $group.Description
    mail = $group.Mail
    mailEnabled = $group.MailEnabled
    securityEnabled = $group.SecurityEnabled
    groupTypes = $group.GroupTypes
    proxyAddresses = $group.ProxyAddresses
    visibility = $group.Visibility
    memberEmails = $memberEmails
    memberEmailCount = $memberEmails.Count
  }
}

$snapshot.meta.servicePrincipalCount = $snapshot.servicePrincipals.Count
$snapshot.meta.applicationCount = $snapshot.applications.Count
$snapshot.meta.oauth2PermissionGrantCount = $snapshot.oauth2PermissionGrants.Count
$snapshot.meta.appRoleAssignmentCount = $snapshot.appRoleAssignments.Count
$snapshot.meta.groupCount = $snapshot.groups.Count

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory) -and -not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$snapshot | ConvertTo-Json -Depth 20 | Out-File $OutputPath -Encoding utf8
