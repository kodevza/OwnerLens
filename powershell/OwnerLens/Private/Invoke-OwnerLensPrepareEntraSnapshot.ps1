<#
.SYNOPSIS
Creates an OwnerLens Microsoft Entra snapshot file.

.DESCRIPTION
Exports service principals, application registrations, groups, group membership facts, owners, credentials, and permissions into the local JSON snapshot consumed by OwnerLens.
#>

function Invoke-OwnerLensPrepareEntraSnapshot {
  [CmdletBinding()]
  param(
  [string]$OutputPath = ".\data\entra-snapshot.json"
  )

$ownerExpand = "owners(`$select=id,displayName,userPrincipalName,mail)"

function Write-EntraSnapshotProgress {
  param([string]$Message)

  $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "[$timestamp] $Message"
}

function Get-EntraGroupMembersIncludingServicePrincipals {
  param(
    [Parameter(Mandatory = $true)]
    [string]$GroupId
  )

  $members = @()
  $uri = "/beta/groups/$($GroupId)/members?`$select=id,displayName,userPrincipalName,mail,appId,servicePrincipalType&`$top=999"

  while ($uri) {
    $currentUri = $uri
    $response = Invoke-OwnerLensRestRequestWithRetry `
      -OperationName "Microsoft Graph group members request" `
      -Request {
        return Invoke-MgGraphRequest -Method GET -Uri $currentUri -OutputType PSObject -ErrorAction Stop
      }
    $members += @($response.value)

    $nextLinkProperty = $response.PSObject.Properties["@odata.nextLink"]
    $uri = if ($nextLinkProperty) { $nextLinkProperty.Value } else { $null }
  }

  return $members
}

function Get-EntraOAuth2PermissionGrants {
  $grants = @()
  $uri = "/v1.0/oauth2PermissionGrants?`$select=id,clientId,consentType,principalId,resourceId,scope&`$top=999"

  while ($uri) {
    $currentUri = $uri
    $response = Invoke-OwnerLensRestRequestWithRetry `
      -OperationName "Microsoft Graph OAuth2 permission grants request" `
      -Request {
        return Invoke-MgGraphRequest -Method GET -Uri $currentUri -OutputType PSObject -ErrorAction Stop
      }
    $grants += @($response.value)

    $nextLinkProperty = $response.PSObject.Properties["@odata.nextLink"]
    $uri = if ($nextLinkProperty) { $nextLinkProperty.Value } else { $null }
  }

  return $grants
}

function ConvertTo-GraphBatchRelativeUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  if ($Url.StartsWith("https://graph.microsoft.com/v1.0", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $Url.Substring("https://graph.microsoft.com/v1.0".Length)
  }

  if ($Url.StartsWith("/v1.0/", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $Url.Substring("/v1.0".Length)
  }

  if ($Url.StartsWith("/", [System.StringComparison]::Ordinal)) {
    return $Url
  }

  return "/$Url"
}

function Get-EntraServicePrincipalAppRoleAssignmentsBatch {
  param(
    [array]$ServicePrincipals = @()
  )

  $assignments = @()
  $pendingRequests = @(
    foreach ($sp in @($ServicePrincipals)) {
      if ($sp -and -not [string]::IsNullOrWhiteSpace([string]$sp.Id)) {
        [pscustomobject]@{
          servicePrincipalId = [string]$sp.Id
          servicePrincipalDisplayName = [string]$sp.DisplayName
          url = "/servicePrincipals/$($sp.Id)/appRoleAssignments?`$select=id,appRoleId,principalId,principalDisplayName,resourceId,resourceDisplayName&`$top=999"
        }
      }
    }
  )
  $completedRequestCount = 0
  $totalInitialRequestCount = $pendingRequests.Count
  $batchSize = 20

  while ($pendingRequests.Count -gt 0) {
    $currentBatch = @($pendingRequests | Select-Object -First $batchSize)
    $pendingRequests = @($pendingRequests | Select-Object -Skip $currentBatch.Count)

    $batchRequests = @()
    $requestById = @{}

    for ($requestIndex = 0; $requestIndex -lt $currentBatch.Count; $requestIndex++) {
      $requestId = [string]($requestIndex + 1)
      $request = $currentBatch[$requestIndex]
      $requestById[$requestId] = $request
      $batchRequests += [pscustomobject]@{
        id = $requestId
        method = "GET"
        url = $request.url
      }
    }

    $body = @{ requests = $batchRequests } | ConvertTo-Json -Depth 10
    $currentBody = $body
    $response = Invoke-OwnerLensRestRequestWithRetry `
      -OperationName "Microsoft Graph app role assignments batch request" `
      -Request {
        return Invoke-MgGraphRequest -Method POST -Uri "/v1.0/`$batch" -Body $currentBody -ContentType "application/json" -OutputType PSObject -ErrorAction Stop
      }

    foreach ($batchResponse in @($response.responses)) {
      $request = $requestById[[string]$batchResponse.id]

      if (-not $request) {
        continue
      }

      if ($batchResponse.status -lt 200 -or $batchResponse.status -ge 300) {
        throw "Graph batch app role assignment query failed for service principal $($request.servicePrincipalDisplayName) ($($request.servicePrincipalId)) with status $($batchResponse.status)."
      }

      $assignments += @($batchResponse.body.value)
      $nextLinkProperty = $batchResponse.body.PSObject.Properties["@odata.nextLink"]

      if ($nextLinkProperty) {
        $pendingRequests += [pscustomobject]@{
          servicePrincipalId = $request.servicePrincipalId
          servicePrincipalDisplayName = $request.servicePrincipalDisplayName
          url = ConvertTo-GraphBatchRelativeUrl -Url $nextLinkProperty.Value
        }
      }

      $completedRequestCount += 1
    }

    Write-EntraSnapshotProgress "Loaded app role assignment pages: $completedRequestCount; initial service principal requests: $totalInitialRequestCount; pending page requests: $($pendingRequests.Count)"
  }

  return $assignments
}

$requiredGraphModules = @(
  "Microsoft.Graph.Authentication",
  "Microsoft.Graph.Applications"
)

foreach ($moduleName in $requiredGraphModules) {
  try {
    Import-Module $moduleName -ErrorAction Stop
  } catch {
    throw "Microsoft Graph PowerShell module missing: $moduleName. Install: Install-Module Microsoft.Graph -Scope CurrentUser"
  }
}

Write-EntraSnapshotProgress "Checking Microsoft Graph context"
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
  groupMembers = @()
}

$oauth2PermissionGrantIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

function Add-OAuth2PermissionGrantSnapshot {
  param(
    [Parameter(Mandatory = $true)]
    $Grant
  )

  if ([string]::IsNullOrWhiteSpace([string]$Grant.Id)) {
    return
  }

  if (-not $oauth2PermissionGrantIds.Add([string]$Grant.Id)) {
    return
  }

  $snapshot.oauth2PermissionGrants += [pscustomobject]@{
    id = $Grant.Id
    clientId = $Grant.ClientId
    consentType = $Grant.ConsentType
    principalId = $Grant.PrincipalId
    resourceId = $Grant.ResourceId
    scope = $Grant.Scope
  }
}

Write-EntraSnapshotProgress "Loading service principals from Microsoft Graph"
$servicePrincipals = Get-MgServicePrincipal `
  -All `
  -Property Id,AppId,DisplayName,ServicePrincipalType,PublisherName,AccountEnabled,AppOwnerOrganizationId,AppDisplayName,Homepage,LoginUrl,ReplyUrls,ServicePrincipalNames,Tags,AppRoles `
  -ExpandProperty $ownerExpand
$servicePrincipals = @($servicePrincipals)
Write-EntraSnapshotProgress "Loaded $($servicePrincipals.Count) service principals"

$servicePrincipalById = @{}

foreach ($sp in $servicePrincipals) {
  $servicePrincipalById[$sp.Id] = $sp
}

Write-EntraSnapshotProgress "Loading applications from Microsoft Graph"
$applications = Get-MgApplication `
  -All `
  -Property Id,AppId,DisplayName,SignInAudience,PublisherDomain,IdentifierUris,Tags,AppRoles,Api,RequiredResourceAccess,Web,Spa,PublicClient,PasswordCredentials,KeyCredentials,CreatedDateTime,DeletedDateTime,DisabledByMicrosoftStatus,Info,Notes `
  -ExpandProperty $ownerExpand
$applications = @($applications)
Write-EntraSnapshotProgress "Loaded $($applications.Count) applications"

$applicationOwnersByAppId = New-ApplicationOwnerIndex -Applications $applications

foreach ($app in $applications) {
  $applicationOwners = Get-ApplicationOwnersByAppId -AppId $app.AppId -ApplicationOwnersByAppId $applicationOwnersByAppId

  $snapshot.applications += [pscustomobject]@{
    id = $app.Id
    appId = $app.AppId
    displayName = $app.DisplayName
    signInAudience = $app.SignInAudience
    publisherDomain = $app.PublisherDomain
    identifierUris = $app.IdentifierUris
    tags = @(ConvertTo-EntraSnapshotTags -Tags $app.Tags)
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
    owners = @($applicationOwners)
  }
}

foreach ($sp in $servicePrincipals) {
  $servicePrincipalOwners = Get-ExpandedOwnerSnapshots -DirectoryObject $sp
  $applicationOwners = Get-ApplicationOwnersByAppId -AppId $sp.AppId -ApplicationOwnersByAppId $applicationOwnersByAppId

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
    tags = @(ConvertTo-EntraSnapshotTags -Tags $sp.Tags)
    servicePrincipalOwners = @($servicePrincipalOwners)
    applicationOwners = @($applicationOwners)
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

Write-EntraSnapshotProgress "Loading global OAuth2 permission grants from Microsoft Graph REST"
$oauth2PermissionGrants = @(Get-EntraOAuth2PermissionGrants)
Write-EntraSnapshotProgress "Loaded $($oauth2PermissionGrants.Count) global OAuth2 permission grants"

foreach ($grant in $oauth2PermissionGrants) {
  Add-OAuth2PermissionGrantSnapshot -Grant $grant
}

Write-EntraSnapshotProgress "Loading app role assignments from Microsoft Graph REST batch for $($servicePrincipals.Count) service principals"
$appRoleAssignments = @(Get-EntraServicePrincipalAppRoleAssignmentsBatch -ServicePrincipals $servicePrincipals)
Write-EntraSnapshotProgress "Loaded $($appRoleAssignments.Count) app role assignments"

foreach ($assignment in $appRoleAssignments) {
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

$canReadGroups = $false

try {
  Import-Module Microsoft.Graph.Groups -ErrorAction Stop
  $canReadGroups = $true
} catch {
  Write-Warning "Microsoft.Graph.Groups could not be loaded. Skipping group snapshot. $($_.Exception.Message)"
}

if ($canReadGroups) {
  Write-EntraSnapshotProgress "Loading groups from Microsoft Graph"
  $groups = Get-MgGroup `
    -All `
    -Property Id,DisplayName,Description,Mail,MailEnabled,SecurityEnabled,GroupTypes,ProxyAddresses,Visibility
  $groups = @($groups)
  Write-EntraSnapshotProgress "Loaded $($groups.Count) groups"

  for ($groupIndex = 0; $groupIndex -lt $groups.Count; $groupIndex++) {
    $group = $groups[$groupIndex]
    Write-EntraSnapshotProgress "[$($groupIndex + 1)/$($groups.Count)] Loading group members for group: $($group.DisplayName) ($($group.Id))"
    $members = Get-EntraGroupMembersIncludingServicePrincipals -GroupId $group.Id
    $members = @($members)
    Write-EntraSnapshotProgress "[$($groupIndex + 1)/$($groups.Count)] Loaded $($members.Count) group members"

    $memberEmails = @(
      $members | ForEach-Object {
        $mail = Get-DirectoryObjectSnapshotValue -DirectoryObject $_ -Name "Mail"
        $userPrincipalName = Get-DirectoryObjectSnapshotValue -DirectoryObject $_ -Name "UserPrincipalName"

        if ($mail) {
          $mail
        } elseif ($userPrincipalName) {
          $userPrincipalName
        }
      } | Where-Object { $_ } | Select-Object -Unique
    )

    foreach ($member in $members) {
      $memberSnapshot = ConvertTo-GroupMemberSnapshot -Group $group -Member $member -ServicePrincipalById $servicePrincipalById
      if ($memberSnapshot.memberId) {
        $snapshot.groupMembers += $memberSnapshot
      }
    }

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
}

$snapshot.meta.servicePrincipalCount = $snapshot.servicePrincipals.Count
$snapshot.meta.applicationCount = $snapshot.applications.Count
$snapshot.meta.oauth2PermissionGrantCount = $snapshot.oauth2PermissionGrants.Count
$snapshot.meta.appRoleAssignmentCount = $snapshot.appRoleAssignments.Count
$snapshot.meta.groupCount = $snapshot.groups.Count
$snapshot.meta.groupMemberCount = $snapshot.groupMembers.Count

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory) -and -not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$snapshot | ConvertTo-Json -Depth 20 | Out-File $OutputPath -Encoding utf8
}
