import { useCallback, useMemo } from "react";

import type { ResourceGroupOwnershipRow } from "../../core/azure/resources";
import type { Tags } from "../../core/azure/tags";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { azureOwnerColumnHelp } from "./azureReportConfig";
import { exportResourceGroupsCsv, readResourceGroups } from "./api";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import type { ColumnFilters, SortRule } from "../../core/collectionControls";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { Badge, type BadgeProps } from "../../report/components/ui/badge";
import { OwnerBadge, type OwnershipEvidenceSelection } from "./ServicePrincipalFieldRenderers";
import { CsvSelectionActionBar } from "./CsvSelectionActionBar";
import { TagBadges } from "./TagBadges";
import { AzureLinkBadge, buildAzureResourceGroupPortalUrl } from "./AzureLinkBadge";

export type AzureRbacResourceGroupSelection = {
  displayName: string;
  resourceGroup: string;
  subscriptionId: string;
};

const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];
const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];

const resourceGroupFields: ReportFieldDescriptor<ResourceGroupOwnershipRow>[] = [
  {
    id: "resourceGroup",
    label: "Resource group",
    valueType: "text",
    getValue: (group) => group.resourceGroup,
    getFilterValue: (group) => ({
      resourceGroup: group.resourceGroup,
      subscriptionName: group.subscriptionName,
      subscriptionId: group.subscriptionId
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "resourceGroup", label: "Resource group", filterColumnId: "resourceGroup" },
        { id: "subscriptionName", label: "Subscription", filterColumnId: "subscriptionName" },
        { id: "subscriptionId", label: "Subscription ID", filterColumnId: "subscriptionId" }
      ]
    }
  },
  {
    id: "owner",
    label: "Owner",
    valueType: "text",
    getValue: (group) => group.ownerCandidates.map((candidate) => candidate.displayName).join(", "),
    getFilterValue: (group) => ({
      owner: group.ownerCandidates.map((candidate) => candidate.displayName),
      confidence: group.confidence
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner", filterColumnId: "ownerCandidates.displayName" },
        { id: "confidence", label: "Confidence", filterColumnId: "confidence", options: ownerConfidenceOptions }
      ]
    }
  },
  {
    id: "azureRbac",
    label: "Azure RBAC",
    valueType: "text",
    getValue: (group) => group.roleAssignments,
    sortColumnId: "rbacRoleLevel",
    getFilterValue: (group) => ({
      roleLevel: group.rbacRoleLevel,
      summary: group.roleAssignments
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
    id: "tags",
    label: "Tags",
    valueType: "text",
    getValue: (group) => formatAzureTags(group.tags),
    filter: { kind: "text" }
  }
];

export function ResourceGroupComponent({
  onAzureRbacClick,
  onOwnershipEvidenceClick,
  initialFilters,
  initialPage,
  initialSortRules,
  onFiltersChange,
  onPageChange,
  onSortRulesChange
}: {
  onAzureRbacClick?: (selection: AzureRbacResourceGroupSelection) => void;
  onOwnershipEvidenceClick?: (selection: OwnershipEvidenceSelection) => void;
  initialFilters?: ColumnFilters;
  initialPage?: number;
  initialSortRules?: SortRule[];
  onFiltersChange?: (filters: ColumnFilters) => void;
  onPageChange?: (page: number) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
}) {
  const resourceGroupFieldRenderers = useMemo<ReportColumnRenderers<ResourceGroupOwnershipRow>>(
    () => ({
      resourceGroup: (group) => (
        <div>
          <AzureLinkBadge
            aria-label={`Open resource group ${group.resourceGroup} in Azure portal`}
            href={buildAzureResourceGroupPortalUrl(group)}
            title={`Go to: ${getResourceGroupResourceId(group)}`}
          >
            {group.resourceGroup}
          </AzureLinkBadge>
          <div className="mt-0.5 text-xs text-muted-foreground">{group.subscriptionName}</div>
        </div>
      ),
      owner: (group) => (
        <OwnerBadge
          confidence={group.confidence}
          ownerCandidates={group.ownerCandidates}
          onClick={
            onOwnershipEvidenceClick
              ? () =>
                  onOwnershipEvidenceClick({
                    displayName: group.resourceGroup,
                    target: {
                      kind: "resourceGroup",
                      subscriptionId: group.subscriptionId,
                      resourceGroup: group.resourceGroup
                    }
                  })
              : undefined
          }
        />
      ),
      azureRbac: (group) => (
        <ResourceGroupRbacBadge
          group={group}
          onClick={
            onAzureRbacClick
              ? () =>
                  onAzureRbacClick({
                    displayName: group.resourceGroup,
                    resourceGroup: group.resourceGroup,
                    subscriptionId: group.subscriptionId
                  })
              : undefined
          }
        />
      ),
      tags: (group) => <TagBadges tags={group.tags} />
    }),
    [onAzureRbacClick, onOwnershipEvidenceClick]
  );
  const loadResourceGroups = useCallback(
    (input: { filters: ColumnFilters; page: number; signal: AbortSignal; sortRules: SortRule[] }) =>
      readResourceGroups(input),
    []
  );

  return (
    <>
      <SelectableGenericTable
        columnHelp={azureOwnerColumnHelp}
        emptyMessage="No resource groups match the filter."
        fieldRenderers={resourceGroupFieldRenderers}
        fields={resourceGroupFields}
        getRowKey={getResourceGroupOwnershipRowKey}
        initialFilters={initialFilters}
        initialPage={initialPage}
        initialSortRules={initialSortRules}
        loadPage={loadResourceGroups}
        loadingMessage="Loading resource groups..."
        minWidthClassName="min-w-[1040px]"
        onFiltersChange={onFiltersChange}
        onPageChange={onPageChange}
        onSortRulesChange={onSortRulesChange}
        renderSelectionOverlay={({ filters, selectAllMatchingFilters, selectedRowKeys, sortRules }) => (
          <CsvSelectionActionBar
            filters={filters}
            itemLabel="resource groups"
            selectAllMatchingFilters={selectAllMatchingFilters}
            selectedRowKeys={selectedRowKeys}
            sortRules={sortRules}
            onExportCsv={exportResourceGroupsCsv}
          />
        )}
      />
    </>
  );
}

const permissionRiskBadgeVariants: Record<PermissionRiskLevel, BadgeProps["variant"]> = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
  none: "riskNone"
};

