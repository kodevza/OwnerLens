import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import type { EntraAppRoleAssignment, EntraOAuth2PermissionGrant } from "../../core/azure/entra/types";
import type { AzureRbac } from "../../core/azure/azureRbac";
import type { ResourceGroupOwnershipRow } from "../../core/azure/resources";
import type { ZtaReport } from "../../core/azure/ztaReport";
import type {
  CreateRuntimeRemediationPackageRequest,
  CreateRuntimeRemediationPackageResponse,
  DeleteRuntimeRemediationTasksRequest,
  RemediationPackage
} from "../../core/runtime/remediation";
import type { LocalReportPaginatedCollection } from "../../core/runtime/collections";
import type { PaginatedCollection } from "../../core/runtime/pagination";
import type { ColumnFilters, SortRule } from "../../core/collectionControls";
import {
  appendRuntimeCollectionFilters,
  appendRuntimeCollectionSortRules,
  appendRuntimeSelectedRowKeys
} from "../../report/runtimeCollectionQuery";

type ServicePrincipalRuntimeResponse = LocalReportPaginatedCollection<"entra.servicePrincipals", ServicePrincipal>;

type ManagedIdentityRuntimeResponse = LocalReportPaginatedCollection<"entra.managedIdentities", ManagedIdentity>;

type ResourceGroupRuntimeResponse = LocalReportPaginatedCollection<
  "azureResources.resourceGroupOwnership",
  ResourceGroupOwnershipRow
>;

type AzureRbacRuntimeResponse = LocalReportPaginatedCollection<"azureRbac", AzureRbac>;

export type EntraPrincipalPermissionsResponse = {
  principalId: string;
  oauth2PermissionGrants: EntraOAuth2PermissionGrant[];
  appRoleAssignments: EntraAppRoleAssignment[];
};

type ZeroTrustAssessmentRuntimeResponse = ZtaReport &
  PaginatedCollection<"zeroTrustAssessment.report", ZtaReport["Tests"]>;

const remotePageSize = 20;

export type CsvExportSelection = {
  filters: ColumnFilters;
  selectAllMatchingFilters: boolean;
  selectedRowKeys: string[];
  sortRules?: SortRule[];
};

export async function readServicePrincipals({
  filters,
  page,
  signal,
  sortRules
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
  sortRules: SortRule[];
}): Promise<ServicePrincipalRuntimeResponse> {
  const url = new URL("/api/data/entra/servicePrincipals", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(remotePageSize));
  appendRuntimeCollectionFilters(url, filters);
  appendRuntimeCollectionSortRules(url, sortRules);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Service principals read failed: ${response.status}`);
  }

  return (await response.json()) as ServicePrincipalRuntimeResponse;
}

export async function readManagedIdentities({
  filters,
  page,
  signal,
  sortRules
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
  sortRules: SortRule[];
}): Promise<ManagedIdentityRuntimeResponse> {
  const url = new URL("/api/data/entra/managedIdentities", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(remotePageSize));
  appendRuntimeCollectionFilters(url, filters);
  appendRuntimeCollectionSortRules(url, sortRules);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Managed identities read failed: ${response.status}`);
  }

  return (await response.json()) as ManagedIdentityRuntimeResponse;
}

export async function readResourceGroups({
  filters,
  page,
  signal,
  sortRules
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
  sortRules: SortRule[];
}): Promise<ResourceGroupRuntimeResponse> {
  const url = new URL("/api/data/azureResources/resourceGroupOwnership", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(remotePageSize));
  appendRuntimeCollectionFilters(url, filters);
  appendRuntimeCollectionSortRules(url, sortRules);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Resource groups read failed: ${response.status}`);
  }

  return (await response.json()) as ResourceGroupRuntimeResponse;
}

export async function exportServicePrincipalsCsv(selection: CsvExportSelection): Promise<void> {
  await downloadRuntimeCsv("/api/data/entra/servicePrincipals", selection, "Service principals CSV export failed");
}

export async function exportManagedIdentitiesCsv(selection: CsvExportSelection): Promise<void> {
  await downloadRuntimeCsv("/api/data/entra/managedIdentities", selection, "Managed identities CSV export failed");
}

export async function exportResourceGroupsCsv(selection: CsvExportSelection): Promise<void> {
  await downloadRuntimeCsv(
    "/api/data/azureResources/resourceGroupOwnership",
    selection,
    "Resource groups CSV export failed"
  );
}

export async function exportRemediationPackageTasksCsv(
  packageId: string,
  selection: CsvExportSelection
): Promise<void> {
  await downloadRuntimeCsv(
    `/api/data/remediationPackages/tasks?id=${encodeURIComponent(packageId)}`,
    selection,
    "Remediation package tasks CSV export failed"
  );
}

export async function readAzureRbac({
  filters,
  page,
  servicePrincipalId,
  signal,
  sortRules
}: {
  filters: ColumnFilters;
  page: number;
  servicePrincipalId: string;
  signal: AbortSignal;
  sortRules: SortRule[];
}): Promise<AzureRbacRuntimeResponse> {
  const url = new URL("/api/data/azureRbac", window.location.origin);
  url.searchParams.set("servicePrincipalId", servicePrincipalId);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(remotePageSize));
  appendRuntimeCollectionFilters(url, filters);
  appendRuntimeCollectionSortRules(url, sortRules);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Azure RBAC read failed: ${response.status}`);
  }

  return (await response.json()) as AzureRbacRuntimeResponse;
}

