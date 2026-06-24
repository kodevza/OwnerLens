# OwnerLens Signing Infrastructure

This folder contains one-time Azure signing infrastructure for OwnerLens release assets.

Use Artifact Signing for public PowerShell Gallery releases. The old Key Vault certificate flow is useful only for private/self-signed testing because a self-signed Key Vault certificate is not publicly trusted.

## Deploy Artifact Signing

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

## Deploy Key Vault

This is retained for local/private signing experiments. Do not use this self-signed certificate for PowerShell Gallery publication.

create rg
```bash
az group create -n rg-ownerlens-signing -l westeurope

```
create deployment

```bash
az deployment group create \
  --resource-group rg-ownerlens-signing \
  --template-file .infra/keyvault.bicep \
  --parameters keyVaultName=kv-ownerlens-signing
```

Assign access to the pipeline identity manually on the Key Vault. Minimum practical RBAC roles:

- Key Vault Crypto User
- Key Vault Certificate User

If using access policies instead of RBAC, the pipeline identity needs approximately:

- certificates: get, list
- keys: get, sign, verify

## Create Code-Signing Certificate

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
