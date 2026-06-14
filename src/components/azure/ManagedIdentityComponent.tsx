import { useMemo } from "react";

import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { azureManagedIdentityColumnHelp } from "./azureReportConfig";
import { readManagedIdentities } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import {
  buildServicePrincipalFieldRenderers,
  type AzureRbacPrincipalSelection,
  type EntraPermissionsPrincipalSelection
} from "./ServicePrincipalFieldRenderers";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];
const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];
const accountEnabledOptions = ["true", "false"];

const managedIdentityFields: ReportFieldDescriptor<ManagedIdentity>[] = [
  {
    id: "displayName",
    label: "Display name",
    valueType: "text",
    getValue: (identity) => identity.displayName,
    filter: { kind: "text" }
  },
  {
    id: "permissionRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (identity) => identity.permissionRisk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "ztaRemediationCountAll",
    label: "ZTA remediations",
    valueType: "number",
    getValue: (identity) => identity.ztaRemediationCountAll,
    getFilterValue: (identity) => identity.ztaMaxRisk,
    filterColumnId: "ztaMaxRisk",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (identity) => identity.azureRbac,
    getFilterValue: (identity) => identity.rbacRoleLevel,
    filterColumnId: "rbacRoleLevel",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "oauthPemrissionsCount",
    label: "Entra API permissions",
    valueType: "number",
    getValue: (identity) => identity.oauthPemrissionsCount,
    getFilterValue: (identity) => identity.entraPermissionRisk,
    filterColumnId: "entraPermissionRisk",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "assignedResourceGroups",
    label: "Assigned resource groups",
    valueType: "list",
    getValue: (identity) => identity.assignedResourceGroups,
    filter: { kind: "text" }
  },
  {
    id: "potentialOwners",
    label: "Owner",
    valueType: "list",
    getValue: (identity) => identity.potentialOwners,
    filter: { kind: "text" }
  },
  {
    id: "ownerConfidence",
    label: "Owner confidence",
    valueType: "ownerConfidence",
    getValue: (identity) => identity.ownerConfidence ?? "none",
    filter: { kind: "multiSelect", options: ownerConfidenceOptions }
  },
  {
    id: "accountEnabled",
    label: "Enabled",
    valueType: "boolean",
    getValue: (identity) => identity.accountEnabled,
    filter: { kind: "multiSelect", options: accountEnabledOptions }
  },
  {
    id: "id",
    label: "Object ID",
    valueType: "text",
    getValue: (identity) => identity.id,
    filter: { kind: "text" }
  },
  {
    id: "tags",
    label: "Tags",
    valueType: "list",
    getValue: (identity) => identity.tags,
    filter: { kind: "text" }
  },
];

export function ManagedIdentityComponent({
  initialFilters,
  onAzureRbacClick,
  onEntraPermissionsClick,
  onZtaRemediationsClick
}: {
  initialFilters?: ColumnFilters;
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onZtaRemediationsClick?: (objectId: string) => void;
}) {
  const fieldRenderers = useMemo(
    () =>
      buildServicePrincipalFieldRenderers<ManagedIdentity>({
        onAzureRbacClick,
        onEntraPermissionsClick,
        onZtaRemediationsClick
      }),
    [onAzureRbacClick, onEntraPermissionsClick, onZtaRemediationsClick]
  );

  return (
    <GenericTable
      columnHelp={azureManagedIdentityColumnHelp}
      emptyMessage="No managed identities match the filter."
      fieldRenderers={fieldRenderers}
      fields={managedIdentityFields}
      getRowKey={(row) => row.id}
      initialFilters={initialFilters}
      loadPage={readManagedIdentities}
      loadingMessage="Loading managed identities..."
      minWidthClassName="min-w-[2160px]"
    />
  );
}
