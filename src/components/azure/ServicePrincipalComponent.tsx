import { useCallback, useMemo, useState } from "react";

import type { EntraServicePrincipalType } from "../../core/azure/entra/types";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { PermissionRiskLevel } from "../../core/risk/types";
import type { RemediationPackage } from "../../core/runtime/remediation";
import { azureServicePrincipalColumnHelp } from "./azureReportConfig";
import { readRemediationPackage, readServicePrincipals } from "./api";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters } from "../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import {
  buildServicePrincipalFieldRenderers,
  type AzureRbacPrincipalSelection,
  type EntraPermissionsPrincipalSelection
} from "./ServicePrincipalFieldRenderers";
import {
  getRemediationPackageSearchValues,
  ZtaRemediationPackageBadges
} from "./ZtaRemediationPackageBadges";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];
const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];
const servicePrincipalTypeOptions: Array<Exclude<EntraServicePrincipalType, "ManagedIdentity">> = [
  "Application",
  "SocialIdp",
  "Legacy"
];

const servicePrincipalFields: ReportFieldDescriptor<ServicePrincipal>[] = [
  {
    id: "displayName",
    label: "Display name",
    valueType: "text",
    getValue: (sp) => sp.displayName,
    getFilterValue: (sp) => ({
      displayName: sp.displayName,
      id: sp.id
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "displayName", label: "Display name", filterColumnId: "displayName" },
        { id: "id", label: "Object ID", filterColumnId: "id" }
      ]
    }
  },
  {
    id: "servicePrincipalType",
    label: "Type",
    valueType: "text",
    getValue: (sp) => sp.servicePrincipalType,
    filter: { kind: "multiSelect", options: servicePrincipalTypeOptions }
  },
  {
    id: "potentialOwners",
    label: "Owner",
    valueType: "text",
    getValue: (sp) => sp.potentialOwners?.join(", ") ?? "",
    getFilterValue: (sp) => ({
      owner: sp.potentialOwners ?? [],
      confidence: sp.ownerConfidence ?? "none"
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner", filterColumnId: "potentialOwners" },
        { id: "confidence", label: "Confidence", filterColumnId: "ownerConfidence", options: ownerConfidenceOptions }
      ]
    }
  },
  {
    id: "permissionRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (sp) => sp.permissionRisk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (sp) => sp.roleAssignments,
    getFilterValue: (sp) => ({
      roleLevel: sp.rbacRoleLevel,
      summary: sp.roleAssignments
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "roleLevel", label: "Role level", filterColumnId: "rbacRoleLevel", options: permissionRiskLevelOptions },
        { id: "summary", label: "Summary", filterColumnId: "roleAssignments" }
      ]
    }
  },
  {
    id: "oauthPermissionsCount",
    label: "Entra API permissions",
    valueType: "text",
    getValue: (sp) => sp.oauthPermissionsCount,
    getFilterValue: (sp) => sp.entraPermissionRisk,
    filterColumnId: "entraPermissionRisk",
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
    id: "RemediationPackages",
    label: "Remediation packages",
    valueType: "list",
    getValue: getRemediationPackageSearchValues,
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
  onRemediationPackageClick,
  onZtaRemediationsClick
}: {
  initialFilters?: ColumnFilters;
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onRemediationPackageClick?: (remediationPackage: RemediationPackage) => void;
  onZtaRemediationsClick?: (objectId: string) => void;
}) {
  const [openPackageState, setOpenPackageState] = useState<{
    status: "idle" | "error";
    message?: string;
  }>({ status: "idle" });
  const openRemediationPackage = useCallback(
    async (packageId: string) => {
      try {
        const remediationPackage = await readRemediationPackage(packageId);

        setOpenPackageState({ status: "idle" });
        onRemediationPackageClick?.(remediationPackage);
      } catch (error) {
        setOpenPackageState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not open remediation package."
        });
      }
    },
    [onRemediationPackageClick]
  );
  const fieldRenderers = useMemo(
    () => ({
      ...buildServicePrincipalFieldRenderers<ServicePrincipal>({
        onAzureRbacClick,
        onEntraPermissionsClick,
        onZtaRemediationsClick
      }),
      RemediationPackages: (servicePrincipal: ServicePrincipal) => (
        <ZtaRemediationPackageBadges
          packages={servicePrincipal.RemediationPackages ?? []}
          onRemediationPackageClick={onRemediationPackageClick ? openRemediationPackage : undefined}
        />
      )
    }),
    [onAzureRbacClick, onEntraPermissionsClick, onRemediationPackageClick, onZtaRemediationsClick, openRemediationPackage]
  );

  return (
    <section className="flex flex-col gap-4">
      {openPackageState.status === "error" ? (
        <div className="text-sm text-destructive">{openPackageState.message}</div>
      ) : null}
      <GenericTable
        columnHelp={azureServicePrincipalColumnHelp}
        emptyMessage="No service principals match the filter."
        fieldRenderers={fieldRenderers}
        fields={servicePrincipalFields}
        getRowKey={(row) => row.id}
        initialFilters={initialFilters}
        loadPage={readServicePrincipals}
        loadingMessage="Loading service principals..."
        minWidthClassName="min-w-[2380px]"
      />
    </section>
  );
}
