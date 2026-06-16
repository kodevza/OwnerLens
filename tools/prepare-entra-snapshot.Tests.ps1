BeforeAll {
  . "$PSScriptRoot/prepare-entra-snapshot.ps1" -LoadFunctionsOnly
}

Describe "prepare-entra-snapshot owner helpers" {
  It "reads owner fields from typed properties and additional properties" {
    $owner = [pscustomobject]@{
      Id = "owner-1"
      DisplayName = "Owner One"
      AdditionalProperties = @{
        userPrincipalName = "owner.one@example.com"
        mail = "owner.one@example.com"
        "@odata.type" = "#microsoft.graph.user"
      }
    }

    $snapshot = ConvertTo-OwnerSnapshot -Owner $owner

    $snapshot.id | Should -Be "owner-1"
    $snapshot.displayName | Should -Be "Owner One"
    $snapshot.userPrincipalName | Should -Be "owner.one@example.com"
    $snapshot.mail | Should -Be "owner.one@example.com"
    $snapshot.ownerType | Should -Be "#microsoft.graph.user"
  }

  It "reads expanded owners from additional properties when Owners is not populated" {
    $directoryObject = [pscustomobject]@{
      AdditionalProperties = @{
        owners = @(
          [pscustomobject]@{
            AdditionalProperties = @{
              id = "owner-2"
              displayName = "Owner Two"
              "@odata.type" = "#microsoft.graph.user"
            }
          }
        )
      }
    }

    $owners = @(Get-ExpandedOwnerSnapshots -DirectoryObject $directoryObject)

    $owners | Should -HaveCount 1
    $owners[0].id | Should -Be "owner-2"
    $owners[0].displayName | Should -Be "Owner Two"
  }

  It "deduplicates merged owner evidence by object id case-insensitively" {
    $first = [pscustomobject]@{ id = "OWNER-1"; displayName = "First owner" }
    $duplicate = [pscustomobject]@{ id = "owner-1"; displayName = "Duplicate owner" }
    $second = [pscustomobject]@{ id = "owner-2"; displayName = "Second owner" }

    $owners = @(Merge-OwnerSnapshots -OwnerSets @(@($first, $second), @($duplicate)))

    $owners | Should -HaveCount 2
    $owners[0].displayName | Should -Be "First owner"
    $owners[1].displayName | Should -Be "Second owner"
  }

  It "indexes application owners by app id for matching service principals" {
    $application = [pscustomobject]@{
      AppId = "app-1"
      Owners = @(
        [pscustomobject]@{
          Id = "owner-1"
          DisplayName = "Application Owner"
        }
      )
    }

    $index = New-ApplicationOwnerIndex -Applications @($application)
    $owners = @(Get-ApplicationOwnersByAppId -AppId "app-1" -ApplicationOwnersByAppId $index)

    $owners | Should -HaveCount 1
    $owners[0].id | Should -Be "owner-1"
    @(Get-ApplicationOwnersByAppId -AppId "missing-app" -ApplicationOwnersByAppId $index) | Should -HaveCount 0
  }
}
