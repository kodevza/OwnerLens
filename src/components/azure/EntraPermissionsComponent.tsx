import { useEffect, useMemo, useState } from "react";

import { GenericTable } from "../../report/components/GenericTable";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { readEntraPermissions, type EntraPrincipalPermissionsResponse } from "./api";

type EntraPermissionRow = {
  id: string;
  permissionType: "OAuth2 permission grant" | "App role assignment";
  resourceDisplayName: string | null;
  resourceId: string;
  permissionDisplayName: string | null;
  permissionValue: string;
  consentType: string | null;
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

const entraPermissionFields: ReportFieldDescriptor<EntraPermissionRow>[] = [
  {
    id: "permissionType",
    label: "Type",
    valueType: "text",
    getValue: (permission) => permission.permissionType,
    filter: { kind: "multiSelect", options: permissionTypeOptions }
  },
  {
    id: "permissionDisplayName",
    label: "Permission",
    valueType: "text",
    getValue: (permission) => permission.permissionDisplayName,
    filter: { kind: "text" }
  },
  {
    id: "permissionValue",
    label: "Value",
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

export function EntraPermissionsComponent({ principalId }: { principalId: string }) {
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
          message: error instanceof Error ? error.message : "Could not load Entra permissions."
        });
      }
    }

    loadPermissions();

    return () => controller.abort();
  }, [principalId]);

  const rows = useMemo(() => (permissions ? mapPermissionsToRows(permissions) : []), [permissions]);

  if (!permissions && loadState.status === "loading") {
    return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">Loading Entra permissions...</div>;
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
        emptyMessage="No Entra permissions match the filter."
        fields={entraPermissionFields}
        getRowKey={(row) => `${row.permissionType}:${row.id}`}
        minWidthClassName="min-w-[1800px]"
        rows={rows}
      />
    </>
  );
}

function mapPermissionsToRows(permissions: EntraPrincipalPermissionsResponse): EntraPermissionRow[] {
  return [
    ...permissions.oauth2PermissionGrants.map((grant) => ({
      id: grant.id,
      permissionType: "OAuth2 permission grant" as const,
      resourceDisplayName: null,
      resourceId: grant.resourceId,
      permissionDisplayName: null,
      permissionValue: grant.scope,
      consentType: grant.consentType,
      principalDisplayName: null,
      principalId: grant.principalId
    })),
    ...permissions.appRoleAssignments.map((assignment) => ({
      id: assignment.id,
      permissionType: "App role assignment" as const,
      resourceDisplayName: assignment.resourceDisplayName,
      resourceId: assignment.resourceId,
      permissionDisplayName: assignment.appRoleDisplayName,
      permissionValue: assignment.appRoleValue ?? assignment.appRoleId,
      consentType: null,
      principalDisplayName: assignment.principalDisplayName,
      principalId: assignment.principalId
    }))
  ];
}
