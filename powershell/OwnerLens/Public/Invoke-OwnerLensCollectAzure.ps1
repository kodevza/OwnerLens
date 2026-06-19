<#
.SYNOPSIS
Collects an Azure resource snapshot for OwnerLens.

.DESCRIPTION
Ensures Azure PowerShell authentication is available, resolves the output path, and writes the local OwnerLens resource snapshot with resources, identities, role assignments, and optional activity logs.
#>

param(
  [Alias("OutputDir")]
  [ValidateNotNullOrEmpty()]
  [string]$DataPath = (Join-Path (Get-Location) "data"),

  [string]$OutputPath = "",

  [ValidateRange(1, 3650)]
  [int]$ActivityDays = 90,

  [ValidateRange(1, 1000000)]
  [int]$MaxActivityRecords = 10000,

  [string]$SubscriptionIds = "",

  [switch]$SkipAuditLogsExport,

  [switch]$ExpandResourceProperties,

  [switch]$SkipLogin,

  [string]$RuntimePath = ""
)

$ownerLensCollectAzureModuleRoot = Split-Path $PSScriptRoot -Parent
$ownerLensCollectAzurePrivatePath = Join-Path $ownerLensCollectAzureModuleRoot "Private"
if (Test-Path -LiteralPath $ownerLensCollectAzurePrivatePath) {
  Get-ChildItem -Path $ownerLensCollectAzurePrivatePath -Filter "*.ps1" -File | ForEach-Object {
    . $_.FullName
  }
}

function Invoke-OwnerLensCollectAzure {
  [CmdletBinding()]
  param(
    [Alias("OutputDir")]
    [ValidateNotNullOrEmpty()]
    [string]$DataPath = (Join-Path (Get-Location) "data"),

    [string]$OutputPath = "",

    [ValidateRange(1, 3650)]
    [int]$ActivityDays = 90,

    [ValidateRange(1, 1000000)]
    [int]$MaxActivityRecords = 10000,

    [string]$SubscriptionIds = "",

    [switch]$SkipAuditLogsExport,

    [switch]$ExpandResourceProperties,

    [switch]$SkipLogin,

    [string]$RuntimePath = ""
  )

  $ErrorActionPreference = "Stop"

  function Write-CollectProgress {
    param([string]$Message)

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "[$timestamp] $Message"
  }

  $resolvedDataPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DataPath)
  New-Item -ItemType Directory -Path $resolvedDataPath -Force | Out-Null

  $resolvedOutputPath = $OutputPath
  if ([string]::IsNullOrWhiteSpace($resolvedOutputPath)) {
    $resolvedOutputPath = Join-Path $resolvedDataPath "snapshot.json"
  }

  if (-not (Get-Command Get-AzContext -ErrorAction SilentlyContinue)) {
    throw "Az PowerShell module missing. Install: Install-Module Az -Scope CurrentUser"
  }

  $context = Get-AzContext
  if (-not $SkipLogin -and -not $context) {
    Write-CollectProgress "Azure context not found. Starting Connect-AzAccount."
    Connect-AzAccount | Out-Null
  }

  Write-CollectProgress "Collecting Azure resource snapshot"
  Write-CollectProgress "Output path: $resolvedOutputPath"

  Import-OwnerLensCollectAzurePrivateFunctions

  $params = @{
    OutputPath = $resolvedOutputPath
    ActivityDays = $ActivityDays
    MaxActivityRecords = $MaxActivityRecords
    SubscriptionIds = $SubscriptionIds
  }
  if ($SkipAuditLogsExport) { $params.SkipAuditLogsExport = $true }
  if ($ExpandResourceProperties) { $params.ExpandResourceProperties = $true }

  Invoke-OwnerLensPrepareResourceSnapshot @params
}

function Import-OwnerLensCollectAzurePrivateFunctions {
  [CmdletBinding()]
  param()

  if (Get-Command Invoke-OwnerLensPrepareResourceSnapshot -ErrorAction SilentlyContinue) {
    return
  }

  $moduleRoot = Split-Path $PSScriptRoot -Parent
  $privatePath = Join-Path $moduleRoot "Private"
  if (-not (Test-Path -LiteralPath $privatePath)) {
    throw "OwnerLens private module path was not found. Import the OwnerLens module or run from an OwnerLens package layout."
  }

  Get-ChildItem -Path $privatePath -Filter "*.ps1" -File | ForEach-Object {
    . $_.FullName
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  Invoke-OwnerLensCollectAzure @PSBoundParameters
}
