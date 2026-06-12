import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";

import { LocalReportRuntime } from "./LocalReportRuntime";
import { defineLocalReportRuntimeRestEndpoints } from "./localReportRuntimeRest";
import type { AzureSnapshot } from "../../../core/azure/resources";
import type { EntraSnapshot } from "../inputTransferObject/entra/EntraSnapshot";
import {
  importZeroTrustAssessmentReportToDuckDb,
  readZeroTrustAssessmentReportFromDuckDb
} from "./zta/snapshotStore";
import { insertEntraServicePrincipalRows } from "./entra/servicePrincipalsTable";
import { insertEntraApplicationRows } from "./entra/applicationsTable";
import { prepareRuntimeSqlSchema } from "./runtimeSqlSchema";
import type { ZeroTrustAssessmentReport } from "./zta/types";

type TestGlobal = typeof globalThis & {
  gc?: () => void;
};

async function collectDuckDbNativeHandles(): Promise<void> {
  // DuckDB's native result wrappers release their libuv handles through finalizers.
  const gc = (globalThis as TestGlobal).gc;

  if (!gc) {
    return;
  }

  for (let cycle = 0; cycle < 3; cycle += 1) {
    gc();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

afterEach(async () => {
  await collectDuckDbNativeHandles();
});

afterAll(async () => {
  await collectDuckDbNativeHandles();
});

type DuckDbTestInstance = Awaited<ReturnType<typeof DuckDBInstance.create>>;
type DuckDbTestConnection = Awaited<ReturnType<DuckDbTestInstance["connect"]>>;

async function withRuntimeTestDir<T>(
  fn: (ctx: { dataDir: string; runtime: LocalReportRuntime; databasePath: string }) => Promise<T>,
  options?: { databasePath?: string }
): Promise<T> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ownerlens-runtime-"));
  const databasePath = options?.databasePath ?? path.join(dataDir, "runtime.duckdb");
  const runtime = new LocalReportRuntime({ dataDir, databasePath });

  try {
    return await fn({ dataDir, runtime, databasePath });
  } finally {
    await runtime.close();
    await rm(dataDir, { force: true, recursive: true });
  }
}

async function withDuckDb<T>(
  fn: (ctx: { instance: DuckDbTestInstance; connection: DuckDbTestConnection }) => Promise<T>,
  databasePath = ":memory:"
): Promise<T> {
  const instance = await DuckDBInstance.create(databasePath);
  const connection = await instance.connect();

  try {
    return await fn({ instance, connection });
  } finally {
    connection.disconnectSync();
    instance.closeSync();
  }
}

function getEndpoint(endpoints: ReturnType<typeof defineLocalReportRuntimeRestEndpoints>, path: string) {
  const endpoint = endpoints.find((candidate) => candidate.path === path);

  if (!endpoint) {
    throw new Error(`Missing endpoint: ${path}`);
  }

  return endpoint;
}

test("imports Zero Trust Assessment report into DuckDB and reads it back through the runtime", async () => {
  const report: ZeroTrustAssessmentReport = {
    Account: "owner@example.test",
    CurrentVersion: "2.4.100",
    Domain: "example.test",
    ExecutedAt: "2026-06-02T16:06:31.3057648+02:00",
    LatestVersion: "2.3.0",
    TenantId: "tenant-1",
    TenantInfo: {
      TenantOverview: {
        UserCount: 4
      }
    },
    TenantName: "Example tenant",
    TestResultSummary: {
      IdentityPassed: 1,
      IdentityTotal: 2
    },
    Tests: [
      {
        TestId: "21791",
        TestTitle: "Guest can't invite other guests",
        TestPillar: "Identity",
        TestImpact: "Medium",
        TestImplementationCost: "Low",
        TestMinimumLicense: "Free",
        TestStatus: "Failed",
        TestResult: "Tenant allows any user to invite guests.",
        TestTags: ["ExternalCollaboration"],
        TestSkipped: "",
        TestDescription: "External collaboration should be restricted.",
        TestCategory: "External collaboration",
        TestRisk: "Medium",
        TestSfiPillar: "Protect tenants and isolate production systems",
        TestAppliesTo: ["Identity"],
        RelatedObjects: [
          {
            object_id: "object-1",
            id: "principal-id-1",
            applicationId: "app-client-1",
            displayName: "Searchable owner app",
            servicePrincipalType: "Application"
          },
          {
            object_id: "object-2",
            id: "principal-id-2",
            applicationId: "app-client-2",
            displayName: "Other owner app",
            servicePrincipalType: "ManagedIdentity"
          }
        ]
      },
      {
        TestId: 21823,
        TestTitle: "Guest self-service sign-up via user flow is disabled",
        TestPillar: "Identity",
        TestStatus: "Passed",
        TestMinimumLicense: ["Free"],
        RelatedObjects: []
      }
    ]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    const exportDir = path.join(dataDir, "exports", "nested");

    await mkdir(exportDir, { recursive: true });
    await writeFile(path.join(dataDir, "regular.json"), JSON.stringify({ TenantId: "not-zta" }), "utf8");
    await writeFile(
      path.join(exportDir, "older-zta-report.json"),
      JSON.stringify({
        ...report,
        ExecutedAt: "2026-06-01T16:06:31.3057648+02:00",
        Tests: [{ TestId: "old", TestStatus: "Failed" }]
      }),
      "utf8"
    );
    await writeFile(path.join(exportDir, "tenant-zta-report.json"), JSON.stringify(report), "utf8");
    await runtime.initialize();

    expect(runtime.getStatus().zeroTrustAssessment).toMatchObject({
      imported: true,
      fileName: "exports/nested/tenant-zta-report.json",
      testCount: 2
    });

    const imported = await runtime.readZeroTrustAssessmentReport();
    expect(imported).toMatchObject({
      Meta: {
        Account: "owner@example.test",
        TenantId: "tenant-1",
        TestResultSummary: {
          IdentityPassed: 1,
          IdentityTotal: 2
        }
      }
    });
    expect(imported.Tests).toHaveLength(2);
    expect(imported.Tests[0]).toMatchObject({
      TestId: "21791",
      TestImpact: "medium",
      TestRisk: "medium",
      TestStatus: "Failed"
    });
    expect(imported.Tests[0].RelatedObjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ object_id: "object-1" }),
        expect.objectContaining({ object_id: "object-2" })
      ])
    );
    expect(imported.Tests[1]).toMatchObject({
      TestId: 21823,
      TestMinimumLicense: ["Free"]
    });

    const endpoints = defineLocalReportRuntimeRestEndpoints(runtime);
    const ztaReportEndpoint = getEndpoint(endpoints, "/api/data/zeroTrustAssessment/report");
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL("http://localhost/api/data/zeroTrustAssessment/report")
      })
    ).resolves.toMatchObject({
      collectionId: "zeroTrustAssessment.report",
      rows: [
        expect.objectContaining({
          TestId: "21791"
        }),
        expect.objectContaining({
          TestId: 21823
        })
      ],
      page: 1,
      pageSize: 50,
      count: 2
    });
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=app-client-1"
        )
      })
    ).resolves.toEqual(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            TestId: "21791",
            RelatedObjects: [
              expect.objectContaining({
                object_id: "object-1",
                applicationId: "app-client-1"
              })
            ]
          })
        ],
        count: 1
      })
    );
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=principal-id-1"
        )
      })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ TestId: "21791" })],
      count: 1
    });
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=Searchable%20owner"
        )
      })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ TestId: "21791" })],
      count: 1
    });
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=object-1"
        )
      })
    ).resolves.toMatchObject({
      rows: [],
      count: 0
    });
    await expect(
      ztaReportEndpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=Application"
        )
      })
    ).resolves.toMatchObject({
      rows: [],
      count: 0
    });
  });
});

