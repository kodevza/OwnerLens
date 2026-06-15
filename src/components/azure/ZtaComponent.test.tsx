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
              id: "related-object-1",
              displayName: "Privileged automation app"
            },
            {
              object_id: "related-object-2",
              displayName: "Break glass account"
            }
          ],
          RemediationPackages: [
            {
              id: "package-1",
              createdAt: "2026-06-12T10:00:00.000Z",
              taskCount: 2
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

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/data/zeroTrustAssessment/report?page=1&count=20");
  expect(getButton("Sort by Test ID").textContent).toContain("Test ID");
  expect(getButton("Sort by Related objects").textContent).toContain("Related objects");
  expect(getButton("Sort by Remediation packages").textContent).toContain("Remediation packages");
  expect(getButton("Sort by Risk").textContent).toContain("Risk");
  expect(queryButton("Sort by Result")).toBeNull();
  expect(queryButton("Sort by Skipped reason")).toBeNull();
  expect(getCheckbox("Select Zero Trust Assessment test 21791").checked).toBe(false);
  expect(container.textContent).toContain("Example Tenant");
  expect(container.textContent).toContain("21791");
  expect(container.textContent).toContain("Completed");
  expect(container.textContent).toContain("Privileged automation app");
  expect(container.textContent).toContain("Break glass account");
  expect(container.textContent).not.toContain("related-object-1");
  expect(container.textContent).not.toContain("related-object-2");
  expect(container.textContent).toContain("High security impact");
  expect(container.textContent).toContain("Free");
  expect(container.textContent).toContain("mfa");
  expect(container.textContent).toContain("2026-06-12T10:00:00.000Z");
  expect(container.textContent).not.toContain("Feature disabled");

  act(() => root.unmount());
});

test("selects Zero Trust Assessment report rows", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: [
        {
          TestId: "21791",
          TestStatus: "Completed",
          TestTitle: "Require MFA for administrators"
        },
        {
          TestId: "21823",
          TestStatus: "Skipped",
          TestTitle: "Require compliant devices"
        }
      ]
    })
  );
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  await waitForText(container, "Require MFA for administrators");

  expect(queryButton("Create remediation package from 1 selected Zero Trust Assessment tests")).toBeNull();

  await toggleCheckbox("Select Zero Trust Assessment test 21791", true);

  expect(getCheckbox("Select Zero Trust Assessment test 21791").checked).toBe(true);
  expect(getCheckbox("Select Zero Trust Assessment test 21823").checked).toBe(false);
  expect(getCheckbox("Select").checked).toBe(false);
  expect(getButton("Create remediation package from 1 selected Zero Trust Assessment tests").textContent).toBe("Create package");

  await toggleCheckbox("Select", true);

  expect(getCheckbox("Select Zero Trust Assessment test 21791").checked).toBe(true);
  expect(getCheckbox("Select Zero Trust Assessment test 21823").checked).toBe(true);
  expect(getCheckbox("Select").checked).toBe(true);
  expect(getButton("Create remediation package from all filtered Zero Trust Assessment tests").textContent).toBe(
    "Create package"
  );

  act(() => root.unmount());
});

