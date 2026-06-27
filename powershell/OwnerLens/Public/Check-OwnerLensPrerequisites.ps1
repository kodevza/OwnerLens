<#
.SYNOPSIS
Checks whether the local machine is ready to run and collect data with OwnerLens.

.DESCRIPTION
Validates Windows/PowerShell prerequisites, module dependencies, local filesystem paths,
OwnerLens packaged/source runtime layout, Node.js availability, Microsoft Graph authentication,
Azure authentication, subscription access, and optional local runtime startup.

The command is read-only except for creating/removing tiny probe files in DataPath, LOCALAPPDATA,
and TEMP. If -TestRuntimeStartup is used, it starts OwnerLens on 127.0.0.1 with a temporary
runtime token and stops it after probing /api/data.

.EXAMPLE
Check-OwnerLensPrerequisites -SkipGraph -SkipAzure

Checks local system and runtime prerequisites without checking Microsoft Graph or Azure authentication.

.EXAMPLE
Check-OwnerLensPrerequisites -OutputJson -FailOnError

Writes the report as JSON and throws when one or more prerequisite checks fail.
#>

function Check-OwnerLensPrerequisites {
  [CmdletBinding()]
  param(
    [string]$RuntimePath = "",

    [string]$PackageRoot = "",

    [ValidateNotNullOrEmpty()]
    [string]$DataPath = (Join-Path (Get-Location) "data"),

    [string]$TenantId = "",

    [string]$SubscriptionIds = "",

    [ValidateRange(0, 65535)]
    [int]$Port = 0,

    [ValidateRange(0, 1024)]
    [int]$MinimumFreeDiskGB = 2,

    [switch]$SkipGraph,

    [switch]$SkipAzure,

    [switch]$SkipRuntime,

    [switch]$SkipOnlineChecks,

    [switch]$TestRuntimeStartup,

    [switch]$OutputJson,

    [switch]$FailOnError
  )

  Set-StrictMode -Version Latest
  $ErrorActionPreference = "Stop"

  $checks = [System.Collections.Generic.List[object]]::new()

function Add-OwnerLensCheck {
  param(
    [ValidateSet("Pass", "Warn", "Fail", "Info")]
    [string]$Status,

    [Parameter(Mandatory = $true)]
    [string]$Area,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [string]$Details = "",

    [string]$Fix = "",

    [object]$Data = $null
  )

  $checks.Add([pscustomobject]@{
    Status = $Status
    Area = $Area
    Name = $Name
    Details = $Details
    Fix = $Fix
    Data = $Data
  }) | Out-Null
}

function Test-OwnerLensCommand {
  param([Parameter(Mandatory = $true)][string]$Name)

  try {
    return Get-Command $Name -ErrorAction Stop
  } catch {
    return $null
  }
}

function Get-OwnerLensBestModule {
  param([Parameter(Mandatory = $true)][string]$Name)

  try {
    return Get-Module -ListAvailable -Name $Name |
      Sort-Object Version -Descending |
      Select-Object -First 1
  } catch {
    return $null
  }
}

function Test-OwnerLensModule {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Area,
    [string]$InstallHint = "",
    [switch]$Required
  )

  $module = Get-OwnerLensBestModule -Name $Name
  if (-not $module) {
    Add-OwnerLensCheck `
      -Status $(if ($Required) { "Fail" } else { "Warn" }) `
      -Area $Area `
      -Name "PowerShell module: $Name" `
      -Details "Module not found." `
      -Fix $(if ($InstallHint) { $InstallHint } else { "Install-Module $Name -Scope CurrentUser" })
    return $null
  }

  try {
    Import-Module $Name -ErrorAction Stop
    Add-OwnerLensCheck -Status "Pass" -Area $Area -Name "PowerShell module: $Name" -Details "Loaded $($module.Version) from $($module.ModuleBase)."
  } catch {
    Add-OwnerLensCheck `
      -Status $(if ($Required) { "Fail" } else { "Warn" }) `
      -Area $Area `
      -Name "PowerShell module import: $Name" `
      -Details $_.Exception.Message `
      -Fix $(if ($InstallHint) { $InstallHint } else { "Reinstall module: Install-Module $Name -Scope CurrentUser -Force" })
  }

  return $module
}

function Resolve-OwnerLensPath {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }

  try {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  } catch {
    return [System.IO.Path]::GetFullPath($Path)
  }
}

function Test-OwnerLensWritableDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Area,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Create
  )

  try {
    $resolvedPath = Resolve-OwnerLensPath -Path $Path
    if (-not (Test-Path -LiteralPath $resolvedPath)) {
      if ($Create) {
        New-Item -ItemType Directory -Path $resolvedPath -Force | Out-Null
      } else {
        Add-OwnerLensCheck -Status "Fail" -Area $Area -Name $Name -Details "Directory does not exist: $resolvedPath" -Fix "Create the directory or pass a different path."
        return
      }
    }

    $probe = Join-Path $resolvedPath (".ownerlens-prereq-{0}.tmp" -f ([guid]::NewGuid().ToString("N")))
    "ownerlens" | Set-Content -LiteralPath $probe -Encoding UTF8
    Remove-Item -LiteralPath $probe -Force
    Add-OwnerLensCheck -Status "Pass" -Area $Area -Name $Name -Details "Writable: $resolvedPath"
  } catch {
    Add-OwnerLensCheck -Status "Fail" -Area $Area -Name $Name -Details $_.Exception.Message -Fix "Grant write access or use another path."
  }
}