test("fills Zero Trust Assessment related object application ids through the REST endpoint", async () => {
  const payrollServicePrincipal = servicePrincipal("sp-1", "client-app-1", "Payroll API", "Application");
  payrollServicePrincipal.tags = ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"];
  const entraSnapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: [],
      servicePrincipalCount: 1
    },
    servicePrincipals: [payrollServicePrincipal],
    applications: [application("application-object-1", "client-app-1", "Payroll app registration")],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };
  const report: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-1",
    TestResultSummary: { IdentityFailed: 1 },
    Tests: [
      {
        TestId: "sp-test",
        TestStatus: "Failed",
        RelatedObjects: [
          {
            object_id: "sp-1",
            displayName: "Payroll API",
            servicePrincipalType: "Application"
          }
        ]
      }
    ]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(entraSnapshot), "utf8");
    await writeFile(path.join(dataDir, "zta-report.json"), JSON.stringify(report), "utf8");
    await runtime.initialize();

    const endpoint = getEndpoint(
      defineLocalReportRuntimeRestEndpoints(runtime),
      "/api/data/zeroTrustAssessment/report"
    );

    await expect(
      endpoint.handle({
        req: {},
        url: new URL("http://localhost/api/data/zeroTrustAssessment/report")
      })
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({
          RelatedObjects: [
            expect.objectContaining({
              object_id: "sp-1",
              servicePrincipalId: "sp-1",
              tags: ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"],
              applicationId: "application-object-1"
            })
          ]
        })
      ],
      Tests: [
        expect.objectContaining({
          RelatedObjects: [
            expect.objectContaining({
              object_id: "sp-1",
              servicePrincipalId: "sp-1",
              tags: ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"],
              applicationId: "application-object-1"
            })
          ]
        })
      ]
    });
    await expect(
      endpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=sp-1"
        )
      })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ TestId: "sp-test" })],
      count: 1
    });
    await expect(
      endpoint.handle({
        req: {},
        url: new URL(
          "http://localhost/api/data/zeroTrustAssessment/report?filter[0][column]=RelatedObjects&filter[0][value][0]=HideApp"
        )
      })
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ TestId: "sp-test" })],
      count: 1
    });
  });
});

test("reads the latest Zero Trust Assessment report from DuckDB by execution time", async () => {
  const olderReport: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-01T10:00:00.000Z",
    TenantId: "tenant-old",
    TestResultSummary: { IdentityPassed: 1 },
    Tests: [{ TestId: "old", TestStatus: "Failed" }]
  };
  const latestReport: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-latest",
    TestResultSummary: { IdentityPassed: 2 },
    CustomTopLevelField: "preserved",
    Tests: [{ TestId: "latest", TestStatus: "Passed" }]
  };

  const imported = await withDuckDb(async ({ connection }) => {
    await prepareRuntimeSqlSchema(connection);
    await importZeroTrustAssessmentReportToDuckDb(connection, olderReport, "older-zta-report.json");
    await importZeroTrustAssessmentReportToDuckDb(connection, latestReport, "latest-zta-report.json");

    return readZeroTrustAssessmentReportFromDuckDb(connection);
  });

  expect(imported).toMatchObject({
    TenantId: "tenant-latest",
    CustomTopLevelField: "preserved",
    Tests: [{ TestId: "latest", TestStatus: "Passed" }]
  });
});

test("imports Zero Trust Assessment related object ids for service principal joins", async () => {
  const report: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-1",
    TestResultSummary: { IdentityFailed: 1 },
    Tests: [
      {
        TestId: "app-test",
        TestStatus: "Failed",
        RelatedObjects: [
          { object_id: "sp-1", displayName: "Application app", servicePrincipalType: "Application" },
          { id: "sp-2", displayName: "Application app by id", servicePrincipalType: "Application" },
          { object_id: "mi-1", displayName: "Managed identity", servicePrincipalType: "ManagedIdentity" },
          { object_id: "sp-1", displayName: "Duplicate app reference", servicePrincipalType: "Application" },
          { displayName: "No object id" }
        ]
      },
      {
        TestId: "empty-test",
        TestStatus: "Passed",
        RelatedObjects: []
      }
    ]
  };

  const result = await withDuckDb(async ({ connection }) => {
    await prepareRuntimeSqlSchema(connection);
    await insertEntraServicePrincipalRows(connection, [
      servicePrincipal("sp-1", "app-1", "Application app", "Application"),
      servicePrincipal("sp-2", "app-2", "Application app by id", "Application"),
      servicePrincipal("mi-1", "mi-app-1", "Managed identity", "ManagedIdentity")
    ]);

    const status = await importZeroTrustAssessmentReportToDuckDb(connection, report, "zta-report.json");

    const relatedRows = await connection.runAndReadAll(
      `
        select report_id, test_ordinal, related_object_id
        from zta_test_related_objects
        order by test_ordinal, related_object_id
      `
    );

    const joinedRows = await connection.runAndReadAll(
      `
        select
          test.test_id,
          related.related_object_id,
          service_principal.service_principal_type
        from zta_test_related_objects related
        join zta_tests test
          on test.report_id = related.report_id
          and test.ordinal = related.test_ordinal
        join entra_service_principals service_principal
          on service_principal.id = related.related_object_id
        order by related.related_object_id
      `
    );

    return {
      reportId: status.reportId,
      relatedRows: relatedRows.getRowObjectsJson(),
      joinedRows: joinedRows.getRowObjectsJson()
    };
  });

  expect(result.relatedRows).toEqual([
    {
      report_id: result.reportId,
      test_ordinal: 0,
      related_object_id: "mi-1"
    },
    {
      report_id: result.reportId,
      test_ordinal: 0,
      related_object_id: "sp-1"
    },
    {
      report_id: result.reportId,
      test_ordinal: 0,
      related_object_id: "sp-2"
    }
  ]);
  expect(result.joinedRows).toEqual([
    {
      test_id: "app-test",
      related_object_id: "mi-1",
      service_principal_type: "ManagedIdentity"
    },
    {
      test_id: "app-test",
      related_object_id: "sp-1",
      service_principal_type: "Application"
    },
    {
      test_id: "app-test",
      related_object_id: "sp-2",
      service_principal_type: "Application"
    }
  ]);
});

