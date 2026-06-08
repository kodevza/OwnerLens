import { useMemo } from "react";

import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import { azureServicePrincipalColumnHelp } from "./azureReportConfig";
import { buildServicePrincipalRuntimeFilterOptions } from "./servicePrincipalRuntimeFilters";
import { readServicePrincipals } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { buildServicePrincipalFieldRenderers } from "./ServicePrincipalFieldRenderers";

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
    id: "ztaRemediationCountAll",
    label: "ZTA remediations",
    valueType: "number",
    getValue: (sp) => sp.ztaRemediationCountAll,
    filter: { kind: "text" }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (sp) => sp.azureRbac,
    filter: { kind: "text" }
  },
  {
    id: "oauthPemrissionsCount",
    label: "Entra permissions",
    valueType: "text",
    getValue: (sp) => sp.oauthPemrissionsCount,
    filter: { kind: "text" }
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
    filter: { kind: "multiSelect" }
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
  onZtaRemediationsClick
}: {
  initialFilters?: ColumnFilters;
  onZtaRemediationsClick?: (objectId: string) => void;
}) {
  const fieldRenderers = useMemo(
    () => buildServicePrincipalFieldRenderers<ServicePrincipal>({ onZtaRemediationsClick }),
    [onZtaRemediationsClick]
  );

  return (
    <GenericTable
      buildFilterOptions={buildServicePrincipalRuntimeFilterOptions}
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
