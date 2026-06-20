/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AzureInventoryStats } from "./AzureInventoryStats";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

test("renders imported Azure and Entra inventory counters", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      users: 12,
      groups: 4,
      servicePrincipals: 1234,
      managedIdentities: 9,
      resourceGroups: 42,
      rbacAssignments: 321
    })
  );

  const { container, root } = renderComponent(<AzureInventoryStats />);

  await waitForText(container, "1,234");
  expect(container.textContent).toContain("Users");
  expect(container.textContent).toContain("Groups");
  expect(container.textContent).toContain("SP");
  expect(container.textContent).toContain("MI");
  expect(container.textContent).toContain("RG");
  expect(container.textContent).toContain("RBAC");
  expect(globalThis.fetch).toHaveBeenCalledWith("/api/data/runtime/stats", expect.any(Object));

  act(() => root.unmount());
});

test("renders a compact error state when stats cannot be read", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    response({ ok: false, status: 500, body: "error" })
  );

  const { container, root } = renderComponent(<AzureInventoryStats />);

  await waitForText(container, "Stats unavailable");

  act(() => root.unmount());
});

function jsonResponse(body: unknown): Response {
  return response({
    body,
    ok: true,
    status: 200
  });
}

function response({ body, ok, status }: { body: unknown; ok: boolean; status: number }): Response {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null)
    },
    json: () => Promise.resolve(body),
    ok,
    status
  } as Response;
}

function renderComponent(component: React.ReactNode): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return { container, root };
}

async function waitForText(container: HTMLElement, text: string): Promise<void> {
  await waitFor(() => {
    expect(container.textContent).toContain(text);
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  const timeoutAt = Date.now() + 2000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
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
