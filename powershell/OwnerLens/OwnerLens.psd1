@{
  RootModule = 'OwnerLens.psm1'
  ModuleVersion = '0.1.0'
  GUID = 'dd9b70d9-637f-47b5-a316-cd89e6f599d1'
  Author = 'OwnerLens'
  CompanyName = 'OwnerLens'
  Copyright = '(c) OwnerLens contributors. All rights reserved.'
  Description = 'Windows-only launcher and collector orchestration module for the local OwnerLens application server.'
  PowerShellVersion = '7.0'
  CompatiblePSEditions = @('Core')
  FunctionsToExport = @(
    'Start-OwnerLens',
    'Stop-OwnerLens',
    'Get-OwnerLensStatus',
    'Open-OwnerLens',
    'Invoke-OwnerLensCollectEntra',
    'Invoke-OwnerLensCollectAzure',
    'Install-OwnerLensRuntime',
    'Check-OwnerLensPrerequisites'
  )
  CmdletsToExport = @()
  VariablesToExport = @()
  AliasesToExport = @()
  PrivateData = @{
    PSData = @{
      Tags = @('OwnerLens', 'Azure', 'Entra', 'Windows')
      LicenseUri = 'https://www.apache.org/licenses/LICENSE-2.0'
      ProjectUri = 'https://github.com/kodevza/OwnerLens'
    }
  }
}
