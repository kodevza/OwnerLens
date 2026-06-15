param(
  [string]$OutputDir = ".\data",
  [string]$OutputPath = "",
  [string]$TenantId = "",
  [string]$AccessToken = "",
  [string[]]$Scopes = @("Application.Read.All", "Group.Read.All", "Directory.Read.All"),
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
  $resolvedOutputPath = Join-Path $OutputDir "entra-snapshot.json"
}

try {
  Import-Module Microsoft.Graph.Authentication -ErrorAction Stop
} catch {
  throw "Microsoft Graph PowerShell module missing: Microsoft.Graph.Authentication. Install: Install-Module Microsoft.Graph -Scope CurrentUser"
}

$context = Get-MgContext
if (-not [string]::IsNullOrWhiteSpace($AccessToken)) {
  Write-CollectProgress "Using provided Microsoft Graph access token."
  $secureAccessToken = $AccessToken | ConvertTo-SecureString -AsPlainText -Force
  Connect-MgGraph -AccessToken $secureAccessToken -NoWelcome | Out-Null
} elseif (-not $SkipLogin -and -not $context) {
  Write-CollectProgress "Microsoft Graph context not found. Starting Connect-MgGraph."

  $connectParams = @{
    Scopes = $Scopes
  }

  if (-not [string]::IsNullOrWhiteSpace($TenantId)) {
    $connectParams.TenantId = $TenantId
  }

  Connect-MgGraph @connectParams | Out-Null
}

Write-CollectProgress "Collecting Microsoft Entra snapshot"
Write-CollectProgress "Output path: $resolvedOutputPath"

& "$PSScriptRoot\prepare-entra-snapshot.ps1" -OutputPath $resolvedOutputPath
