param(
  [Parameter(Mandatory)]
  [string]$VaultName,

  [Parameter(Mandatory)]
  [string]$CertificateName,

  [string]$Subject = "CN=OwnerLens Code Signing"
)

$ErrorActionPreference = "Stop"

$codeSigningEku = "1.3.6.1.5.5.7.3.3"

$policy = New-AzKeyVaultCertificatePolicy `
  -IssuerName "Self" `
  -SubjectName $Subject `
  -SecretContentType "application/x-pkcs12" `
  -KeyType RSA `
  -KeySize 4096 `
  -KeyUsage DigitalSignature `
  -Ekus $codeSigningEku `
  -ValidityInMonths 12 `
  -KeyNotExportable `
  -EmailAtPercentageLifetime 80

Add-AzKeyVaultCertificate `
  -VaultName $VaultName `
  -Name $CertificateName `
  -CertificatePolicy $policy

Write-Host "Certificate creation started. Check completion:"
Write-Host "Get-AzKeyVaultCertificateOperation -VaultName $VaultName -Name $CertificateName"