function ResourceGroupRbacBadge({
  group,
  onClick
}: {
  group: ResourceGroupOwnershipRow;
  onClick?: () => void;
}) {
  const title = formatResourceGroupRbacSummary(group);
  const badge = (
    <Badge
      className="min-w-10 justify-center font-sans text-xs font-semibold tabular-nums"
      title={title}
      variant={permissionRiskBadgeVariants[group.rbacRoleLevel]}
    >
      {group.rbacRoleAssignmentCount}
    </Badge>
  );

  if (!onClick) {
    return badge;
  }

  return (
    <button
      aria-label={`Open Azure RBAC assignments for resource group ${group.resourceGroup}`}
      className="cursor-pointer rounded-full font-sans text-xs font-semibold transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={title}
      type="button"
      onClick={onClick}
    >
      {badge}
    </button>
  );
}

function formatResourceGroupRbacSummary(group: ResourceGroupOwnershipRow): string {
  if (group.rbacRoleAssignmentCount === 0) {
    return "No Azure RBAC assignments for service principals or managed identities in this resource group";
  }

  return group.roleAssignments
    .map((assignment) => `${assignment.roleDefinitionName ?? "Role"} assigned to ${assignment.principalDisplayName ?? assignment.principalId}`)
    .join(", ");
}

function getResourceGroupOwnershipRowKey(row: Pick<ResourceGroupOwnershipRow, "subscriptionId" | "resourceGroup">) {
  return `${row.subscriptionId}:${row.resourceGroup}`;
}

function getResourceGroupResourceId(row: Pick<ResourceGroupOwnershipRow, "subscriptionId" | "resourceGroup">) {
  return `/subscriptions/${row.subscriptionId}/resourceGroups/${row.resourceGroup}`;
}

function formatAzureTags(tags: Tags | null): string {
  if (!tags) {
    return "";
  }

  return Object.entries(tags)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
