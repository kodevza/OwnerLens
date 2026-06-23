param location string = resourceGroup().location
param keyVaultName string

resource kv 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }

    // Access is assigned manually in Azure.
    enableRbacAuthorization: true

    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true

    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

output keyVaultUri string = kv.properties.vaultUri