test("enriches Zero Trust Assessment related objects with application object ids", async () => {
  const report: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-1",
    Tests: [
      {
        TestId: "sp-test",
        TestStatus: "Failed",
        RelatedObjects: [
          { object_id: "sp-1", displayName: "Application app", servicePrincipalType: "Application" },
          { id: "sp-2", displayName: "Application without registration", servicePrincipalType: "Application" },
          { object_id: "user-1", userPrincipalName: "user@example.test" }
        ]
      }
    ]
  };

  const result = await withDuckDb(async ({ connection }) => {
    await prepareRuntimeSqlSchema(connection);
    const taggedServicePrincipal = servicePrincipal("sp-1", "app-1", "Application app", "Application");
    taggedServicePrincipal.tags = ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"];
    await insertEntraServicePrincipalRows(connection, [
      taggedServicePrincipal,
      servicePrincipal("sp-2", "app-2", "Application without registration", "Application")
    ]);
    await insertEntraApplicationRows(connection, [
      application("application-object-1", "app-1", "Application app registration")
    ]);

    await importZeroTrustAssessmentReportToDuckDb(connection, report, "zta-report.json");

    const imported = await readZeroTrustAssessmentReportFromDuckDb(connection);
    const relatedRows = await connection.runAndReadAll(
      `
        select related_object_id
        from zta_test_related_objects
        order by related_object_id
      `
    );

    return {
      imported,
      relatedRows: relatedRows.getRowObjectsJson()
    };
  });

  expect(result.imported).toMatchObject({
    Tests: [
      {
        RelatedObjects: [
          expect.objectContaining({
            object_id: "sp-1",
            applicationId: "application-object-1",
            tags: ["WindowsAzureActiveDirectoryIntegratedApp", "HideApp"]
          }),
          expect.objectContaining({
            id: "sp-2",
            applicationId: null
          }),
          expect.not.objectContaining({
            applicationId: expect.anything()
          })
        ]
      }
    ]
  });
  expect(result.relatedRows).toEqual([
    { related_object_id: "application-object-1" },
    { related_object_id: "sp-1" },
    { related_object_id: "sp-2" },
    { related_object_id: "user-1" }
  ]);
});

