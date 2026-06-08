/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ServicePrincipalComponent } from "./ServicePrincipalComponent";
import type { ServicePrincipal } from "../../core/azure/entra/servicePrincipal";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type ServicePrincipalResponse = {
  collectionId: "entra.servicePrincipals";
  rows: ServicePrincipal[];
  columns: string[];
  page: number;
  pageSize: number;
  count: number;
};

const columns = [
  "displayName",
  "servicePrincipalType",
  "permissionRisk",
  "azureRbac",
  "accountEnabled",
  "id",
  "appId",
  "appDisplayName",
  "publisherName",
  "tags"
];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  document.body.innerHTML = "";
});

test("loads service principals through the full table UI and sends filters and pagination to HTTP", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);
    const url = new URL(requestUrl, window.location.origin);
    const page = Number(url.searchParams.get("page") ?? "1");
    const filters = readFilterQuery(url);

    if (filters.displayName?.[0] === "Payroll") {
      return jsonResponse(collection([payrollApi], { page, count: 1 }));
    }

    if (filters.servicePrincipalType?.includes("Application")) {
      return jsonResponse(collection([graphApi, payrollApi], { page: 1, count: 2 }));
    }

    if (filters.accountEnabled?.includes("false")) {
      return jsonResponse(collection([disabledLegacyApp], { page: 1, count: 1 }));
    }

    return jsonResponse(
      collection(page === 1 ? [graphApi, payrollApi] : [disabledLegacyApp], {
        page,
        count: 75
      })
    );
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ServicePrincipalComponent />);

  expect(container.textContent).toContain("Loading service principals...");

  await waitForText(container, "Microsoft Graph");

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/data/entra/servicePrincipals?page=1&count=50");
  expect(getButton("Sort by Display name").textContent).toContain("Display name");
  expect(getButton("Sort by Type").textContent).toContain("Type");
  expect(getButton("Sort by Risk").textContent).toContain("Risk");
  expect(getButton("Sort by Azure RBAC").textContent).toContain("Azure RBAC");
  expect(getButton("Sort by Enabled").textContent).toContain("Enabled");
  expect(getButton("Sort by Object ID").textContent).toContain("Object ID");
  expect(getButton("Sort by Client/App ID").textContent).toContain("Client/App ID");
  expect(getButton("Sort by App display name").textContent).toContain("App display name");
  expect(getButton("Sort by Publisher").textContent).toContain("Publisher");
  expect(getButton("Sort by Tags").textContent).toContain("Tags");
  expect(container.textContent).toContain("graph-sp-id");
  expect(container.textContent).toContain("high");
  expect(container.textContent).toContain("Owner on subscription");
  expect(container.textContent).toContain("payroll-client-id");
  expect(container.textContent).toContain("Microsoft");
  expect(container.textContent).toContain("finance");
  expect(container.textContent).toContain("Page 1 of 2");

  await changeInput("Filter Display name", "Payroll");
  await waitForRequestContaining("filter%5B0%5D%5Bcolumn%5D=displayName");
  expect(lastFetchUrl()).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=Payroll");
  await waitForText(container, "Payroll API");
  expect(container.textContent).not.toContain("Microsoft Graph");

  await changeInput("Filter Display name", "");
  await waitForText(container, "Microsoft Graph");

  await openValueFilter("Filter Type");
  await toggleCheckbox("Application", true);
  await waitForRequestContaining("filter%5B0%5D%5Bcolumn%5D=servicePrincipalType");
  expect(lastFetchUrl()).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=Application");
  expect(container.textContent).toContain("Microsoft Graph");
  expect(container.textContent).toContain("Payroll API");

  await clearValueFilter("Filter Type");
  await waitForText(container, "Page 1 of 2");

  await openValueFilter("Filter Enabled");
  await toggleCheckbox("false", true);
  await waitForRequestContaining("filter%5B0%5D%5Bcolumn%5D=accountEnabled");
  expect(lastFetchUrl()).toContain("filter%5B0%5D%5Bvalue%5D%5B0%5D=false");
  await waitForText(container, "Legacy disabled app");

  await clearValueFilter("Filter Enabled");
  await waitForText(container, "Page 1 of 2");

  await clickButton("Next");
  await waitForRequestContaining("page=2&count=50");
  await waitForText(container, "Legacy disabled app");
  expect(container.textContent).toContain("Page 2 of 2");

  act(() => root.unmount());

  function lastFetchUrl() {
    const lastCall = fetchMock.mock.calls.at(-1);
    if (!lastCall) {
      throw new Error("Expected fetch to have been called.");
    }

    return String(lastCall[0]);
  }

  async function waitForRequestContaining(part: string) {
    await waitFor(() => {
      expect(lastFetchUrl()).toContain(part);
    });
  }
});

