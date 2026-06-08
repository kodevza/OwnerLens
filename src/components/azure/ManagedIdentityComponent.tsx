import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import { azureManagedIdentityColumnHelp } from "./azureReportConfig";
import { buildServicePrincipalRuntimeFilterOptions } from "./servicePrincipalRuntimeFilters";
import { readManagedIdentities } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { servicePrincipalFieldRenderers } from "./ServicePrincipalFieldRenderers";

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
    filter: { kind: "multiSelect" }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (identity) => identity.azureRbac,
    filter: { kind: "text" }
  },
  {
    id: "oauthPemrissionsCount",
    label: "Entra permissions",
    valueType: "number",
    getValue: (identity) => identity.oauthPemrissionsCount,
    filter: { kind: "text" }
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
    filter: { kind: "multiSelect" }
  },
  {
    id: "accountEnabled",
    label: "Enabled",
    valueType: "boolean",
    getValue: (identity) => identity.accountEnabled,
    filter: { kind: "multiSelect" }
  },
  {
    id: "id",
    label: "Object ID",
    valueType: "text",
    getValue: (identity) => identity.id,
    filter: { kind: "text" }
  },
  {
    id: "appId",
    label: "Client/App ID",
    valueType: "text",
    getValue: (identity) => identity.appId,
    filter: { kind: "text" }
  }
];

export function ManagedIdentityComponent() {
  return (
    <GenericTable
      buildFilterOptions={buildServicePrincipalRuntimeFilterOptions}
      columnHelp={azureManagedIdentityColumnHelp}
      emptyMessage="No managed identities match the filter."
      fieldRenderers={servicePrincipalFieldRenderers}
      fields={managedIdentityFields}
      getRowKey={(row) => row.id}
      loadPage={readManagedIdentities}
      loadingMessage="Loading managed identities..."
      minWidthClassName="min-w-[1920px]"
    />
  );
}
