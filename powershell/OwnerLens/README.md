# OwnerLens PowerShell Module

Windows-only launcher module for a local OwnerLens application server.

## Build

```powershell
pwsh ./scripts/build-windows-runtime.ps1
pwsh ./scripts/build-powershell-module.ps1
```

## Import

```powershell
Import-Module ./artifacts/OwnerLens/OwnerLens.psd1 -Force
```

For a local development install from a bundled runtime:

```powershell
Install-OwnerLensRuntime -Force
```

## Start, Open, Stop

```powershell
Start-OwnerLens
Open-OwnerLens
Get-OwnerLensStatus
Stop-OwnerLens
```

`Start-OwnerLens` binds to `127.0.0.1`, chooses a random free port by default, writes state to
`$env:LOCALAPPDATA\OwnerLens\runtime-state.json`, and keeps the runtime token out of normal output.

Use explicit paths when needed:

```powershell
Start-OwnerLens -Port 4174 -DataPath C:\OwnerLensData
```

## Collect Entra

```powershell
Invoke-OwnerLensCollectEntra -TenantId "<tenant-id>" -DataPath C:\OwnerLensData
```

## Collect Azure

```powershell
Invoke-OwnerLensCollectAzure -SubscriptionIds "sub-id-1,sub-id-2" -ActivityDays 30 -DataPath C:\OwnerLensData
```
