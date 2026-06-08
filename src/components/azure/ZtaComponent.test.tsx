/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ZtaReport } from "../../core/azure/ztaReport";
import { ZtaComponent } from "./ZtaComponent";

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

test("loads Zero Trust Assessment report metadata and tests", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      Meta: {
        Account: "admin@example.test",
        CurrentVersion: "1.0.0",
        Domain: "example.test",
        ExecutedAt: "2026-06-02T16:06:31.3057648+02:00",
        LatestVersion: "1.1.0",
        TenantId: "tenant-1",
        TenantName: "Example Tenant",
        TestResultSummary: {
          Failed: 1,
          Passed: 1
        }
      },
      Tests: [
        {
          TestCategory: "Identity",
          TestId: "21791",
          TestImpact: "High security impact",
          TestImplementationCost: "Low",
          TestMinimumLicense: ["Free"],
          TestPillar: "Identity",
          TestResult: "Failed",
          TestRisk: "High",
          RelatedObjects: [
            {
              id: "related-object-1"
            },
            {
              object_id: "related-object-2"
            }
          ],
          TestStatus: "Completed",
          TestTags: ["mfa", "identity"],
          TestTitle: "Require MFA for administrators"
        },
        {
          SkippedReason: "Feature disabled",
          TestCategory: "Devices",
          TestId: 21823,
          TestPillar: "Endpoint",
          TestResult: "Skipped",
          TestRisk: "Medium",
          TestStatus: "Skipped",
          TestTitle: "Require compliant devices"
        }
      ]
    })
  );
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  expect(container.textContent).toContain("Loading Zero Trust Assessment report...");

  await waitForText(container, "Require MFA for administrators");

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/data/zeroTrustAssessment/report");
  expect(getButton("Sort by Test ID").textContent).toContain("Test ID");
  expect(getButton("Sort by Related objects").textContent).toContain("Related objects");
  expect(getButton("Sort by Risk").textContent).toContain("Risk");
  expect(queryButton("Sort by Result")).toBeNull();
  expect(container.textContent).toContain("Example Tenant");
  expect(container.textContent).toContain("21791");
  expect(container.textContent).toContain("Completed");
  expect(container.textContent).toContain("related-object-1");
  expect(container.textContent).toContain("related-object-2");
  expect(container.textContent).toContain("High security impact");
  expect(container.textContent).toContain("Free");
  expect(container.textContent).toContain("mfa");
  expect(container.textContent).toContain("Feature disabled");

  act(() => root.unmount());
});

test("renders HTTP errors", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    ({
      ok: false,
      status: 500
    }) as Response
  );
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  await waitForText(container, "Zero Trust Assessment report read failed: 500");

  act(() => root.unmount());
});

function jsonResponse(body: ZtaReport): Response {
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
  const button = queryButton(label);
  if (!button) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function queryButton(label: string): HTMLButtonElement | null {
  const button = [...document.querySelectorAll("button")].find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!(button instanceof HTMLButtonElement)) {
    return null;
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
