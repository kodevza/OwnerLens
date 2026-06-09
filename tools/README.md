# OwnerLens Tools

PowerShell scripts in this directory create the JSON snapshot files consumed by the OwnerLens app.

## Core Files

- `prepare-resource-snapshot.ps1` creates the Azure resource snapshot used by the app. It exports subscriptions, resource groups, resources, managed identities, role assignments, and optional Azure Monitor activity logs.
- `prepare-entra-snapshot.ps1` creates the Entra snapshot used by the app. It exports service principals, application registrations, and groups so ownership and identity relationships can be resolved.

Run these commands from the repository root so the default output paths write into `.\data`.

## Prerequisites

- PowerShell 7 or Windows PowerShell
- Azure PowerShell modules:

```powershell
Install-Module Az -Scope CurrentUser
Install-Module Az.ManagedServiceIdentity -Scope CurrentUser
Install-Module Microsoft.Graph -Scope CurrentUser
```

If `Invoke-AzRestMethod` is missing, update `Az.Accounts`:

```powershell
Update-Module Az.Accounts
```

## Sign In

Sign in to Azure before creating the resource snapshot:

```powershell
Connect-AzAccount
```

Sign in to Microsoft Graph before creating the Entra snapshot:

```powershell
Connect-MgGraph -TenantId "<tenant-id>" -Scopes "Application.Read.All","Group.Read.All","Directory.Read.All"
```

## Create Snapshots

Create the Azure resource snapshot:

```powershell
.\tools\prepare-resource-snapshot.ps1
```

By default this writes `.\data\snapshot.json`, using the current Azure subscription and the last 90 days of activity logs.

Common resource snapshot options:

```powershell
.\tools\prepare-resource-snapshot.ps1 -SubscriptionIds "sub-id-1,sub-id-2"
.\tools\prepare-resource-snapshot.ps1 -OutputPath ".\data\snapshot-prod.json"
.\tools\prepare-resource-snapshot.ps1 -ActivityDays 30 -MaxActivityRecords 5000
.\tools\prepare-resource-snapshot.ps1 -SkipAuditLogsExport
.\tools\prepare-resource-snapshot.ps1 -ExpandResourceProperties
```

Resource property expansion is disabled by default because OwnerLens reads the standard resource fields plus identity data from the resource list response. Use `-ExpandResourceProperties` only when debugging or when you need Azure's additional expanded metadata in a raw snapshot.

Create the Entra snapshot:

```powershell
.\tools\prepare-entra-snapshot.ps1
```

By default this writes `.\data\entra-snapshot.json`.

Common Entra snapshot option:

```powershell
.\tools\prepare-entra-snapshot.ps1 -OutputPath ".\data\entra-snapshot-prod.json"
```

After both files exist, start the app with `npm run dev` and refresh the browser.

## Scripts

- `prepare-resource-snapshot.ps1` exports Azure subscriptions, resource groups, resources, user-assigned managed identities, role assignments, and optional Azure Monitor activity logs.
- `prepare-entra-snapshot.ps1` exports Entra service principals, application registrations, and groups.
- `azure-activity-check.ps1` is a helper loaded by `prepare-resource-snapshot.ps1`; it is not usually run directly.

## Notes

- Snapshot files can contain tenant, subscription, resource, identity, application registration, group, credential metadata, and activity-log metadata. Review them before sharing.
- The app discovers files in `.\data` whose names end with `snapshot.json`, such as `snapshot.json`, `entra-snapshot.json`, or `snapshot-prod.json`.
- If scripts fail with a missing connection error, run the relevant sign-in command again and retry.
