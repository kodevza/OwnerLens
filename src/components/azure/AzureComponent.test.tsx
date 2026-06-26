/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ZtaReport } from "../../core/azure/ztaReport";
import { AzureComponent } from "./AzureComponent";
import { OwnershipEvidenceComponent } from "./identity/OwnershipEvidenceComponent";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).fetch;
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

test("hides the Zero Trust Assessment tab by default", () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 0,
      page: 1,
      pageSize: 20,
      rows: []
    })
  );

  const { root } = renderComponent(<AzureComponent />);

  expect(getButton("Service principals")).toBeDefined();
  expect(queryButton("Zero Trust Assessment")).toBeNull();

  act(() => root.unmount());
});

test("keeps service principal filters and page separate from managed identities", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);
    const url = new URL(requestUrl, window.location.origin);

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 1,
        page: Number(url.searchParams.get("page") ?? "1"),
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
            oauthPermissionsCount: 0,
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
            ztaRemediationFailedCount: 0
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 75,
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: 20,
      rows: [
        {
          accountEnabled: true,
          appDisplayName: "Payroll API",
          appId: "sp-client-id",
          appOwnerOrganizationId: null,
          azureRbac: "No Azure RBAC assignments",
          displayName: "Payroll API",
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
          oauthPermissionsCount: 0,
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

  await waitForText(container, "Payroll API");
  await clickButton("Filter Display name");
  await changeInput("Display name Display name value", "Payroll");
  await waitForRequest((requestUrl) => requestUrl.includes("filter%5B0%5D%5Bvalue%5D%5B0%5D=Payroll"));
  await clickButton("Next");
  await waitForRequest((requestUrl) =>
    requestUrl.startsWith("/api/data/entra/servicePrincipals?page=2&count=20") &&
    requestUrl.includes("filter%5B0%5D%5Bvalue%5D%5B0%5D=Payroll")
  );

  await clickButton("Managed identities");
  await waitForText(container, "uami-prod");

  const managedIdentityRequest = lastRequest((requestUrl) => requestUrl.startsWith("/api/data/entra/managedIdentities"));
  expect(managedIdentityRequest).toContain("page=1&count=20");
  expect(managedIdentityRequest).not.toContain("Payroll");

  await clickButton("Service principals");
  await waitForRequest((requestUrl) =>
    requestUrl.startsWith("/api/data/entra/servicePrincipals?page=2&count=20") &&
    requestUrl.includes("filter%5B0%5D%5Bvalue%5D%5B0%5D=Payroll")
  );

  act(() => root.unmount());

  async function waitForRequest(predicate: (requestUrl: string) => boolean): Promise<void> {
    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([input]) => String(input)).some(predicate)).toBe(true);
    });
  }

  function lastRequest(predicate: (requestUrl: string) => boolean): string {
    const requestUrl = fetchMock.mock.calls
      .map(([input]) => String(input))
      .reverse()
      .find(predicate);
    if (!requestUrl) {
      throw new Error("Expected matching request.");
    }

    return requestUrl;
  }
});

test.skip("opens related managed identity from Zero Trust Assessment with an Object ID filter", async () => {
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
            oauthPermissionsCount: 0,
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

  await clickButton("Open related object uami-prod identity");
  await waitForText(container, "uami-prod");

  expect(getButton("Managed identities").getAttribute("data-state")).toBe("active");

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

test.skip("opens related service principal from Zero Trust Assessment with the resolved service principal ID", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      return zeroTrustAssessmentJsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: [
          {
            TestId: "zta-sp-1",
            TestStatus: "Completed",
            TestTitle: "Service principal exposure",
            RelatedObjects: [
              {
                id: "application-object-id",
                displayName: "Service principal app",
                servicePrincipalId: "sp-object-id",
                servicePrincipalType: "Application"
              }
            ]
          }
        ]
      });
    }

    if (requestUrl.startsWith("/api/data/entra/servicePrincipals")) {
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
            oauthPermissionsCount: 0,
            appRolesPermissionCount: 0,
            entraPermissionRisk: "none",
            servicePrincipalNames: [],
            servicePrincipalType: "Application",
            potentialOwners: [],
            ownerConfidence: "none",
            tags: []
          }
        ]
      });
    }

    return jsonResponse({
      collectionId: "entra.managedIdentities",
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
  await waitForText(container, "Service principal exposure");

  await clickButton("Open related object Service principal app");
  await waitForText(container, "Service principal app");

  expect(getButton("Service principals").getAttribute("data-state")).toBe("active");

  const servicePrincipalRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .reverse()
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/servicePrincipals"));
  expect(servicePrincipalRequest).toBeDefined();

  const url = new URL(servicePrincipalRequest ?? "", window.location.origin);
  expect(url.searchParams.get("filter[0][column]")).toBe("id");
  expect(url.searchParams.get("filter[0][value][0]")).toBe("sp-object-id");

  act(() => root.unmount());
});

