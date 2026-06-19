<#
.SYNOPSIS
Collects a Microsoft Entra snapshot for OwnerLens.

.DESCRIPTION
Ensures Microsoft Graph authentication is available, resolves the output path, and writes the local OwnerLens Entra snapshot with applications, service principals, groups, owners, and membership facts.
#>

param(
  [Alias("OutputDir")]
  [ValidateNotNullOrEmpty()]
  [string]$DataPath = (Join-Path (Get-Location) "data"),

  [string]$OutputPath = "",

  [string]$TenantId = "",

  [string]$AccessToken = "",

  [ValidateNotNullOrEmpty()]
  [string[]]$Scopes = @("Application.Read.All", "Group.Read.All", "Directory.Read.All"),

  [switch]$SkipLogin,

  [string]$RuntimePath = ""
)

$ownerLensCollectEntraModuleRoot = Split-Path $PSScriptRoot -Parent
$ownerLensCollectEntraPrivatePath = Join-Path $ownerLensCollectEntraModuleRoot "Private"
if (Test-Path -LiteralPath $ownerLensCollectEntraPrivatePath) {
  Get-ChildItem -Path $ownerLensCollectEntraPrivatePath -Filter "*.ps1" -File | ForEach-Object {
    . $_.FullName
  }
}

function Invoke-OwnerLensCollectEntra {
  [CmdletBinding()]
  param(
    [Alias("OutputDir")]
    [ValidateNotNullOrEmpty()]
    [string]$DataPath = (Join-Path (Get-Location) "data"),

    [string]$OutputPath = "",

    [string]$TenantId = "",

    [string]$AccessToken = "",

    [ValidateNotNullOrEmpty()]
    [string[]]$Scopes = @("Application.Read.All", "Group.Read.All", "Directory.Read.All"),

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
    $resolvedOutputPath = Join-Path $resolvedDataPath "entra-snapshot.json"
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

  Import-OwnerLensCollectEntraPrivateFunctions
  Invoke-OwnerLensPrepareEntraSnapshot -OutputPath $resolvedOutputPath
}

function Import-OwnerLensCollectEntraPrivateFunctions {
  [CmdletBinding()]
  param()

  if (Get-Command Invoke-OwnerLensPrepareEntraSnapshot -ErrorAction SilentlyContinue) {
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
  Invoke-OwnerLensCollectEntra @PSBoundParameters
}