function Test-OwnerLensDiskFree {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$MinimumGB
  )

  try {
    $resolvedPath = Resolve-OwnerLensPath -Path $Path
    if (-not (Test-Path -LiteralPath $resolvedPath)) {
      New-Item -ItemType Directory -Path $resolvedPath -Force | Out-Null
    }

    $root = [System.IO.Path]::GetPathRoot($resolvedPath)
    if (-not $root) {
      Add-OwnerLensCheck -Status "Warn" -Area "Storage" -Name "Free disk space" -Details "Could not determine drive root for $resolvedPath."
      return
    }

    $driveName = $root.TrimEnd("\")
    $drive = Get-PSDrive -Name $driveName.TrimEnd(":") -ErrorAction Stop
    $freeGB = [math]::Round(($drive.Free / 1GB), 2)
    $status = if ($freeGB -ge $MinimumGB) { "Pass" } else { "Warn" }
    Add-OwnerLensCheck -Status $status -Area "Storage" -Name "Free disk space" -Details "$freeGB GB free on $root. Minimum expected: $MinimumGB GB." -Fix $(if ($status -eq "Warn") { "Use a drive with more free space for large tenant snapshots." } else { "" })
  } catch {
    Add-OwnerLensCheck -Status "Warn" -Area "Storage" -Name "Free disk space" -Details $_.Exception.Message
  }
}

function Find-OwnerLensPackageRoot {
  param([string]$ExplicitPackageRoot)

  $candidates = [System.Collections.Generic.List[string]]::new()

  if (-not [string]::IsNullOrWhiteSpace($ExplicitPackageRoot)) {
    $candidates.Add((Resolve-OwnerLensPath -Path $ExplicitPackageRoot)) | Out-Null
  }

  $candidates.Add((Get-Location).ProviderPath) | Out-Null

  if ($PSScriptRoot) {
    $cursor = Resolve-OwnerLensPath -Path $PSScriptRoot
    for ($i = 0; $i -lt 6 -and -not [string]::IsNullOrWhiteSpace($cursor); $i++) {
      $candidates.Add($cursor) | Out-Null
      $parent = Split-Path -Parent $cursor
      if ($parent -eq $cursor) { break }
      $cursor = $parent
    }
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (
      (Test-Path -LiteralPath (Join-Path $candidate "package.json")) -and
      (Test-Path -LiteralPath (Join-Path $candidate "bin\ownerlens.js"))
    ) {
      return $candidate
    }
  }

  return ""
}

function Find-OwnerLensModuleRoot {
  $candidates = [System.Collections.Generic.List[string]]::new()

  if ($PSScriptRoot) {
    $cursor = Resolve-OwnerLensPath -Path $PSScriptRoot
    for ($i = 0; $i -lt 6 -and -not [string]::IsNullOrWhiteSpace($cursor); $i++) {
      $candidates.Add($cursor) | Out-Null
      $candidates.Add((Join-Path $cursor "powershell\OwnerLens")) | Out-Null
      $parent = Split-Path -Parent $cursor
      if ($parent -eq $cursor) { break }
      $cursor = $parent
    }
  }

  $module = Get-OwnerLensBestModule -Name "OwnerLens"
  if ($module) {
    $candidates.Add($module.ModuleBase) | Out-Null
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (
      (Test-Path -LiteralPath (Join-Path $candidate "OwnerLens.psd1")) -and
      (Test-Path -LiteralPath (Join-Path $candidate "OwnerLens.psm1"))
    ) {
      return $candidate
    }
  }

  return ""
}

function Resolve-OwnerLensRuntimeLayout {
  param(
    [string]$ExplicitRuntimePath,
    [string]$PackageRoot,
    [string]$ModuleRoot
  )

  $candidates = [System.Collections.Generic.List[string]]::new()

  if (-not [string]::IsNullOrWhiteSpace($ExplicitRuntimePath)) {
    $candidates.Add((Resolve-OwnerLensPath -Path $ExplicitRuntimePath)) | Out-Null
  }

  if (-not [string]::IsNullOrWhiteSpace($ModuleRoot)) {
    $candidates.Add((Join-Path $ModuleRoot "bin\win-x64")) | Out-Null
  }

  if ($env:LOCALAPPDATA) {
    $candidates.Add((Join-Path $env:LOCALAPPDATA "OwnerLens\runtime")) | Out-Null
  }

  if (-not [string]::IsNullOrWhiteSpace($PackageRoot)) {
    $candidates.Add($PackageRoot) | Out-Null
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate)) {
      continue
    }

    $packagedEntrypoint = Join-Path $candidate "app\bin\ownerlens.js"
    $sourceEntrypoint = Join-Path $candidate "bin\ownerlens.js"

    if (Test-Path -LiteralPath $packagedEntrypoint) {
      return [pscustomobject]@{
        Kind = "PackagedRuntime"
        RuntimeRoot = $candidate
        AppRoot = Join-Path $candidate "app"
        Entrypoint = $packagedEntrypoint
        NodePath = Join-Path $candidate "node.exe"
      }
    }

    if (Test-Path -LiteralPath $sourceEntrypoint) {
      return [pscustomobject]@{
        Kind = "SourcePackage"
        RuntimeRoot = $candidate
        AppRoot = $candidate
        Entrypoint = $sourceEntrypoint
        NodePath = ""
      }
    }
  }

  return $null
}

