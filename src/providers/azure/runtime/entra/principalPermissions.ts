export {
  countOAuthPermissionScopes,
  getOAuth2PermissionGrantRisk,
  getOrCreatePrincipalPermissionSummary,
  maxPermissionRisk,
  permissionRiskRank,
  readPrincipalPermissionSummary,
  readPrincipalPermissions as readEntraPrincipalPermissions,
  toCoreEntraOAuth2PermissionGrant,
  type EntraPrincipalPermissions
} from "./EntraReadModel";
