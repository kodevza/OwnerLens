<#
.SYNOPSIS
Creates a local runtime access token for OwnerLens.

.DESCRIPTION
Generates a random URL-safe token used by the PowerShell module to protect local OwnerLens runtime API calls.
#>

function New-OwnerLensRuntimeToken {
  [CmdletBinding()]
  param()

  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}
