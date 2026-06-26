import type { LocalReportCollectionQueryOptions } from "../../../core/runtime/collections";
import type {
  CreateRuntimeRemediationPackageRequest,
  DeleteRuntimeRemediationTasksRequest
} from "../../../core/runtime/remediation";
import type {
  GeneratePowerShellScriptRequest,
  RuntimePowerShellScript
} from "./scripts/PowershellScriptService";

export type LocalReportRuntimeRestRuntime = {
  listSnapshots(): Promise<unknown> | unknown;
  readAppConfig(): Promise<unknown> | unknown;
  readInventoryStats(): Promise<unknown> | unknown;
  queryEntraServicePrincipals(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  exportEntraServicePrincipalsCsv(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryEntraManagedIdentities(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  exportEntraManagedIdentitiesCsv(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  readEntraPrincipalPermissions(principalId: string): Promise<unknown> | unknown;
  readEntraUserGroups(user: string): Promise<unknown> | unknown;
  queryEntraOAuth2PermissionGrants(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryEntraAppRoleAssignments(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryAzureResourceGroupOwnership(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  exportAzureResourceGroupOwnershipCsv(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryAzureResources(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryAzureRoleAssignments(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryAzureRbac(servicePrincipalId: string, options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  queryAzureRbacForResourceGroup(
    target: { subscriptionId: string; resourceGroup: string },
    options: LocalReportCollectionQueryOptions
  ): Promise<unknown> | unknown;
  readOwnershipEvidence(request: unknown): Promise<unknown> | unknown;
  setOwnerCandidateDisabled(key: string, disabled: boolean): Promise<number> | number;
  queryZeroTrustAssessmentReport(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  exportZeroTrustAssessmentReportCsv(options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  createZeroTrustAssessmentRemediationPackage(request: CreateRuntimeRemediationPackageRequest): Promise<{ id: string }> | { id: string };
  readRemediationPackage(packageId: string): Promise<unknown> | unknown;
  exportRemediationPackageTasksCsv(packageId: string, options: LocalReportCollectionQueryOptions): Promise<unknown> | unknown;
  deleteRemediationTasks(request: DeleteRuntimeRemediationTasksRequest): Promise<unknown> | unknown;
  generatePowerShellScript(request: GeneratePowerShellScriptRequest): Promise<RuntimePowerShellScript> | RuntimePowerShellScript;
};
