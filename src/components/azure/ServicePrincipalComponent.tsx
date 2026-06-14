import { useMemo } from "react";

import type { EntraServicePrincipalType } from "../../core/azure/entra/types";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { azureServicePrincipalColumnHelp } from "./azureReportConfig";
import { readServicePrincipals } from "./api";
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
const servicePrincipalTypeOptions: Array<Exclude<EntraServicePrincipalType, "ManagedIdentity">> = [
  "Application",
  "SocialIdp",
  "Legacy"
];
const accountEnabledOptions = ["true", "false"];

const servicePrincipalFields: ReportFieldDescriptor<ServicePrincipal>[] = [
  {
    id: "displayName",
    label: "Display name",
    valueType: "text",
    getValue: (sp) => sp.displayName,
    filter: { kind: "text" }
  },
  {
    id: "servicePrincipalType",
    label: "Type",
    valueType: "text",
    getValue: (sp) => sp.servicePrincipalType,
    filter: { kind: "multiSelect", options: servicePrincipalTypeOptions }
  },
  {
    id: "permissionRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (sp) => sp.permissionRisk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "ztaRemediationCountAll",
    label: "ZTA remediations",
    valueType: "number",
    getValue: (sp) => sp.ztaRemediationCountAll,
    getFilterValue: (sp) => sp.ztaMaxRisk,
    filterColumnId: "ztaMaxRisk",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (sp) => sp.azureRbac,
    getFilterValue: (sp) => ({
      roleLevel: sp.rbacRoleLevel,
      summary: sp.azureRbac
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "roleLevel", label: "Role level", filterColumnId: "rbacRoleLevel", options: permissionRiskLevelOptions },
        { id: "summary", label: "Summary", filterColumnId: "azureRbac" }
      ]
    }
  },
  {
    id: "oauthPemrissionsCount",
    label: "Entra API permissions",
    valueType: "text",
    getValue: (sp) => sp.oauthPemrissionsCount,
    getFilterValue: (sp) => sp.entraPermissionRisk,
    filterColumnId: "entraPermissionRisk",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "potentialOwners",
    label: "Owner",
    valueType: "list",
    getValue: (sp) => sp.potentialOwners,
    filter: { kind: "text" }
  },
  {
    id: "ownerConfidence",
    label: "Owner confidence",
    valueType: "ownerConfidence",
    getValue: (sp) => sp.ownerConfidence ?? "none",
    filter: { kind: "multiSelect", options: ownerConfidenceOptions }
  },
  {
    id: "accountEnabled",
    label: "Enabled",
    valueType: "boolean",
    getValue: (sp) => sp.accountEnabled,
    filter: { kind: "multiSelect", options: accountEnabledOptions }
  },
  {
    id: "id",
    label: "Object ID",
    valueType: "text",
    getValue: (sp) => sp.id,
    filter: { kind: "text" }
  },
  {
    id: "publisherName",
    label: "Publisher",
    valueType: "text",
    getValue: (sp) => sp.publisherName,
    filter: { kind: "text" }
  },
  {
    id: "tags",
    label: "Tags",
    valueType: "list",
    getValue: (sp) => sp.tags,
    filter: { kind: "text" }
  }
];


export function ServicePrincipalComponent({
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
      buildServicePrincipalFieldRenderers<ServicePrincipal>({
        onAzureRbacClick,
        onEntraPermissionsClick,
        onZtaRemediationsClick
      }),
    [onAzureRbacClick, onEntraPermissionsClick, onZtaRemediationsClick]
  );

  return (
    <GenericTable
      columnHelp={azureServicePrincipalColumnHelp}
      emptyMessage="No service principals match the filter."
      fieldRenderers={fieldRenderers}
      fields={servicePrincipalFields}
      getRowKey={(row) => row.id}
      initialFilters={initialFilters}
      loadPage={readServicePrincipals}
      loadingMessage="Loading service principals..."
      minWidthClassName="min-w-[2400px]"
    />
  );
}
