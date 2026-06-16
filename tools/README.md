# OwnerLens Tools

PowerShell scripts in this directory create the JSON snapshot files consumed by the OwnerLens app.

## Core Files

- `prepare-resource-snapshot.ps1` creates the Azure resource snapshot used by the app. It exports subscriptions, resource groups, resources, managed identities, role assignments, and optional Azure Monitor activity logs.
- `prepare-entra-snapshot.ps1` creates the Entra snapshot used by the app. It exports service principals, application registrations, groups, and raw group membership facts so ownership and identity relationships can be resolved.

Run these commands from the repository root so the default output paths write into `.\data`.

## Prerequisites

- PowerShell 7 or Windows PowerShell
- PowerShell 7 (`pwsh`) and Pester 5.7 or newer for PowerShell tests. `npm run test:pester` installs Pester for the current user if it is missing.
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
.\tools\collect-azure.ps1
```

By default this writes `.\data\snapshot.json`, using the current Azure subscription and the last 90 days of activity logs.

Common resource snapshot options:

```powershell
.\tools\collect-azure.ps1 -SubscriptionIds "sub-id-1,sub-id-2"
.\tools\collect-azure.ps1 -OutputPath ".\data\snapshot-prod.json"
.\tools\collect-azure.ps1 -ActivityDays 30 -MaxActivityRecords 5000
.\tools\collect-azure.ps1 -SkipAuditLogsExport
.\tools\collect-azure.ps1 -ExpandResourceProperties
```

Resource property expansion is disabled by default because OwnerLens reads the standard resource fields plus identity data from the resource list response. Use `-ExpandResourceProperties` only when debugging or when you need Azure's additional expanded metadata in a raw snapshot.

Create the Entra snapshot:

```powershell
.\tools\collect-entra.ps1
```

By default this writes `.\data\entra-snapshot.json`.

Common Entra snapshot option:

```powershell
.\tools\collect-entra.ps1 -TenantId "<tenant-id>"
.\tools\collect-entra.ps1 -OutputPath ".\data\entra-snapshot-prod.json"
```

After both files exist, start the app with `npm run dev` and refresh the browser.

The same collectors are available through npm scripts:

```bash
npm run collect:azure -- -SubscriptionIds "sub-id-1,sub-id-2"
npm run collect:entra -- -TenantId "<tenant-id>"
```

After publishing the package, the equivalent `npx` commands are:

```bash
npx ownerlens collect:azure -SubscriptionIds "sub-id-1,sub-id-2"
npx ownerlens collect:entra -TenantId "<tenant-id>"
```

## Scripts

- `collect-azure.ps1` signs in when needed, then calls `prepare-resource-snapshot.ps1`.
- `collect-entra.ps1` signs in when needed, then calls `prepare-entra-snapshot.ps1`.
- `prepare-resource-snapshot.ps1` exports Azure subscriptions, resource groups, resources, user-assigned managed identities, role assignments, and optional Azure Monitor activity logs.
- `prepare-entra-snapshot.ps1` exports Entra service principals, application registrations, owner relationships, groups, and group memberships. Service principal owner evidence keeps Graph service principal owners and matching application registration owners separate, with a combined owner list for compatibility. Group memberships are collected as object IDs and member object types; Azure RBAC access inherited through a group is resolved later by the local runtime, not by the collector.
- `azure-activity-check.ps1` is a helper loaded by `prepare-resource-snapshot.ps1`; it is not usually run directly.

## Notes

- Snapshot files can contain tenant, subscription, resource, identity, application registration, group, group membership, credential metadata, and activity-log metadata. Review them before sharing.
- The Entra collector records group membership facts only. It does not evaluate those memberships as permissions; OwnerLens resolves Azure RBAC roles inherited through groups during local runtime enrichment.
- The app discovers files in `.\data` whose names end with `snapshot.json`, such as `snapshot.json`, `entra-snapshot.json`, or `snapshot-prod.json`.
- If scripts fail with a missing connection error, run the relevant sign-in command again and retry.
