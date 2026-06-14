/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ManagedIdentityComponent } from "./ManagedIdentityComponent";
import type { ManagedIdentity } from "../../core/azure/entra/managedIdentity";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type ManagedIdentityResponse = {
  collectionId: "entra.managedIdentities";
  rows: ManagedIdentity[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  document.body.innerHTML = "";
});

test("loads managed identities with runtime risk enrichment", async () => {
  const mediumIdentity = managedIdentity({
    appId: "client-1",
    azureRbac: "Contributor on rg/rg-app (write-capable role)",
    displayName: "uami-a",
    id: "principal-uami-1",
    permissionRisk: "medium",
    rbacRoleAssignmentCount: 1,
    rbacRoleLevel: "medium",
    rbacSubscriptionCount: 1,
    ztaRemediationCountAll: 3,
    ztaRemediationFailedCount: 1,
    ztaMaxRisk: "medium",
    oauthPemrissionsCount: 1,
    appRolesPermissionCount: 2,
    entraPermissionRisk: "high",
    assignedResourceGroups: ["rg-app"],
    potentialOwners: ["alice@example.test"],
    ownerConfidence: "high",
    tags: ["ownerlens", "managed-identity"]
  });
  const highIdentity = managedIdentity({
    appId: "client-2",
    azureRbac: "Owner on subscription (privileged role)",
    displayName: "uami-high",
    id: "principal-uami-2",
    permissionRisk: "high",
    rbacRoleAssignmentCount: 2,
    rbacRoleLevel: "high",
    rbacSubscriptionCount: 1
  });
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const url = new URL(String(input), window.location.origin);
    const filters = readFilterQuery(url);

    if (filters.rbacRoleLevel?.includes("high")) {
      return jsonResponse(collection([highIdentity], { count: 1 }));
    }

    if (filters.entraPermissionRisk?.includes("high")) {
      return jsonResponse(collection([mediumIdentity], { count: 1 }));
    }

    if (filters.ztaMaxRisk?.includes("medium")) {
      return jsonResponse(collection([mediumIdentity], { count: 1 }));
    }

    return jsonResponse(collection([mediumIdentity, highIdentity], { count: 2 }));
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ManagedIdentityComponent />);

  await waitForText(container, "uami-a");

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/data/entra/managedIdentities?page=1&count=20");
  expect(getButton("Sort by Risk").textContent).toContain("Risk");
  expect(getButton("Sort by ZTA remediations").textContent).toContain("ZTA remediations");
  expect(getButton("Sort by Entra API permissions").textContent).toContain("Entra API permissions");
  expect(getButton("Sort by Tags").textContent).toContain("Tags");
  expect(container.textContent).toContain("1/2");
  expect(container.textContent).toContain("1/3");
  expect(document.querySelector("[title='Contributor on rg/rg-app (write-capable role)']")).toBeDefined();
  expect(container.textContent).toContain("rg-app");
  expect(container.textContent).toContain("alice@example.test");
  expect(container.textContent).toContain("high");
  expect(container.textContent).toContain("ownerlens");
  expect(container.textContent).toContain("managed-identity");

  await openValueFilter("Filter Azure RBAC");
  await toggleCheckbox("high", true);
  await waitFor(() => {
    expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bcolumn%5D=rbacRoleLevel");
  });
  expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=high");
  await waitForText(container, "uami-high");
  expect(container.textContent).not.toContain("uami-a");

  await clearValueFilter("Filter Azure RBAC");
  await waitForText(container, "uami-a");

  await openValueFilter("Filter Entra API permissions");
  await toggleCheckbox("high", true);
  await waitFor(() => {
    expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bcolumn%5D=entraPermissionRisk");
  });
  expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=high");
  await waitForText(container, "uami-a");
  expect(container.textContent).not.toContain("uami-high");

  await clearValueFilter("Filter Entra API permissions");
  await waitForText(container, "uami-high");

  await openValueFilter("Filter ZTA remediations");
  await toggleCheckbox("medium", true);
  await waitFor(() => {
    expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bcolumn%5D=ztaMaxRisk");
  });
  expect(lastFetchUrl(fetchMock)).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=medium");
  await waitForText(container, "uami-a");
  expect(container.textContent).not.toContain("uami-high");

  act(() => root.unmount());
});

