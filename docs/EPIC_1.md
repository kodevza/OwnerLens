## Epic 1: Azure Snapshot Export

### Goal

Create a **simple, admin-reviewable Azure snapshot** that can be generated without installing the product.

The snapshot is later used offline for owner analysis. No scoring, no database, no UI. Because apparently restraint is still legal.

---

## Business Value

Customer can quickly export ownership-relevant Azure data and share/review it safely.

This proves the first product promise:

> “We can collect enough Azure evidence to infer who may own a resource group or resource.”

---

## Scope

### Included

* Check Az PowerShell module exists
* Check user is connected to Azure
* Use the current default subscription, unless a comma-separated subscription list is provided
* Validate selected subscriptions are enabled
* For each selected subscription:

  * list resource groups
  * capture RG tags
  * collect last 90 days of RG Activity Logs
* Export one JSON snapshot file

### Not Included

* owner inference
* resources inventory
* RBAC
* Graph / Entra lookup
* CLI product wrapper
* database
* HTML report

---

## Story 1.1: Create Minimal PowerShell Snapshot Script

### Title

Create `Export-AzureOwnershipSnapshot.ps1`

### Description

Create a minimal PowerShell script that exports subscription, resource group, and activity log data into a JSON snapshot.

### Acceptance Criteria

* Script can be reviewed in under 2 minutes
* Uses only read operations
* Produces valid JSON
* Fails clearly if user is not connected to Azure
* Does not perform owner analysis

---

## Story 1.2: Check Azure PowerShell Availability

### Acceptance Criteria

Script checks:

```powershell
Get-Command Get-AzContext
```

If missing, it exits with:

```txt
Az PowerShell module missing. Install: Install-Module Az -Scope CurrentUser
```

---

## Story 1.3: Check Azure Login Context

### Acceptance Criteria

Script checks:

```powershell
Get-AzContext
```

If missing, it exits with:

```txt
Not connected. Run: Connect-AzAccount
```

---

## Story 1.4: Select Enabled Subscriptions

### Source Equivalent

```powershell
$context = Get-AzContext
$enabledSubscriptions = Get-AzSubscription | Where-Object State -eq "Enabled"
```

By default, export only `$context.Subscription.Id`.

If `-SubscriptionIds` is provided, split it by comma and export only those subscriptions.

Example:

```powershell
npm run collect:azure -- -SubscriptionIds "sub-id-1,sub-id-2"
```

Subscription names are also accepted for admin convenience.

If a requested subscription is not visible or not enabled, the script exits with:

```txt
Subscription not found or not enabled: <value>
```

### Output Fields

* subscriptionId
* subscriptionName
* tenantId
* state

---

## Story 1.5: Collect Resource Groups Per Subscription

### Source Equivalent

```powershell
Set-AzContext -SubscriptionId <id>
Get-AzResourceGroup
```

### Output Fields

* subscriptionId
* resourceGroup
* location
* tags

---

## Story 1.6: Collect 90-Day RG Activity Logs

### Source Equivalent

```powershell
Get-AzActivityLog `
  -ResourceGroupName <rg> `
  -StartTime (Get-Date).AddDays(-90)
```

### Output Fields

* eventTimestamp
* caller
* operationName
* resourceId
* resourceGroupName
* category
* status
* authorizationAction
* authorizationScope
* resourceProviderName

Filtering comes later. Collector stays dumb.

---

## Story 1.7: Export Snapshot JSON

### Default Output

```txt
snapshot.json
```

### Export Rules

* Export one JSON object, not one object per resource group
* Keep top-level arrays flat so offline analysis can join by `subscriptionId`, `resourceGroupName`, and `resourceId`
* Include enough metadata to audit when and how the snapshot was created
* Do not export raw Az PowerShell SDK objects
* Do not export full activity-log `authorization`, `claims`, or `properties` objects initially
* Export only explicit fields needed for ownership analysis and admin review
* Keep the collector read-only and dumb; filtering and scoring happen later

### Shape

```json
{
  "meta": {
    "provider": "azure",
    "snapshotVersion": "0.1",
    "createdAt": "...",
    "activityDays": 90,
    "activityStartTime": "...",
    "requestedSubscriptions": [],
    "subscriptionCount": 0,
    "resourceGroupCount": 0,
    "activityLogCount": 0
  },
  "subscriptions": [
    {
      "subscriptionId": "...",
      "subscriptionName": "...",
      "tenantId": "...",
      "state": "Enabled"
    }
  ],
  "resourceGroups": [
    {
      "subscriptionId": "...",
      "subscriptionName": "...",
      "resourceGroup": "...",
      "location": "...",
      "tags": {}
    }
  ],
  "activityLogs": [
    {
      "subscriptionId": "...",
      "subscriptionName": "...",
      "eventTimestamp": "...",
      "submissionTimestamp": "...",
      "caller": "...",
      "operationName": "...",
      "operationNameValue": "...",
      "status": "...",
      "subStatus": "...",
      "category": "...",
      "resourceGroupName": "...",
      "resourceId": "...",
      "resourceProviderName": "...",
      "resourceType": "...",
      "authorizationAction": "...",
      "authorizationScope": "..."
    }
  ]
}
```

