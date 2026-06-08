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
      return jsonResponse(ztaReport);
    }

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 50,
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
            publisherName: null,
            replyUrls: [],
            roleAssignments: [],
            oauthPemrissionsCount: 0,
            appRolesPermissionCount: 0,
            isAllParticipant: false,
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
      pageSize: 50,
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
      return jsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: [
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
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 1,
      page: 1,
      pageSize: 50,
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
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          oauthPemrissionsCount: 0,
          appRolesPermissionCount: 0,
          isAllParticipant: false,
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
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function getInput(label: string): HTMLInputElement {
  const input = [...document.querySelectorAll("input")].find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${label}.`);
  }

  return input;
}