test("imports Entra snapshot into DuckDB and reads it back through the runtime", async () => {
  const snapshot: EntraSnapshot & { groups: Array<{ id: string }> } = {
    meta: {
      provider: "entra",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: ["Application.Read.All"],
      servicePrincipalCount: 2,
      applicationCount: 1,
      oauth2PermissionGrantCount: 1,
      appRoleAssignmentCount: 1
    },
    servicePrincipals: [
      {
        id: "sp-1",
        appId: "app-1",
        displayName: "Example app",
        appDisplayName: "Example app registration",
        servicePrincipalType: "Application",
        publisherName: null,
        accountEnabled: true,
        appOwnerOrganizationId: "tenant-1",
        homepage: null,
        loginUrl: null,
        replyUrls: ["https://example.test/callback"],
        servicePrincipalNames: ["api://example"],
        tags: ["WindowsAzureActiveDirectoryIntegratedApp"],
        appRoles: [
          {
            id: "role-1",
            value: "Read.All",
            displayName: "Read",
            description: null,
            isEnabled: true,
            allowedMemberTypes: ["Application"]
          }
        ],
        owners: [{ id: "owner-1", displayName: "Owner One" }],
        metadata: { source: "test" }
      },
      {
        id: "mi-1",
        appId: "mi-app-1",
        displayName: "Example managed identity",
        appDisplayName: null,
        servicePrincipalType: "ManagedIdentity",
        publisherName: null,
        accountEnabled: true,
        appOwnerOrganizationId: "tenant-1",
        homepage: null,
        loginUrl: null,
        replyUrls: [],
        servicePrincipalNames: [],
        tags: ["WindowsAzureActiveDirectoryManagedIdentity"],
        appRoles: [],
        owners: [],
        metadata: null
      }
    ],
    applications: [
      {
        id: "application-object-1",
        appId: "app-1",
        displayName: "Example app registration",
        signInAudience: "AzureADMyOrg",
        publisherDomain: "example.test",
        identifierUris: ["api://example"],
        tags: ["WindowsAzureActiveDirectoryIntegratedApp"],
        appRoles: [
          {
            id: "role-1",
            value: "Read.All",
            displayName: "Read",
            description: "Read access",
            isEnabled: true,
            allowedMemberTypes: ["Application"]
          }
        ],
        oauth2PermissionScopes: [
          {
            id: "scope-1",
            value: "user_impersonation",
            adminConsentDisplayName: "Access Example API",
            isEnabled: true,
            type: "User"
          }
        ],
        requiredResourceAccess: [
          {
            resourceAppId: "00000003-0000-0000-c000-000000000000",
            resourceAccess: [{ id: "permission-1", type: "Scope" }]
          }
        ],
        web: {
          redirectUris: ["https://example.test/callback"],
          implicitGrantSettings: { enableAccessTokenIssuance: false, enableIdTokenIssuance: true }
        },
        spa: {
          redirectUris: ["https://spa.example.test/callback"]
        },
        publicClient: {
          redirectUris: ["http://localhost"]
        },
        passwordCredentials: [
          {
            keyId: "password-key-1",
            displayName: "client secret",
            hint: "abc",
            startDateTime: "2026-01-01T00:00:00.000Z",
            endDateTime: "2026-12-31T00:00:00.000Z",
            secretText: "must-not-survive"
          }
        ],
        keyCredentials: [
          {
            keyId: "certificate-key-1",
            displayName: "certificate",
            type: "AsymmetricX509Cert",
            usage: "Verify",
            customKeyIdentifier: "AQID",
            startDateTime: "2026-01-01T00:00:00.000Z",
            endDateTime: "2026-12-31T00:00:00.000Z"
          }
        ],
        createdDateTime: "2026-01-01T00:00:00.000Z",
        deletedDateTime: null,
        disabledByMicrosoftStatus: null,
        info: {
          termsOfServiceUrl: "https://example.test/terms",
          supportUrl: "https://example.test/support"
        },
        notes: "Business critical app",
        owners: [{ id: "app-owner-1", mail: "app-owner@example.test", ownerType: "#microsoft.graph.user" }]
      }
    ],
    oauth2PermissionGrants: [
      {
        id: "grant-1",
        clientId: "sp-1",
        consentType: "AllPrincipals",
        principalId: null,
        resourceId: "graph",
        scope: "User.Read"
      },
      {
        id: "grant-2",
        clientId: "mi-1",
        consentType: "Principal",
        principalId: "user-1",
        resourceId: "sharepoint",
        scope: "Sites.Read.All Files.Read.All"
      },
      {
        id: "grant-3",
        clientId: "external-1",
        consentType: "FutureConsentType",
        principalId: null,
        resourceId: "graph",
        scope: "Mail.Read"
      }
    ],
    appRoleAssignments: [
      {
        id: "assignment-1",
        appRoleId: "role-1",
        appRoleDisplayName: "Read",
        appRoleValue: "Read.All",
        principalId: "sp-1",
        principalDisplayName: "Example app",
        resourceId: "graph",
        resourceDisplayName: "Microsoft Graph"
      },
      {
        id: "assignment-2",
        appRoleId: "role-2",
        appRoleDisplayName: null,
        appRoleValue: null,
        principalId: "mi-1",
        principalDisplayName: null,
        resourceId: "sharepoint",
        resourceDisplayName: null
      }
    ],
    groups: [{ id: "group-1" }]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(snapshot), "utf8");
    await runtime.initialize();

    expect(runtime.getStatus().entra).toMatchObject({
      imported: true,
      servicePrincipalCount: 2,
      applicationCount: 1,
      oauth2PermissionGrantCount: 3,
      appRoleAssignmentCount: 2
    });

    const imported = (await runtime.readSnapshot("entra-snapshot.json")) as EntraSnapshot & {
      groups: Array<{ id: string }>;
    };
    const queried = await runtime.queryEntraServicePrincipals({
      filters: [
        { column: "displayName", values: ["Example", "Missing"] },
        { column: "accountEnabled", values: ["true"] }
      ],
      page: 1,
      pageSize: 10
    });
    const queriedManagedIdentities = await runtime.queryEntraManagedIdentities({
      page: 1,
      pageSize: 10
    });
    const principalPermissions = await runtime.readEntraPrincipalPermissions("SP-1");
    const endpoints = defineLocalReportRuntimeRestEndpoints(runtime);
    const servicePrincipalsEndpoint = getEndpoint(endpoints, "/api/data/entra/servicePrincipals");
    const managedIdentitiesEndpoint = getEndpoint(endpoints, "/api/data/entra/managedIdentities");
    const oauth2PermissionGrantsEndpoint = getEndpoint(endpoints, "/api/data/entra/oauth2PermissionGrants");

    const restServicePrincipals = await servicePrincipalsEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/entra/servicePrincipals?page=1&count=10")
    });
    const restManagedIdentities = await managedIdentitiesEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/entra/managedIdentities?page=1&count=10")
    });
    const restOAuth2PermissionGrants = await oauth2PermissionGrantsEndpoint.handle({
      req: {},
      url: new URL("http://localhost/api/data/entra/oauth2PermissionGrants?page=1&count=10")
    });

    expect(imported.meta?.provider).toBe("entra");
    expect(imported.servicePrincipals).toHaveLength(2);
    expect(imported.servicePrincipals[0]).toMatchObject({
      id: "sp-1",
      appRoles: [{ id: "role-1" }],
      metadata: { source: "test" },
      owners: [{ id: "owner-1" }]
    });
    expect(imported.applications).toHaveLength(1);
    expect(imported.applications?.[0]).toMatchObject({
      id: "application-object-1",
      appId: "app-1",
      displayName: "Example app registration",
      oauth2PermissionScopes: [{ id: "scope-1", value: "user_impersonation" }],
      requiredResourceAccess: [{ resourceAppId: "00000003-0000-0000-c000-000000000000" }],
      web: { redirectUris: ["https://example.test/callback"] },
      spa: { redirectUris: ["https://spa.example.test/callback"] },
      publicClient: { redirectUris: ["http://localhost"] },
      passwordCredentials: [
        {
          keyId: "password-key-1",
          displayName: "client secret",
          hint: "abc",
          startDateTime: "2026-01-01T00:00:00.000Z",
          endDateTime: "2026-12-31T00:00:00.000Z"
        }
      ],
      keyCredentials: [{ keyId: "certificate-key-1", usage: "Verify" }],
      owners: [{ id: "app-owner-1", mail: "app-owner@example.test" }]
    });
    expect(imported.applications?.[0].passwordCredentials[0]).not.toHaveProperty("secretText");
    expect(imported.oauth2PermissionGrants).toEqual(snapshot.oauth2PermissionGrants);
    expect(imported.oauth2PermissionGrants?.[0]).not.toHaveProperty("risk");
    expect(imported.appRoleAssignments).toEqual(snapshot.appRoleAssignments);
    expect(principalPermissions).toEqual({
      principalId: "SP-1",
      oauth2PermissionGrants: [
        {
          id: "grant-1",
          clientId: "sp-1",
          consentType: "AllPrincipals",
          principalId: null,
          resourceId: "graph",
          risk: "high",
          scope: "User.Read"
        }
      ],
      appRoleAssignments: [
        {
          id: "assignment-1",
          appRoleId: "role-1",
          appRoleDisplayName: "Read",
          appRoleValue: "Read.All",
          principalId: "sp-1",
          principalDisplayName: "Example app",
          resourceId: "graph",
          resourceDisplayName: "Microsoft Graph"
        }
      ]
    });
    expect(imported.groups).toEqual([{ id: "group-1" }]);
    expect(queried).toMatchObject({
      collectionId: "entra.servicePrincipals",
      columns: expect.arrayContaining(["id", "displayName"]),
      count: 1,
      page: 1,
      pageSize: 10,
      rows: [
        expect.objectContaining({
          id: "sp-1",
          displayName: "Example app",
          oauthPemrissionsCount: 1,
          appRolesPermissionCount: 1,
          entraPermissionRisk: "high",
          rbacRoleAssignmentCount: 0,
          rbacRoleLevel: "none",
          rbacSubscriptionCount: 0
        })
      ]
    });
    expect(queriedManagedIdentities).toMatchObject({
      collectionId: "entra.managedIdentities",
      count: 1,
      rows: [
        expect.objectContaining({
          id: "mi-1",
          servicePrincipalType: "ManagedIdentity",
          oauthPemrissionsCount: 2,
          appRolesPermissionCount: 1,
          entraPermissionRisk: "medium",
          rbacRoleAssignmentCount: 0,
          rbacRoleLevel: "none",
          rbacSubscriptionCount: 0
        })
      ]
    });
    expect(restServicePrincipals).toMatchObject({
      collectionId: "entra.servicePrincipals",
      columns: expect.arrayContaining(["oauthPemrissionsCount", "appRolesPermissionCount", "entraPermissionRisk"]),
      rows: [
        expect.objectContaining({
          id: "sp-1",
          oauthPemrissionsCount: 1,
          appRolesPermissionCount: 1,
          entraPermissionRisk: "high"
        })
      ]
    });
    expect(restManagedIdentities).toMatchObject({
      collectionId: "entra.managedIdentities",
      columns: expect.arrayContaining(["oauthPemrissionsCount", "appRolesPermissionCount", "entraPermissionRisk"]),
      rows: [
        expect.objectContaining({
          id: "mi-1",
          oauthPemrissionsCount: 2,
          appRolesPermissionCount: 1,
          entraPermissionRisk: "medium"
        })
      ]
    });
    expect(restOAuth2PermissionGrants).toMatchObject({
      collectionId: "entra.oauth2PermissionGrants",
      columns: expect.arrayContaining(["id", "consentType", "risk"]),
      rows: [
        expect.objectContaining({ id: "grant-1", risk: "high" }),
        expect.objectContaining({ id: "grant-2", risk: "low" }),
        expect.objectContaining({ id: "grant-3", risk: "medium" })
      ]
    });
  });
});