### Field Notes

* `createdAt` is UTC ISO 8601
* `activityStartTime` is UTC ISO 8601
* `tags` are copied from the resource group because owner hints are often stored there
* `authorizationAction` and `authorizationScope` replace the raw `authorization` object to avoid duplicate-key JSON serialization issues
* `claims` and `properties` are excluded until a specific ownership use case requires them

---

## Initial Script Target

```powershell
param(
  [string]$OutputPath = ".\snapshot.json",
  [int]$ActivityDays = 90,
  [string]$SubscriptionIds = ""
)

if (-not (Get-Command Get-AzContext -ErrorAction SilentlyContinue)) {
  throw "Az PowerShell module missing. Install: Install-Module Az -Scope CurrentUser"
}

$context = Get-AzContext

if (-not $context) {
  throw "Not connected. Run: Connect-AzAccount"
}

$activityStartTime = (Get-Date).AddDays(-$ActivityDays)
$subscriptionFilters = @()

if ([string]::IsNullOrWhiteSpace($SubscriptionIds)) {
  $subscriptionFilters = @($context.Subscription.Id)
} else {
  $subscriptionFilters = $SubscriptionIds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}

$snapshot = [ordered]@{
  meta = [ordered]@{
    provider = "azure"
    snapshotVersion = "0.1"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    activityDays = $ActivityDays
    activityStartTime = $activityStartTime.ToUniversalTime().ToString("o")
    requestedSubscriptions = $subscriptionFilters
  }
  subscriptions = @()
  resourceGroups = @()
  activityLogs = @()
}

$enabledSubscriptions = Get-AzSubscription | Where-Object State -eq "Enabled"
$subs = @()

foreach ($filter in $subscriptionFilters) {
  $sub = $enabledSubscriptions | Where-Object { $_.Id -eq $filter -or $_.Name -eq $filter } | Select-Object -First 1

  if (-not $sub) {
    throw "Subscription not found or not enabled: $filter"
  }

  if (-not ($subs | Where-Object Id -eq $sub.Id)) {
    $subs += $sub
  }
}

foreach ($sub in $subs) {

  Set-AzContext -SubscriptionId $sub.Id | Out-Null

  $snapshot.subscriptions += [pscustomobject]@{
    subscriptionId = $sub.Id
    subscriptionName = $sub.Name
    tenantId = $sub.TenantId
    state = $sub.State
  }

  $rgs = Get-AzResourceGroup

  foreach ($rg in $rgs) {

    $snapshot.resourceGroups += [pscustomobject]@{
      subscriptionId = $sub.Id
      subscriptionName = $sub.Name
      resourceGroup = $rg.ResourceGroupName
      location = $rg.Location
      tags = $rg.Tags
    }

    $logs = Get-AzActivityLog `
      -ResourceGroupName $rg.ResourceGroupName `
      -StartTime $activityStartTime

    foreach ($log in $logs) {
      $snapshot.activityLogs += [pscustomobject]@{
        subscriptionId = $sub.Id
        subscriptionName = $sub.Name
        eventTimestamp = $log.EventTimestamp
        submissionTimestamp = $log.SubmissionTimestamp
        caller = $log.Caller
        operationName = $log.OperationName
        operationNameValue = $log.OperationNameValue
        status = $log.Status
        subStatus = $log.SubStatus
        category = $log.Category
        resourceGroupName = $log.ResourceGroupName
        resourceId = $log.ResourceId
        resourceProviderName = $log.ResourceProviderName
        resourceType = $log.ResourceType
        authorizationAction = $log.Authorization.Action
        authorizationScope = $log.Authorization.Scope
      }
    }
  }
}

$snapshot.meta.subscriptionCount = $snapshot.subscriptions.Count
$snapshot.meta.resourceGroupCount = $snapshot.resourceGroups.Count
$snapshot.meta.activityLogCount = $snapshot.activityLogs.Count

$snapshot | ConvertTo-Json -Depth 10 | Out-File $OutputPath -Encoding utf8
```

---

## Definition of Done

* Admin can read the script quickly
* Script exports snapshot from real Azure tenant
* JSON can be processed offline
* No hidden writes
* No dependency on your future product code
* Epic 2 can consume this file for owner analysis
