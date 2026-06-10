/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ZtaReport } from "../../core/azure/ztaReport";
import { AzureComponent } from "./AzureComponent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  document.body.innerHTML = "";
});

test("opens related managed identity from Zero Trust Assessment with an Object ID filter", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      return zeroTrustAssessmentJsonResponse(ztaReport);
    }

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accountEnabled: true,
            appDisplayName: null,
            appId: "mi-client-id",
            appOwnerOrganizationId: null,
            azureRbac: "No Azure RBAC assignments",
            displayName: "uami-prod",
            homepage: null,
            id: "mi-object-id",
            loginUrl: null,
            managedIdentityAssignments: [],
            permissionRisk: "none",
            rbacRoleAssignmentCount: 0,
            rbacRoleLevel: "none",
            rbacSubscriptionCount: 0,
            publisherName: null,
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
            tags: []
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 0,
      page: 1,
      pageSize: 20,
      rows: []
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await clickButton("Zero Trust Assessment");
  await waitForText(container, "Managed identity exposure");

  await clickButton("Open related object mi-object-id");
  await waitForText(container, "uami-prod");

  const managedIdentityRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .reverse()
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/managedIdentities"));
  expect(managedIdentityRequest).toBeDefined();

  const url = new URL(managedIdentityRequest ?? "", window.location.origin);
  expect(url.searchParams.get("filter[0][column]")).toBe("id");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("mi-object-id");

  act(() => root.unmount());
});

test("opens Zero Trust Assessment filtered by related object from a principal ZTA badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      const tests: ZtaReport["Tests"] = [
        {
          TestId: "zta-sp-1",
          TestStatus: "Failed",
          TestTitle: "Service principal exposure",
          RelatedObjects: [{ id: "sp-object-id", servicePrincipalType: "Application" }]
        },
        {
          TestId: "zta-other-1",
          TestStatus: "Failed",
          TestTitle: "Unrelated exposure",
          RelatedObjects: [{ id: "other-object-id", servicePrincipalType: "Application" }]
        }
      ];
      const url = new URL(requestUrl, window.location.origin);
      const relatedObjectFilter = url.searchParams.get("filter[0][value][0]");
      const filteredTests = relatedObjectFilter
        ? tests.filter((test) => JSON.stringify(test).includes(relatedObjectFilter))
        : tests;

      return zeroTrustAssessmentJsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: filteredTests
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 1,
      page: 1,
      pageSize: 20,
      rows: [
        {
          accountEnabled: true,
          appDisplayName: "Service principal app",
          appId: "sp-client-id",
          appOwnerOrganizationId: null,
          azureRbac: "No Azure RBAC assignments",
          displayName: "Service principal app",
          homepage: null,
          id: "sp-object-id",
          loginUrl: null,
          permissionRisk: "none",
          rbacRoleAssignmentCount: 0,
          rbacRoleLevel: "none",
          rbacSubscriptionCount: 0,
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          oauthPemrissionsCount: 0,
          appRolesPermissionCount: 0,
          entraPermissionRisk: "none",
          servicePrincipalNames: [],
          servicePrincipalType: "Application",
          potentialOwners: [],
          ownerConfidence: "none",
          tags: [],
          ztaMaxRisk: "high",
          ztaRemediationCountAll: 3,
          ztaRemediationFailedCount: 1
        }
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ZTA remediations 1/3");
  await waitForText(container, "Service principal exposure");

  expect(getInput("Filter Related objects").value).toBe("sp-object-id");
  expect(container.textContent).toContain("Service principal exposure");
  expect(container.textContent).not.toContain("Unrelated exposure");

  act(() => root.unmount());
});

