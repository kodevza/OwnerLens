import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import { buildServicePrincipalRuntimeFilterOptions } from "./servicePrincipalRuntimeFilters";
import { readServicePrincipals } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ReportFieldDescriptor } from "../../report/reportTypes";

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
    filter: { kind: "multiSelect" }
  },
  {
    id: "permissionRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (sp) => sp.permissionRisk,
    filter: { kind: "multiSelect" }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (sp) => sp.azureRbac,
    filter: { kind: "text" }
  },
  {
    id: "accountEnabled",
    label: "Enabled",
    valueType: "boolean",
    getValue: (sp) => sp.accountEnabled,
    filter: { kind: "multiSelect" }
  },
  {
    id: "id",
    label: "Object ID",
    valueType: "text",
    getValue: (sp) => sp.id,
    filter: { kind: "text" }
  },
  {
    id: "appId",
    label: "Client/App ID",
    valueType: "text",
    getValue: (sp) => sp.appId,
    filter: { kind: "text" }
  },
  {
    id: "appDisplayName",
    label: "App display name",
    valueType: "text",
    getValue: (sp) => sp.appDisplayName,
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

export function ServicePrincipalComponent() {
  return (
    <GenericTable
      buildFilterOptions={buildServicePrincipalRuntimeFilterOptions}
      emptyMessage="No service principals match the filter."
      fields={servicePrincipalFields}
      getRowKey={(row) => row.id}
      loadPage={readServicePrincipals}
      loadingMessage="Loading service principals..."
      minWidthClassName="min-w-[1760px]"
    />
  );
}
