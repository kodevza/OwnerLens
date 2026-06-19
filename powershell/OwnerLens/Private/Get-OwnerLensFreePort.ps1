<#
.SYNOPSIS
Finds an available local TCP port for the OwnerLens runtime.

.DESCRIPTION
Temporarily binds to loopback on an ephemeral port and returns the selected port number for local preview hosting.
#>

function Get-OwnerLensFreePort {
  [CmdletBinding()]
  param()

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}