test("opens Azure RBAC tab for the selected service principal from its RBAC badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/azureRbac")) {
      return jsonResponse({
        collectionId: "azureRbac",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accessDisplayName: "Owner on subscription Platform",
            accessResourceGroup: null,
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1",
            accessScopeType: "Subscription",
            accessSubscriptionId: "sub-1",
            canDelegate: false,
            condition: null,
            conditionVersion: null,
            principalDisplayName: "Service principal app",
            principalId: "sp-object-id",
            principalType: "ServicePrincipal",
            roleAssignmentId: "assignment-1",
            roleDefinitionId: "owner-role-id",
            roleDefinitionName: "Owner",
            scope: "/subscriptions/sub-1",
            scopeSubscriptionId: "sub-1",
            servicePrincipalId: "sp-object-id",
            signInName: null,
            subscriptionId: "sub-1",
            subscriptionName: "Platform"
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 1,
      page: 1,
      pageSize: 20,
      rows: [
        {
          accountEnabled: true,
          appDisplayName: "Service principal app",
          appId: "sp-client-id",
          appOwnerOrganizationId: null,
          azureRbac: "Owner on subscription Platform",
          displayName: "Service principal app",
          homepage: null,
          id: "sp-object-id",
          loginUrl: null,
          permissionRisk: "high",
          rbacRoleAssignmentCount: 1,
          rbacRoleLevel: "high",
          rbacSubscriptionCount: 1,
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          oauthPemrissionsCount: 0,
          appRolesPermissionCount: 0,
          entraPermissionRisk: "none",
          servicePrincipalNames: [],
          servicePrincipalType: "Application",
          potentialOwners: [],
          ownerConfidence: "none",
          tags: [],
          ztaMaxRisk: "none",
          ztaRemediationCountAll: 0,
          ztaRemediationFailedCount: 0
        }
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open Azure RBAC assignments 1/1");
  await waitForText(container, "Owner on subscription Platform");

  expect(getButton("Service principal app")).toBeDefined();

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();

  const url = new URL(azureRbacRequest ?? "", window.location.origin);
  expect(url.searchParams.get("servicePrincipalId")).toBe("sp-object-id");

  await clickButton("Close Service principal app Azure RBAC tab");
  await waitFor(() => {
    expect(queryButton("Close Service principal app Azure RBAC tab")).toBeNull();
    expect(container.textContent).not.toContain("Owner on subscription Platform");
  });

  act(() => root.unmount());
});

test("opens Entra permissions tab for the selected service principal from its permissions badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/permissions")) {
      return jsonResponse({
        principalId: "sp-object-id",
        oauth2PermissionGrants: [
          {
            id: "grant-1",
            clientId: "sp-object-id",
            consentType: "AllPrincipals",
            principalId: null,
            resourceId: "graph-sp-id",
            scope: "User.Read Directory.Read.All"
          }
        ],
        appRoleAssignments: [
          {
            id: "app-role-assignment-1",
            appRoleId: "role-1",
            appRoleDisplayName: "Read directory data",
            appRoleValue: "Directory.Read.All",
            principalId: "sp-object-id",
            principalDisplayName: "Service principal app",
            resourceId: "graph-sp-id",
            resourceDisplayName: "Microsoft Graph"
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 1,
      page: 1,
      pageSize: 20,
      rows: [
        {
          accountEnabled: true,
          appDisplayName: "Service principal app",
          appId: "sp-client-id",
          appOwnerOrganizationId: null,
          azureRbac: "No Azure RBAC assignments",
          displayName: "Service principal app",
          homepage: null,
          id: "sp-object-id",
          loginUrl: null,
          permissionRisk: "high",
          rbacRoleAssignmentCount: 0,
          rbacRoleLevel: "none",
          rbacSubscriptionCount: 0,
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          oauthPemrissionsCount: 2,
          appRolesPermissionCount: 1,
          entraPermissionRisk: "high",
          servicePrincipalNames: [],
          servicePrincipalType: "Application",
          potentialOwners: [],
          ownerConfidence: "none",
          tags: [],
          ztaMaxRisk: "none",
          ztaRemediationCountAll: 0,
          ztaRemediationFailedCount: 0
        }
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open Entra permissions 2/1");
  await waitForText(container, "User.Read Directory.Read.All");
  await waitForText(container, "Read directory data");

  expect(getButton("Service principal app permissions")).toBeDefined();

  const permissionsRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/permissions"));
  expect(permissionsRequest).toBeDefined();

  const url = new URL(permissionsRequest ?? "", window.location.origin);
  expect(url.searchParams.get("principalId")).toBe("sp-object-id");

  await clickButton("Close Service principal app Entra permissions tab");
  await waitFor(() => {
    expect(queryButton("Close Service principal app Entra permissions tab")).toBeNull();
    expect(container.textContent).not.toContain("User.Read Directory.Read.All");
  });

  act(() => root.unmount());
});

test("opens Azure RBAC tab for the selected managed identity from its RBAC badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/azureRbac")) {
      return jsonResponse({
        collectionId: "azureRbac",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accessDisplayName: "Contributor on resource group rg-app",
            accessResourceGroup: "rg-app",
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1/resourceGroups/rg-app",
            accessScopeType: "ResourceGroup",
            accessSubscriptionId: "sub-1",
            canDelegate: false,
            condition: null,
            conditionVersion: null,
            principalDisplayName: "uami-prod",
            principalId: "mi-object-id",
            principalType: "ServicePrincipal",
            roleAssignmentId: "assignment-mi-1",
            roleDefinitionId: "contributor-role-id",
            roleDefinitionName: "Contributor",
            scope: "/subscriptions/sub-1/resourceGroups/rg-app",
            scopeResourceGroup: "rg-app",
            scopeSubscriptionId: "sub-1",
            servicePrincipalId: "mi-object-id",
            signInName: null,
            subscriptionId: "sub-1",
            subscriptionName: "Platform"
          }
        ]
      });
    }

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accountEnabled: true,
            appDisplayName: null,
            appId: "mi-client-id",
            appOwnerOrganizationId: null,
            assignedResourceGroups: ["rg-app"],
            azureRbac: "Contributor on resource group rg-app",
            displayName: "uami-prod",
            homepage: null,
            id: "mi-object-id",
            entraPermissionRisk: "none",
            loginUrl: null,
            managedIdentityAssignments: [],
            oauthPemrissionsCount: 0,
            appRolesPermissionCount: 0,
            ownerConfidence: "none",
            permissionRisk: "medium",
            potentialOwners: [],
            publisherName: null,
            rbacRoleAssignmentCount: 2,
            rbacRoleLevel: "medium",
            rbacSubscriptionCount: 1,
            replyUrls: [],
            roleAssignments: [],
            servicePrincipalNames: [],
            servicePrincipalType: "ManagedIdentity",
            tags: [],
            ztaMaxRisk: "none",
            ztaRemediationCountAll: 0,
            ztaRemediationFailedCount: 0
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 0,
      page: 1,
      pageSize: 20,
      rows: []
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await clickButton("Managed identities");
  await waitForText(container, "uami-prod");
  await clickButton("Open Azure RBAC assignments 2/1");
  await waitForText(container, "Contributor on resource group rg-app");

  expect(getButton("uami-prod")).toBeDefined();

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();

  const url = new URL(azureRbacRequest ?? "", window.location.origin);
  expect(url.searchParams.get("servicePrincipalId")).toBe("mi-object-id");

  act(() => root.unmount());
});

const ztaReport: ZtaReport = {
  Meta: {
    TenantId: "tenant-1",
    TenantName: "Example Tenant"
  },
  Tests: [
    {
      TestId: "zta-1",
      TestStatus: "Completed",
      TestTitle: "Managed identity exposure",
      RelatedObjects: [
        {
          id: "mi-object-id",
          servicePrincipalType: "ManagedIdentity"
        }
      ]
    }
  ]
};

function jsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200
  } as Response;
}

function zeroTrustAssessmentJsonResponse(body: ZtaReport): Response {
  return jsonResponse({
    collectionId: "zeroTrustAssessment.report",
    rows: body.Tests,
    columns: [],
    page: 1,
    pageSize: 20,
    count: body.Tests.length,
    ...body
  });
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
    const button = getButton(label);
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    button.click();
  });
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

function getButton(label: string): HTMLButtonElement {
  const button = queryButton(label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function queryButton(label: string): HTMLButtonElement | null {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );

  return button instanceof HTMLButtonElement ? button : null;
}

function getInput(label: string): HTMLInputElement {
  const input = [...document.querySelectorAll("input")].find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${label}.`);
  }

  return input;
}