test("imports legacy Entra snapshots without applications as an empty applications collection", async () => {
  const snapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "0.3",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: ["Application.Read.All"],
      servicePrincipalCount: 0
    },
    servicePrincipals: [],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(snapshot), "utf8");
    await runtime.initialize();

    expect(runtime.getStatus().entra).toMatchObject({
      imported: true,
      servicePrincipalCount: 0,
      applicationCount: 0
    });

    const imported = await runtime.readSnapshot("entra-snapshot.json");

    expect((imported as EntraSnapshot).applications).toEqual([]);
  });
});

test("enriches Entra runtime collections with latest ZTA remediation summaries", async () => {
  const entraSnapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: [],
      servicePrincipalCount: 2
    },
    servicePrincipals: [
      servicePrincipal("sp-1", "app-1", "Application app", "Application"),
      servicePrincipal("principal-uami-1", "client-1", "Identity app", "ManagedIdentity")
    ],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };
  const olderReport: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-01T10:00:00.000Z",
    TenantId: "tenant-1",
    TestResultSummary: { IdentityFailed: 1 },
    Tests: [
      {
        TestId: "older-sp-test",
        TestStatus: "Failed",
        TestRisk: "High",
        RelatedObjects: [{ object_id: "sp-1" }]
      }
    ]
  };
  const latestReport: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-1",
    TestResultSummary: { IdentityFailed: 2 },
    Tests: [
      {
        TestId: "sp-failed",
        TestStatus: "failed",
        TestRisk: "High",
        RelatedObjects: [
          { object_id: "SP-1", displayName: "Application app" },
          { id: "sp-1", displayName: "Duplicate application app" }
        ]
      },
      {
        TestId: "sp-and-mi-passed",
        TestStatus: "Passed",
        TestRisk: "Medium",
        RelatedObjects: [{ id: "sp-1" }, { object_id: "principal-uami-1" }]
      },
      {
        TestId: "mi-failed",
        TestStatus: "Failed",
        TestRisk: "Low",
        RelatedObjects: [{ id: "principal-uami-1" }]
      }
    ]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(entraSnapshot), "utf8");
    await writeFile(path.join(dataDir, "older-zta-report.json"), JSON.stringify(olderReport), "utf8");
    await writeFile(path.join(dataDir, "latest-zta-report.json"), JSON.stringify(latestReport), "utf8");
    await runtime.initialize();

    const queriedServicePrincipals = await runtime.queryEntraServicePrincipals({
      page: 1,
      pageSize: 10
    });
    const queriedManagedIdentities = await runtime.queryEntraManagedIdentities({
      page: 1,
      pageSize: 10
    });

    expect(queriedServicePrincipals).toMatchObject({
      collectionId: "entra.servicePrincipals",
      columns: expect.arrayContaining(["ztaRemediationCountAll", "ztaRemediationFailedCount", "ztaMaxRisk"]),
      rows: [
        expect.objectContaining({
          id: "sp-1",
          ztaRemediationCountAll: 2,
          ztaRemediationFailedCount: 1,
          ztaMaxRisk: "high"
        })
      ]
    });
    expect(queriedManagedIdentities).toMatchObject({
      collectionId: "entra.managedIdentities",
      columns: expect.arrayContaining(["ztaRemediationCountAll", "ztaRemediationFailedCount", "ztaMaxRisk"]),
      rows: [
        expect.objectContaining({
          id: "principal-uami-1",
          ztaRemediationCountAll: 2,
          ztaRemediationFailedCount: 1,
          ztaMaxRisk: "medium"
        })
      ]
    });
  });
});

