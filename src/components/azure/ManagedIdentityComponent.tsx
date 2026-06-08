import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import { buildServicePrincipalRuntimeFilterOptions } from "./servicePrincipalRuntimeFilters";
import { readManagedIdentities } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ReportFieldDescriptor } from "../../report/reportTypes";

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
    id: "assignedResourceGroups",
    label: "Assigned resource groups",
    valueType: "list",
    getValue: (identity) => identity.assignedResourceGroups,
    filter: { kind: "text" }
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
      emptyMessage="No managed identities match the filter."
      fields={managedIdentityFields}
      getRowKey={(row) => row.id}
      loadPage={readManagedIdentities}
      loadingMessage="Loading managed identities..."
      minWidthClassName="min-w-[1560px]"
    />
  );
}
