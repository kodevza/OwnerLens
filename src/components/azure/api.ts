import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";
import type { ResourceGroupOwnershipRow } from "../../core/azure/resources";
import type { ZtaReport } from "../../core/azure/ztaReport";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import { appendRuntimeCollectionFilters } from "../../report/runtimeCollectionQuery";

type ServicePrincipalRuntimeResponse = {
  collectionId: "entra.servicePrincipals";
  rows: ServicePrincipal[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

type ManagedIdentityRuntimeResponse = {
  collectionId: "entra.managedIdentities";
  rows: ManagedIdentity[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

type ResourceGroupRuntimeResponse = {
  collectionId: "azureResources.resourceGroupOwnership";
  rows: ResourceGroupOwnershipRow[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

type ZeroTrustAssessmentRuntimeResponse = ZtaReport & {
  collectionId: "zeroTrustAssessment.report";
  rows: ZtaReport["Tests"];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

const pageSize = 50;

export async function readServicePrincipals({
  filters,
  page,
  signal
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
}): Promise<ServicePrincipalRuntimeResponse> {
  const url = new URL("/api/data/entra/servicePrincipals", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(pageSize));
  appendRuntimeCollectionFilters(url, filters);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Service principals read failed: ${response.status}`);
  }

  return (await response.json()) as ServicePrincipalRuntimeResponse;
}

export async function readManagedIdentities({
  filters,
  page,
  signal
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
}): Promise<ManagedIdentityRuntimeResponse> {
  const url = new URL("/api/data/entra/managedIdentities", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(pageSize));
  appendRuntimeCollectionFilters(url, filters);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Managed identities read failed: ${response.status}`);
  }

  return (await response.json()) as ManagedIdentityRuntimeResponse;
}

export async function readResourceGroups({
  filters,
  page,
  signal
}: {
  filters: ColumnFilters;
  page: number;
  signal: AbortSignal;
}): Promise<ResourceGroupRuntimeResponse> {
  const url = new URL("/api/data/azureResources/resourceGroupOwnership", window.location.origin);
  url.searchParams.set("page", String(page));
  url.searchParams.set("count", String(pageSize));
  appendRuntimeCollectionFilters(url, filters);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Resource groups read failed: ${response.status}`);
  }

  return (await response.json()) as ResourceGroupRuntimeResponse;
}

export async function readZeroTrustAssessmentReport({
  filters = {},
  page,
  pageSize,
  signal
}: {
  filters?: ColumnFilters;
  page?: number;
  pageSize?: number;
  signal: AbortSignal;
}): Promise<ZeroTrustAssessmentRuntimeResponse> {
  const url = new URL("/api/data/zeroTrustAssessment/report", window.location.origin);
  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }
  if (pageSize !== undefined) {
    url.searchParams.set("count", String(pageSize));
  }
  appendRuntimeCollectionFilters(url, filters);

  const response = await fetch(`${url.pathname}${url.search}`, { signal });
  if (!response.ok) {
    throw new Error(`Zero Trust Assessment report read failed: ${response.status}`);
  }

  return (await response.json()) as ZeroTrustAssessmentRuntimeResponse;
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