test.skip("does not guess a service principal tab for a Zero Trust Assessment related object without a principal type", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      return zeroTrustAssessmentJsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: [
          {
            TestId: "zta-user-1",
            TestStatus: "Completed",
            TestTitle: "User exposure",
            RelatedObjects: [
              {
                id: "user-object-id",
                userPrincipalName: "user@example.test"
              }
            ]
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
  await waitForText(container, "User exposure");

  const servicePrincipalRequestCountBeforeClick = fetchMock.mock.calls.filter(([input]) =>
    String(input).startsWith("/api/data/entra/servicePrincipals")
  ).length;
  await clickButton("Open related object user@example.test");

  expect(getButton("Zero Trust Assessment").getAttribute("data-state")).toBe("active");
  expect(
    fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/data/entra/servicePrincipals"))
  ).toHaveLength(servicePrincipalRequestCountBeforeClick);

  act(() => root.unmount());
});

test.skip("opens Zero Trust Assessment filtered by related object from a principal ZTA badge", async () => {
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
          oauthPermissionsCount: 0,
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

  expect(getButton("Filter Related objects").textContent).toContain("Service principal ID: sp-object-id");
  expect(container.textContent).toContain("Service principal exposure");
  expect(container.textContent).not.toContain("Unrelated exposure");

  act(() => root.unmount());
});

test.skip("opens a remediation package tab after creating a package from Zero Trust Assessment selection", async () => {
  URL.createObjectURL = jest.fn(() => "blob:ownerlens-remediation-package");
  URL.revokeObjectURL = jest.fn();
  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input, init) => {
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
            accessDisplayName: "Owner on resource group rg-app",
            accessRisk: "high",
            accessResourceGroup: "rg-app",
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1/resourceGroups/rg-app",
            accessScopeType: "ResourceGroup",
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
            scope: "/subscriptions/sub-1/resourceGroups/rg-app",
            scopeSubscriptionId: "sub-1",
            servicePrincipalId: "sp-object-id",
            signInName: null,
            subscriptionId: "sub-1",
            subscriptionName: "Platform"
          }
        ]
      });
    }

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
            risk: "high",
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

    if (requestUrl === "/api/data/zeroTrustAssessment/remediationPackages" && init?.method === "POST") {
      return jsonResponse({
        id: "package-1"
      });
    }

    if (requestUrl === "/api/data/remediationPackages?id=package-1") {
      return jsonResponse({
        id: "package-1",
        createdAt: "2026-06-12T10:00:00.000Z",
        sourceKind: "zeroTrustAssessment",
        sourceLabel: "Zero Trust Assessment",
        sourceQuery: {
          filters: {},
          selectedRowKeys: ["zta-1"]
        },
        taskCount: 1,
        tasks: [
          {
            id: "task-1",
            packageId: "package-1",
            createdAt: "2026-06-12T10:00:00.000Z",
            status: "open",
            targetKind: "Application",
            targetId: "sp-object-id",
            targetLabel: "Service principal app",
            title: "Service principal exposure",
            risk: "High",
            sourceEvidence: {
              sourceKind: "zeroTrustAssessment",
              test: {
                TestId: "zta-1",
                TestStatus: "Failed"
              },
              relatedObject: {
                id: "sp-object-id",
                displayName: "Service principal app"
              },
              azureEnrichment: {
                id: "sp-object-id",
                displayName: "Service principal app",
                roleAssignments: [testRoleAssignment("Owner", "/subscriptions/sub-1/resourceGroups/rg-app")],
                oauthPermissionsCount: 2,
                appRolesPermissionCount: 1,
                entraPermissionRisk: "high",
                rbacRoleAssignmentCount: 1,
                rbacRoleLevel: "high",
                rbacSubscriptionCount: 1,
                potentialOwners: ["alice@example.test"],
                ownerConfidence: "high"
              }
            }
          }
        ]
      });
    }

    if (requestUrl === "/api/data/remediationPackages/tasks" && init?.method === "DELETE") {
      return jsonResponse({
        id: "package-1",
        createdAt: "2026-06-12T10:00:00.000Z",
        sourceKind: "zeroTrustAssessment",
        sourceLabel: "Zero Trust Assessment",
        sourceQuery: {
          filters: {},
          selectedRowKeys: ["zta-1"]
        },
        taskCount: 0,
        tasks: []
      });
    }

    if (requestUrl.startsWith("/api/data/remediationPackages/tasks?") && requestUrl.includes("format=csv")) {
      return csvResponse("Task ID,Title\ntask-1,Service principal exposure");
    }

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      return zeroTrustAssessmentJsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: [
          {
            TestId: "zta-1",
            TestStatus: "Failed",
            TestTitle: "Service principal exposure",
            RelatedObjects: [{ id: "sp-object-id", servicePrincipalType: "Application" }]
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
  await waitForText(container, "Service principal exposure");
  await toggleCheckbox("Select Zero Trust Assessment test zta-1", true);
  await clickButton("Create remediation package from 1 selected Zero Trust Assessment tests");
  await waitForText(container, "Remediation package");

  expect(container.textContent).toContain("Zero Trust Assessment");
  expect(container.textContent).toContain("2026-06-12T10:00:00.000Z");
  expect(container.textContent).toContain("open");
  expect(container.textContent).toContain("Service principal app");
  expect(container.textContent).toContain("sp-object-id");
  expect(container.textContent).toContain("Service principal exposure");
  expect(container.textContent).toContain("high");
  expect(getButton("Sort by Owner").textContent).toContain("Owner");
  expect(getButton("Sort by Entra API permissions").textContent).toContain("Entra API permissions");
  expect(getButton("Sort by Azure RBAC").textContent).toContain("Azure RBAC");
  expect(container.textContent).toContain("alice@example.test");
  expect(container.textContent).toContain("2/1");
  expect(container.textContent).toContain("1/1");
  expect(container.textContent).toContain("Related object");
  expect(container.textContent).toContain("ZTA test zta-1");
  expect(container.textContent).toContain("Status: Failed");
  expect(container.textContent).not.toContain("Related object:");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data/zeroTrustAssessment/remediationPackages",
    expect.objectContaining({
      body: JSON.stringify({
        filters: {},
        selectedRowKeys: ["zta-1"]
      }),
      method: "POST"
    })
  );
  expect(fetchMock).toHaveBeenCalledWith("/api/data/remediationPackages?id=package-1");

  await clickButton("Open Azure RBAC assignments 1/1");
  await waitForText(container, "Owner on resource group rg-app");

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();
  expect(new URL(azureRbacRequest ?? "", window.location.origin).searchParams.get("servicePrincipalId")).toBe("sp-object-id");

  await clickButton("Close RBAC: Service principal app tab");
  await waitForText(container, "ZTA test zta-1");

  await clickButton("Open Entra API permissions 2/1");
  await waitForText(container, "User.Read Directory.Read.All");
  await waitForText(container, "Read directory data");

  const permissionsRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/permissions"));
  expect(permissionsRequest).toBeDefined();
  expect(new URL(permissionsRequest ?? "", window.location.origin).searchParams.get("principalId")).toBe("sp-object-id");

  await clickButton("Close Service principal app Entra API permissions tab");
  await waitForText(container, "ZTA test zta-1");

  await toggleCheckbox("Select remediation task Service principal exposure", true);
  await clickButton("Export 1 selected remediation tasks to CSV");

  const downloadedBlob = (URL.createObjectURL as jest.Mock).mock.calls[0]?.[0] as Blob | undefined;
  expect(downloadedBlob).toBeInstanceOf(Blob);
  const downloadedCsv = downloadedBlob ? await readBlobText(downloadedBlob) : "";
  expect(downloadedCsv).toContain("Task ID,Title");
  expect(downloadedCsv).toContain("task-1,Service principal exposure");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data/remediationPackages/tasks?id=package-1&format=csv&selectedRowKey=task-1"
  );

  await clickButton("Delete 1 selected remediation tasks");
  await waitForText(container, "No remediation tasks were created.");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data/remediationPackages/tasks",
    expect.objectContaining({
      body: JSON.stringify({
        packageId: "package-1",
        taskIds: ["task-1"]
      }),
      method: "DELETE"
    })
  );

  await clickButton("Close remediation package tab");
  await waitFor(() => {
    expect(queryButton("Close remediation package tab")).toBeNull();
    expect(container.textContent).not.toContain("ZTA test zta-1");
  });

  act(() => root.unmount());
  clickSpy.mockRestore();
});

