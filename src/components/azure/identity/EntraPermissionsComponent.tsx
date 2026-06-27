import { useEffect, useMemo, useState } from "react";

import { GenericTable } from "../../../report/components/table/GenericTable";
import type { ColumnFilters, SortRule } from "../../../core/collectionControls";
import type { ReportFieldDescriptor } from "../../../report/reportTypes";
import type { PermissionRiskLevel } from "../../../core/risk/types";
import type { ReportColumnRenderers } from "../../../report/buildCollectionColumns";
import { readEntraPermissions, type EntraPrincipalPermissionsResponse } from "../api";
import { EntraLinkBadge, buildEntraEnterpriseApplicationPermissionsPortalUrl } from "./EntraLinkBadge";

type EntraPermissionRow = {
  clientAppId: string | null;
  clientServicePrincipalId: string;
  id: string;
  permissionType: "OAuth2 permission grant" | "App role assignment";
  resourceDisplayName: string | null;
  resourceId: string;
  permissionDisplayName: string | null;
  permissionValue: string;
  consentType: string | null;
  risk: PermissionRiskLevel | null;
  principalDisplayName: string | null;
  principalId: string | null;
};

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
    }
  | {
      status: "error";
      message: string;
    };

const permissionTypeOptions: EntraPermissionRow["permissionType"][] = ["OAuth2 permission grant", "App role assignment"];
const consentTypeOptions = ["AllPrincipals", "Principal"];
const permissionRiskLevelOptions: PermissionRiskLevel[] = ["high", "medium", "low", "none"];

const entraPermissionFieldRenderers: ReportColumnRenderers<EntraPermissionRow> = {
  id: (permission) => (
    <EntraLinkBadge
      href={buildEntraEnterpriseApplicationPermissionsPortalUrl({
        appId: permission.clientAppId,
        objectId: permission.clientServicePrincipalId
      })}
      title={`Open granted permissions in Microsoft Entra admin center: ${permission.id}`}
    >
      {permission.id}
    </EntraLinkBadge>
  )
};

const entraPermissionFields: ReportFieldDescriptor<EntraPermissionRow>[] = [
  {
    id: "permissionType",
    label: "Type",
    valueType: "text",
    getValue: (permission) => permission.permissionType,
    filter: { kind: "multiSelect", options: permissionTypeOptions }
  },
  {
    id: "permissionValue",
    label: "Permission",
    valueType: "text",
    getValue: (permission) => permission.permissionValue,
    filter: { kind: "text" }
  },
  {
    id: "resourceDisplayName",
    label: "Resource",
    valueType: "text",
    getValue: (permission) => permission.resourceDisplayName,
    filter: { kind: "text" }
  },
  {
    id: "resourceId",
    label: "Resource ID",
    valueType: "text",
    getValue: (permission) => permission.resourceId,
    filter: { kind: "text" }
  },
  {
    id: "consentType",
    label: "Consent",
    valueType: "text",
    getValue: (permission) => permission.consentType,
    filter: { kind: "multiSelect", options: consentTypeOptions }
  },
  {
    id: "risk",
    label: "Risk",
    valueType: "riskLevel",
    getValue: (permission) => permission.risk,
    filter: { kind: "multiSelect", options: permissionRiskLevelOptions }
  },
  {
    id: "principalDisplayName",
    label: "Principal",
    valueType: "text",
    getValue: (permission) => permission.principalDisplayName,
    filter: { kind: "text" }
  },
  {
    id: "principalId",
    label: "Principal ID",
    valueType: "text",
    getValue: (permission) => permission.principalId,
    filter: { kind: "text" }
  },
  {
    id: "id",
    label: "Assignment ID",
    valueType: "text",
    getValue: (permission) => permission.id,
    filter: { kind: "text" }
  }
];

type EntraPermissionsComponentProps = {
  appId?: string | null;
  filters?: ColumnFilters;
  onFiltersChange?: (filters: ColumnFilters) => void;
  onSortRulesChange?: (sortRules: SortRule[]) => void;
  principalId: string;
  sortRules?: SortRule[];
};

export function EntraPermissionsComponent({
  appId,
  filters,
  onFiltersChange,
  onSortRulesChange,
  principalId,
  sortRules
}: EntraPermissionsComponentProps) {
  const [permissions, setPermissions] = useState<EntraPrincipalPermissionsResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadPermissions() {
      setLoadState({ status: "loading" });

      try {
        setPermissions(await readEntraPermissions({ principalId, signal: controller.signal }));
        setLoadState({ status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setPermissions(null);
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load Entra API permissions."
        });
      }
    }

    loadPermissions();

    return () => controller.abort();
  }, [principalId]);

  const rows = useMemo(() => (permissions ? mapPermissionsToRows(permissions, appId) : []), [appId, permissions]);

  if (!permissions && loadState.status === "loading") {
    return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Loading Entra API permissions...</div>;
  }

  if (!permissions && loadState.status === "error") {
    return <div className="rounded-md border border-destructive/40 bg-card p-4 text-sm text-destructive">{loadState.message}</div>;
  }

  return (
    <>
      {loadState.status === "error" ? (
        <div className="rounded-md border border-destructive/40 bg-card p-4 text-sm text-destructive">{loadState.message}</div>
      ) : null}
      <GenericTable
        columnWidthsStorageKey="entra-api-permissions"
        emptyMessage="No Entra API permissions match the filter."
        fieldRenderers={entraPermissionFieldRenderers}
        fields={entraPermissionFields}
        filters={filters}
        getRowKey={(row) => `${row.permissionType}:${row.id}`}
        minWidthClassName="min-w-[1800px]"
        rows={rows}
        sortRules={sortRules}
        onFiltersChange={onFiltersChange}
        onSortRulesChange={onSortRulesChange}
      />
    </>
  );
}

function mapPermissionsToRows(
  permissions: EntraPrincipalPermissionsResponse,
  clientAppId?: string | null
): EntraPermissionRow[] {
  return [
    ...permissions.oauth2PermissionGrants.map((grant) => ({
      clientAppId: clientAppId ?? null,
      clientServicePrincipalId: permissions.principalId,
      id: grant.id,
      permissionType: "OAuth2 permission grant" as const,
      resourceDisplayName: null,
      resourceId: grant.resourceId,
      permissionDisplayName: null,
      permissionValue: grant.scope,
      consentType: grant.consentType,
      risk: grant.risk,
      principalDisplayName: null,
      principalId: grant.principalId
    })),
    ...permissions.appRoleAssignments.map((assignment) => ({
      clientAppId: clientAppId ?? null,
      clientServicePrincipalId: permissions.principalId,
      id: assignment.id,
      permissionType: "App role assignment" as const,
      resourceDisplayName: assignment.resourceDisplayName,
      resourceId: assignment.resourceId,
      permissionDisplayName: assignment.appRoleDisplayName,
      permissionValue: assignment.appRoleValue ?? assignment.appRoleId,
      consentType: null,
      risk: null,
      principalDisplayName: assignment.principalDisplayName,
      principalId: assignment.principalId
    }))
  ];
}
