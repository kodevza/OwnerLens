# OwnerLens Collector Commands

OwnerLens snapshot collectors are exposed through the npm CLI and the PowerShell module in `powershell/OwnerLens`.

The private snapshot preparation functions live under `powershell/OwnerLens/Private`:

- `Invoke-OwnerLensPrepareResourceSnapshot.ps1` creates the Azure resource snapshot used by the app. It exports subscriptions, resource groups, resources, managed identities, role assignments, and optional Azure Monitor activity logs.
- `Invoke-OwnerLensPrepareEntraSnapshot.ps1` creates the Entra snapshot used by the app. It exports service principals, application registrations, groups, and raw group membership facts so ownership and identity relationships can be resolved.

Run collector commands from the repository root so default output paths write into `.\data`.

## Prerequisites

- PowerShell 7 (`pwsh`) and Pester 5.7 or newer for PowerShell tests.
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

```bash
npm run collect:azure
```

By default this writes `.\data\snapshot.json`, using the current Azure subscription and the last 90 days of activity logs.

Common resource snapshot options:

```bash
npm run collect:azure -- -SubscriptionIds "sub-id-1,sub-id-2"
npm run collect:azure -- -OutputPath ".\data\snapshot-prod.json"
npm run collect:azure -- -ActivityDays 30 -MaxActivityRecords 5000
npm run collect:azure -- -SkipAuditLogsExport
npm run collect:azure -- -ExpandResourceProperties
```

Resource property expansion is disabled by default because OwnerLens reads the standard resource fields plus identity data from the resource list response. Use `-ExpandResourceProperties` only when debugging or when you need Azure's additional expanded metadata in a raw snapshot.

Create the Entra snapshot:

```bash
npm run collect:entra
```

By default this writes `.\data\entra-snapshot.json`.

Common Entra snapshot options:

```bash
npm run collect:entra -- -TenantId "<tenant-id>"
npm run collect:entra -- -OutputPath ".\data\entra-snapshot-prod.json"
```

After publishing the package, the equivalent `npx` commands are:

```bash
npx ownerlens collect:azure -SubscriptionIds "sub-id-1,sub-id-2"
npx ownerlens collect:entra -TenantId "<tenant-id>"
```

The same collectors are also available from the PowerShell module:

```powershell
Import-Module .\powershell\OwnerLens\OwnerLens.psd1 -Force
Invoke-OwnerLensCollectAzure -SubscriptionIds "sub-id-1,sub-id-2"
Invoke-OwnerLensCollectEntra -TenantId "<tenant-id>"
```

## Notes

- Snapshot files can contain tenant, subscription, resource, identity, application registration, group, group membership, credential metadata, and activity-log metadata. Review them before sharing.
- The Entra collector records group membership facts only. It does not evaluate those memberships as permissions; OwnerLens resolves Azure RBAC roles inherited through groups during local runtime enrichment.
- The app discovers files in `.\data` whose names end with `snapshot.json`, such as `snapshot.json`, `entra-snapshot.json`, or `snapshot-prod.json`.
- If scripts fail with a missing connection error, run the relevant sign-in command again and retry.
