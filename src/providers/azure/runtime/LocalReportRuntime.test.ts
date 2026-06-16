import { defineLocalReportRuntimeRestEndpoints } from "./localReportRuntimeRest";
import type { LocalReportRuntime } from "./LocalReportRuntime";
import { createRuntimeRestMiddleware } from "../../../core/runtime/rest";
import type { AzureSnapshot } from "../inputTransferObject/generated/AzureSnapshot";
import type { EntraSnapshot } from "../inputTransferObject/generated/EntraSnapshot";

function getEndpoint(
  endpoints: ReturnType<typeof defineLocalReportRuntimeRestEndpoints>,
  path: string,
  method?: string
) {
  const endpoint = endpoints.find(
    (candidate) => candidate.path === path && (!method || (candidate.method ?? "GET") === method)
  );

  if (!endpoint) {
    throw new Error(`Missing endpoint: ${path}`);
  }

  return endpoint;
}

test("defines local report runtime REST endpoints", async () => {
  const azureSnapshot: AzureSnapshot = {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      activityDays: 30,
      activityStartTime: "2026-05-06T00:00:00.000Z",
      maxActivityRecords: 1000,
      requestedSubscriptions: ["sub-1"],
      subscriptionCount: 0,
      resourceGroupCount: 2,
      resourceCount: 0,
      userAssignedManagedIdentityCount: 0,
      roleAssignmentCount: 0,
      activityLogCount: 2
    },
    subscriptions: [],
    resourceGroups: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription 1",
        resourceGroup: "rg-1",
        location: "westeurope",
        tags: { ownerGroup: "alice@example.test" }
      },
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription 1",
        resourceGroup: "rg-activity",
        location: "westeurope",
        tags: null
      }
    ],
    resources: [],
    userAssignedManagedIdentities: [],
    roleAssignments: [],
    activityLogs: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription 1",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        submissionTimestamp: null,
        caller: "alice@example.test",
        operationName: "Update resource group",
        operationNameValue: "Microsoft.Resources/subscriptions/resourcegroups/write",
        status: "Succeeded",
        subStatus: null,
        category: "Administrative",
        resourceGroupName: "rg-activity",
        resourceId: null,
        resourceProviderName: "Microsoft.Resources",
        resourceType: "Microsoft.Resources/resourceGroups",
        authorizationAction: "Microsoft.Resources/subscriptions/resourcegroups/write",
        authorizationScope: null
      },
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription 1",
        eventTimestamp: "2026-06-04T10:00:00.000Z",
        submissionTimestamp: null,
        caller: "bob@example.test",
        operationName: "Update resource group",
        operationNameValue: "Microsoft.Resources/subscriptions/resourcegroups/write",
        status: "Succeeded",
        subStatus: null,
        category: "Administrative",
        resourceGroupName: "rg-activity",
        resourceId: null,
        resourceProviderName: "Microsoft.Resources",
        resourceType: "Microsoft.Resources/resourceGroups",
        authorizationAction: "Microsoft.Resources/subscriptions/resourcegroups/write",
        authorizationScope: null
      }
    ]
  };
  const entraSnapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: [],
      servicePrincipalCount: 0
    },
    servicePrincipals: [],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };
  const disabledOwnerKeys = new Set<string>();
  const disabledAliceKey = "resourceGroup:sub-1:rg-activity:alice@example.test:2026-06-05T10:00:00.000Z";
  const emptyCollection = (
    collectionId: string,
    options: { page?: number; pageSize?: number }
  ): { collectionId: string; rows: unknown[]; columns: string[]; page: number; pageSize: number; count: number } => ({
    collectionId,
    rows: [],
    columns: [],
    page: options.page ?? 2,
    pageSize: options.pageSize ?? 25,
    count: 0
  });
  const runtime = {
    listSnapshots: jest.fn().mockResolvedValue({ files: [] }),
    readSnapshot: jest.fn((name: string) => {
      if (name === "snapshot.json") {
        return Promise.resolve(azureSnapshot);
      }

      if (name === "entra-snapshot.json") {
        return Promise.resolve(entraSnapshot);
      }

      return Promise.resolve({ meta: { provider: "unknown" } });
    }),
    readZeroTrustAssessmentReport: jest.fn().mockResolvedValue({
      Meta: {
        TenantId: "tenant-1",
        ExecutedAt: "2026-06-05T00:00:00.000Z"
      },
      Tests: [{ TestId: "zta-1", TestStatus: "Passed" }]
    }),
    readEntraServicePrincipals: jest.fn().mockResolvedValue([{ id: "sp-1" }]),
    readServicePrincipals: jest.fn().mockResolvedValue([{ id: "sp-1" }]),
    readManagedIdentities: jest.fn().mockResolvedValue([{ id: "mi-1" }]),
    readEntraOAuth2PermissionGrants: jest.fn().mockResolvedValue([{ id: "grant-1" }]),
    readEntraAppRoleAssignments: jest.fn().mockResolvedValue([{ id: "assignment-1" }]),
    readEntraPrincipalPermissions: jest.fn((principalId: string) =>
      Promise.resolve({
        principalId,
        oauth2PermissionGrants: [{ id: "grant-1", clientId: principalId }],
        appRoleAssignments: [{ id: "assignment-1", principalId }]
      })
    ),
    readAzureSubscriptions: jest.fn().mockResolvedValue([{ subscriptionId: "sub-1" }]),
    readAzureResourceGroups: jest.fn().mockResolvedValue([{ resourceGroup: "rg-1" }]),
    readAzureResources: jest.fn().mockResolvedValue([{ resourceId: "res-1" }]),
    readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([{ resourceId: "uami-1" }]),
    readAzureRoleAssignments: jest.fn().mockResolvedValue([{ roleAssignmentId: "ra-1" }]),
    readAzureActivityLogs: jest.fn().mockResolvedValue([{ eventTimestamp: "2026-06-05T00:00:00.000Z" }]),
    queryEntraServicePrincipals: jest.fn((options) =>
      Promise.resolve(emptyCollection("entra.servicePrincipals", options))
    ),
    exportEntraServicePrincipalsCsv: jest.fn(() =>
      Promise.resolve({
        kind: "csv",
        collectionId: "entra.servicePrincipals",
        fileName: "ownerlens-service-principals.csv",
        contentType: "text/csv; charset=utf-8",
        body: "\uFEFFid,displayName\nsp-1,App",
        columns: ["id", "displayName"],
        count: 1
      })
    ),
    queryEntraManagedIdentities: jest.fn((options) =>
      Promise.resolve(emptyCollection("entra.managedIdentities", options))
    ),
    exportEntraManagedIdentitiesCsv: jest.fn(() =>
      Promise.resolve({
        kind: "csv",
        collectionId: "entra.managedIdentities",
        fileName: "ownerlens-managed-identities.csv",
        contentType: "text/csv; charset=utf-8",
        body: "\uFEFFid,displayName\nmi-1,Identity",
        columns: ["id", "displayName"],
        count: 1
      })
    ),
    queryEntraOAuth2PermissionGrants: jest.fn((options) =>
      Promise.resolve(emptyCollection("entra.oauth2PermissionGrants", options))
    ),
    queryEntraAppRoleAssignments: jest.fn((options) =>
      Promise.resolve(emptyCollection("entra.appRoleAssignments", options))
    ),
    queryAzureSubscriptions: jest.fn((options) =>
      Promise.resolve(emptyCollection("azureResources.subscriptions", options))
    ),
    queryAzureResourceGroups: jest.fn((options) =>
      Promise.resolve(emptyCollection("azureResources.resourceGroups", options))
    ),
    queryAzureResourceGroupOwnership: jest.fn((options: { page?: number; pageSize?: number }) => {
      const aliceDisabled = disabledOwnerKeys.has(disabledAliceKey);

      return Promise.resolve({
        collectionId: "azureResources.resourceGroupOwnership",
        columns: [],
        rows: [
          {
            resourceGroup: "rg-1",
            owner: "alice@example.test",
            confidence: "high",
            source: "tag.ownerGroup",
            evidence: [{ user: "ownerGroup=alice@example.test", date: null }]
          },
          {
            resourceGroup: "rg-activity",
            targetKey: "resourceGroup:sub-1:rg-activity",
            owner: aliceDisabled ? "bob@example.test" : "alice@example.test",
            confidence: "low",
            source: "activity.lastModifier",
            evidence: [
              {
                user: "alice@example.test",
                date: "2026-06-05T10:00:00.000Z",
                disabled: aliceDisabled || undefined
              },
              { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
            ]
          }
        ],
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 10,
        count: 2
      });
    }),
    exportAzureResourceGroupOwnershipCsv: jest.fn(() =>
      Promise.resolve({
        kind: "csv",
        collectionId: "azureResources.resourceGroupOwnership",
        fileName: "ownerlens-resource-groups.csv",
        contentType: "text/csv; charset=utf-8",
        body: "\uFEFFsubscriptionId,resourceGroup,owner\nsub-1,rg-1,alice@example.test",
        columns: ["subscriptionId", "resourceGroup", "owner"],
        count: 1
      })
    ),
    queryAzureResources: jest.fn((options) => Promise.resolve(emptyCollection("azureResources.resources", options))),
    queryAzureUserAssignedManagedIdentities: jest.fn((options) =>
      Promise.resolve(emptyCollection("azureResources.userAssignedManagedIdentities", options))
    ),
    queryAzureRoleAssignments: jest.fn((options) =>
      Promise.resolve(emptyCollection("azureResources.roleAssignments", options))
    ),
    queryAzureRbac: jest.fn((servicePrincipalId: string, options: { page?: number; pageSize?: number }) =>
      Promise.resolve({
        collectionId: "azureRbac",
        rows: [
          {
            servicePrincipalId,
            accessScope: "/subscriptions/sub-1/resourceGroups/rg-1",
            accessScopeType: "ResourceGroup"
          }
        ],
        columns: ["servicePrincipalId", "accessScope", "accessScopeType"],
        page: options.page ?? 1,
        pageSize: options.pageSize ?? 10,
        count: 1
      })
    ),
    queryAzureActivityLogs: jest.fn((options) =>
      Promise.resolve(emptyCollection("azureResources.activityLogs", options))
    ),
    queryZeroTrustAssessmentReport: jest.fn((options) =>
      Promise.resolve(emptyCollection("zeroTrustAssessment.report", options))
    ),
    exportZeroTrustAssessmentReportCsv: jest.fn(() =>
      Promise.resolve({
        kind: "csv",
        collectionId: "zeroTrustAssessment.report",
        fileName: "ownerlens-zero-trust-assessment.csv",
        contentType: "text/csv; charset=utf-8",
        body: "\uFEFFTestId,TestStatus\nzta-1,Failed",
        columns: ["TestId", "TestStatus"],
        count: 1
      })
    ),
    createZeroTrustAssessmentRemediationPackage: jest.fn(() =>
      Promise.resolve({
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
            targetId: "sp-1",
            targetLabel: "Service principal app",
            title: "Service principal exposure",
            risk: "High",
            sourceEvidence: {
              sourceKind: "zeroTrustAssessment"
            }
          }
        ]
      })
    ),
    readRemediationPackage: jest.fn((packageId: string) =>
      Promise.resolve({
        id: packageId,
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
            packageId,
            createdAt: "2026-06-12T10:00:00.000Z",
            status: "open",
            targetKind: "zeroTrustAssessmentTest",
            targetId: "35016",
            targetLabel: "Mandatory labeling is enabled in sensitivity label policies",
            title: "Mandatory labeling is enabled in sensitivity label policies",
            risk: "medium",
            sourceEvidence: {
              sourceKind: "zeroTrustAssessment"
            }
          }
        ]
      })
    ),
    exportRemediationPackageTasksCsv: jest.fn(() =>
      Promise.resolve({
        kind: "csv",
        collectionId: "remediationPackage.tasks",
        fileName: "ownerlens-remediation-package-package-1.csv",
        contentType: "text/csv; charset=utf-8",
        body: "Task ID,Title\ntask-1,Service principal exposure",
        columns: ["id", "title"],
        count: 1
      })
    ),
    deleteRemediationTasks: jest.fn((request: { packageId: string; taskIds: string[] }) =>
      Promise.resolve({
        id: request.packageId,
        createdAt: "2026-06-12T10:00:00.000Z",
        sourceKind: "zeroTrustAssessment",
        sourceLabel: "Zero Trust Assessment",
        sourceQuery: {
          filters: {},
          selectedRowKeys: ["zta-1"]
        },
        taskCount: 0,
        tasks: []
      })
    ),
    readDisabledOwnerEvidenceKeys: jest.fn(() => Promise.resolve(new Set(disabledOwnerKeys))),
    setOwnerEvidenceDisabled: jest.fn((key: string, disabled: boolean) => {
      if (disabled) {
        disabledOwnerKeys.add(key);
      } else {
        disabledOwnerKeys.delete(key);
      }

      return Promise.resolve(disabledOwnerKeys.size);
    }),
    recalculateEnrichment: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({ initialized: true })
  };

  const endpoints = defineLocalReportRuntimeRestEndpoints(runtime as unknown as LocalReportRuntime);
  const listEndpoint = getEndpoint(endpoints, "/api/data");
  const readEndpoint = getEndpoint(endpoints, "/api/data/read");
  const servicePrincipalsEndpoint = getEndpoint(endpoints, "/api/data/entra/servicePrincipals");
  const managedIdentitiesEndpoint = getEndpoint(endpoints, "/api/data/entra/managedIdentities");
  const entraPermissionsEndpoint = getEndpoint(endpoints, "/api/data/entra/permissions");
  const oauth2PermissionGrantsEndpoint = getEndpoint(endpoints, "/api/data/entra/oauth2PermissionGrants");
  const appRoleAssignmentsEndpoint = getEndpoint(endpoints, "/api/data/entra/appRoleAssignments");
  const subscriptionsEndpoint = getEndpoint(endpoints, "/api/data/azureResources/subscriptions");
  const resourceGroupsEndpoint = getEndpoint(endpoints, "/api/data/azureResources/resourceGroups");
  const resourceGroupOwnershipEndpoint = getEndpoint(endpoints, "/api/data/azureResources/resourceGroupOwnership");
  const disabledEvidenceEndpoint = getEndpoint(
    endpoints,
    "/api/data/azureResources/resourceGroupOwnership/disabledEvidence"
  );
  const resourcesEndpoint = getEndpoint(endpoints, "/api/data/azureResources/resources");
  const userAssignedManagedIdentitiesEndpoint = getEndpoint(
    endpoints,
    "/api/data/azureResources/userAssignedManagedIdentities"
  );
  const roleAssignmentsEndpoint = getEndpoint(endpoints, "/api/data/azureResources/roleAssignments");
  const azureRbacEndpoint = getEndpoint(endpoints, "/api/data/azureRbac");
  const activityLogsEndpoint = getEndpoint(endpoints, "/api/data/azureResources/activityLogs");
  const zeroTrustAssessmentReportEndpoint = getEndpoint(endpoints, "/api/data/zeroTrustAssessment/report");
  const zeroTrustAssessmentRemediationPackagesEndpoint = getEndpoint(
    endpoints,
    "/api/data/zeroTrustAssessment/remediationPackages"
  );
  const remediationPackagesEndpoint = getEndpoint(endpoints, "/api/data/remediationPackages");
  const remediationTaskExportEndpoint = getEndpoint(endpoints, "/api/data/remediationPackages/tasks", "GET");
  const remediationTasksEndpoint = getEndpoint(endpoints, "/api/data/remediationPackages/tasks", "DELETE");
  const enrichmentRecalculateEndpoint = getEndpoint(endpoints, "/api/data/runtime/enrichment/recalculate");
  const runtimeEndpoint = getEndpoint(endpoints, "/api/data/runtime");

  expect(enrichmentRecalculateEndpoint.method).toBe("POST");

  expect(endpoints.map((endpoint) => endpoint.path)).toEqual([
    "/api/data",
    "/api/data/read",
    "/api/data/entra/servicePrincipals",
    "/api/data/entra/managedIdentities",
    "/api/data/entra/permissions",
    "/api/data/entra/oauth2PermissionGrants",
    "/api/data/entra/appRoleAssignments",
    "/api/data/azureResources/subscriptions",
    "/api/data/azureResources/resourceGroups",
    "/api/data/azureResources/resourceGroupOwnership",
    "/api/data/azureResources/resourceGroupOwnership/disabledEvidence",
    "/api/data/azureResources/resources",
    "/api/data/azureResources/userAssignedManagedIdentities",
    "/api/data/azureResources/roleAssignments",
    "/api/data/azureRbac",
    "/api/data/azureResources/activityLogs",
    "/api/data/zeroTrustAssessment/report",
    "/api/data/zeroTrustAssessment/remediationPackages",
    "/api/data/remediationPackages",
    "/api/data/remediationPackages/tasks",
    "/api/data/remediationPackages/tasks",
    "/api/data/runtime/enrichment/recalculate",
    "/api/data/runtime"
  ]);
  await expect(listEndpoint.handle({ req: {}, url: new URL("http://localhost/api/data") })).resolves.toEqual({
    files: []
  });
  await expect(
    readEndpoint.handle({ req: {}, url: new URL("http://localhost/api/data/read?name=entra-snapshot.json") })
  ).resolves.toEqual(entraSnapshot);
  await expect(
    servicePrincipalsEndpoint.handle({
      req: {},
      url: new URL(
        "http://localhost/api/data/entra/servicePrincipals?page=2&count=25&filter[0][column]=displayName&filter[0][value][0]=app&filter[0][value][1]=api&filter[1][column]=accountEnabled&filter[1][value]=true&sort[0][column]=displayName&sort[0][direction]=asc&sort[1][column]=permissionRisk&sort[1][direction]=desc"
      )
    })
  ).resolves.toEqual({
    collectionId: "entra.servicePrincipals",
    rows: [],
    columns: [],
    page: 2,
    pageSize: 25,
    count: 0
  });
  expect(runtime.queryEntraServicePrincipals).toHaveBeenLastCalledWith({
    filters: [
      { column: "displayName", values: ["app", "api"] },
      { column: "accountEnabled", values: ["true"] }
    ],
    sortRules: [
      { columnId: "displayName", direction: "asc" },
      { columnId: "permissionRisk", direction: "desc" }
    ],
    page: 2,
    pageSize: 25
  });
  await expect(
    servicePrincipalsEndpoint.handle({
      req: {},
      url: new URL(
        "http://localhost/api/data/entra/servicePrincipals?format=csv&filter[0][column]=displayName&filter[0][value]=app&sort[0][column]=displayName&sort[0][direction]=asc"
      )
    })
  ).resolves.toMatchObject({
    kind: "csv",
    collectionId: "entra.servicePrincipals",
    fileName: "ownerlens-service-principals.csv",
    body: "\uFEFFid,displayName\nsp-1,App"
  });
  await managedIdentitiesEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/entra/managedIdentities?page=1&count=10")
  });
  await managedIdentitiesEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/entra/managedIdentities?format=csv")
  });
  await expect(
    entraPermissionsEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/entra/permissions?principalId=sp-1")
    })
  ).resolves.toEqual({
    principalId: "sp-1",
    oauth2PermissionGrants: [{ id: "grant-1", clientId: "sp-1" }],
    appRoleAssignments: [{ id: "assignment-1", principalId: "sp-1" }]
  });
  expect(() =>
    entraPermissionsEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/entra/permissions")
    })
  ).toThrow("Missing required query parameter: principalId");
  await oauth2PermissionGrantsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/entra/oauth2PermissionGrants?page=1&count=10")
  });
  await appRoleAssignmentsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/entra/appRoleAssignments?page=1&count=10")
  });
  await subscriptionsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/subscriptions?page=1&count=10")
  });
  await resourceGroupsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/resourceGroups?page=1&count=10")
  });
  await expect(
    resourceGroupOwnershipEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
    })
  ).resolves.toMatchObject({
    collectionId: "azureResources.resourceGroupOwnership",
    rows: expect.arrayContaining([
      expect.objectContaining({
        resourceGroup: "rg-1",
        owner: "alice@example.test",
        confidence: "high",
        source: "tag.ownerGroup",
        evidence: [{ user: "ownerGroup=alice@example.test", date: null }]
      }),
      expect.objectContaining({
        resourceGroup: "rg-activity",
        targetKey: "resourceGroup:sub-1:rg-activity",
        owner: "alice@example.test",
        confidence: "low",
        source: "activity.lastModifier",
        evidence: [
          { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z" },
          { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
        ]
      })
    ]),
    page: 1,
    pageSize: 10,
    count: 2
  });
  await expect(
    disabledEvidenceEndpoint.handle({
      req: {},
      url: new URL(
        "http://localhost/api/data/azureResources/resourceGroupOwnership/disabledEvidence?key=resourceGroup%3Asub-1%3Arg-activity%3Aalice%40example.test%3A2026-06-05T10%3A00%3A00.000Z&disabled=true"
      )
    })
  ).resolves.toEqual({
    key: "resourceGroup:sub-1:rg-activity:alice@example.test:2026-06-05T10:00:00.000Z",
    disabled: true,
    disabledCount: 1
  });
  await expect(
    resourceGroupOwnershipEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
    })
  ).resolves.toMatchObject({
    rows: expect.arrayContaining([
      expect.objectContaining({
        resourceGroup: "rg-activity",
        owner: "bob@example.test",
        confidence: "low",
        evidence: [
          { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z", disabled: true },
          { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
        ]
      })
    ])
  });
  await resourceGroupOwnershipEndpoint.handle({
    req: {},
    url: new URL(
      "http://localhost/api/data/azureResources/resourceGroupOwnership?format=csv&filter[0][column]=owner&filter[0][value]=alice&sort[0][column]=resourceGroup&sort[0][direction]=asc&selectedRowKey=sub-1%3Arg-1"
    )
  });
  await resourcesEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/resources?page=1&count=10")
  });
  await userAssignedManagedIdentitiesEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/userAssignedManagedIdentities?page=1&count=10")
  });
  await roleAssignmentsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/roleAssignments?page=1&count=10")
  });
  await expect(
    azureRbacEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/azureRbac?servicePrincipalId=sp-1&page=1&count=10")
    })
  ).resolves.toMatchObject({
    collectionId: "azureRbac",
    rows: [
      {
        servicePrincipalId: "sp-1",
        accessScope: "/subscriptions/sub-1/resourceGroups/rg-1",
        accessScopeType: "ResourceGroup"
      }
    ],
    page: 1,
    pageSize: 10,
    count: 1
  });
  expect(() =>
    azureRbacEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/azureRbac?page=1&count=10")
    })
  ).toThrow("Missing required query parameter: servicePrincipalId");
  await activityLogsEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/azureResources/activityLogs?page=1&count=10")
  });
  await expect(
    zeroTrustAssessmentReportEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/zeroTrustAssessment/report?page=1&count=10")
    })
  ).resolves.toEqual({
    collectionId: "zeroTrustAssessment.report",
    rows: [],
    columns: [],
    page: 1,
    pageSize: 10,
    count: 0
  });
  await zeroTrustAssessmentReportEndpoint.handle({
    req: {},
    url: new URL("http://localhost/api/data/zeroTrustAssessment/report?format=csv")
  });
  await expect(
    zeroTrustAssessmentRemediationPackagesEndpoint.handle({
      body: {
        filters: {
          RelatedObjects: {
            type: "text",
            value: "sp-1"
          }
        },
        selectAllMatchingFilters: "true",
        selectedRowKeys: ["zta-1"]
      },
      req: {},
      url: new URL("http://localhost/api/data/zeroTrustAssessment/remediationPackages")
    })
  ).resolves.toMatchObject({
    id: "package-1"
  });
  await expect(
    remediationPackagesEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/remediationPackages?id=package-1")
    })
  ).resolves.toMatchObject({
    id: "package-1",
    sourceKind: "zeroTrustAssessment",
    taskCount: 1,
    tasks: [
      expect.objectContaining({
        status: "open",
        targetId: "35016"
      })
    ]
  });
  await expect(
    remediationTaskExportEndpoint.handle({
      req: {},
      url: new URL(
        "http://localhost/api/data/remediationPackages/tasks?format=csv&id=package-1&selectedRowKey=task-1&sort[0][column]=title&sort[0][direction]=asc"
      )
    })
  ).resolves.toMatchObject({
    kind: "csv",
    collectionId: "remediationPackage.tasks",
    fileName: "ownerlens-remediation-package-package-1.csv"
  });
  await expect(
    remediationTasksEndpoint.handle({
      body: {
        packageId: "package-1",
        taskIds: ["task-1"]
      },
      req: {},
      url: new URL("http://localhost/api/data/remediationPackages/tasks")
    })
  ).resolves.toMatchObject({
    id: "package-1",
    taskCount: 0,
    tasks: []
  });
  await expect(
    zeroTrustAssessmentRemediationPackagesEndpoint.handle({
      body: {
        filters: {},
        selectedRowKeys: "zta-1"
      },
      req: {},
      url: new URL("http://localhost/api/data/zeroTrustAssessment/remediationPackages")
    })
  ).rejects.toThrow("Invalid Zero Trust Assessment remediation package request.");
  await expect(
    enrichmentRecalculateEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/runtime/enrichment/recalculate")
    })
  ).resolves.toBeUndefined();
  expect(runtimeEndpoint.handle({ req: {}, url: new URL("http://localhost/api/data/runtime") })).toEqual({
    initialized: true
  });
  expect(runtime.recalculateEnrichment).toHaveBeenCalledTimes(1);
  expect(runtime.readZeroTrustAssessmentReport).not.toHaveBeenCalled();
  expect(runtime.readSnapshot).toHaveBeenCalledWith("entra-snapshot.json");
  expect(runtime.queryEntraServicePrincipals).toHaveBeenCalledWith({
    filters: [
      { column: "displayName", values: ["app", "api"] },
      { column: "accountEnabled", values: ["true"] }
    ],
    sortRules: [
      { columnId: "displayName", direction: "asc" },
      { columnId: "permissionRisk", direction: "desc" }
    ],
    page: 2,
    pageSize: 25
  });
  expect(runtime.exportEntraServicePrincipalsCsv).toHaveBeenCalledWith({
    filters: [{ column: "displayName", values: ["app"] }],
    sortRules: [{ columnId: "displayName", direction: "asc" }],
    page: undefined,
    pageSize: undefined
  });
  expect(runtime.queryEntraManagedIdentities).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.exportEntraManagedIdentitiesCsv).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: undefined,
    pageSize: undefined
  });
  expect(runtime.readEntraPrincipalPermissions).toHaveBeenCalledWith("sp-1");
  expect(runtime.queryEntraOAuth2PermissionGrants).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryEntraAppRoleAssignments).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureSubscriptions).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureResourceGroups).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureResourceGroupOwnership).toHaveBeenNthCalledWith(1, {
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureResourceGroupOwnership).toHaveBeenNthCalledWith(2, {
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.exportAzureResourceGroupOwnershipCsv).toHaveBeenCalledWith({
    filters: [{ column: "owner", values: ["alice"] }],
    sortRules: [{ columnId: "resourceGroup", direction: "asc" }],
    page: undefined,
    pageSize: undefined,
    selectedRowKeys: ["sub-1:rg-1"]
  });
  expect(runtime.queryAzureResources).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureUserAssignedManagedIdentities).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureRoleAssignments).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureRbac).toHaveBeenCalledWith("sp-1", {
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryAzureActivityLogs).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.queryZeroTrustAssessmentReport).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: 1,
    pageSize: 10
  });
  expect(runtime.exportZeroTrustAssessmentReportCsv).toHaveBeenCalledWith({
    filters: [],
    sortRules: [],
    page: undefined,
    pageSize: undefined
  });
  expect(runtime.createZeroTrustAssessmentRemediationPackage).toHaveBeenCalledWith({
    filters: {
      RelatedObjects: {
        type: "text",
        value: "sp-1"
      }
    },
    selectAllMatchingFilters: false,
    selectedRowKeys: ["zta-1"]
  });
  expect(runtime.readRemediationPackage).toHaveBeenCalledWith("package-1");
  expect(runtime.exportRemediationPackageTasksCsv).toHaveBeenCalledWith("package-1", {
    filters: [],
    sortRules: [{ columnId: "title", direction: "asc" }],
    page: undefined,
    pageSize: undefined,
    selectedRowKeys: ["task-1"]
  });
  expect(runtime.deleteRemediationTasks).toHaveBeenCalledWith({
    packageId: "package-1",
    taskIds: ["task-1"]
  });
});