test("creates a remediation package from selected Zero Trust Assessment rows with current filters", async () => {
  const onRemediationPackageCreated = jest.fn();
  const tests: ZtaReport["Tests"] = [
    {
      TestId: "21791",
      RelatedObjects: [
        {
          id: "related-object-1",
          displayName: "Privileged automation app"
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require MFA for administrators"
    },
    {
      TestId: "21823",
      RelatedObjects: [
        {
          id: "related-object-2",
          displayName: "Break glass account"
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require compliant devices"
    }
  ];
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    if (String(input) === "/api/data/zeroTrustAssessment/remediationPackages") {
      return {
        json: async () => ({
          id: "package-1"
        }),
        ok: true,
        status: 201
      } as Response;
    }

    if (String(input) === "/api/data/remediationPackages?id=package-1") {
      return {
        json: async () => ({
          id: "package-1",
          createdAt: "2026-06-12T10:00:00.000Z",
          sourceKind: "zeroTrustAssessment",
          sourceLabel: "Zero Trust Assessment",
          sourceQuery: {
            filters: {
              RelatedObjects: {
                type: "text",
                value: "Privileged automation"
              }
            },
            selectedRowKeys: ["21791"]
          },
          taskCount: 1,
          tasks: []
        }),
        ok: true,
        status: 200
      } as Response;
    }

    const url = new URL(String(input), window.location.origin);
    const filterValue = url.searchParams.get("filter[0][value][0]");
    const filteredTests = filterValue ? tests.filter((test) => JSON.stringify(test).includes(filterValue)) : tests;

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: filteredTests
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent onRemediationPackageCreated={onRemediationPackageCreated} />);

  await waitForText(container, "Require MFA for administrators");

  act(() => {
    getButton("Filter Related objects").click();
  });
  act(() => {
    changeInputValue(getInput("Related objects Display name value"), "Privileged automation");
  });

  await waitFor(() => {
    expect(container.textContent).toContain("Require MFA for administrators");
    expect(container.textContent).not.toContain("Require compliant devices");
  });

  await toggleCheckbox("Select Zero Trust Assessment test 21791", true);

  await act(async () => {
    getButton("Create remediation package from 1 selected Zero Trust Assessment tests").click();
  });

  await waitFor(() => {
    expect(onRemediationPackageCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "package-1",
        sourceKind: "zeroTrustAssessment"
      })
    );
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data/zeroTrustAssessment/remediationPackages",
    expect.objectContaining({
      body: JSON.stringify({
        filters: {
          RelatedObjects: {
            type: "objectFields",
            conditions: [{ fieldId: "displayName", value: "Privileged automation" }]
          }
        },
        selectedRowKeys: ["21791"]
      }),
      method: "POST"
    })
  );
  expect(fetchMock).toHaveBeenCalledWith("/api/data/remediationPackages?id=package-1");

  act(() => root.unmount());
});

test("sends select-all selection when creating a remediation package from filtered Zero Trust Assessment rows", async () => {
  const tests: ZtaReport["Tests"] = [
    {
      TestId: "21791",
      RelatedObjects: [{ id: "related-object-1", displayName: "Privileged automation app" }],
      TestStatus: "Completed",
      TestTitle: "Require MFA for administrators"
    },
    {
      TestId: "21823",
      RelatedObjects: [{ id: "related-object-2", displayName: "Privileged break glass app" }],
      TestStatus: "Completed",
      TestTitle: "Require compliant devices"
    }
  ];
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    if (String(input) === "/api/data/zeroTrustAssessment/remediationPackages") {
      return {
        json: async () => ({ id: "package-1" }),
        ok: true,
        status: 201
      } as Response;
    }

    if (String(input) === "/api/data/remediationPackages?id=package-1") {
      return {
        json: async () => ({
          id: "package-1",
          createdAt: "2026-06-12T10:00:00.000Z",
          sourceKind: "zeroTrustAssessment",
          sourceLabel: "Zero Trust Assessment",
          sourceQuery: {
            filters: {},
            selectAllMatchingFilters: true,
            selectedRowKeys: ["21791", "21823"]
          },
          taskCount: 2,
          tasks: []
        }),
        ok: true,
        status: 200
      } as Response;
    }

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: tests
    });
  });
  globalThis.fetch = fetchMock;

  const { root } = renderComponent(<ZtaComponent />);

  await waitFor(() => {
    expect(getCheckbox("Select").checked).toBe(false);
  });

  await toggleCheckbox("Select", true);

  await act(async () => {
    getButton("Create remediation package from all filtered Zero Trust Assessment tests").click();
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data/zeroTrustAssessment/remediationPackages",
    expect.objectContaining({
      body: JSON.stringify({
        filters: {},
        selectAllMatchingFilters: true,
        selectedRowKeys: ["21791", "21823"]
      }),
      method: "POST"
    })
  );

  act(() => root.unmount());
});

test("opens an existing remediation package from a Zero Trust Assessment package badge", async () => {
  const onRemediationPackageClick = jest.fn();
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    if (String(input) === "/api/data/remediationPackages?id=package-1") {
      return {
        json: async () => ({
          id: "package-1",
          createdAt: "2026-06-12T10:00:00.000Z",
          sourceKind: "zeroTrustAssessment",
          sourceLabel: "Zero Trust Assessment",
          sourceQuery: {
            filters: {},
            selectedRowKeys: ["21791"]
          },
          taskCount: 1,
          tasks: []
        }),
        ok: true,
        status: 200
      } as Response;
    }

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: [
        {
          TestId: "21791",
          RemediationPackages: [
            {
              id: "package-1",
              createdAt: "2026-06-12T10:00:00.000Z",
              taskCount: 1
            }
          ],
          TestStatus: "Completed",
          TestTitle: "Require MFA for administrators"
        }
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent onRemediationPackageClick={onRemediationPackageClick} />);

  await waitForText(container, "Require MFA for administrators");

  await act(async () => {
    getButton("Open remediation package package-1").click();
  });

  await waitFor(() => {
    expect(onRemediationPackageClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "package-1",
        sourceKind: "zeroTrustAssessment"
      })
    );
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/data/remediationPackages?id=package-1");

  act(() => root.unmount());
});