function Get-OwnerLensNodeVersion {
  param([Parameter(Mandatory = $true)][string]$NodePath)

  try {
    $output = & $NodePath --version 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return [string]$output
  } catch {
    return $null
  }
}

function ConvertTo-OwnerLensNodeVersionNumber {
  param([string]$Version)

  if ([string]::IsNullOrWhiteSpace($Version)) { return $null }
  $clean = $Version.Trim().TrimStart("v")
  try { return [version]$clean } catch { return $null }
}

function Test-OwnerLensRuntimeLayout {
  param([Parameter(Mandatory = $true)]$Layout)

  Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "Runtime layout" -Details "$($Layout.Kind): $($Layout.RuntimeRoot)"

  $requiredPaths = @(
    @{ Name = "entrypoint"; Path = $Layout.Entrypoint },
    @{ Name = "package.json"; Path = (Join-Path $Layout.AppRoot "package.json") },
    @{ Name = "dist/index.html"; Path = (Join-Path $Layout.AppRoot "dist\index.html") },
    @{ Name = "dist-server/ownerlens-server.js"; Path = (Join-Path $Layout.AppRoot "dist-server\ownerlens-server.js") },
    @{ Name = "node_modules"; Path = (Join-Path $Layout.AppRoot "node_modules") },
    @{ Name = "migrations"; Path = (Join-Path $Layout.AppRoot "migrations") },
    @{ Name = "contracts"; Path = (Join-Path $Layout.AppRoot "contracts") }
  )

  foreach ($item in $requiredPaths) {
    if (Test-Path -LiteralPath $item.Path) {
      Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "Runtime path: $($item.Name)" -Details $item.Path
    } else {
      Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Runtime path: $($item.Name)" -Details "Missing: $($item.Path)" -Fix "Run npm run build and package the runtime, or run Install-OwnerLensRuntime -Force from a complete package."
    }
  }

  $packageJsonPath = Join-Path $Layout.AppRoot "package.json"
  if (Test-Path -LiteralPath $packageJsonPath) {
    try {
      $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
      Add-OwnerLensCheck -Status "Info" -Area "Runtime" -Name "Package" -Details "$($packageJson.name) $($packageJson.version)"
    } catch {
      Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "Package metadata" -Details "Could not parse package.json: $($_.Exception.Message)"
    }
  }

  $nodePath = ""
  if ($Layout.NodePath -and (Test-Path -LiteralPath $Layout.NodePath)) {
    $nodePath = $Layout.NodePath
    Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "Bundled node.exe" -Details $nodePath
  } else {
    $nodeCommand = Test-OwnerLensCommand -Name "node.exe"
    if (-not $nodeCommand) {
      $nodeCommand = Test-OwnerLensCommand -Name "node"
    }

    if ($nodeCommand) {
      $nodePath = $nodeCommand.Source
      Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "System Node.js" -Details $nodePath
    } else {
      Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Node.js" -Details "No bundled node.exe and no node command in PATH." -Fix "Use a packaged Windows runtime with node.exe or install Node.js 20+."
    }
  }

  if ($nodePath) {
    $nodeVersionRaw = Get-OwnerLensNodeVersion -NodePath $nodePath
    $nodeVersion = ConvertTo-OwnerLensNodeVersionNumber -Version $nodeVersionRaw
    if (-not $nodeVersion) {
      Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Node.js version" -Details "Could not read Node.js version from $nodePath."
    } elseif ($nodeVersion.Major -lt 20) {
      Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Node.js version" -Details "$nodeVersionRaw. Expected Node.js 20+." -Fix "Upgrade Node.js or bundle a current node.exe."
    } else {
      Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "Node.js version" -Details $nodeVersionRaw
    }
  }

  $duckDbApi = Join-Path $Layout.AppRoot "node_modules\@duckdb\node-api"
  $duckDbBindings = Join-Path $Layout.AppRoot "node_modules\@duckdb\node-bindings"
  if (Test-Path -LiteralPath $duckDbApi) {
    Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "DuckDB node-api" -Details $duckDbApi
  } else {
    Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "DuckDB node-api" -Details "Missing @duckdb/node-api." -Fix "Run npm ci for source layout or rebuild packaged runtime with production dependencies."
  }

  if (Test-Path -LiteralPath $duckDbBindings) {
    Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "DuckDB node-bindings" -Details $duckDbBindings
  } else {
    Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "DuckDB node-bindings" -Details "Missing @duckdb/node-bindings." -Fix "Run npm ci for source layout or rebuild packaged runtime with production dependencies."
  }

  if ($IsWindows) {
    $winBindingCandidates = @(
      (Join-Path $Layout.AppRoot "node_modules\@duckdb\node-bindings-win32-x64\duckdb.node")
      (Join-Path $Layout.AppRoot "node_modules\@duckdb\node-bindings-win32-arm64\duckdb.node")
    )
    $winBinding = $winBindingCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($winBinding) {
      Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "DuckDB Windows native binding" -Details $winBinding
    } else {
      Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "DuckDB Windows native binding" -Details "Missing @duckdb Windows native binding package." -Fix "Rebuild/package on Windows x64, or ensure optional dependencies are included."
    }
  } else {
    $nativeBinding = Get-ChildItem -LiteralPath (Join-Path $Layout.AppRoot "node_modules\@duckdb") -Recurse -Filter "duckdb.node" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nativeBinding) {
      Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "DuckDB native binding" -Details $nativeBinding.FullName
    } else {
      Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "DuckDB native binding" -Details "No duckdb.node found. This may fail at runtime."
    }
  }

  return $nodePath
}