test.skip("opens a remediation package tab from a Zero Trust Assessment package badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl === "/api/data/remediationPackages?id=package-1") {
      return jsonResponse({
        id: "package-1",
        createdAt: "2026-06-12T10:00:00.000Z",
        sourceKind: "zeroTrustAssessment",
        sourceLabel: "Zero Trust Assessment",
        sourceQuery: {
          filters: {},
          selectedRowKeys: ["zta-1"]
        },
        taskCount: 1,
        tasks: [
          {
            id: "task-1",
            packageId: "package-1",
            createdAt: "2026-06-12T10:00:00.000Z",
            status: "open",
            targetKind: "Application",
            targetId: "sp-object-id",
            targetLabel: "Service principal app",
            title: "Service principal exposure",
            risk: "High",
            sourceEvidence: {
              sourceKind: "zeroTrustAssessment",
              test: {
                TestId: "zta-1",
                TestStatus: "Failed"
              },
              relatedObject: {
                id: "sp-object-id",
                displayName: "Service principal app"
              }
            }
          }
        ]
      });
    }

    if (requestUrl.startsWith("/api/data/zeroTrustAssessment/report")) {
      return zeroTrustAssessmentJsonResponse({
        Meta: {
          TenantId: "tenant-1",
          TenantName: "Example Tenant"
        },
        Tests: [
          {
            TestId: "zta-1",
            TestStatus: "Failed",
            TestTitle: "Service principal exposure",
            RelatedObjects: [{ id: "sp-object-id", servicePrincipalType: "Application" }],
            RemediationPackages: [
              {
                id: "package-1",
                createdAt: "2026-06-12T10:00:00.000Z",
                taskCount: 1
              }
            ]
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
  await waitForText(container, "Service principal exposure");
  await clickButton("Open remediation package package-1");
  await waitForText(container, "Remediation package");

  expect(container.textContent).toContain("Service principal app");
  expect(container.textContent).toContain("ZTA test zta-1");
  expect(fetchMock).toHaveBeenCalledWith("/api/data/remediationPackages?id=package-1");

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
            accessRisk: "high",
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
          oauthPermissionsCount: 0,
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

  expect(getButton("RBAC: Service principal app")).toBeDefined();
  expect(container.textContent).toContain("high");

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();

  const url = new URL(azureRbacRequest ?? "", window.location.origin);
  expect(url.searchParams.get("servicePrincipalId")).toBe("sp-object-id");

  await clickButton("Close RBAC: Service principal app tab");
  await waitFor(() => {
    expect(queryButton("Close RBAC: Service principal app tab")).toBeNull();
    expect(container.textContent).not.toContain("Owner on subscription Platform");
  });

  act(() => root.unmount());
});

test("keeps Azure RBAC filters isolated per closable resource tab and clears them after close", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);
    const url = new URL(requestUrl, window.location.origin);

    if (requestUrl.startsWith("/api/data/azureRbac")) {
      const servicePrincipalId = url.searchParams.get("servicePrincipalId");
      const isFirstApp = servicePrincipalId === "sp-one-id";

      return jsonResponse({
        collectionId: "azureRbac",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accessDisplayName: isFirstApp ? "Owner on subscription Platform" : "Reader on subscription Platform",
            accessRisk: isFirstApp ? "high" : "low",
            accessResourceGroup: null,
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1",
            accessScopeType: "Subscription",
            accessSubscriptionId: "sub-1",
            canDelegate: false,
            condition: null,
            conditionVersion: null,
            principalDisplayName: isFirstApp ? "App One" : "App Two",
            principalId: servicePrincipalId,
            principalType: "ServicePrincipal",
            roleAssignmentId: isFirstApp ? "assignment-one" : "assignment-two",
            roleDefinitionId: isFirstApp ? "owner-role-id" : "reader-role-id",
            roleDefinitionName: isFirstApp ? "Owner" : "Reader",
            scope: "/subscriptions/sub-1",
            scopeSubscriptionId: "sub-1",
            servicePrincipalId,
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
      count: 2,
      page: 1,
      pageSize: 20,
      rows: [
        servicePrincipalRow({ displayName: "App One", id: "sp-one-id" }),
        servicePrincipalRow({ displayName: "App Two", id: "sp-two-id" })
      ]
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "App One");
  await clickButtonAt("Open Azure RBAC assignments 1/1", 0);
  await waitForText(container, "Owner on subscription Platform");
  await changeInput("Filter Role", "Owner");
  await waitForAzureRbacRequest((requestUrl) =>
    requestUrl.includes("servicePrincipalId=sp-one-id") &&
    requestUrl.includes("filter%5B0%5D%5Bvalue%5D%5B0%5D=Owner")
  );

  await clickButton("Service principals");
  await waitForText(container, "App Two");
  await clickButtonAt("Open Azure RBAC assignments 1/1", 1);
  await waitForText(container, "Reader on subscription Platform");

  expect(getButton("RBAC: App One")).toBeDefined();
  expect(getButton("RBAC: App Two")).toBeDefined();
  expect(lastAzureRbacRequest("sp-two-id")).not.toContain("Owner");

  await clickButton("RBAC: App One");
  await waitForText(container, "Owner on subscription Platform");
  expect(getInput("Filter Role").value).toBe("Owner");

  await clickButton("Close RBAC: App One tab");
  await waitFor(() => {
    expect(queryButton("Close RBAC: App One tab")).toBeNull();
  });

  await clickButton("Service principals");
  await clickButtonAt("Open Azure RBAC assignments 1/1", 0);
  await waitForText(container, "Owner on subscription Platform");
  expect(lastAzureRbacRequest("sp-one-id")).not.toContain("Owner");

  act(() => root.unmount());

  async function waitForAzureRbacRequest(predicate: (requestUrl: string) => boolean): Promise<void> {
    await waitFor(() => {
      expect(fetchMock.mock.calls.map(([requestInput]) => String(requestInput)).some(predicate)).toBe(true);
    });
  }

  function lastAzureRbacRequest(servicePrincipalId: string): string {
    const requestUrl = fetchMock.mock.calls
      .map(([requestInput]) => String(requestInput))
      .reverse()
      .find((candidate) => candidate.startsWith("/api/data/azureRbac") && candidate.includes(`servicePrincipalId=${servicePrincipalId}`));
    if (!requestUrl) {
      throw new Error(`Expected Azure RBAC request for ${servicePrincipalId}.`);
    }

    return requestUrl;
  }
});

test("opens selectable ownership evidence table from a service principal owner badge", async () => {
  let evidenceReadCount = 0;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/ownerCandidates/status")) {
      return jsonResponse({
        key: "resourceGroup:sub-1:rg-app:principal:sp-object-id:ownerUser:alice@example.test",
        status: "inactive",
        disabled: true,
        disabledCount: 1
      });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      evidenceReadCount += 1;
      return jsonResponse({
        target: {
          kind: "servicePrincipal",
          id: "sp-object-id",
          displayName: "Service principal app"
        },
        evidence: [
          {
            key: "owner-1:alice@example.test:2026-06-05T00:00:00.000Z",
            statusKey: "resourceGroup:sub-1:rg-app:principal:sp-object-id:ownerUser:alice@example.test",
            ownerCandidateKey: "ownerUser:alice@example.test",
            ownerDisplayName: "alice@example.test",
            ownerType: "ownerUser",
            confidence: "high",
            source: "resourceGroupOwner",
            path: "indirect",
            discoverySource: "tag",
            rank: 1,
            evidence: "alice@example.test",
            date: "2026-06-05T00:00:00.000Z",
            disabled: evidenceReadCount > 1,
            relatedScopes: [
              {
                subscriptionId: "sub-1",
                subscriptionName: "Platform",
                resourceGroup: "rg-app",
                principalId: "sp-object-id"
              }
            ]
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
          permissionRisk: "none",
          rbacRoleAssignmentCount: 0,
          rbacRoleLevel: "none",
          rbacSubscriptionCount: 0,
          publisherName: null,
          replyUrls: [],
          roleAssignments: [],
          oauthPermissionsCount: 0,
          appRolesPermissionCount: 0,
          entraPermissionRisk: "none",
          servicePrincipalNames: [],
          servicePrincipalType: "Application",
          potentialOwners: ["alice@example.test"],
          ownerCandidates: [
            {
              key: "owner-1",
              displayName: "alice@example.test",
              type: "ownerUser",
              confidence: "high",
              source: "entraApplicationOwner",
              rank: 1,
              evidence: [{ user: "alice@example.test", date: "2026-06-05T00:00:00.000Z" }],
              relatedScopes: []
            }
          ],
          ownerConfidence: "high",
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
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Resource group owner");

  expect(getButton("SP: Service principal app owners")).toBeDefined();
  expect(getButton("SP: Service principal app owners").title).toBe("SP: Service principal app owners");
  expect(getCheckbox("Select ownership evidence alice@example.test alice@example.test").checked).toBe(false);

  const evidenceRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/evidence"));
  expect(evidenceRequest).toBeDefined();

  const url = new URL(evidenceRequest ?? "", window.location.origin);
  expect(url.searchParams.has("azureRbac")).toBe(false);
  expect(url.searchParams.get("kind")).toBe("servicePrincipal");
  expect(url.searchParams.get("principalId")).toBe("sp-object-id");

  await clickElementByLabel("Set alice@example.test ownership evidence Inactive");
  await waitForText(container, "Inactive");
  expect(evidenceReadCount).toBe(2);

  const statusRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/ownerCandidates/status"));
  expect(statusRequest).toBeDefined();

  const statusUrl = new URL(statusRequest ?? "", window.location.origin);
  expect(statusUrl.searchParams.get("key")).toBe(
    "resourceGroup:sub-1:rg-app:principal:sp-object-id:ownerUser:alice@example.test"
  );
  expect(statusUrl.searchParams.get("status")).toBe("inactive");

  await clickButton("Close SP: Service principal app ownership evidence tab");
  await waitFor(() => {
    expect(queryButton("Close SP: Service principal app ownership evidence tab")).toBeNull();
    expect(container.textContent).not.toContain("Resource group owner");
  });

  act(() => root.unmount());
});

test("sets direct service principal owner evidence status to inactive", async () => {
  let evidenceReadCount = 0;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/ownerCandidates/status")) {
      return jsonResponse({
        key: "owner-1:alice@example.test:2026-06-05T00:00:00.000Z",
        status: "inactive",
        disabled: true,
        disabledCount: 1
      });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      evidenceReadCount += 1;
      return ownershipEvidenceResponse({
        candidateKey: "owner-1",
        displayName: "alice@example.test",
        type: "ownerUser",
        disabled: evidenceReadCount > 1
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "alice@example.test",
      type: "ownerUser"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Application owner");

  await clickElementByLabel("Set alice@example.test ownership evidence Inactive");
  await waitForText(container, "Inactive");
  expect(evidenceReadCount).toBe(2);

  const statusRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/ownerCandidates/status"));
  expect(statusRequest).toBeDefined();

  const statusUrl = new URL(statusRequest ?? "", window.location.origin);
  expect(statusUrl.searchParams.get("key")).toBe("owner-1:alice@example.test:2026-06-05T00:00:00.000Z");
  expect(statusUrl.searchParams.get("status")).toBe("inactive");

  act(() => root.unmount());
});

test("reloads ownership evidence after deactivating an indirect ownerGroup candidate", async () => {
  let evidenceReadCount = 0;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/ownerCandidates/status")) {
      return jsonResponse({
        key: "resourceGroup:sub-1:rg-mi:principal:mi-object-id:ownerGroup:platform-team",
        status: "inactive",
        disabled: true,
        disabledCount: 1
      });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      evidenceReadCount += 1;
      return jsonResponse({
        target: {
          kind: "managedIdentity",
          id: "mi-object-id",
          displayName: "uami-prod"
        },
        evidence: evidenceReadCount === 1
          ? [
              {
                key: "ownerGroup:platform-team:ownerGroup=platform-team:",
                statusKey: "resourceGroup:sub-1:rg-mi:principal:mi-object-id:ownerGroup:platform-team",
                ownerCandidateKey: "ownerGroup:platform-team",
                ownerDisplayName: "platform-team",
                ownerType: "ownerGroup",
                confidence: "high",
                source: "tag",
                path: "indirect",
                discoverySource: "tag",
                rank: 1,
                evidence: "ownerGroup=platform-team",
                date: null,
                relatedScopes: [
                  {
                    subscriptionId: "sub-1",
                    subscriptionName: "Platform",
                    resourceGroup: "rg-mi",
                    principalId: "mi-object-id"
                  }
                ]
              }
            ]
          : [
              {
                key: "ownerTag:fallback@example.test:owner=fallback@example.test:",
                statusKey: "resourceGroup:sub-1:rg-mi:principal:mi-object-id:ownerTag:fallback@example.test",
                ownerCandidateKey: "ownerTag:fallback@example.test",
                ownerDisplayName: "fallback@example.test",
                ownerType: "ownerTag",
                confidence: "medium",
                source: "tag",
                path: "indirect",
                discoverySource: "tag",
                rank: 1,
                evidence: "owner=fallback@example.test",
                date: null,
                relatedScopes: [
                  {
                    subscriptionId: "sub-1",
                    subscriptionName: "Platform",
                    resourceGroup: "rg-mi",
                    principalId: "mi-object-id"
                  }
                ]
              }
            ]
      });
    }

    return jsonResponse({});
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(
    <OwnershipEvidenceComponent
      displayName="uami-prod"
      target={{ kind: "managedIdentity", principalId: "mi-object-id" }}
    />
  );

  await waitForText(container, "platform-team");

  await clickElementByLabel("Set platform-team ownership evidence Inactive");
  await waitForText(container, "fallback@example.test");

  expect(evidenceReadCount).toBe(2);
  expect(container.textContent).not.toContain("platform-team");

  const statusRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/ownerCandidates/status"));
  expect(statusRequest).toBeDefined();

  const statusUrl = new URL(statusRequest ?? "", window.location.origin);
  expect(statusUrl.searchParams.get("key")).toBe(
    "resourceGroup:sub-1:rg-mi:principal:mi-object-id:ownerGroup:platform-team"
  );
  expect(statusUrl.searchParams.get("status")).toBe("inactive");

  act(() => root.unmount());
});

test("keeps inactive status after a successful status update when evidence reload fails", async () => {
  let evidenceReadCount = 0;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/ownerCandidates/status")) {
      return jsonResponse({
        key: "owner-1:alice@example.test:2026-06-05T00:00:00.000Z",
        status: "inactive",
        disabled: true,
        disabledCount: 1
      });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      evidenceReadCount += 1;
      if (evidenceReadCount > 1) {
        return { ok: false, status: 500 } as Response;
      }

      return ownershipEvidenceResponse({
        candidateKey: "owner-1",
        displayName: "alice@example.test",
        type: "ownerUser"
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "alice@example.test",
      type: "ownerUser"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Application owner");

  await clickElementByLabel("Set alice@example.test ownership evidence Inactive");
  await waitForText(container, "Inactive");

  expect(evidenceReadCount).toBe(2);
  expect(container.textContent).not.toContain("Could not update ownership evidence status.");

  act(() => root.unmount());
});

test("reads combined principal ownership evidence without an Azure RBAC toggle", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      return jsonResponse({
        target: {
          kind: "servicePrincipal",
          id: "sp-object-id",
          displayName: "Service principal app"
        },
        evidence: [
          {
            key: "resourceGroup:sub-1:rg-app:principal:sp-object-id:ownerUser:alice@example.test",
            statusKey: "resourceGroup:sub-1:rg-app:principal:sp-object-id:ownerUser:alice@example.test",
            ownerCandidateKey: "ownerUser:alice@example.test",
            ownerDisplayName: "alice@example.test",
            ownerType: "ownerUser",
            confidence: "medium",
            source: "resourceGroupOwner",
            path: "indirect",
            discoverySource: "tag",
            rank: 1,
            evidence: "owner=alice@example.test",
            date: null,
            relatedScopes: [
              {
                subscriptionId: "sub-1",
                subscriptionName: "Platform",
                resourceGroup: "rg-app",
                principalId: "sp-object-id"
              }
            ]
          }
        ]
      });
    }

    return servicePrincipalOwnerResponse({ displayName: "alice@example.test", type: "ownerUser" });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "owner=alice@example.test");

  const evidenceRequests = fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((requestUrl) => requestUrl.startsWith("/api/data/ownership/evidence"));
  expect(evidenceRequests).toHaveLength(1);
  expect(new URL(evidenceRequests[0], window.location.origin).searchParams.has("azureRbac")).toBe(false);

  act(() => root.unmount());
});

test("sets resource group owner candidate status to inactive from the evidence table", async () => {
  let evidenceReadCount = 0;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/ownerCandidates/status")) {
      return jsonResponse({
        key: "resourceGroup:sub-1:rg-app:ownerUser:alice@example.test",
        status: "inactive",
        disabled: true,
        disabledCount: 1
      });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      evidenceReadCount += 1;
      return jsonResponse({
        target: {
          kind: "resourceGroup",
          id: "resourceGroup:sub-1:rg-app",
          displayName: "rg-app",
          subscriptionId: "sub-1",
          subscriptionName: "Platform",
          resourceGroup: "rg-app"
        },
        evidence: [
          {
            key: "ownerUser:alice@example.test:alice@example.test:2026-06-05T00:00:00.000Z",
            statusKey: "resourceGroup:sub-1:rg-app:ownerUser:alice@example.test",
            ownerCandidateKey: "ownerUser:alice@example.test",
            ownerDisplayName: "alice@example.test",
            ownerType: "ownerUser",
            confidence: "low",
            source: "activity",
            path: "direct",
            discoverySource: "activityLog",
            rank: 1,
            evidence: "alice@example.test",
            date: "2026-06-05T00:00:00.000Z",
            disabled: evidenceReadCount > 1,
            relatedScopes: [
              {
                subscriptionId: "sub-1",
                subscriptionName: "Platform",
                resourceGroup: "rg-app"
              }
            ]
          }
        ]
      });
    }

    if (requestUrl.startsWith("/api/data/azureResources/resourceGroupOwnership")) {
      return jsonResponse({
        collectionId: "azureResources.resourceGroupOwnership",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Platform",
            resourceGroup: "rg-app",
            location: "westeurope",
            tags: null,
            targetKey: "resourceGroup:sub-1:rg-app",
            ownerCandidates: [
              {
                key: "ownerUser:alice@example.test",
                displayName: "alice@example.test",
                type: "ownerUser",
                confidence: "low",
                source: "activity",
                rank: 1,
                evidence: [{ user: "alice@example.test", date: "2026-06-05T00:00:00.000Z" }],
                relatedScopes: [
                  {
                    subscriptionId: "sub-1",
                    subscriptionName: "Platform",
                    resourceGroup: "rg-app"
                  }
                ]
              }
            ],
            owner: "alice@example.test",
            confidence: "low",
            source: "activity.lastModifier",
            evidence: [{ user: "alice@example.test", date: "2026-06-05T00:00:00.000Z" }],
            roleAssignments: [],
            rbacRoleAssignmentCount: 0,
            rbacRoleLevel: "none"
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

  await clickButton("Resource groups");
  await waitForText(container, "rg-app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Activity log");

  const evidenceRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/evidence"));
  expect(evidenceRequest).toBeDefined();

  const evidenceUrl = new URL(evidenceRequest ?? "", window.location.origin);
  expect(evidenceUrl.searchParams.has("azureRbac")).toBe(false);
  expect(evidenceUrl.searchParams.get("kind")).toBe("resourceGroup");
  expect(evidenceUrl.searchParams.get("page")).toBe("1");
  expect(evidenceUrl.searchParams.get("count")).toBe("20");

  await clickElementByLabel("Set alice@example.test ownership evidence Inactive");
  await waitForText(container, "Inactive");
  expect(evidenceReadCount).toBe(2);

  const statusRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/ownership/ownerCandidates/status"));
  expect(statusRequest).toBeDefined();

  const url = new URL(statusRequest ?? "", window.location.origin);
  expect(url.searchParams.get("key")).toBe("resourceGroup:sub-1:rg-app:ownerUser:alice@example.test");
  expect(url.searchParams.get("status")).toBe("inactive");

  act(() => root.unmount());
});

test("opens direct Entra user groups dropdown from ownership evidence", async () => {
  let resolveUserGroups: ((response: Response) => void) | null = null;
  const userGroupsResponse = new Promise<Response>((resolve) => {
    resolveUserGroups = resolve;
  });
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/userGroups")) {
      return userGroupsResponse;
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      return ownershipEvidenceResponse({
        displayName: "alice@example.test",
        type: "ownerUser"
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "alice@example.test",
      type: "ownerUser"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Application owner");
  await clickButton("Open direct groups for alice@example.test");
  await waitForText(document.body, "Loading groups...");

  const userGroupsRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/userGroups"));
  expect(userGroupsRequest).toBeDefined();
  expect(new URL(userGroupsRequest ?? "", window.location.origin).searchParams.get("user")).toBe("alice@example.test");

  await act(async () => {
    resolveUserGroups?.(jsonResponse({
      user: "alice@example.test",
      groups: [
        { groupId: "group-1", groupDisplayName: "Engineering Owners" },
        { groupId: "group-2", groupDisplayName: "Platform Operators" }
      ]
    }));
    await userGroupsResponse;
  });
  await waitForText(document.body, "Engineering Owners");
  expect(document.querySelector('[role="dialog"]')?.className).toContain("max-h-[50vh]");
  expect(document.body.textContent).toContain("group-2");

  await changeInput("Filter direct groups for alice@example.test", "^Engineering");
  await waitFor(() => {
    expect(document.body.textContent).toContain("Engineering Owners");
    expect(document.body.textContent).not.toContain("Platform Operators");
  });

  await changeInput("Filter direct groups for alice@example.test", "group-2");
  await waitFor(() => {
    expect(document.body.textContent).toContain("Platform Operators");
    expect(document.body.textContent).not.toContain("Engineering Owners");
  });

  await changeInput("Filter direct groups for alice@example.test", "not-present");
  await waitForText(document.body, "No direct group memberships match the filter.");

  await changeInput("Filter direct groups for alice@example.test", "[");
  await waitForText(document.body, "Invalid regular expression.");
  expect(document.body.textContent).toContain("Engineering Owners");
  expect(document.body.textContent).toContain("Platform Operators");

  expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/data/ownership/evidence"))).toBe(true);

  act(() => root.unmount());
});

test("opens ownership evidence for application owner evidence", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      const url = new URL(requestUrl, window.location.origin);
      if (url.searchParams.get("principalId") === "application-object-id") {
        return jsonResponse({
          target: {
            kind: "servicePrincipal",
            id: "application-object-id",
            displayName: "Application owner app"
          },
          evidence: []
        });
      }

      return ownershipEvidenceResponse({
        candidateKey: "application:application-object-id",
        displayName: "Application owner app",
        type: "application"
      });
    }

    if (requestUrl.startsWith("/api/data/azureRbac")) {
      return jsonResponse({
        collectionId: "azureRbac",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accessDisplayName: "Reader on application subscription",
            accessRisk: "low",
            accessResourceGroup: null,
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1",
            accessScopeType: "Subscription",
            accessSubscriptionId: "sub-1",
            canDelegate: false,
            condition: null,
            conditionVersion: null,
            principalDisplayName: "Application owner app",
            principalId: "application-object-id",
            principalType: "ServicePrincipal",
            roleAssignmentId: "assignment-application",
            roleDefinitionId: "reader-role-id",
            roleDefinitionName: "Reader",
            scope: "/subscriptions/sub-1",
            scopeSubscriptionId: "sub-1",
            servicePrincipalId: "application-object-id",
            signInName: null,
            subscriptionId: "sub-1",
            subscriptionName: "Platform"
          }
        ]
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "Application owner app",
      type: "application"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for Application owner app");
  await waitForText(container, "Application owner");
  await clickButton("Open application Azure RBAC assignments for Application owner app");
  await waitForText(container, "Reader on application subscription");

  const applicationRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(applicationRbacRequest).toBeDefined();

  const rbacUrl = new URL(applicationRbacRequest ?? "", window.location.origin);
  expect(rbacUrl.searchParams.get("servicePrincipalId")).toBe("application-object-id");

  await clickButton("Close RBAC: Application owner app tab");
  await waitForText(container, "Application owner");

  await clickButton("Open application ownership evidence for Application owner app");
  await waitForText(container, "No ownership evidence was found.");

  const applicationEvidenceRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => {
      if (!requestUrl.startsWith("/api/data/ownership/evidence")) {
        return false;
      }

      const url = new URL(requestUrl, window.location.origin);
      return url.searchParams.get("principalId") === "application-object-id";
    });
  expect(applicationEvidenceRequest).toBeDefined();

  const url = new URL(applicationEvidenceRequest ?? "", window.location.origin);
  expect(url.searchParams.get("kind")).toBe("servicePrincipal");
  expect(url.searchParams.get("principalId")).toBe("application-object-id");
  expect(getButton("SP: Application owner app owners")).toBeDefined();

  act(() => root.unmount());
});

test("renders empty and failed direct Entra user group dropdown states", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/userGroups")) {
      return jsonResponse({ user: "alice@example.test", groups: [] });
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      return ownershipEvidenceResponse({
        displayName: "alice@example.test",
        type: "ownerUser"
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "alice@example.test",
      type: "ownerUser"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(container, "Application owner");
  await clickButton("Open direct groups for alice@example.test");
  await waitForText(document.body, "No direct group memberships found.");

  act(() => root.unmount());

  const failedFetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/userGroups")) {
      return { ok: false, status: 500 } as Response;
    }

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      return ownershipEvidenceResponse({
        displayName: "alice@example.test",
        type: "ownerUser"
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "alice@example.test",
      type: "ownerUser"
    });
  });
  globalThis.fetch = failedFetchMock;

  const failedRender = renderComponent(<AzureComponent />);
  await waitForText(failedRender.container, "Service principal app");
  await clickButton("Open ownership evidence for alice@example.test");
  await waitForText(failedRender.container, "Application owner");
  await clickButton("Open direct groups for alice@example.test");
  await waitForText(document.body, "Entra user groups read failed: 500");

  act(() => failedRender.root.unmount());
});

test("does not show direct Entra user groups action for non-user ownership evidence", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/ownership/evidence")) {
      return ownershipEvidenceResponse({
        displayName: "Platform Owners",
        type: "ownerGroup"
      });
    }

    return servicePrincipalOwnerResponse({
      displayName: "Platform Owners",
      type: "ownerGroup"
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await waitForText(container, "Service principal app");
  await clickButton("Open ownership evidence for Platform Owners");
  await waitForText(container, "Application owner");

  expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/data/entra/userGroups"))).toBe(false);
  expect(queryButton("Open direct groups for Platform Owners")).toBeNull();
  expect(document.body.textContent).not.toContain("Direct groups for Platform Owners");

  act(() => root.unmount());
});

test("opens Entra API permissions tab for the selected service principal from its permissions badge", async () => {
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
            risk: "high",
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
          oauthPermissionsCount: 2,
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
  await clickButton("Open Entra API permissions 2/1");
  await waitForText(container, "User.Read Directory.Read.All");
  await waitForText(container, "Directory.Read.All");
  await waitForText(container, "Microsoft Graph");
  await waitForText(container, "Risk");
  await waitForText(container, "high");

  expect(getButton("PER: Service principal app")).toBeDefined();

  const permissionsRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/entra/permissions"));
  expect(permissionsRequest).toBeDefined();

  const url = new URL(permissionsRequest ?? "", window.location.origin);
  expect(url.searchParams.get("principalId")).toBe("sp-object-id");

  await clickButton("Close Service principal app Entra API permissions tab");
  await waitFor(() => {
    expect(queryButton("Close Service principal app Entra API permissions tab")).toBeNull();
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
            accessRisk: "high",
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
            oauthPermissionsCount: 0,
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

  expect(getButton("RBAC: uami-prod")).toBeDefined();
  expect(container.textContent).toContain("high");

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();

  const url = new URL(azureRbacRequest ?? "", window.location.origin);
  expect(url.searchParams.get("servicePrincipalId")).toBe("mi-object-id");

  act(() => root.unmount());
});

test("opens Azure RBAC tab for the selected resource group from its RBAC badge", async () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/azureResources/resourceGroupOwnership")) {
      return jsonResponse({
        collectionId: "azureResources.resourceGroupOwnership",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Platform",
            resourceGroup: "rg-app",
            location: "westeurope",
            tags: null,
            targetKey: "resourceGroup:sub-1:rg-app",
            ownerCandidates: [],
            owner: null,
            confidence: "none",
            source: "none",
            evidence: [],
            roleAssignments: [testRoleAssignment("Owner", "/subscriptions/sub-1/resourceGroups/rg-app")],
            rbacRoleAssignmentCount: 1,
            rbacRoleLevel: "high"
          }
        ]
      });
    }

    if (requestUrl.startsWith("/api/data/azureRbac")) {
      return jsonResponse({
        collectionId: "azureRbac",
        columns: [],
        count: 1,
        page: 1,
        pageSize: 20,
        rows: [
          {
            accessDisplayName: "Owner on resource group rg-app",
            accessRisk: "high",
            accessResourceGroup: "rg-app",
            accessResourceId: null,
            accessScope: "/subscriptions/sub-1/resourceGroups/rg-app",
            accessScopeType: "ResourceGroup",
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
            scope: "/subscriptions/sub-1/resourceGroups/rg-app",
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
      count: 0,
      page: 1,
      pageSize: 20,
      rows: []
    });
  });
  globalThis.fetch = fetchMock;

  const { container, root } = renderComponent(<AzureComponent />);

  await clickButton("Resource groups");
  await waitForText(container, "rg-app");
  await clickButton("Open Azure RBAC assignments for resource group rg-app");
  await waitForText(container, "Owner on resource group rg-app");

  const azureRbacRequest = fetchMock.mock.calls
    .map(([input]) => String(input))
    .find((requestUrl) => requestUrl.startsWith("/api/data/azureRbac"));
  expect(azureRbacRequest).toBeDefined();

  const url = new URL(azureRbacRequest ?? "", window.location.origin);
  expect(url.searchParams.get("subscriptionId")).toBe("sub-1");
  expect(url.searchParams.get("resourceGroup")).toBe("rg-app");
  expect(url.searchParams.get("servicePrincipalId")).toBeNull();

  await clickButton("Close RBAC: rg-app tab");
  await waitForText(container, "rg-app");

  act(() => root.unmount());
});

test.skip("handles Backspace as in-app view back navigation outside editable fields", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 0,
        page: 1,
        pageSize: 20,
        rows: []
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

  const { root } = renderComponent(<AzureComponent />);

  await clickButton("Managed identities");
  expect(getButton("Managed identities").getAttribute("data-state")).toBe("active");

  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
  await act(async () => {
    window.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(true);
  expect(getButton("Service principals").getAttribute("data-state")).toBe("active");

  act(() => root.unmount());
});

test("handles browser Back as in-app view navigation before leaving the app page", async () => {
  window.history.pushState({ beforeOwnerLens: true }, "", "/before-ownerlens");
  window.history.pushState({}, "", "/ownerlens");

  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 0,
        page: 1,
        pageSize: 20,
        rows: []
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

  const { root } = renderComponent(<AzureComponent />);

  await clickButton("Managed identities");
  expect(getButton("Managed identities").getAttribute("data-state")).toBe("active");

  await act(async () => {
    window.history.back();
  });
  await waitFor(() => {
    expect(getButton("Service principals").getAttribute("data-state")).toBe("active");
  });

  expect(window.location.pathname).toBe("/ownerlens");

  act(() => root.unmount());
  window.history.replaceState(null, "", "/");
});

test("prevents Backspace browser navigation when no in-app view history is available", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () =>
    jsonResponse({
      collectionId: "entra.servicePrincipals",
      columns: [],
      count: 0,
      page: 1,
      pageSize: 20,
      rows: []
    })
  );

  const { root } = renderComponent(<AzureComponent />);

  expect(getButton("Service principals").getAttribute("data-state")).toBe("active");

  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
  await act(async () => {
    window.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(true);
  expect(getButton("Service principals").getAttribute("data-state")).toBe("active");

  act(() => root.unmount());
});

test("leaves Backspace available inside editable fields", async () => {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async (input) => {
    const requestUrl = String(input);

    if (requestUrl.startsWith("/api/data/entra/managedIdentities")) {
      return jsonResponse({
        collectionId: "entra.managedIdentities",
        columns: [],
        count: 0,
        page: 1,
        pageSize: 20,
        rows: []
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

  const { root } = renderComponent(<AzureComponent />);

  await clickButton("Managed identities");
  expect(getButton("Managed identities").getAttribute("data-state")).toBe("active");

  const input = document.createElement("input");
  input.value = "filter";
  document.body.appendChild(input);

  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
  await act(async () => {
    input.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(false);
  expect(getButton("Managed identities").getAttribute("data-state")).toBe("active");

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
          displayName: "uami-prod identity",
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

function csvResponse(body: string): Response {
  return {
    blob: async () => new Blob([body], { type: "text/csv; charset=utf-8" }),
    headers: new Headers({
      "Content-Disposition": 'attachment; filename="ownerlens-remediation-package-package-1.csv"'
    }),
    ok: true,
    status: 200
  } as Response;
}

function testRoleAssignment(roleDefinitionName: string, scope: string) {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription One",
    roleAssignmentId: `${roleDefinitionName}-${scope}`,
    scope,
    principalId: "sp-object-id",
    principalType: "ServicePrincipal",
    principalDisplayName: "Service principal app",
    signInName: null,
    roleDefinitionId: `${roleDefinitionName}-id`,
    roleDefinitionName,
    canDelegate: false,
    condition: null,
    conditionVersion: null
  };
}

function servicePrincipalRow({ displayName, id }: { displayName: string; id: string }) {
  return {
    accountEnabled: true,
    appDisplayName: displayName,
    appId: `${id}-client-id`,
    appOwnerOrganizationId: null,
    azureRbac: "Owner on subscription Platform",
    displayName,
    homepage: null,
    id,
    loginUrl: null,
    permissionRisk: "high",
    rbacRoleAssignmentCount: 1,
    rbacRoleLevel: "high",
    rbacSubscriptionCount: 1,
    publisherName: null,
    replyUrls: [],
    roleAssignments: [],
    oauthPermissionsCount: 0,
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
  };
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

async function clickButtonAt(label: string, index: number) {
  await act(async () => {
    const button = getButtons(label)[index];
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Expected button ${label} at index ${index}.`);
    }

    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    button.click();
  });
}

async function clickElementByLabel(label: string) {
  await act(async () => {
    const element = getElementByLabel(label);
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    element.click();
  });
}

async function changeInput(label: string, value: string): Promise<void> {
  const input = getInput(label);

  await act(async () => {
    setNativeInputValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

function servicePrincipalOwnerResponse(owner: { displayName: string; type: string }): Response {
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
        oauthPermissionsCount: 0,
        appRolesPermissionCount: 0,
        entraPermissionRisk: "none",
        servicePrincipalNames: [],
        servicePrincipalType: "Application",
        potentialOwners: [owner.displayName],
        ownerCandidates: [
          {
            key: "owner-1",
            displayName: owner.displayName,
            type: owner.type,
            confidence: "high",
            source: "entraApplicationOwner",
            rank: 1,
            evidence: [{ user: owner.displayName, date: "2026-06-05T00:00:00.000Z" }],
            relatedScopes: []
          }
        ],
        ownerConfidence: "high",
        tags: [],
        ztaMaxRisk: "none",
        ztaRemediationCountAll: 0,
        ztaRemediationFailedCount: 0
      }
    ]
  });
}

function ownershipEvidenceResponse(owner: { candidateKey?: string; displayName: string; type: string; disabled?: boolean }): Response {
  return jsonResponse({
    target: {
      kind: "servicePrincipal",
      id: "sp-object-id",
      displayName: "Service principal app"
    },
    evidence: [
      {
        key: `owner-1:${owner.displayName}:2026-06-05T00:00:00.000Z`,
        statusKey: `owner-1:${owner.displayName}:2026-06-05T00:00:00.000Z`,
        ownerCandidateKey: owner.candidateKey ?? "owner-1",
        ownerDisplayName: owner.displayName,
        ownerType: owner.type,
        confidence: "high",
        source: "entraApplicationOwner",
        path: "direct",
        discoverySource: "applicationOwner",
        rank: 1,
        evidence: owner.displayName,
        date: "2026-06-05T00:00:00.000Z",
        disabled: owner.disabled,
        relatedScopes: []
      }
    ]
  });
}

function getButton(label: string): HTMLButtonElement {
  const button = queryButton(label);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button ${label}.`);
  }

  return button;
}

function getButtons(label: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement &&
      (candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label)
  );
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

function getInput(label: string): HTMLInputElement {
  const input = [...document.querySelectorAll("input")].find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Expected input ${label}.`);
  }

  return input;
}

function getElementByLabel(label: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>("[aria-label]")].find(
    (candidate) => candidate.getAttribute("aria-label") === label
  );
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected element ${label}.`);
  }

  return element;
}

function queryButton(label: string): HTMLButtonElement | null {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label
  );

  return button instanceof HTMLButtonElement ? button : null;
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
  const prototype = Object.getPrototypeOf(input) as HTMLInputElement;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(input, value);
  } else if (valueSetter) {
    valueSetter.call(input, value);
  } else {
    input.value = value;
  }
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(blob);
  });
}

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
