# OwnerLens Signing Infrastructure

This folder contains one-time Azure signing infrastructure for OwnerLens release assets.

The package publishing workflow signs PowerShell release files with `AzureSignTool`
using a code-signing certificate stored in Azure Key Vault.

## Deploy Key Vault

Create a resource group:

```bash
az group create -n rg-ownerlens-signing -l westeurope
```

Deploy the Key Vault:

```bash
az deployment group create \
  --resource-group rg-ownerlens-signing \
  --template-file .infra/keyvault.bicep \
  --parameters keyVaultName=kv-ownerlens-signing
```

Assign access to the GitHub Actions OIDC service principal on the Key Vault.
Minimum practical RBAC roles:

- Key Vault Crypto User
- Key Vault Certificate User

If using access policies instead of RBAC, the pipeline identity needs approximately:

- certificates: get, list
- keys: get, sign, verify

Create the certificate once during bootstrap, not in every pipeline run:

```powershell
./.infra/create-code-signing-cert.ps1 `
  -VaultName "kv-ownerlens-signing" `
  -CertificateName "ownerlens-code-signing"
```

Check certificate creation status:

```powershell
Get-AzKeyVaultCertificateOperation -VaultName "kv-ownerlens-signing" -Name "ownerlens-code-signing"
```

Configure the `package-signing` GitHub environment secrets used by
`.github/workflows/publish-package.yml`:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `KEY_VAULT_URL`, for example `https://kv-ownerlens-signing.vault.azure.net/`
- `SIGNING_CERT_NAME`, for example `ownerlens-code-signing`
- `PSGALLERY_API_KEY`

## Artifact Signing

## Deploy Artifact Signing

Artifact Signing infrastructure is retained for a future public-trust signing
flow. The current publishing workflow does not use it.

Register the resource provider once per subscription:

```bash
az provider register --namespace Microsoft.CodeSigning
az provider show --namespace Microsoft.CodeSigning --query registrationState -o tsv
```

Create or reuse a resource group in a supported Artifact Signing region:

```bash
az group create -n rg-ownerlens-signing -l northeurope
```

Deploy the Artifact Signing account:

```bash
az deployment group create \
  --resource-group rg-ownerlens-signing \
  --template-file .infra/artifact-signing.bicep \
  --parameters codeSigningAccountName=<globally-unique-account-name>
```

Complete Public Trust identity validation in the Azure portal:

1. Open the Artifact Signing account.
2. Go to Identity validations.
3. Create an Organization/Public identity validation.
4. Wait until validation is completed.
5. Copy the Identity validation Id.

Create the Public Trust certificate profile and grant GitHub Actions signing access:

```bash
az deployment group create \
  --resource-group rg-ownerlens-signing \
  --template-file .infra/artifact-signing.bicep \
  --parameters \
      codeSigningAccountName=<globally-unique-account-name> \
      identityValidationId=<completed-identity-validation-id> \
      signerPrincipalId=<github-oidc-app-service-principal-object-id>
```

The Bicep assigns `Artifact Signing Certificate Profile Signer` on the certificate profile when `signerPrincipalId` is provided. To let a user or group complete identity validation, pass `identityVerifierPrincipalId`; the Bicep assigns `Artifact Signing Identity Verifier` on the account.