const graphApi = servicePrincipal({
  accountEnabled: true,
  appDisplayName: "Microsoft Graph",
  appId: "graph-client-id",
  displayName: "Microsoft Graph",
  id: "graph-sp-id",
  azureRbac: "Owner on subscription (privileged role)",
  permissionRisk: "high",
  publisherName: "Microsoft",
  servicePrincipalType: "Application",
  tags: ["windowsAzureActiveDirectoryIntegratedApp"]
});

const payrollApi = servicePrincipal({
  accountEnabled: true,
  appDisplayName: "Payroll API",
  appId: "payroll-client-id",
  displayName: "Payroll API",
  id: "payroll-sp-id",
  publisherName: "Contoso",
  servicePrincipalType: "Application",
  tags: ["finance", "line-of-business"]
});

const disabledLegacyApp = servicePrincipal({
  accountEnabled: false,
  appDisplayName: "Legacy disabled app",
  appId: "legacy-client-id",
  displayName: "Legacy disabled app",
  id: "legacy-sp-id",
  publisherName: null,
  servicePrincipalType: "Legacy",
  tags: ["disabled"]
});

function servicePrincipal(input: Partial<ServicePrincipal> & Pick<ServicePrincipal, "id" | "appId" | "displayName">): ServicePrincipal {
  return {
    accountEnabled: true,
    appDisplayName: null,
    appOwnerOrganizationId: null,
    homepage: null,
    loginUrl: null,
    publisherName: null,
    replyUrls: [],
    servicePrincipalNames: [],
    servicePrincipalType: "Application",
    tags: [],
    permissionRisk: "none",
    azureRbac: "No Azure RBAC assignments",
    roleAssignments: [],
    ...input
  } as ServicePrincipal;
}

function collection(rows: ServicePrincipal[], { page, count }: { page: number; count: number }): ServicePrincipalResponse {
  return {
    collectionId: "entra.servicePrincipals",
    columns,
    count,
    page,
    pageSize: 50,
    rows
  };
}

function jsonResponse(body: ServicePrincipalResponse): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200
  } as Response;
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

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

async function changeInput(label: string, value: string) {
  const input = getInput(label);

  await act(async () => {
    setNativeInputValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

async function waitForText(container: HTMLElement, text: string) {
  await waitFor(() => {
    expect(container.textContent).toContain(text);
  });
}

async function waitFor(assertion: () => void) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function getInput(label: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`Could not find input: ${label}`);
  }

  return input;
}

function getButton(label: string): HTMLButtonElement {
  const button = findButton(label);
  if (!button) {
    throw new Error(`Could not find button: ${label}`);
  }

  return button;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.getAttribute("aria-label") === label || element.textContent?.trim() === label
  );
}

function getCheckbox(label: string): HTMLInputElement {
  const labelElement = [...document.querySelectorAll("label")].find((element) => element.textContent?.trim() === label);
  const checkbox = labelElement?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) {
    throw new Error(`Could not find checkbox: ${label}`);
  }

  return checkbox;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
}