test("returns 201 Created with remediation package id when creating a package", async () => {
  const runtime = {
    createZeroTrustAssessmentRemediationPackage: jest.fn(() =>
      Promise.resolve({
        id: "package-1",
        createdAt: "2026-06-12T10:00:00.000Z",
        sourceKind: "zeroTrustAssessment",
        sourceLabel: "Zero Trust Assessment",
        sourceQuery: {
          filters: {},
          selectedRowKeys: ["zta-1"]
        },
        taskCount: 1,
        tasks: []
      })
    )
  };
  const middleware = createRuntimeRestMiddleware({
    basePath: "/api/data",
    endpoints: defineLocalReportRuntimeRestEndpoints(runtime as unknown as LocalReportRuntime),
    getErrorStatusCode: () => 500
  });
  const response = createTestResponse();
  const next = jest.fn();

  await middleware(
    {
      body: {
        filters: {},
        selectedRowKeys: ["zta-1"]
      },
      method: "POST",
      url: "/api/data/zeroTrustAssessment/remediationPackages"
    },
    response,
    next
  );

  expect(next).not.toHaveBeenCalled();
  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body)).toEqual({ id: "package-1" });
});

test("returns CSV runtime export artifacts as downloadable files", async () => {
  const middleware = createRuntimeRestMiddleware({
    basePath: "/api/data",
    endpoints: [
      {
        path: "/api/data/test",
        handle: () => ({
          kind: "csv",
          collectionId: "test.collection",
          fileName: "test.csv",
          contentType: "text/csv; charset=utf-8",
          body: "id\n1",
          columns: ["id"],
          count: 1
        })
      }
    ],
    getErrorStatusCode: () => 500
  });
  const response = createTestResponse();
  const next = jest.fn();

  await middleware(
    {
      method: "GET",
      url: "/api/data/test"
    },
    response,
    next
  );

  expect(next).not.toHaveBeenCalled();
  expect(response.statusCode).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="test.csv"');
  expect(response.body).toBe("id\n1");
});

