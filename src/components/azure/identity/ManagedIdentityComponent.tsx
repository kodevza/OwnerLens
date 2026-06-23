import { useCallback, useMemo, useState } from "react";

import type { ManagedIdentity } from "../../../core/azure/entra/managedIdentity";
import type { OwnerConfidence } from "../../../core/ownership/types";
import type { PermissionRiskLevel } from "../../../core/risk/types";
import type { RemediationPackage } from "../../../core/runtime/remediation";
import { getTagNames } from "../../../core/azure/tags";
import { azureManagedIdentityColumnHelp } from "../azureReportConfig";
import { exportManagedIdentitiesCsv, readManagedIdentities, readRemediationPackage } from "../api";
import { SelectableGenericTable } from "../../../report/components/table/SelectableGenericTable";
import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../../report/reportTypes";
import { CsvSelectionActionBar } from "../CsvSelectionActionBar";
import {
  buildServicePrincipalFieldRenderers,
  type AzureRbacPrincipalSelection,
  type EntraPermissionsPrincipalSelection,
  type OwnershipEvidenceSelection
} from "./ServicePrincipalFieldRenderers";
import { TagBadges } from "../TagBadges";
import { ZtaRemediationPackageBadges } from "../remediation/ZtaRemediationPackageBadges";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];
const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];

const managedIdentityFields: ReportFieldDescriptor<ManagedIdentity>[] = [
  {
    id: "displayName",
    label: "Display name",
    valueType: "text",
    getValue: (identity) => identity.displayName,
    getFilterValue: (identity) => ({
      displayName: identity.displayName,
      id: identity.id
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
    id: "assignedResourceGroups",
    label: "Resource group",
    valueType: "list",
    getValue: (identity) => identity.resourceGroup ? [identity.resourceGroup] : identity.assignedResourceGroups,
    filter: { kind: "text" }
  },
  {
    id: "potentialOwners",
    label: "Owner candidates",
    valueType: "text",
    getValue: (identity) => identity.potentialOwners?.join(", ") ?? "",
    getFilterValue: (identity) => ({
      owner: identity.potentialOwners ?? [],
      confidence: identity.ownerConfidence ?? "none"
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner candidates", filterColumnId: "potentialOwners" },
        { id: "confidence", label: "Confidence", filterColumnId: "ownerConfidence", options: ownerConfidenceOptions }
      ]
    }
  },
  {
    id: "permissionRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (identity) => identity.permissionRisk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "number",
    getValue: (identity) => identity.rbacRoleAssignmentCount,
    sortColumnId: "rbacRoleLevel",
    getFilterValue: (identity) => ({
      roleLevel: identity.rbacRoleLevel,
      assignmentCount: identity.rbacRoleAssignmentCount
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "roleLevel", label: "Role level", filterColumnId: "rbacRoleLevel", options: permissionRiskLevelOptions },
        { id: "assignmentCount", label: "Assignment count", filterColumnId: "rbacRoleAssignmentCount" }
      ]
    }
  },
  {
    id: "oauthPermissionsCount",
    label: "API Permissions",
    valueType: "number",
    getValue: (identity) => identity.oauthPermissionsCount,
    getFilterValue: (identity) => identity.entraPermissionRisk,
    filterColumnId: "entraPermissionRisk",
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },

  {
    id: "tags",
    label: "Tags",
    valueType: "list",
    getValue: (identity) => getTagNames(identity.tags),
    filter: { kind: "text" }
  },
];

export function ManagedIdentityComponent({
  initialFilters,
  initialPage,
  initialSortRules,
  onAzureRbacClick,
  onEntraPermissionsClick,
  onFiltersChange,
  onOwnershipEvidenceClick,
  onPageChange,
  onRemediationPackageClick,
  onSortRulesChange,
  onZtaRemediationsClick
}: {
  initialFilters?: ColumnFilters;
  initialPage?: number;
  initialSortRules?: SortRule[];
  onAzureRbacClick?: (principal: AzureRbacPrincipalSelection) => void;
  onEntraPermissionsClick?: (principal: EntraPermissionsPrincipalSelection) => void;
  onFiltersChange?: (filters: ColumnFilters) => void;
  onOwnershipEvidenceClick?: (selection: OwnershipEvidenceSelection) => void;
  onPageChange?: (page: number) => void;
  onRemediationPackageClick?: (remediationPackage: RemediationPackage) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
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
      ...buildServicePrincipalFieldRenderers<ManagedIdentity>({
        onAzureRbacClick,
        onEntraPermissionsClick,
        onOwnershipEvidenceClick,
        onZtaRemediationsClick
      }),
      RemediationPackages: (identity: ManagedIdentity) => (
        <ZtaRemediationPackageBadges
          packages={identity.RemediationPackages ?? []}
          onRemediationPackageClick={onRemediationPackageClick ? openRemediationPackage : undefined}
        />
      ),
      tags: (identity: ManagedIdentity) => <TagBadges tags={identity.tags} />
    }),
    [
      onAzureRbacClick,
      onEntraPermissionsClick,
      onOwnershipEvidenceClick,
      onRemediationPackageClick,
      onZtaRemediationsClick,
      openRemediationPackage
    ]
  );

  return (
    <section className="flex flex-col gap-4">
      {openPackageState.status === "error" ? (
        <div className="text-sm text-destructive">{openPackageState.message}</div>
      ) : null}
      <SelectableGenericTable
        columnHelp={azureManagedIdentityColumnHelp}
        columnWidthsStorageKey="entra-managed-identities"
        emptyMessage="No managed identities match the filter."
        fieldRenderers={fieldRenderers}
        fields={managedIdentityFields}
        getRowKey={(row) => row.id}
        initialFilters={initialFilters}
        initialPage={initialPage}
        initialSortRules={initialSortRules}
        loadPage={readManagedIdentities}
        loadingMessage="Loading managed identities..."
        minWidthClassName="min-w-[2140px]"
        onFiltersChange={onFiltersChange}
        onPageChange={onPageChange}
        onSortRulesChange={onSortRulesChange}
        renderSelectionOverlay={({ filters, selectAllMatchingFilters, selectedRowKeys, sortRules }) => (
          <CsvSelectionActionBar
            filters={filters}
            itemLabel="managed identities"
            selectAllMatchingFilters={selectAllMatchingFilters}
            selectedRowKeys={selectedRowKeys}
            sortRules={sortRules}
            onExportCsv={exportManagedIdentitiesCsv}
          />
        )}
      />
    </section>
  );
}