const columns = [
  "displayName",
  "permissionRisk",
  "ztaRemediationCountAll",
  "ztaRemediationFailedCount",
  "ztaMaxRisk",
  "azureRbac",
  "oauthPemrissionsCount",
  "appRolesPermissionCount",
  "entraPermissionRisk",
  "assignedResourceGroups",
  "potentialOwners",
  "ownerConfidence",
  "accountEnabled",
  "id",
  "appId",
  "tags"
];

function managedIdentity(input: Partial<ManagedIdentity> & Pick<ManagedIdentity, "id" | "appId" | "displayName">): ManagedIdentity {
  return {
    accountEnabled: true,
    appDisplayName: null,
    appOwnerOrganizationId: null,
    azureRbac: "No Azure RBAC assignments",
    homepage: null,
    loginUrl: null,
    managedIdentityAssignments: [],
    permissionRisk: "none",
    publisherName: null,
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none",
    rbacSubscriptionCount: 0,
    replyUrls: [],
    roleAssignments: [],
    oauthPemrissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none",
    servicePrincipalNames: [],
    servicePrincipalType: "ManagedIdentity",
    assignedResourceGroups: [],
    potentialOwners: [],
    ownerConfidence: "none",
    tags: [],
    ztaMaxRisk: "none",
    ztaRemediationCountAll: 0,
    ztaRemediationFailedCount: 0,
    ...input
  } as ManagedIdentity;
}

function collection(rows: ManagedIdentity[], { count }: { count: number }): ManagedIdentityResponse {
  return {
    collectionId: "entra.managedIdentities",
    columns,
    count,
    page: 1,
    pageSize: 20,
    rows
  };
}

function jsonResponse(body: ManagedIdentityResponse): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200
  } as Response;
}

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

async function clickButton(label: string) {
  await act(async () => {
    getButton(label).click();
  });
}

async function openValueFilter(label: string) {
  await clickButton(label);
  await waitForText(document.body, "Clear");
}

async function clearValueFilter(label: string) {
  if (!findButton("Clear")) {
    await openValueFilter(label);
  }

  await clickButton("Clear");
}

async function toggleCheckbox(label: string, checked: boolean) {
  const checkbox = getCheckbox(label);

  if (checkbox.checked === checked) {
    return;
  }

  await act(async () => {
    checkbox.click();
  });
}

function getButton(label: string): HTMLButtonElement {
  const button = findButton(label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((candidate): candidate is HTMLButtonElement => {
    if (!(candidate instanceof HTMLButtonElement)) {
      return false;
    }

    return candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label;
  });
}

function getCheckbox(label: string): HTMLInputElement {
  const labelElement = [...document.querySelectorAll("label")].find((element) => element.textContent?.trim() === label);
  const checkbox = labelElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) {
    throw new Error(`Could not find checkbox: ${label}`);
  }

  return checkbox;
}

function readFilterQuery(url: URL): Record<string, string[]> {
  const filters: Record<string, string[]> = {};

  for (let index = 0; ; index += 1) {
    const column = url.searchParams.get(`filter[${index}][column]`);
    if (!column) {
      return filters;
    }

    filters[column] = url.searchParams.getAll(`filter[${index}][value][0]`);
  }
}

function lastFetchUrl(fetchMock: jest.Mock<Promise<Response>, Parameters<typeof fetch>>): string {
  const lastCall = fetchMock.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error("Expected fetch to have been called.");
  }

  return String(lastCall[0]);
}

async function waitForText(container: HTMLElement, text: string) {
  await waitFor(() => {
    expect(container.textContent).toContain(text);
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }

  throw lastError;
}
