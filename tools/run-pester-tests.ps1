param(
  [switch]$SkipInstall
)

$minimumPesterVersion = [version]"5.7.0"
$pesterModule = Get-Module -ListAvailable Pester |
  Where-Object { $_.Version -ge $minimumPesterVersion } |
  Sort-Object Version -Descending |
  Select-Object -First 1

if (-not $pesterModule) {
  if ($SkipInstall) {
    throw "Pester $minimumPesterVersion or newer is required. Install with: Install-Module Pester -Scope CurrentUser -MinimumVersion $minimumPesterVersion"
  }

  Install-Module Pester -Scope CurrentUser -MinimumVersion $minimumPesterVersion -Force -SkipPublisherCheck
}

Import-Module Pester -MinimumVersion $minimumPesterVersion -Force

$configuration = New-PesterConfiguration
$configuration.Run.Path = @($PSScriptRoot)
$configuration.Run.PassThru = $true
$configuration.Output.Verbosity = "Detailed"

$result = Invoke-Pester -Configuration $configuration

if ($result.FailedCount -gt 0) {
  exit 1
}
