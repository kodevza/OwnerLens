<#
.SYNOPSIS
Creates an OwnerLens Azure resource snapshot file.

.DESCRIPTION
Exports subscriptions, resource groups, resources, identities, role assignments, and optional Azure Monitor activity logs into the local JSON snapshot consumed by OwnerLens.
#>

function Invoke-OwnerLensPrepareResourceSnapshot {
  [CmdletBinding()]
  param(
  [string]$OutputPath = ".\data\snapshot.json",
  [int]$ActivityDays = 90,
  [int]$MaxActivityRecords = 10000,
  [switch]$SkipAuditLogsExport,
  [string]$SubscriptionIds = "",
  [switch]$ExpandResourceProperties
  )

if (-not (Get-Command Get-AzContext -ErrorAction SilentlyContinue)) {
  throw "Az PowerShell module missing. Install: Install-Module Az -Scope CurrentUser"
}

if (-not (Get-Command Invoke-AzRestMethod -ErrorAction SilentlyContinue)) {
  throw "Invoke-AzRestMethod missing. Update Az.Accounts: Update-Module Az.Accounts"
}

function Write-SnapshotProgress {
  param([string]$Message)

  $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "[$timestamp] $Message"
}

function Get-ScopeParts {
  param([string]$Scope)

  $parts = [ordered]@{
    scopeType = "Unknown"
    scopeSubscriptionId = $null
    scopeResourceGroup = $null
    scopeResourceProvider = $null
    scopeResourceType = $null
    scopeResourceName = $null
    scopeManagementGroup = $null
  }

  if ([string]::IsNullOrWhiteSpace($Scope)) {
    return [pscustomobject]$parts
  }

  if ($Scope -match "^/providers/Microsoft\.Management/managementGroups/([^/]+)$") {
    $parts.scopeType = "ManagementGroup"
    $parts.scopeManagementGroup = $Matches[1]
    return [pscustomobject]$parts
  }

  if ($Scope -match "^/subscriptions/([^/]+)$") {
    $parts.scopeType = "Subscription"
    $parts.scopeSubscriptionId = $Matches[1]
    return [pscustomobject]$parts
  }

  if ($Scope -match "^/subscriptions/([^/]+)/resourceGroups/([^/]+)$") {
    $parts.scopeType = "ResourceGroup"
    $parts.scopeSubscriptionId = $Matches[1]
    $parts.scopeResourceGroup = $Matches[2]
    return [pscustomobject]$parts
  }

  if ($Scope -match "^/subscriptions/([^/]+)/resourceGroups/([^/]+)/providers/(.+)$") {
    $parts.scopeType = "Resource"
    $parts.scopeSubscriptionId = $Matches[1]
    $parts.scopeResourceGroup = $Matches[2]

    $providerPathSegments = $Matches[3].Split("/")
    if ($providerPathSegments.Count -gt 0) {
      $parts.scopeResourceProvider = $providerPathSegments[0]
    }

    $typeParts = @()
    $nameParts = @()

    for ($i = 1; $i -lt $providerPathSegments.Count; $i += 2) {
      $typeParts += $providerPathSegments[$i]
      if (($i + 1) -lt $providerPathSegments.Count) {
        $nameParts += $providerPathSegments[$i + 1]
      }
    }

    if ($typeParts.Count -gt 0 -and $parts.scopeResourceProvider) {
      $parts.scopeResourceType = ($parts.scopeResourceProvider + "/" + ($typeParts -join "/"))
    }
    if ($nameParts.Count -gt 0) {
      $parts.scopeResourceName = ($nameParts -join "/")
    }

    return [pscustomobject]$parts
  }

  return [pscustomobject]$parts
}

Write-SnapshotProgress "Checking Azure context"
$context = Get-AzContext

if (-not $context) {
  throw "Not connected. Run: Connect-AzAccount"
}

$activityStartTime = (Get-Date).AddDays(-$ActivityDays)
$subscriptionFilters = @()

if ([string]::IsNullOrWhiteSpace($SubscriptionIds)) {
  $subscriptionFilters = @($context.Subscription.Id)
} else {
  $subscriptionFilters = @($SubscriptionIds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

Write-SnapshotProgress "Preparing Azure resource snapshot"
Write-SnapshotProgress "Output path: $OutputPath"
Write-SnapshotProgress "Activity window: last $ActivityDays days starting $($activityStartTime.ToUniversalTime().ToString("o"))"
Write-SnapshotProgress "Requested subscriptions: $($subscriptionFilters -join ', ')"
if ($SkipAuditLogsExport) {
  Write-SnapshotProgress "Activity log export: skipped"
} else {
  Write-SnapshotProgress "Activity log export: enabled, max $MaxActivityRecords records per subscription"
}
if ($ExpandResourceProperties) {
  Write-SnapshotProgress "Resource property expansion: enabled"
} else {
  Write-SnapshotProgress "Resource property expansion: disabled"
}

$snapshot = [ordered]@{
  meta = [ordered]@{
    provider = "azure"
    snapshotVersion = "0.4"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    activityDays = $ActivityDays
    activityStartTime = $activityStartTime.ToUniversalTime().ToString("o")
    maxActivityRecords = $MaxActivityRecords
    skipAuditLogsExport = [bool]$SkipAuditLogsExport
    requestedSubscriptions = $subscriptionFilters
  }
  subscriptions = [System.Collections.Generic.List[object]]::new()
  resourceGroups = [System.Collections.Generic.List[object]]::new()
  resources = [System.Collections.Generic.List[object]]::new()
  userAssignedManagedIdentities = [System.Collections.Generic.List[object]]::new()
  roleAssignments = [System.Collections.Generic.List[object]]::new()
  activityLogs = [System.Collections.Generic.List[object]]::new()
}

Write-SnapshotProgress "Loading enabled subscriptions"
$enabledSubscriptions = Get-AzSubscription | Where-Object State -eq "Enabled"
$subs = @()

if (-not (Get-Command Get-AzUserAssignedIdentity -ErrorAction SilentlyContinue)) {
  throw "Az.ManagedServiceIdentity PowerShell module missing. Install: Install-Module Az.ManagedServiceIdentity -Scope CurrentUser"
}

foreach ($filter in $subscriptionFilters) {
  Write-SnapshotProgress "Resolving subscription filter: $filter"
  $sub = $enabledSubscriptions | Where-Object { $_.Id -eq $filter -or $_.Name -eq $filter } | Select-Object -First 1

  if (-not $sub) {
    throw "Subscription not found or not enabled: $filter"
  }

  if (-not ($subs | Where-Object Id -eq $sub.Id)) {
    $subs += $sub
    Write-SnapshotProgress "Selected subscription: $($sub.Name) ($($sub.Id))"
  }
}

$subscriptionIndex = 0
foreach ($sub in $subs) {
  $subscriptionIndex += 1
  Write-SnapshotProgress "[$subscriptionIndex/$($subs.Count)] Starting subscription: $($sub.Name) ($($sub.Id))"

  Write-SnapshotProgress "[$($sub.Name)] Setting Azure context"
  Set-AzContext -SubscriptionId $sub.Id | Out-Null

  $snapshot.subscriptions.Add([pscustomobject]@{
    subscriptionId = $sub.Id
    subscriptionName = $sub.Name
    tenantId = $sub.TenantId
    state = $sub.State
    tags = $null
  }) | Out-Null

  Write-SnapshotProgress "[$($sub.Name)] Loading resource groups"
  $rgs = Get-AzResourceGroup
  Write-SnapshotProgress "[$($sub.Name)] Loaded $($rgs.Count) resource groups"

  if ($ExpandResourceProperties) {
    Write-SnapshotProgress "[$($sub.Name)] Loading resources with expanded properties"
    $resources = Get-AzResource -ExpandProperties
  } else {
    Write-SnapshotProgress "[$($sub.Name)] Loading resources"
    $resources = Get-AzResource
  }
  Write-SnapshotProgress "[$($sub.Name)] Loaded $($resources.Count) resources"

  Write-SnapshotProgress "[$($sub.Name)] Loading user-assigned managed identities"
  $userAssignedIdentities = Get-AzUserAssignedIdentity
  Write-SnapshotProgress "[$($sub.Name)] Loaded $($userAssignedIdentities.Count) user-assigned managed identities"

  Write-SnapshotProgress "[$($sub.Name)] Loading role assignments"
  $roleAssignments = Get-AzRoleAssignment
  Write-SnapshotProgress "[$($sub.Name)] Loaded $($roleAssignments.Count) role assignments"

  $activityLogs = @()
  if (-not $SkipAuditLogsExport) {
    Write-SnapshotProgress "[$($sub.Name)] Loading Azure Monitor activity logs"
    $activityLogs = Get-AzureMonitorActivityLogs -SubscriptionId $sub.Id -StartTime $activityStartTime -MaxRecord $MaxActivityRecords
    Write-SnapshotProgress "[$($sub.Name)] Loaded $($activityLogs.Count) activity log records"
  }

  Write-SnapshotProgress "[$($sub.Name)] Adding resources to snapshot"
  foreach ($resource in $resources) {
    $identity = $resource.Identity

    $userAssignedIdentityResourceIds = @()
    if ($identity -and $identity.UserAssignedIdentities) {
      $userAssignedIdentityResourceIds = @($identity.UserAssignedIdentities.PSObject.Properties.Name)
    }

    $snapshot.resources.Add([pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      resourceId = $resource.ResourceId
      resourceName = $resource.Name
      resourceGroup = $resource.ResourceGroupName
      resourceType = $resource.ResourceType
      kind = $resource.Kind
      location = $resource.Location
      tags = $resource.Tags
      identityType = $identity.Type
      identityPrincipalId = $identity.PrincipalId
      identityTenantId = $identity.TenantId
      userAssignedIdentityResourceIds = $userAssignedIdentityResourceIds
      userAssignedIdentities = $identity.UserAssignedIdentities
    }) | Out-Null
  }

  Write-SnapshotProgress "[$($sub.Name)] Adding role assignments to snapshot"
  foreach ($assignment in $roleAssignments) {
    $scopeParts = Get-ScopeParts $assignment.Scope
    $principalId = [string]$assignment.ObjectId

    $snapshot.roleAssignments.Add([pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      roleAssignmentId = $assignment.RoleAssignmentId
      scope = $assignment.Scope
      scopeType = $scopeParts.scopeType
      scopeSubscriptionId = $scopeParts.scopeSubscriptionId
      scopeResourceGroup = $scopeParts.scopeResourceGroup
      scopeResourceProvider = $scopeParts.scopeResourceProvider
      scopeResourceType = $scopeParts.scopeResourceType
      scopeResourceName = $scopeParts.scopeResourceName
      scopeManagementGroup = $scopeParts.scopeManagementGroup
      principalId = $principalId
      principalType = $assignment.ObjectType
      principalDisplayName = $assignment.DisplayName
      signInName = $assignment.SignInName
      roleDefinitionId = $assignment.RoleDefinitionId
      roleDefinitionName = $assignment.RoleDefinitionName
      canDelegate = $assignment.CanDelegate
      condition = $assignment.Condition
      conditionVersion = $assignment.ConditionVersion
    }
    ) | Out-Null
  }

  Write-SnapshotProgress "[$($sub.Name)] Adding user-assigned managed identities to snapshot"
  foreach ($identity in $userAssignedIdentities) {
    $snapshot.userAssignedManagedIdentities.Add([pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      resourceId = $identity.Id
      name = $identity.Name
      resourceGroup = $identity.ResourceGroupName
      location = $identity.Location
      clientId = $identity.ClientId
      principalId = $identity.PrincipalId
      tenantId = $identity.TenantId
      tags = $identity.Tags
    }) | Out-Null
  }

  Write-SnapshotProgress "[$($sub.Name)] Adding resource groups to snapshot"
  foreach ($rg in $rgs) {

    $snapshot.resourceGroups.Add([pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      resourceGroup = $rg.ResourceGroupName
      location = $rg.Location
      tags = $rg.Tags
    }) | Out-Null
  }

  Write-SnapshotProgress "[$($sub.Name)] Adding activity logs to snapshot"
  foreach ($log in $activityLogs) {
    $snapshot.activityLogs.Add([pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      eventTimestamp = $log.EventTimestamp
      submissionTimestamp = $log.SubmissionTimestamp
      caller = $log.Caller
      callerUserPrincipalName = $log.CallerUserPrincipalName
      callerName = $log.CallerName
      callerEmail = $log.CallerEmail
      callerObjectId = $log.CallerObjectId
      callerIdentityType = $log.CallerIdentityType
      callerAppId = $log.CallerAppId
      callerIpAddress = $log.CallerIpAddress
      callerTenantId = $log.CallerTenantId
      operationName = $log.OperationName
      operationNameValue = $log.OperationNameValue
      status = $log.Status
      subStatus = $log.SubStatus
      category = $log.Category
      resourceGroupName = $log.ResourceGroupName
      resourceId = $log.ResourceId
      resourceProviderName = $log.ResourceProviderName
      resourceType = $log.ResourceType
      authorizationAction = $log.authorizationAction
      authorizationScope = $log.authorizationScope
    }) | Out-Null
  }

  Write-SnapshotProgress "[$subscriptionIndex/$($subs.Count)] Finished subscription: $($sub.Name)"
}

Write-SnapshotProgress "Finalizing snapshot metadata"
$snapshot.meta.subscriptionCount = $snapshot.subscriptions.Count
$snapshot.meta.resourceGroupCount = $snapshot.resourceGroups.Count
$snapshot.meta.resourceCount = $snapshot.resources.Count
$snapshot.meta.userAssignedManagedIdentityCount = $snapshot.userAssignedManagedIdentities.Count
$snapshot.meta.roleAssignmentCount = $snapshot.roleAssignments.Count
$snapshot.meta.activityLogCount = $snapshot.activityLogs.Count

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory) -and -not (Test-Path $outputDirectory)) {
  Write-SnapshotProgress "Creating output directory: $outputDirectory"
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

Write-SnapshotProgress "Writing snapshot JSON to $OutputPath"
$snapshot | ConvertTo-Json -Depth 20 | Out-File $OutputPath -Encoding utf8
Write-SnapshotProgress "Snapshot complete: $($snapshot.meta.subscriptionCount) subscriptions, $($snapshot.meta.resourceGroupCount) resource groups, $($snapshot.meta.resourceCount) resources, $($snapshot.meta.userAssignedManagedIdentityCount) user-assigned managed identities, $($snapshot.meta.roleAssignmentCount) role assignments, $($snapshot.meta.activityLogCount) activity logs"
}