function Get-OwnerLensFreePort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Test-OwnerLensPortAvailable {
  param([int]$PortToCheck)

  if ($PortToCheck -le 0) {
    try {
      $freePort = Get-OwnerLensFreePort
      Add-OwnerLensCheck -Status "Pass" -Area "Network" -Name "Loopback bind" -Details "Able to bind 127.0.0.1. Sample free port: $freePort."
    } catch {
      Add-OwnerLensCheck -Status "Fail" -Area "Network" -Name "Loopback bind" -Details $_.Exception.Message -Fix "Check local firewall/security software and loopback policy."
    }
    return
  }

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $PortToCheck)
    $listener.Start()
    Add-OwnerLensCheck -Status "Pass" -Area "Network" -Name "Port $PortToCheck" -Details "Available on 127.0.0.1."
  } catch {
    Add-OwnerLensCheck -Status "Fail" -Area "Network" -Name "Port $PortToCheck" -Details $_.Exception.Message -Fix "Stop the process using the port or run Start-OwnerLens -Port 0."
  } finally {
    if ($listener) { $listener.Stop() }
  }
}

function Test-OwnerLensRuntimeStartup {
  param(
    [Parameter(Mandatory = $true)]$Layout,
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$DataPath,
    [int]$RequestedPort
  )

  if (-not $NodePath) {
    Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Runtime startup" -Details "Skipped because Node.js is not available."
    return
  }

  $portToUse = if ($RequestedPort -gt 0) { $RequestedPort } else { Get-OwnerLensFreePort }
  $token = [guid]::NewGuid().ToString("N")
  $stdoutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ownerlens-prereq-{0}.out.log" -f $token)
  $stderrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("ownerlens-prereq-{0}.err.log" -f $token)
  $process = $null

  try {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.WorkingDirectory = $Layout.AppRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.ArgumentList.Add($Layout.Entrypoint)
    $startInfo.ArgumentList.Add("start")
    $startInfo.ArgumentList.Add("--host")
    $startInfo.ArgumentList.Add("127.0.0.1")
    $startInfo.ArgumentList.Add("--port")
    $startInfo.ArgumentList.Add([string]$portToUse)
    $startInfo.Environment["OWNERLENS_DATA_DIR"] = (Resolve-OwnerLensPath -Path $DataPath)
    $startInfo.Environment["OWNERLENS_RUNTIME_TOKEN"] = $token

    $process = [System.Diagnostics.Process]::Start($startInfo)
    if (-not $process) {
      throw "Process did not start."
    }

    $deadline = (Get-Date).AddSeconds(30)
    $url = "http://127.0.0.1:$portToUse/api/data"
    $lastError = ""

    while ((Get-Date) -lt $deadline) {
      if ($process.HasExited) {
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        throw "Runtime exited with code $($process.ExitCode). stdout=$stdout stderr=$stderr"
      }

      try {
        $response = Invoke-RestMethod -Method GET -Uri $url -Headers @{ "x-ownerlens-runtime-token" = $token } -TimeoutSec 5 -ErrorAction Stop
        Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "Runtime startup" -Details "Started and answered $url. Files=$(@($response.files).Count)."
        return
      } catch {
        $lastError = $_.Exception.Message
        Start-Sleep -Milliseconds 500
      }
    }

    throw "Runtime did not become ready within 30 seconds. Last error: $lastError"
  } catch {
    Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Runtime startup" -Details $_.Exception.Message -Fix "Check runtime build, DuckDB native bindings, logs, and OWNERLENS_DATA_DIR permissions."
  } finally {
    if ($process -and -not $process.HasExited) {
      try { $process.Kill() } catch {}
      try { $process.WaitForExit(5000) | Out-Null } catch {}
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-OwnerLensSystem {
  Add-OwnerLensCheck -Status "Info" -Area "System" -Name "Machine" -Details "$env:COMPUTERNAME / $([System.Runtime.InteropServices.RuntimeInformation]::OSDescription)"
  Add-OwnerLensCheck -Status "Info" -Area "System" -Name "Architecture" -Details ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString())

  if ($IsWindows) {
    Add-OwnerLensCheck -Status "Pass" -Area "System" -Name "Operating system" -Details "Windows detected."
  } else {
    Add-OwnerLensCheck -Status "Fail" -Area "System" -Name "Operating system" -Details "OwnerLens PowerShell module is currently Windows-only." -Fix "Run on Windows with PowerShell 7."
  }

  if ($PSVersionTable.PSEdition -eq "Core" -and $PSVersionTable.PSVersion.Major -ge 7) {
    Add-OwnerLensCheck -Status "Pass" -Area "System" -Name "PowerShell" -Details "$($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion)"
  } else {
    Add-OwnerLensCheck -Status "Fail" -Area "System" -Name "PowerShell" -Details "$($PSVersionTable.PSEdition) $($PSVersionTable.PSVersion). Expected PowerShell 7+." -Fix "Install PowerShell 7 and run with pwsh."
  }

  try {
    $policies = Get-ExecutionPolicy -List | ForEach-Object { "$($_.Scope)=$($_.ExecutionPolicy)" }
    $effective = Get-ExecutionPolicy
    $status = if ($effective -in @("Restricted", "AllSigned")) { "Warn" } else { "Pass" }
    Add-OwnerLensCheck -Status $status -Area "System" -Name "Execution policy" -Details ($policies -join "; ") -Fix $(if ($status -eq "Warn") { "Run packaged commands via pwsh -ExecutionPolicy Bypass, or adjust CurrentUser policy if allowed." } else { "" })
  } catch {
    Add-OwnerLensCheck -Status "Warn" -Area "System" -Name "Execution policy" -Details $_.Exception.Message
  }

  if ($env:LOCALAPPDATA) {
    Add-OwnerLensCheck -Status "Pass" -Area "System" -Name "LOCALAPPDATA" -Details $env:LOCALAPPDATA
  } else {
    Add-OwnerLensCheck -Status "Fail" -Area "System" -Name "LOCALAPPDATA" -Details "Environment variable is empty." -Fix "Run from a normal interactive Windows user profile."
  }

  if ($IsWindows) {
    try {
      $longPaths = Get-ItemPropertyValue -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction Stop
      $status = if ([int]$longPaths -eq 1) { "Pass" } else { "Warn" }
      Add-OwnerLensCheck -Status $status -Area "System" -Name "Long paths" -Details "LongPathsEnabled=$longPaths" -Fix $(if ($status -eq "Warn") { "Enable Windows long paths if npm/source layouts hit path length issues." } else { "" })
    } catch {
      Add-OwnerLensCheck -Status "Warn" -Area "System" -Name "Long paths" -Details "Could not read registry value: $($_.Exception.Message)"
    }
  }

  Test-OwnerLensWritableDirectory -Area "Storage" -Name "DataPath writable" -Path $DataPath -Create

  if ($env:LOCALAPPDATA) {
    Test-OwnerLensWritableDirectory -Area "Storage" -Name "OwnerLens app data writable" -Path (Join-Path $env:LOCALAPPDATA "OwnerLens") -Create
  }

  Test-OwnerLensWritableDirectory -Area "Storage" -Name "TEMP writable" -Path ([System.IO.Path]::GetTempPath())
  Test-OwnerLensDiskFree -Path $DataPath -MinimumGB $MinimumFreeDiskGB
  Test-OwnerLensPortAvailable -PortToCheck $Port

  foreach ($commandName in @("pwsh", "git", "npm")) {
    $command = Test-OwnerLensCommand -Name $commandName
    if ($command) {
      Add-OwnerLensCheck -Status "Info" -Area "System" -Name "Command: $commandName" -Details $command.Source
    } else {
      $status = if ($commandName -eq "pwsh") { "Fail" } else { "Warn" }
      Add-OwnerLensCheck -Status $status -Area "System" -Name "Command: $commandName" -Details "Not found in PATH."
    }
  }
}

function Test-OwnerLensGraph {
  if ($SkipGraph) {
    Add-OwnerLensCheck -Status "Info" -Area "Graph" -Name "Graph checks" -Details "Skipped by -SkipGraph."
    return
  }

  Test-OwnerLensModule -Name "Microsoft.Graph.Authentication" -Area "Graph" -Required -InstallHint "Install-Module Microsoft.Graph -Scope CurrentUser" | Out-Null
  Test-OwnerLensModule -Name "Microsoft.Graph.Applications" -Area "Graph" -Required -InstallHint "Install-Module Microsoft.Graph -Scope CurrentUser" | Out-Null
  Test-OwnerLensModule -Name "Microsoft.Graph.Groups" -Area "Graph" -InstallHint "Install-Module Microsoft.Graph -Scope CurrentUser" | Out-Null

  if (-not (Test-OwnerLensCommand -Name "Get-MgContext")) {
    Add-OwnerLensCheck -Status "Fail" -Area "Graph" -Name "Graph commands" -Details "Get-MgContext is not available." -Fix "Install/import Microsoft.Graph.Authentication."
    return
  }

  $context = $null
  try { $context = Get-MgContext } catch {}

  if (-not $context) {
    Add-OwnerLensCheck -Status "Fail" -Area "Graph" -Name "Graph connection" -Details "Not connected." -Fix "Connect-MgGraph -TenantId '<tenant-id>' -Scopes 'Application.Read.All','Group.Read.All','Directory.Read.All'"
    return
  }

  Add-OwnerLensCheck -Status "Pass" -Area "Graph" -Name "Graph connection" -Details "Tenant=$($context.TenantId); Account=$($context.Account); AuthType=$($context.AuthType)"

  if (-not [string]::IsNullOrWhiteSpace($TenantId) -and $context.TenantId -ne $TenantId) {
    Add-OwnerLensCheck -Status "Fail" -Area "Graph" -Name "Tenant match" -Details "Connected tenant is $($context.TenantId), expected $TenantId." -Fix "Reconnect: Disconnect-MgGraph; Connect-MgGraph -TenantId '$TenantId' -Scopes ..."
  } elseif (-not [string]::IsNullOrWhiteSpace($TenantId)) {
    Add-OwnerLensCheck -Status "Pass" -Area "Graph" -Name "Tenant match" -Details $TenantId
  }

  $requiredScopes = @("Application.Read.All", "Group.Read.All", "Directory.Read.All")
  $grantedScopes = @($context.Scopes)
  foreach ($scope in $requiredScopes) {
    if ($grantedScopes -contains $scope) {
      Add-OwnerLensCheck -Status "Pass" -Area "Graph" -Name "Graph scope: $scope" -Details "Granted."
    } else {
      Add-OwnerLensCheck -Status "Fail" -Area "Graph" -Name "Graph scope: $scope" -Details "Missing. Current scopes: $($grantedScopes -join ', ')" -Fix "Reconnect with scopes: $($requiredScopes -join ', ')"
    }
  }

  if ($SkipOnlineChecks) {
    Add-OwnerLensCheck -Status "Info" -Area "Graph" -Name "Graph API probes" -Details "Skipped by -SkipOnlineChecks."
    return
  }

  $graphProbes = @(
    @{ Name = "organization"; Uri = "/v1.0/organization?`$select=id,displayName" },
    @{ Name = "service principals"; Uri = "/v1.0/servicePrincipals?`$top=1&`$select=id,displayName,appId" },
    @{ Name = "applications"; Uri = "/v1.0/applications?`$top=1&`$select=id,displayName,appId" },
    @{ Name = "oauth2PermissionGrants"; Uri = "/v1.0/oauth2PermissionGrants?`$top=1&`$select=id,clientId,resourceId,scope" },
    @{ Name = "groups"; Uri = "/v1.0/groups?`$top=1&`$select=id,displayName" }
  )

  foreach ($probe in $graphProbes) {
    try {
      Invoke-MgGraphRequest -Method GET -Uri $probe.Uri -OutputType PSObject -ErrorAction Stop | Out-Null
      Add-OwnerLensCheck -Status "Pass" -Area "Graph" -Name "Graph probe: $($probe.Name)" -Details $probe.Uri
    } catch {
      Add-OwnerLensCheck -Status "Fail" -Area "Graph" -Name "Graph probe: $($probe.Name)" -Details $_.Exception.Message -Fix "Check Graph permissions/consent for OwnerLens collection."
    }
  }
}

function Test-OwnerLensAzure {
  if ($SkipAzure) {
    Add-OwnerLensCheck -Status "Info" -Area "Azure" -Name "Azure checks" -Details "Skipped by -SkipAzure."
    return
  }

  Test-OwnerLensModule -Name "Az.Accounts" -Area "Azure" -Required -InstallHint "Install-Module Az -Scope CurrentUser" | Out-Null
  Test-OwnerLensModule -Name "Az.Resources" -Area "Azure" -Required -InstallHint "Install-Module Az -Scope CurrentUser" | Out-Null
  Test-OwnerLensModule -Name "Az.ManagedServiceIdentity" -Area "Azure" -Required -InstallHint "Install-Module Az.ManagedServiceIdentity -Scope CurrentUser" | Out-Null

  $requiredCommands = @(
    "Get-AzContext",
    "Connect-AzAccount",
    "Get-AzSubscription",
    "Set-AzContext",
    "Invoke-AzRestMethod",
    "Get-AzResourceGroup",
    "Get-AzResource",
    "Get-AzRoleAssignment",
    "Get-AzUserAssignedIdentity"
  )

  foreach ($commandName in $requiredCommands) {
    $command = Test-OwnerLensCommand -Name $commandName
    if ($command) {
      Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Azure command: $commandName" -Details $command.Source
    } else {
      Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Azure command: $commandName" -Details "Missing." -Fix "Install/update Az modules."
    }
  }

  if (-not (Test-OwnerLensCommand -Name "Get-AzContext")) {
    return
  }

  $context = $null
  try { $context = Get-AzContext } catch {}

  if (-not $context) {
    Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Azure connection" -Details "Not connected." -Fix "Connect-AzAccount"
    return
  }

  Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Azure connection" -Details "Account=$($context.Account.Id); Tenant=$($context.Tenant.Id); Subscription=$($context.Subscription.Id) $($context.Subscription.Name)"

  if (-not [string]::IsNullOrWhiteSpace($TenantId) -and $context.Tenant.Id -ne $TenantId) {
    Add-OwnerLensCheck -Status "Warn" -Area "Azure" -Name "Azure tenant match" -Details "Azure context tenant is $($context.Tenant.Id), expected $TenantId." -Fix "Set-AzContext to the intended tenant/subscription."
  }

  $enabledSubscriptions = @()
  try {
    $enabledSubscriptions = @(Get-AzSubscription | Where-Object { $_.State -eq "Enabled" })
    Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Enabled subscriptions" -Details "Visible enabled subscriptions: $($enabledSubscriptions.Count)."
  } catch {
    Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Enabled subscriptions" -Details $_.Exception.Message -Fix "Check Azure login and tenant/subscription permissions."
    return
  }

  $subscriptionFilters = @()
  if ([string]::IsNullOrWhiteSpace($SubscriptionIds)) {
    if ($context.Subscription -and $context.Subscription.Id) {
      $subscriptionFilters = @([string]$context.Subscription.Id)
    }
  } else {
    $subscriptionFilters = @($SubscriptionIds.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }

  if ($subscriptionFilters.Count -eq 0) {
    Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Subscription selection" -Details "No subscription selected." -Fix "Set-AzContext -SubscriptionId '<id>' or pass -SubscriptionIds."
    return
  }

  $resolvedSubscriptions = @()
  foreach ($filter in $subscriptionFilters) {
    $sub = $enabledSubscriptions | Where-Object { $_.Id -eq $filter -or $_.Name -eq $filter } | Select-Object -First 1
    if (-not $sub) {
      Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Subscription: $filter" -Details "Not found or not enabled." -Fix "Use an enabled subscription ID/name visible to Get-AzSubscription."
      continue
    }

    $resolvedSubscriptions += $sub
    Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Subscription: $filter" -Details "$($sub.Name) ($($sub.Id))"
  }

  if ($SkipOnlineChecks) {
    Add-OwnerLensCheck -Status "Info" -Area "Azure" -Name "Azure API probes" -Details "Skipped by -SkipOnlineChecks."
    return
  }

  foreach ($sub in $resolvedSubscriptions) {
    try {
      Set-AzContext -SubscriptionId $sub.Id -ErrorAction Stop | Out-Null
      Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Set context: $($sub.Name)" -Details $sub.Id
    } catch {
      Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Set context: $($sub.Name)" -Details $_.Exception.Message
      continue
    }

    $encodedStart = [Uri]::EscapeDataString((Get-Date).AddMinutes(-15).ToUniversalTime().ToString("o"))
    $encodedEnd = [Uri]::EscapeDataString((Get-Date).ToUniversalTime().ToString("o"))
    $activityFilter = [Uri]::EscapeDataString("eventTimestamp ge '$([Uri]::UnescapeDataString($encodedStart))' and eventTimestamp le '$([Uri]::UnescapeDataString($encodedEnd))'")

    $azureProbes = @(
      @{ Name = "resource groups"; Path = "/subscriptions/$($sub.Id)/resourcegroups?api-version=2021-04-01" },
      @{ Name = "resources"; Path = "/subscriptions/$($sub.Id)/resources?api-version=2021-04-01" },
      @{ Name = "role assignments"; Path = "/subscriptions/$($sub.Id)/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&`$top=1" },
      @{ Name = "user-assigned managed identities"; Path = "/subscriptions/$($sub.Id)/providers/Microsoft.ManagedIdentity/userAssignedIdentities?api-version=2023-01-31" },
      @{ Name = "activity logs"; Path = "/subscriptions/$($sub.Id)/providers/microsoft.insights/eventtypes/management/values?api-version=2015-04-01&`$filter=$activityFilter" }
    )

    foreach ($probe in $azureProbes) {
      try {
        $response = Invoke-AzRestMethod -Method GET -Path $probe.Path -ErrorAction Stop
        $statusCode = [int]$response.StatusCode
        if ($statusCode -ge 200 -and $statusCode -lt 300) {
          Add-OwnerLensCheck -Status "Pass" -Area "Azure" -Name "Azure probe: $($probe.Name) / $($sub.Name)" -Details "HTTP $statusCode"
        } else {
          Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Azure probe: $($probe.Name) / $($sub.Name)" -Details "HTTP $statusCode $($response.Content)" -Fix "Check Azure RBAC permissions."
        }
      } catch {
        Add-OwnerLensCheck -Status "Fail" -Area "Azure" -Name "Azure probe: $($probe.Name) / $($sub.Name)" -Details $_.Exception.Message -Fix "Check Azure RBAC permissions and provider availability."
      }
    }
  }
}

function Test-OwnerLensExistingState {
  if (-not $env:LOCALAPPDATA) { return }

  $statePath = Join-Path $env:LOCALAPPDATA "OwnerLens\runtime-state.json"
  if (-not (Test-Path -LiteralPath $statePath)) {
    Add-OwnerLensCheck -Status "Info" -Area "Runtime" -Name "Existing runtime state" -Details "No state file found."
    return
  }

  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $process = $null
    if ($state.ProcessId) {
      $process = Get-Process -Id ([int]$state.ProcessId) -ErrorAction SilentlyContinue
    }

    if ($process) {
      Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "Existing runtime state" -Details "State file points to running PID $($state.ProcessId) at $($state.ServerUrl)." -Fix "Run Stop-OwnerLens before starting a new pilot session if this is stale."
    } else {
      Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "Stale runtime state" -Details "State file exists but process is not running: $statePath" -Fix "Run Stop-OwnerLens or delete the stale state file."
    }
  } catch {
    Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "Existing runtime state" -Details "Could not parse $statePath`: $($_.Exception.Message)" -Fix "Delete the corrupted state file."
  }
}

function Write-OwnerLensReport {
  $summary = [pscustomobject]@{
    Pass = @($checks | Where-Object Status -eq "Pass").Count
    Warn = @($checks | Where-Object Status -eq "Warn").Count
    Fail = @($checks | Where-Object Status -eq "Fail").Count
    Info = @($checks | Where-Object Status -eq "Info").Count
  }

  if ($OutputJson) {
    [pscustomobject]@{
      summary = $summary
      checks = $checks
    } | ConvertTo-Json -Depth 8
    return
  }

  Write-Host ""
  Write-Host "OwnerLens prerequisite check"
  Write-Host "============================"
  Write-Host "Pass=$($summary.Pass) Warn=$($summary.Warn) Fail=$($summary.Fail) Info=$($summary.Info)"
  Write-Host ""

  $checks |
    Sort-Object @{ Expression = { switch ($_.Status) { "Fail" { 0 } "Warn" { 1 } "Pass" { 2 } default { 3 } } } }, Area, Name |
    Select-Object Status, Area, Name, Details, Fix |
    Format-Table -AutoSize -Wrap

  $failures = @($checks | Where-Object Status -eq "Fail")
  if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Blocking fixes:"
    foreach ($failure in $failures) {
      $fix = if ($failure.Fix) { $failure.Fix } else { "No automatic fix provided." }
      Write-Host "- [$($failure.Area)] $($failure.Name): $fix"
    }
  }
}

Test-OwnerLensSystem
Test-OwnerLensExistingState

$moduleRoot = Find-OwnerLensModuleRoot
if ($moduleRoot) {
  Add-OwnerLensCheck -Status "Pass" -Area "Module" -Name "OwnerLens module root" -Details $moduleRoot

  try {
    $manifest = Test-ModuleManifest -Path (Join-Path $moduleRoot "OwnerLens.psd1") -ErrorAction Stop
    Add-OwnerLensCheck -Status "Pass" -Area "Module" -Name "OwnerLens manifest" -Details "Version=$($manifest.Version); PowerShellVersion=$($manifest.PowerShellVersion)"
  } catch {
    Add-OwnerLensCheck -Status "Fail" -Area "Module" -Name "OwnerLens manifest" -Details $_.Exception.Message
  }
} else {
  Add-OwnerLensCheck -Status "Warn" -Area "Module" -Name "OwnerLens module root" -Details "Could not find OwnerLens.psd1/OwnerLens.psm1." -Fix "Run from the repository/package root or install/import the OwnerLens module."
}

$resolvedPackageRoot = Find-OwnerLensPackageRoot -ExplicitPackageRoot $PackageRoot
if ($resolvedPackageRoot) {
  Add-OwnerLensCheck -Status "Pass" -Area "Runtime" -Name "OwnerLens package root" -Details $resolvedPackageRoot
} else {
  Add-OwnerLensCheck -Status "Warn" -Area "Runtime" -Name "OwnerLens package root" -Details "Could not find package.json + bin/ownerlens.js. Packaged runtime may still be valid."
}

$runtimeLayout = $null
$nodePath = ""
if ($SkipRuntime) {
  Add-OwnerLensCheck -Status "Info" -Area "Runtime" -Name "Runtime checks" -Details "Skipped by -SkipRuntime."
} else {
  $runtimeLayout = Resolve-OwnerLensRuntimeLayout -ExplicitRuntimePath $RuntimePath -PackageRoot $resolvedPackageRoot -ModuleRoot $moduleRoot
  if (-not $runtimeLayout) {
    Add-OwnerLensCheck -Status "Fail" -Area "Runtime" -Name "Runtime layout" -Details "Could not find packaged runtime or source package." -Fix "Run Install-OwnerLensRuntime -Force, pass -RuntimePath, or run from a built OwnerLens repository/package root."
  } else {
    $nodePath = Test-OwnerLensRuntimeLayout -Layout $runtimeLayout
    if ($TestRuntimeStartup) {
      Test-OwnerLensRuntimeStartup -Layout $runtimeLayout -NodePath $nodePath -DataPath $DataPath -RequestedPort $Port
    }
  }
}

Test-OwnerLensGraph
Test-OwnerLensAzure
Write-OwnerLensReport

if ($FailOnError -and (@($checks | Where-Object Status -eq "Fail").Count -gt 0)) {
  throw "OwnerLens prerequisite checks failed."
}
}
