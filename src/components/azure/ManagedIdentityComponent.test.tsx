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
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      collectionId: "entra.managedIdentities",
      columns: ["displayName", "permissionRisk", "azureRbac", "assignedResourceGroups", "accountEnabled", "id", "appId"],
      count: 1,
      page: 1,
      pageSize: 50,
      rows: [
        {
          accountEnabled: true,
          appDisplayName: null,
          appId: "client-1",
          appOwnerOrganizationId: null,
          azureRbac: "Contributor on rg/rg-app (write-capable role)",
          displayName: "uami-a",
          homepage: null,
          id: "principal-uami-1",
          loginUrl: null,
          managedIdentityAssignments: [],
          permissionRisk: "medium",
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          servicePrincipalNames: [],
          servicePrincipalType: "ManagedIdentity",
          assignedResourceGroups: ["rg-app"],
          tags: []
        }
      ]
    })
  );
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ManagedIdentityComponent />);

  await waitForText(container, "uami-a");

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/data/entra/managedIdentities?page=1&count=50");
  expect(getButton("Sort by Risk").textContent).toContain("Risk");
  expect(container.textContent).toContain("medium");
  expect(container.textContent).toContain("Contributor on rg/rg-app");
  expect(container.textContent).toContain("rg-app");

  act(() => root.unmount());
});

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

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll("button")].find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
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