test("enriches service principals with ZTA remediations related to application object ids", async () => {
  const entraSnapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: [],
      servicePrincipalCount: 2,
      applicationCount: 1
    },
    servicePrincipals: [
      servicePrincipal("sp-1", "app-1", "Application app", "Application"),
      servicePrincipal("sp-2", "app-2", "Other application app", "Application")
    ],
    applications: [application("application-object-1", "app-1", "Application app registration")],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };
  const report: ZeroTrustAssessmentReport = {
    ExecutedAt: "2026-06-03T10:00:00.000Z",
    TenantId: "tenant-1",
    TestResultSummary: { IdentityFailed: 2 },
    Tests: [
      {
        TestId: "app-object-failed",
        TestStatus: "Failed",
        TestRisk: "High",
        RelatedObjects: [{ id: "application-object-1" }]
      },
      {
        TestId: "app-object-and-sp-deduped",
        TestStatus: "Passed",
        TestRisk: "Medium",
        RelatedObjects: [{ id: "application-object-1" }, { object_id: "sp-1" }]
      }
    ]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(entraSnapshot), "utf8");
    await writeFile(path.join(dataDir, "zta-report.json"), JSON.stringify(report), "utf8");
    await runtime.initialize();

    const queriedServicePrincipals = await runtime.queryEntraServicePrincipals({
      page: 1,
      pageSize: 10
    });

    expect(queriedServicePrincipals).toMatchObject({
      collectionId: "entra.servicePrincipals",
      rows: [
        expect.objectContaining({
          id: "sp-1",
          ztaRemediationCountAll: 2,
          ztaRemediationFailedCount: 1,
          ztaMaxRisk: "high"
        }),
        expect.objectContaining({
          id: "sp-2",
          ztaRemediationCountAll: 0,
          ztaRemediationFailedCount: 0,
          ztaMaxRisk: "none"
        })
      ]
    });
  });
});

test("imports Azure resources snapshot into DuckDB and reads it back through the runtime", async () => {
  const snapshot: AzureSnapshot & { ownershipHints: Array<{ id: string }> } = {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      activityDays: 90,
      activityStartTime: "2026-03-07T00:00:00.000Z",
      maxActivityRecords: 10000,
      requestedSubscriptions: ["sub-1"],
      subscriptionCount: 1,
      resourceGroupCount: 1,
      resourceCount: 1,
      userAssignedManagedIdentityCount: 1,
      roleAssignmentCount: 1,
      activityLogCount: 1
    },
    subscriptions: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        tenantId: "tenant-1",
        state: "Enabled",
        tags: null
      }
    ],
    resourceGroups: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceGroup: "rg-app",
        location: "westeurope",
        tags: { owner: "team-a" }
      }
    ],
    resources: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.Web/sites/app-a",
        resourceName: "app-a",
        resourceGroup: "rg-app",
        resourceType: "Microsoft.Web/sites",
        kind: "app",
        location: "westeurope",
        tags: { env: "test" },
        identityType: "SystemAssigned",
        identityPrincipalId: "principal-1",
        identityTenantId: "tenant-1",
        userAssignedIdentityResourceIds: ["/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a"],
        userAssignedIdentities: {
          "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a": {
            clientId: "client-1",
            principalId: "principal-uami-1"
          }
        }
      }
    ],
    userAssignedManagedIdentities: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a",
        name: "uami-a",
        resourceGroup: "rg-app",
        location: "westeurope",
        clientId: "client-1",
        principalId: "principal-uami-1",
        tenantId: "tenant-1",
        tags: null
      }
    ],
    roleAssignments: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        roleAssignmentId: "ra-1",
        scope: "/subscriptions/sub-1/resourceGroups/rg-app",
        scopeType: "ResourceGroup",
        scopeSubscriptionId: "sub-1",
        scopeResourceGroup: "rg-app",
        scopeResourceProvider: null,
        scopeResourceType: null,
        scopeResourceName: null,
        scopeManagementGroup: null,
        principalId: "principal-1",
        principalType: "ServicePrincipal",
        principalDisplayName: "app-a",
        signInName: null,
        roleDefinitionId: "role-1",
        roleDefinitionName: "Contributor",
        canDelegate: false,
        condition: null,
        conditionVersion: null
      }
    ],
    activityLogs: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        eventTimestamp: "2026-06-04T00:00:00.000Z",
        submissionTimestamp: null,
        caller: "owner@example.test",
        callerUserPrincipalName: "owner@example.test",
        callerName: null,
        callerEmail: null,
        callerObjectId: null,
        callerIdentityType: null,
        callerAppId: null,
        callerIpAddress: null,
        callerTenantId: null,
        operationName: "Create app",
        operationNameValue: "Microsoft.Web/sites/write",
        status: "Succeeded",
        subStatus: null,
        category: "Administrative",
        resourceGroupName: "rg-app",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.Web/sites/app-a",
        resourceProviderName: "Microsoft.Web",
        resourceType: "Microsoft.Web/sites",
        authorizationAction: "Microsoft.Web/sites/write",
        authorizationScope: "/subscriptions/sub-1/resourceGroups/rg-app"
      }
    ],
    ownershipHints: [{ id: "hint-1" }]
  };

  await withRuntimeTestDir(async ({ dataDir, runtime }) => {
    await writeFile(path.join(dataDir, "snapshot.json"), JSON.stringify(snapshot), "utf8");
    await runtime.initialize();

    expect(runtime.getStatus().azureResources).toMatchObject({
      imported: true,
      subscriptionCount: 1,
      resourceGroupCount: 1,
      resourceCount: 1,
      userAssignedManagedIdentityCount: 1,
      roleAssignmentCount: 1,
      activityLogCount: 1
    });

    const imported = (await runtime.readSnapshot("snapshot.json")) as AzureSnapshot & {
      ownershipHints: Array<{ id: string }>;
    };
    const queried = await runtime.queryAzureResources({
      filters: [{ column: "resourceType", values: ["web"] }],
      page: 1,
      pageSize: 10
    });

    expect(imported.meta.provider).toBe("azure");
    expect(imported.resources[0]).toMatchObject({
      resourceName: "app-a",
      tags: { env: "test" },
      userAssignedIdentityResourceIds: [
        "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a"
      ]
    });
    expect(imported.roleAssignments).toEqual(snapshot.roleAssignments);
    expect(imported.activityLogs).toEqual(snapshot.activityLogs);
    expect(imported.ownershipHints).toEqual([{ id: "hint-1" }]);
    expect(queried).toMatchObject({
      collectionId: "azureResources.resources",
      columns: expect.arrayContaining(["resourceId", "resourceType"]),
      count: 1,
      rows: [expect.objectContaining({ resourceName: "app-a", resourceType: "Microsoft.Web/sites" })]
    });
  });
});

