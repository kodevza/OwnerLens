param(
  [string]$OutputDir = ".\data",
  [string]$OutputPath = "",
  [int]$ActivityDays = 90,
  [int]$MaxActivityRecords = 10000,
  [switch]$SkipAuditLogsExport,
  [string]$SubscriptionIds = "",
  [switch]$ExpandResourceProperties,
  [switch]$SkipLogin
)

$ErrorActionPreference = "Stop"

function Write-CollectProgress {
  param([string]$Message)

  $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "[$timestamp] $Message"
}

$resolvedOutputPath = $OutputPath
if ([string]::IsNullOrWhiteSpace($resolvedOutputPath)) {
  $resolvedOutputPath = Join-Path $OutputDir "snapshot.json"
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

$prepareParams = @{
  OutputPath = $resolvedOutputPath
  ActivityDays = $ActivityDays
  MaxActivityRecords = $MaxActivityRecords
  SubscriptionIds = $SubscriptionIds
}

if ($SkipAuditLogsExport) {
  $prepareParams.SkipAuditLogsExport = $true
}

if ($ExpandResourceProperties) {
  $prepareParams.ExpandResourceProperties = $true
}

& "$PSScriptRoot\prepare-resource-snapshot.ps1" @prepareParams