test("returns 400 for malformed JSON request bodies", async () => {
  const middleware = createRuntimeRestMiddleware({
    basePath: "/api/data",
    endpoints: [
      {
        method: "POST",
        parseJsonBody: true,
        path: "/api/data/test",
        handle: ({ body }) => body
      }
    ],
    getErrorStatusCode: (error) => (error instanceof Error && error.message === "Malformed JSON request body." ? 400 : 500)
  });
  const response = createTestResponse();
  const next = jest.fn();

  await middleware(
    {
      body: "{not-json",
      method: "POST",
      url: "/api/data/test"
    },
    response,
    next
  );

  expect(next).not.toHaveBeenCalled();
  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body)).toEqual({ error: "Malformed JSON request body." });
});

test("returns JSON 404 for unknown runtime API paths", async () => {
  const middleware = createRuntimeRestMiddleware({
    basePath: "/api/data",
    endpoints: [],
    getErrorStatusCode: (error) => (error instanceof Error && error.message === "Runtime API endpoint not found." ? 404 : 500)
  });
  const response = createTestResponse();
  const next = jest.fn();

  await middleware(
    {
      method: "GET",
      url: "/api/data/remediationPackages"
    },
    response,
    next
  );

  expect(next).not.toHaveBeenCalled();
  expect(response.statusCode).toBe(404);
  expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
  expect(JSON.parse(response.body)).toEqual({ error: "Runtime API endpoint not found." });
});

function createTestResponse() {
  return {
    body: "",
    headers: new Map<string, string>(),
    statusCode: 200,
    end(body: string) {
      this.body = body;
    },
    setHeader(name: string, value: string) {
      this.headers.set(name, value);
    }
  };
}
