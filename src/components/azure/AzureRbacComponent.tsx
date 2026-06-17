import { useCallback } from "react";

import type { AzureRbac } from "../../core/azure/azureRbac";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters, SortRule } from "../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import type { PermissionRiskLevel } from "../../core/risk/types";
import { readAzureRbac, type AzureRbacTarget } from "./api";

const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];
const azureScopeTypeOptions = ["ManagementGroup", "Subscription", "ResourceGroup", "Resource", "Unknown"];
const azurePrincipalTypeOptions = ["User", "Group", "ServicePrincipal", "ForeignGroup", "Device", "ManagedIdentity"];
const assignmentSourceOptions = ["direct", "group"];

const azureRbacFields: ReportFieldDescriptor<AzureRbac>[] = [
  {
    id: "accessDisplayName",
    label: "Access",
    valueType: "text",
    getValue: (assignment) => assignment.accessDisplayName,
    filter: { kind: "text" }
  },
  {
    id: "accessRisk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (assignment) => assignment.accessRisk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "assignmentSource",
    label: "Source",
    valueType: "text",
    getValue: (assignment) =>
      assignment.assignmentSource === "group"
        ? `Via group: ${assignment.inheritedFromGroupDisplayName ?? assignment.inheritedFromGroupId ?? "group"}`
        : "Direct",
    filterColumnId: "assignmentSource",
    filter: { kind: "multiSelect", options: assignmentSourceOptions }
  },
  {
    id: "roleDefinitionName",
    label: "Role",
    valueType: "text",
    getValue: (assignment) => assignment.roleDefinitionName,
    filter: { kind: "text" }
  },
  {
    id: "accessScopeType",
    label: "Scope type",
    valueType: "text",
    getValue: (assignment) => assignment.accessScopeType,
    filter: { kind: "multiSelect", options: azureScopeTypeOptions }
  },
  {
    id: "subscriptionName",
    label: "Subscription",
    valueType: "text",
    getValue: (assignment) => assignment.subscriptionName,
    filter: { kind: "text" }
  },
  {
    id: "accessResourceGroup",
    label: "Resource group",
    valueType: "text",
    getValue: (assignment) => assignment.accessResourceGroup,
    filter: { kind: "text" }
  },
  {
    id: "scopeResourceName",
    label: "Resource",
    valueType: "text",
    getValue: (assignment) => assignment.scopeResourceName,
    filter: { kind: "text" }
  },
  {
    id: "principalType",
    label: "Principal type",
    valueType: "text",
    getValue: (assignment) => assignment.principalType,
    filter: { kind: "multiSelect", options: azurePrincipalTypeOptions }
  },
  {
    id: "scope",
    label: "Scope",
    valueType: "text",
    getValue: (assignment) => assignment.scope,
    filter: { kind: "text" }
  },
  {
    id: "roleAssignmentId",
    label: "Assignment ID",
    valueType: "text",
    getValue: (assignment) => assignment.roleAssignmentId,
    filter: { kind: "text" }
  }
];

export function AzureRbacComponent({ target }: { target: AzureRbacTarget }) {
  const loadPage = useCallback(
    ({
      filters,
      page,
      signal,
      sortRules
    }: {
      filters: ColumnFilters;
      page: number;
      signal: AbortSignal;
      sortRules: SortRule[];
    }) =>
      readAzureRbac({ filters, page, signal, sortRules, target }),
    [target]
  );

  return (
    <GenericTable
      emptyMessage="No Azure RBAC assignments match the filter."
      fields={azureRbacFields}
      getRowKey={(row) => row.roleAssignmentId ?? `${row.servicePrincipalId}:${row.scope}:${row.roleDefinitionId ?? row.roleDefinitionName ?? ""}`}
      loadPage={loadPage}
      loadingMessage="Loading Azure RBAC assignments..."
      minWidthClassName="min-w-[2200px]"
    />
  );
}