test("persists disabled owner evidence keys in DuckDB across runtime restarts", async () => {
  const disabledKey = "resourceGroup:sub-1:rg-activity:alice@example.test:2026-06-05T10:00:00.000Z";
  const azureSnapshot: AzureSnapshot = {
    meta: {
      provider: "azure",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      activityDays: 30,
      activityStartTime: "2026-05-06T00:00:00.000Z",
      maxActivityRecords: 1000,
      requestedSubscriptions: ["sub-1"],
      subscriptionCount: 0,
      resourceGroupCount: 1,
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
      snapshotVersion: "1",
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

  await withRuntimeTestDir(async ({ dataDir, runtime: firstRuntime, databasePath }) => {
    await writeFile(path.join(dataDir, "snapshot.json"), JSON.stringify(azureSnapshot), "utf8");
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(entraSnapshot), "utf8");

    await firstRuntime.initialize();
    let endpoints = defineLocalReportRuntimeRestEndpoints(firstRuntime);
    let ownershipEndpoint = getEndpoint(endpoints, "/api/data/azureResources/resourceGroupOwnership");
    let disabledEvidenceEndpoint = getEndpoint(
      endpoints,
      "/api/data/azureResources/resourceGroupOwnership/disabledEvidence"
    );

    await expect(
      ownershipEndpoint.handle({
        req: {},
        url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
      })
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({
          resourceGroup: "rg-activity",
          owner: "alice@example.test",
          confidence: "low",
          source: "activity.lastModifier",
          evidence: [
            { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z" },
            { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
          ]
        })
      ]
    });
    await expect(
      disabledEvidenceEndpoint.handle({
        req: {},
        url: new URL(
          `http://localhost/api/data/azureResources/resourceGroupOwnership/disabledEvidence?key=${encodeURIComponent(disabledKey)}&disabled=true`
        )
      })
    ).resolves.toEqual({ key: disabledKey, disabled: true, disabledCount: 1 });
    await expect(
      ownershipEndpoint.handle({
        req: {},
        url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
      })
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({
          resourceGroup: "rg-activity",
          owner: "bob@example.test",
          confidence: "low",
          source: "activity.lastModifier",
          evidence: [
            { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z", disabled: true },
            { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
          ]
        })
      ]
    });

    await firstRuntime.close();

    const secondRuntime = new LocalReportRuntime({ dataDir, databasePath });
    try {
      await secondRuntime.initialize();
      endpoints = defineLocalReportRuntimeRestEndpoints(secondRuntime);
      ownershipEndpoint = getEndpoint(endpoints, "/api/data/azureResources/resourceGroupOwnership");
      disabledEvidenceEndpoint = getEndpoint(
        endpoints,
        "/api/data/azureResources/resourceGroupOwnership/disabledEvidence"
      );
      await expect(
        ownershipEndpoint.handle({
          req: {},
          url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
        })
      ).resolves.toMatchObject({
        rows: [
          expect.objectContaining({
            resourceGroup: "rg-activity",
            owner: "bob@example.test",
            confidence: "low",
            evidence: [
              { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z", disabled: true },
              { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
            ]
          })
        ]
      });
      await expect(
        disabledEvidenceEndpoint.handle({
          req: {},
          url: new URL(
            `http://localhost/api/data/azureResources/resourceGroupOwnership/disabledEvidence?key=${encodeURIComponent(disabledKey)}&disabled=false`
          )
        })
      ).resolves.toEqual({ key: disabledKey, disabled: false, disabledCount: 0 });
      await expect(
        ownershipEndpoint.handle({
          req: {},
          url: new URL("http://localhost/api/data/azureResources/resourceGroupOwnership?page=1&count=10")
        })
      ).resolves.toMatchObject({
        rows: [
          expect.objectContaining({
            resourceGroup: "rg-activity",
            owner: "alice@example.test",
            confidence: "low",
            evidence: [
              { user: "alice@example.test", date: "2026-06-05T10:00:00.000Z" },
              { user: "bob@example.test", date: "2026-06-04T10:00:00.000Z" }
            ]
          })
        ]
      });
    } finally {
      await secondRuntime.close();
    }
  });
});

test("closes runtime DuckDB file lock", async () => {
  await withRuntimeTestDir(async ({ dataDir, runtime, databasePath }) => {
    await runtime.initialize();
    await runtime.close();

    const result = await withDuckDb(async ({ connection }) => {
      const rows = await connection.runAndReadAll("select 1 as ok");
      return rows.getRowObjectsJson();
    }, databasePath);

    expect(result).toEqual([{ ok: 1 }]);

    const secondRuntime = new LocalReportRuntime({ dataDir, databasePath });
    try {
      await secondRuntime.initialize();
      expect(secondRuntime.getStatus()).toMatchObject({
        initialized: true,
        databasePath
      });
    } finally {
      await secondRuntime.close();
    }
  });
});

test("materializes Azure identity enrichment runs and exposes the latest run in runtime output", async () => {
  const entraSnapshot: EntraSnapshot = {
    meta: {
      provider: "entra",
      snapshotVersion: "1",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "owner@example.test",
      scopes: [],
      servicePrincipalCount: 2
    },
    servicePrincipals: [
      servicePrincipal("sp-1", "app-1", "Application app", "Application"),
      servicePrincipal("principal-uami-1", "client-1", "Identity app", "ManagedIdentity")
    ],
    oauth2PermissionGrants: [],
    appRoleAssignments: []
  };
  const azureSnapshot: AzureSnapshot = {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      activityDays: 90,
      activityStartTime: "2026-03-07T00:00:00.000Z",
      maxActivityRecords: 10000,
      requestedSubscriptions: ["sub-1"],
      subscriptionCount: 1,
      resourceGroupCount: 1,
      resourceCount: 1,
      userAssignedManagedIdentityCount: 1,
      roleAssignmentCount: 2,
      activityLogCount: 0
    },
    subscriptions: [],
    resourceGroups: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceGroup: "rg-app",
        location: "westeurope",
        tags: { ownerGroup: "alice@example.test" }
      }
    ],
    resources: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.Web/sites/app-a",
        resourceName: "app-a",
        resourceGroup: "rg-app",
        resourceType: "Microsoft.Web/sites",
        kind: "app",
        location: "westeurope",
        tags: null,
        identityType: "UserAssigned",
        identityPrincipalId: null,
        identityTenantId: null,
        userAssignedIdentityResourceIds: [
          "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a"
        ],
        userAssignedIdentities: {
          "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a": {
            clientId: "client-1",
            principalId: "principal-uami-1"
          }
        }
      }
    ],
    userAssignedManagedIdentities: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription One",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-a",
        name: "uami-a",
        resourceGroup: "rg-app",
        location: "westeurope",
        clientId: "client-1",
        principalId: "principal-uami-1",
        tenantId: "tenant-1",
        tags: null
      }
    ],
    roleAssignments: [
      roleAssignment("sp-1", "Owner", "/subscriptions/sub-1", "Subscription"),
      roleAssignment("principal-uami-1", "Reader", "/subscriptions/sub-1/resourceGroups/rg-app", "ResourceGroup")
    ],
    activityLogs: []
  };

  await withRuntimeTestDir(async ({ dataDir, runtime, databasePath }) => {
    await writeFile(path.join(dataDir, "entra-snapshot.json"), JSON.stringify(entraSnapshot), "utf8");
    await writeFile(path.join(dataDir, "snapshot.json"), JSON.stringify(azureSnapshot), "utf8");
    await runtime.initialize();

    const firstStatus = runtime.getStatus().enrichment;
    const servicePrincipals = await runtime.readServicePrincipals();
    const managedIdentities = await runtime.readManagedIdentities();
    const queriedServicePrincipals = await runtime.queryEntraServicePrincipals({
      page: 1,
      pageSize: 10
    });
    const queriedManagedIdentities = await runtime.queryEntraManagedIdentities({
      page: 1,
      pageSize: 10
    });
    const queriedAzureRbac = await runtime.queryAzureRbac("sp-1", {
      page: 1,
      pageSize: 10
    });

    expect(firstStatus).toMatchObject({
      calculated: true,
      identityRoleAssignmentCount: 2,
      accessRiskIdentityCount: 2,
      managedIdentityAssignmentCount: 1
    });
    expect(servicePrincipals[0]).toMatchObject({
      id: "sp-1",
      permissionRisk: "high",
      azureRbac: expect.stringContaining("Owner on subscription"),
      roleAssignments: [expect.objectContaining({ roleDefinitionName: "Owner" })],
      rbacRoleAssignmentCount: 1,
      rbacRoleLevel: "high",
      rbacSubscriptionCount: 1
    });
    expect(queriedServicePrincipals).toMatchObject({
      collectionId: "entra.servicePrincipals",
      rows: [
        expect.objectContaining({
          id: "sp-1",
          potentialOwners: ["alice@example.test"],
          ownerConfidence: "high"
        })
      ]
    });
    expect(managedIdentities[0]).toMatchObject({
      id: "principal-uami-1",
      permissionRisk: "low",
      azureRbac: expect.stringContaining("Reader on rg/rg-app"),
      roleAssignments: [expect.objectContaining({ roleDefinitionName: "Reader" })],
      rbacRoleAssignmentCount: 1,
      rbacRoleLevel: "low",
      rbacSubscriptionCount: 1,
      assignedResourceGroups: ["rg-app"],
      managedIdentityAssignments: [expect.objectContaining({ assignedResourceName: "app-a" })]
    });
    expect(queriedManagedIdentities).toMatchObject({
      collectionId: "entra.managedIdentities",
      rows: [
        expect.objectContaining({
          id: "principal-uami-1",
          potentialOwners: ["alice@example.test"],
          ownerConfidence: "high"
        })
      ]
    });
    expect(queriedAzureRbac).toMatchObject({
      collectionId: "azureRbac",
      rows: [
        expect.objectContaining({
          servicePrincipalId: "sp-1",
          principalId: "sp-1",
          roleDefinitionName: "Owner",
          accessRisk: "high",
          accessScope: "/subscriptions/sub-1",
          accessScopeType: "Subscription",
          accessSubscriptionId: "sub-1",
          accessDisplayName: "Owner on subscription Subscription One"
        })
      ],
      count: 1
    });

    await writeFile(path.join(dataDir, "entra-snapshot.json"), "{not-json", "utf8");
    await writeFile(path.join(dataDir, "snapshot.json"), "{not-json", "utf8");
    await runtime.recalculateEnrichment();

    const secondStatus = runtime.getStatus().enrichment;
    expect(secondStatus.calculated).toBe(true);
    expect(secondStatus.latestRunId).not.toBe(firstStatus.latestRunId);
    expect(secondStatus.identityRoleAssignmentCount).toBe(2);

    await runtime.close();

    const result = await withDuckDb(async ({ connection }) => {
      const rows = await connection.runAndReadAll(
        "select count(*) as run_count from azure_runtime_enrichment_runs where status = 'completed'"
      );
      return rows.getRowObjectsJson();
    }, databasePath);

    expect(result[0]).toEqual({ run_count: "2" });
  });
});

