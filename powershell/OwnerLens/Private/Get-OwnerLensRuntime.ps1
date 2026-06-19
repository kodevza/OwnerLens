<#
.SYNOPSIS
Resolves the OwnerLens runtime executable and app paths.

.DESCRIPTION
Validates the runtime directory and returns the Node, Vite, app root, and runtime root paths needed to start the local OwnerLens server.
#>

function Get-OwnerLensRuntime {
  [CmdletBinding()]
  param(
    [string]$RuntimePath = ""
  )

  $paths = Get-OwnerLensPaths
  $candidate = if (-not [string]::IsNullOrWhiteSpace($RuntimePath)) {
    $RuntimePath
  } elseif (Test-Path -LiteralPath (Join-Path $paths.BundledRuntimeRoot "app\bin\ownerlens.js")) {
    $paths.BundledRuntimeRoot
  } else {
    $paths.RuntimeRoot
  }

  $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "OwnerLens runtime was not found at '$candidate'. Run Install-OwnerLensRuntime or build the bundled runtime."
  }

  $runtimeRoot = $resolved.ProviderPath
  $appRoot = Join-Path $runtimeRoot "app"
  $nodePath = Join-Path $runtimeRoot "node.exe"
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
      $nodeCommand = Get-Command "node" -ErrorAction SilentlyContinue
    }
    if (-not $nodeCommand) {
      throw "OwnerLens runtime does not include node.exe and no local node command was found. Build a Windows runtime bundle with node.exe for packaged use."
    }
    $nodePath = $nodeCommand.Source
  }

  $entrypoint = Join-Path $appRoot "bin\ownerlens.js"
  $packageJson = Join-Path $appRoot "package.json"
  $distPath = Join-Path $appRoot "dist"
  $nodeModulesPath = Join-Path $appRoot "node_modules"
  $viteScript = Join-Path $nodeModulesPath "vite\bin\vite.js"

  foreach ($requiredPath in @($entrypoint, $packageJson, $distPath, $nodeModulesPath, $viteScript)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "OwnerLens runtime is incomplete. Missing required path: $requiredPath"
    }
  }

  [pscustomobject]@{
    RuntimeRoot = $runtimeRoot
    AppRoot = $appRoot
    NodePath = $nodePath
    Entrypoint = $entrypoint
    ViteScript = $viteScript
  }
}
