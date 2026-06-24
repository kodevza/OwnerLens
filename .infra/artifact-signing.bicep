@description('Azure region for the Artifact Signing account. Use a region supported by Microsoft.CodeSigning.')
@allowed([
  'brazilsouth'
  'centralus'
  'eastus'
  'japaneast'
  'koreacentral'
  'northcentralus'
  'northeurope'
  'westus'
  'westus2'
])
param location string = 'northeurope'

@description('Globally unique Artifact Signing account name. Must be 3-24 alphanumeric characters, start with a letter, and not start with "one".')
param codeSigningAccountName string = 'olenssign${uniqueString(subscription().id, resourceGroup().id)}'

@description('Artifact Signing pricing tier.')
@allowed([
  'Basic'
  'Premium'
])
param skuName string = 'Basic'

@description('Optional Public Trust certificate profile name. The profile is created only when identityValidationId is set.')
param certificateProfileName string = 'OwnerLensPublicTrust'

@description('Identity validation ID copied from the Artifact Signing account after the portal-only Public Trust identity validation is completed.')
param identityValidationId string = ''

@description('Include street address in the public trust certificate subject.')
param includeStreetAddress bool = false

@description('Include postal code in the public trust certificate subject.')
param includePostalCode bool = false

@description('Optional Microsoft Entra object ID for the GitHub Actions federated credential service principal. When set, it gets signer access on the certificate profile.')
param signerPrincipalId string = ''

@description('Principal type for signerPrincipalId.')
@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
param signerPrincipalType string = 'ServicePrincipal'

@description('Optional Microsoft Entra object ID for the human or group that will complete identity validation in the Azure portal.')
param identityVerifierPrincipalId string = ''

@description('Principal type for identityVerifierPrincipalId.')
@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
param identityVerifierPrincipalType string = 'User'

@description('Resource tags.')
param tags object = {
  app: 'OwnerLens'
  workload: 'code-signing'
}

var createCertificateProfile = identityValidationId != ''
var assignSignerRole = createCertificateProfile && signerPrincipalId != ''
var assignIdentityVerifierRole = identityVerifierPrincipalId != ''
var certificateProfileSignerRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '2837e146-70d7-4cfd-ad55-7efa6464f958'
)
var identityVerifierRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4339b7cf-9826-4e41-b4ed-c7f4505dac08'
)

resource account 'Microsoft.CodeSigning/codeSigningAccounts@2026-05-15-preview' = {
  name: codeSigningAccountName
  location: location
  tags: tags
  properties: {
    sku: {
      name: skuName
    }
  }
}

resource profile 'Microsoft.CodeSigning/codeSigningAccounts/certificateProfiles@2026-05-15-preview' = if (createCertificateProfile) {
  parent: account
  name: certificateProfileName
  properties: {
    identityValidationId: identityValidationId
    includeCity: false
    includeCountry: false
    includePostalCode: includePostalCode
    includeState: false
    includeStreetAddress: includeStreetAddress
    profileType: 'PublicTrust'
  }
}

resource identityVerifierAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignIdentityVerifierRole) {
  name: guid(account.id, identityVerifierPrincipalId, identityVerifierRoleDefinitionId)
  scope: account
  properties: {
    principalId: identityVerifierPrincipalId
    principalType: identityVerifierPrincipalType
    roleDefinitionId: identityVerifierRoleDefinitionId
  }
}

resource signerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignSignerRole) {
  name: guid(profile.id, signerPrincipalId, certificateProfileSignerRoleDefinitionId)
  scope: profile
  properties: {
    principalId: signerPrincipalId
    principalType: signerPrincipalType
    roleDefinitionId: certificateProfileSignerRoleDefinitionId
  }
}

output accountName string = account.name
output accountResourceId string = account.id
output certificateProfileName string = createCertificateProfile ? profile.name : ''
output certificateProfileResourceId string = createCertificateProfile ? profile.id : ''