function servicePrincipal(
  id: string,
  appId: string,
  displayName: string,
  servicePrincipalType: "Application" | "ManagedIdentity"
): EntraSnapshot["servicePrincipals"][number] {
  return {
    id,
    appId,
    displayName,
    appDisplayName: null,
    servicePrincipalType,
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: "tenant-1",
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: [],
    appRoles: [],
    owners: [],
    metadata: null
  };
}

function application(
  id: string,
  appId: string,
  displayName: string
): NonNullable<EntraSnapshot["applications"]>[number] {
  return {
    id,
    appId,
    displayName,
    signInAudience: null,
    publisherDomain: null,
    identifierUris: [],
    tags: [],
    appRoles: [],
    oauth2PermissionScopes: [],
    requiredResourceAccess: [],
    web: null,
    spa: null,
    publicClient: null,
    passwordCredentials: [],
    keyCredentials: [],
    createdDateTime: null,
    deletedDateTime: null,
    disabledByMicrosoftStatus: null,
    info: null,
    notes: null,
    owners: []
  };
}

function roleAssignment(
  principalId: string,
  roleDefinitionName: string,
  scope: string,
  scopeType: NonNullable<AzureSnapshot["roleAssignments"]>[number]["scopeType"]
): NonNullable<AzureSnapshot["roleAssignments"]>[number] {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription One",
    roleAssignmentId: `${principalId}-${roleDefinitionName}`,
    scope,
    scopeType,
    scopeSubscriptionId: "sub-1",
    scopeResourceGroup: scopeType === "ResourceGroup" || scopeType === "Resource" ? "rg-app" : null,
    scopeResourceProvider: null,
    scopeResourceType: null,
    scopeResourceName: null,
    scopeManagementGroup: null,
    principalId,
    principalType: "ServicePrincipal",
    principalDisplayName: principalId,
    signInName: null,
    roleDefinitionId: `${roleDefinitionName}-id`,
    roleDefinitionName,
    canDelegate: false,
    condition: null,
    conditionVersion: null
  };
}