test("filters related objects by display name", async () => {
  const tests: ZtaReport["Tests"] = [
    {
      TestId: "21791",
      RelatedObjects: [
        {
          id: "related-object-1",
          displayName: "Privileged automation app",
          servicePrincipalType: "Application"
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require MFA for administrators"
    },
    {
      TestId: "21823",
      RelatedObjects: [
        {
          id: "related-object-2",
          displayName: "Break glass account",
          userPrincipalName: "breakglass@example.test"
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require compliant devices"
    }
  ];
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const url = new URL(String(input), window.location.origin);
    const filterValue = url.searchParams.get("filter[0][value][0]");
    const filteredTests = filterValue ? tests.filter((test) => JSON.stringify(test).includes(filterValue)) : tests;

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: filteredTests
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  await waitForText(container, "Require MFA for administrators");
  expect(container.textContent).toContain("Privileged automation app");
  expect(container.textContent).not.toContain("related-object-1");

  act(() => {
    getButton("Filter Related objects").click();
  });
  act(() => {
    changeInputValue(getInput("Related objects Display name value"), "Privileged automation");
  });

  await waitFor(() => {
    const filteredRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((requestUrl) => {
        const url = new URL(requestUrl, window.location.origin);
        return url.searchParams.get("filter[0][column]") === "RelatedObjects.displayName";
      });
    expect(filteredRequest).toBeDefined();
    expect(container.textContent).toContain("Require MFA for administrators");
    expect(container.textContent).not.toContain("Require compliant devices");
    expect(container.textContent).toContain("Privileged automation app");
    expect(container.textContent).not.toContain("related-object-1");
  });

  act(() => root.unmount());
});

test("filters related objects by tags", async () => {
  const tests: ZtaReport["Tests"] = [
    {
      TestId: "21791",
      RelatedObjects: [
        {
          id: "related-object-1",
          tags: ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"]
        },
        {
          id: "related-object-2",
          tags: ["OtherTag"]
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require MFA for administrators"
    },
    {
      TestId: "21823",
      RelatedObjects: [
        {
          id: "related-object-3",
          tags: ["OtherTag"]
        }
      ],
      TestStatus: "Completed",
      TestTitle: "Require compliant devices"
    }
  ];
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const url = new URL(String(input), window.location.origin);
    const filterColumn = url.searchParams.get("filter[0][column]");
    const filterValue = url.searchParams.get("filter[0][value][0]");
    const filteredTests =
      filterColumn === "RelatedObjects.tags" && filterValue
        ? tests.flatMap((test) => {
            const relatedObjects = (test.RelatedObjects ?? []).filter((relatedObject) =>
              (relatedObject.tags ?? []).includes(filterValue)
            );

            return relatedObjects.length > 0 ? [{ ...test, RelatedObjects: relatedObjects }] : [];
          })
        : tests;

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: filteredTests
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  await waitForText(container, "Require MFA for administrators");

  act(() => {
    getButton("Filter Related objects").click();
  });
  act(() => {
    changeInputValue(getInput("Related objects Tags value"), "HideApp");
  });

  await waitFor(() => {
    const filteredRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((requestUrl) => {
        const url = new URL(requestUrl, window.location.origin);
        return url.searchParams.get("filter[0][column]") === "RelatedObjects.tags";
      });
    expect(filteredRequest).toBeDefined();
    expect(container.textContent).toContain("Require MFA for administrators");
    expect(container.textContent).not.toContain("Require compliant devices");
    expect(container.textContent).toContain("related-object-1");
    expect(container.textContent).not.toContain("related-object-2");
  });

  act(() => root.unmount());
});

test("reports a useful error when remediation package read returns HTML", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    if (String(input) === "/api/data/zeroTrustAssessment/remediationPackages") {
      return {
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          id: "package-1"
        }),
        ok: true,
        status: 201
      } as Response;
    }

    if (String(input) === "/api/data/remediationPackages?id=package-1") {
      return {
        headers: new Headers({ "Content-Type": "text/html" }),
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<!doctype \"... is not valid JSON");
        },
        ok: true,
        status: 200,
        text: async () => "<!doctype html>"
      } as unknown as Response;
    }

    return jsonResponse({
      Meta: {
        TenantName: "Example Tenant"
      },
      Tests: [
        {
          TestId: "21791",
          TestStatus: "Completed",
          TestTitle: "Require MFA for administrators"
        }
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<ZtaComponent />);

  await waitForText(container, "Require MFA for administrators");
  await toggleCheckbox("Select Zero Trust Assessment test 21791", true);

  await act(async () => {
    getButton("Create remediation package from 1 selected Zero Trust Assessment tests").click();
  });

  await waitForText(
    container,
    "Remediation package read failed: expected JSON from /api/data/remediationPackages?id=package-1 but received text/html."
  );

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
    json: async () => ({
      collectionId: "zeroTrustAssessment.report",
      rows: body.Tests,
      columns: [],
      page: 1,
      pageSize: 20,
      count: body.Tests.length,
      ...body
    }),
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

function getInput(label: string): HTMLInputElement {
  const input = [...document.querySelectorAll("input")].find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${label}.`);
  }

  return input;
}

function changeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function toggleCheckbox(label: string, checked: boolean): Promise<void> {
  const checkbox = getCheckbox(label);

  if (checkbox.checked === checked) {
    return;
  }

  await act(async () => {
    checkbox.click();
  });
}

function getCheckbox(label: string): HTMLInputElement {
  const checkbox = [...document.querySelectorAll("input")].find(
    (candidate) => candidate.getAttribute("aria-label") === label && candidate.getAttribute("type") === "checkbox"
  );
  if (!(checkbox instanceof HTMLInputElement)) {
    throw new Error(`Expected checkbox ${label}.`);
  }

  return checkbox;
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