export async function readEntraPermissions({
  principalId,
  signal
}: {
  principalId: string;
  signal: AbortSignal;
}): Promise<EntraPrincipalPermissionsResponse> {
  const url = new URL("/api/data/entra/permissions", window.location.origin);
  url.searchParams.set("principalId", principalId);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Entra API permissions read failed: ${response.status}`);
  }

  return (await response.json()) as EntraPrincipalPermissionsResponse;
}

export async function readZeroTrustAssessmentReport({
  filters = {},
  page,
  pageSize = remotePageSize,
  signal,
  sortRules = []
}: {
  filters?: ColumnFilters;
  page?: number;
  pageSize?: number;
  signal: AbortSignal;
  sortRules?: SortRule[];
}): Promise<ZeroTrustAssessmentRuntimeResponse> {
  const url = new URL("/api/data/zeroTrustAssessment/report", window.location.origin);
  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }
  if (pageSize !== undefined) {
    url.searchParams.set("count", String(pageSize));
  }
  appendRuntimeCollectionFilters(url, filters);
  appendRuntimeCollectionSortRules(url, sortRules);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Zero Trust Assessment report read failed: ${response.status}`);
  }

  return (await response.json()) as ZeroTrustAssessmentRuntimeResponse;
}

export async function createZeroTrustAssessmentRemediationPackage(
  request: CreateRuntimeRemediationPackageRequest
): Promise<CreateRuntimeRemediationPackageResponse> {
  const response = await fetch("/api/data/zeroTrustAssessment/remediationPackages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Zero Trust Assessment remediation package creation failed: ${response.status}`);
  }

  return readJsonResponse<CreateRuntimeRemediationPackageResponse>(
    response,
    "/api/data/zeroTrustAssessment/remediationPackages",
    "Zero Trust Assessment remediation package creation failed"
  );
}

export async function readRemediationPackage(packageId: string): Promise<RemediationPackage> {
  const url = new URL("/api/data/remediationPackages", window.location.origin);
  url.searchParams.set("id", packageId);

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(`Remediation package read failed: ${response.status}`);
  }

  return readJsonResponse<RemediationPackage>(response, `${url.pathname}${url.search}`, "Remediation package read failed");
}

export async function deleteRemediationTasks(
  request: DeleteRuntimeRemediationTasksRequest
): Promise<RemediationPackage> {
  const response = await fetch("/api/data/remediationPackages/tasks", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Remediation task deletion failed: ${response.status}`);
  }

  return readJsonResponse<RemediationPackage>(
    response,
    "/api/data/remediationPackages/tasks",
    "Remediation task deletion failed"
  );
}

export async function updateDisabledOwnerEvidence({
  key,
  disabled
}: {
  key: string;
  disabled: boolean;
}): Promise<void> {
  const url = new URL("/api/data/azureResources/resourceGroupOwnership/disabledEvidence", window.location.origin);
  url.searchParams.set("key", key);
  url.searchParams.set("disabled", String(disabled));

  const response = await fetch(`${url.pathname}${url.search}`);
  if (!response.ok) {
    throw new Error(`Owner candidate update failed: ${response.status}`);
  }
}

async function readJsonResponse<T>(response: Response, requestPath: string, failurePrefix: string): Promise<T> {
  const contentType = response.headers?.get("Content-Type") ?? "";

  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${failurePrefix}: expected JSON from ${requestPath} but received ${contentType}.`);
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new Error(
      `${failurePrefix}: could not parse JSON from ${requestPath}: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`,
      { cause: error }
    );
  }
}

async function downloadRuntimeCsv(path: string, selection: CsvExportSelection, failurePrefix: string): Promise<void> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("format", "csv");
  appendRuntimeCollectionFilters(url, selection.filters);
  appendRuntimeCollectionSortRules(url, selection.sortRules ?? []);

  if (!selection.selectAllMatchingFilters) {
    appendRuntimeSelectedRowKeys(url, selection.selectedRowKeys);
  }

  const requestPath = `${url.pathname}${url.search}`;
  const response = await fetch(requestPath);
  if (!response.ok) {
    throw new Error(`${failurePrefix}: ${response.status}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = getDownloadFileName(response, "ownerlens-export.csv");
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function getDownloadFileName(response: Response, fallback: string): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = /filename="([^"]+)"/.exec(disposition);

  return fileNameMatch?.[1] ?? fallback;
}
