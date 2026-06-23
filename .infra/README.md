# OwnerLens Signing Infrastructure

This folder contains the one-time Azure Key Vault setup for OwnerLens code-signing assets.

## Deploy Key Vault

create rg
```bash
az group create -n rg-ownerlens-signing -l westeurope

```
create deployment

```bash
az deployment group create \
  --resource-group rg-ownerlens-signing \
  --template-file infra/keyvault.bicep \
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
./infra/create-code-signing-cert.ps1 `
  -VaultName "kv-ownerlens-signing" `
  -CertificateName "ownerlens-code-signing"
```

Check certificate creation status:

```powershell
Get-AzKeyVaultCertificateOperation -VaultName "kv-ownerlens-signing" -Name "ownerlens-code-signing"
```
