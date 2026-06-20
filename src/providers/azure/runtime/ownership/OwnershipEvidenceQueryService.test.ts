import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type {
  AzureActivityLog,
  AzureRoleAssignment,
  AzureSnapshot
} from "../../inputTransferObject/generated/AzureSnapshot";
import type { EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";
import { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";
import { OwnershipEvidenceQueryService } from "./OwnershipEvidenceQueryService";

test("returns indirect cost center tag evidence for a service principal with Azure RBAC on the resource group", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-api",
          location: "westeurope",
          tags: {
            costCenter: "CC-1001"
          }
        }
      ]
    }),
    servicePrincipals: [
      servicePrincipal({
        id: "sp-rbac",
        displayName: "RBAC App",
        roleAssignments: [
          roleAssignment({
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
          })
        ]
      })
    ]
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-RBAC" })).resolves.toEqual({
    target: {
      kind: "servicePrincipal",
      id: "sp-rbac",
      displayName: "RBAC App"
    },
    evidence: [
      {
        key: "ownerTag:cc-1001:costcenter=cc-1001:",
        ownerCandidateKey: "ownerTag:cc-1001",
        ownerDisplayName: "cc-1001",
        ownerType: "ownerTag",
        confidence: "high",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "tag",
        rank: 1,
        evidence: "costCenter=CC-1001",
        date: null,
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-api",
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
          }
        ]
      }
    ]
  });
});

test("returns indirect activity log owner evidence for a service principal with Azure RBAC on the resource group", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-api",
          location: "westeurope",
          tags: null
        }
      ],
      activityLogs: [
        activityLog({
          caller: "alice@example.test",
          eventTimestamp: "2026-06-05T10:00:00.000Z",
          resourceGroupName: "rg-api"
        })
      ]
    }),
    servicePrincipals: [
      servicePrincipal({
        id: "sp-rbac",
        displayName: "RBAC App",
        roleAssignments: [
          roleAssignment({
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
          })
        ]
      })
    ]
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "sp-rbac" })).resolves.toEqual({
    target: {
      kind: "servicePrincipal",
      id: "sp-rbac",
      displayName: "RBAC App"
    },
    evidence: [
      {
        key: "ownerUser:alice@example.test:alice@example.test:2026-06-05T10:00:00.000Z",
        ownerCandidateKey: "ownerUser:alice@example.test",
        ownerDisplayName: "alice@example.test",
        ownerType: "ownerUser",
        confidence: "low",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "activityLog",
        rank: 1,
        evidence: "alice@example.test",
        date: "2026-06-05T10:00:00.000Z",
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-api",
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
          }
        ]
      }
    ]
  });
});

test("returns the app caller as indirect activity log owner evidence for a service principal with Azure RBAC on the resource group", async () => {
  const subscriptionId = "7e7963c6-cddc-4d64-bcdd-1bfb727a05c2";
  const resourceGroup = "rg-ownerlens-foundry-dev-pl";
  const callerObjectId = "5b7315c4-5800-421e-b2c0-567b4b9646c0";
  const callerAppId = "8edd93e1-2103-40b4-bd70-6e34e586362d";
  const threatProtectionScope = [
    getResourceGroupScope(subscriptionId, resourceGroup),
    "providers/Microsoft.Storage/storageAccounts/ownerlensfnw226058f",
    "providers/Microsoft.Security/advancedThreatProtectionSettings/current"
  ].join("/");
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId,
          subscriptionName: "Test",
          resourceGroup,
          location: "polandcentral",
          tags: null
        }
      ],
      activityLogs: [
        {
          subscriptionId,
          subscriptionName: "Test",
          eventTimestamp: "2026-06-13T14:19:58.4125071Z",
          submissionTimestamp: "2026-06-13T14:21:21Z",
          caller: callerObjectId,
          callerUserPrincipalName: null,
          callerName: null,
          callerEmail: null,
          callerObjectId,
          callerIdentityType: "app",
          callerAppId,
          callerIpAddress: null,
          callerTenantId: "655ccf7b-6f5b-4110-86e3-45c4b8ffc39a",
          operationName: "Updates the Advanced Threat Protection Settings",
          operationNameValue: "Microsoft.Security/advancedThreatProtectionSettings/write",
          status: "Succeeded",
          subStatus: "OK (HTTP Status Code: 200)",
          category: "Administrative",
          resourceGroupName: resourceGroup,
          resourceId: threatProtectionScope,
          resourceProviderName: "Microsoft.Security",
          resourceType: "Microsoft.Security/advancedThreatProtectionSettings",
          authorizationAction: "Microsoft.Security/advancedThreatProtectionSettings/write",
          authorizationScope: threatProtectionScope
        }
      ]
    }),
    servicePrincipals: [
      servicePrincipal({
        id: "sp-rbac",
        displayName: "RBAC App",
        roleAssignments: [
          roleAssignment({
            principalId: "sp-rbac",
            scope: getResourceGroupScope(subscriptionId, resourceGroup),
            roleDefinitionName: "Contributor",
            subscriptionId,
            subscriptionName: "Test"
          })
        ]
      })
    ]
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "sp-rbac" })).resolves.toEqual({
    target: {
      kind: "servicePrincipal",
      id: "sp-rbac",
      displayName: "RBAC App"
    },
    evidence: [
      {
        key: `application:${callerObjectId}:${callerObjectId}:2026-06-13T14:19:58.4125071Z`,
        ownerCandidateKey: `application:${callerObjectId}`,
        ownerDisplayName: callerObjectId,
        ownerType: "application",
        confidence: "low",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "activityLog",
        rank: 1,
        evidence: callerObjectId,
        date: "2026-06-13T14:19:58.4125071Z",
        relatedScopes: [
          {
            subscriptionId,
            subscriptionName: "Test",
            resourceGroup,
            principalId: "sp-rbac",
            scope: getResourceGroupScope(subscriptionId, resourceGroup),
            roleDefinitionName: "Contributor"
          }
        ]
      }
    ]
  });
});

test("does not return direct service principal or application owner evidence for a service principal", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({ resourceGroups: [] }),
    servicePrincipals: [
      servicePrincipal({
        id: "sp-direct",
        displayName: "Direct Owner App",
        servicePrincipalOwners: [
          {
            id: "sp-owner-1",
            displayName: "Service Principal Owner",
            userPrincipalName: "sp-owner@example.test",
            mail: null,
            ownerType: "User"
          }
        ],
        applicationOwners: [
          {
            id: "app-owner-1",
            displayName: "Application Owner",
            userPrincipalName: null,
            mail: "app-owner@example.test",
            ownerType: "Group"
          }
        ],
        roleAssignments: []
      })
    ]
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-DIRECT" })).resolves.toEqual({
    target: {
      kind: "servicePrincipal",
      id: "sp-direct",
      displayName: "Direct Owner App"
    },
    evidence: []
  });
});

test("reads resource group owner evidence for distinct Azure RBAC resource groups of a service principal", async () => {
  const readAzureResourceGroupOwnershipSqlRows = jest.fn().mockResolvedValue([
    {
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-api",
      location: "westeurope",
      tags: { costCenter: "CC-1001" },
      targetKey: "resourceGroup:sub-1:rg-api",
      kind: "resourceGroup",
      owner: "cc-1001",
      ownerCandidate: "ownerTag:cc-1001",
      ownerDisplayName: "cc-1001",
      confidence: "high",
      source: "tag.costCenter",
      evidence: [{ user: "costCenter=CC-1001", date: null }]
    },
    {
      subscriptionId: "sub-2",
      subscriptionName: "Development",
      resourceGroup: "rg-worker",
      location: "westeurope",
      tags: { ownerGroup: "Worker-Team" },
      targetKey: "resourceGroup:sub-2:rg-worker",
      kind: "resourceGroup",
      owner: "worker-team",
      ownerCandidate: "ownerGroup:worker-team",
      ownerDisplayName: "worker-team",
      confidence: "high",
      source: "tag.ownerGroup",
      evidence: [{ user: "ownerGroup=Worker-Team", date: null }]
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      readServicePrincipalRows: jest.fn().mockResolvedValue([
        servicePrincipal({
          id: "sp-rbac",
          displayName: "RBAC App",
          roleAssignments: [
            roleAssignment({
              principalId: "sp-rbac",
              scope: "/subscriptions/sub-1/resourceGroups/rg-api",
              roleDefinitionName: "Contributor"
            }),
            roleAssignment({
              principalId: "sp-rbac",
              scope: "/subscriptions/sub-1/resourceGroups/rg-api",
              roleDefinitionName: "Reader"
            }),
            roleAssignment({
              principalId: "sp-rbac",
              scope: "/subscriptions/sub-2/resourceGroups/rg-worker",
              roleDefinitionName: "Contributor",
              subscriptionId: "sub-2",
              subscriptionName: "Development"
            })
          ]
        })
      ])
    },
    azureResources: {
      readAzureResourceGroupOwnershipSqlRows,
      readAzureUserAssignedManagedIdentities: jest.fn()
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-RBAC" })).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerTag:cc-1001",
        ownerDisplayName: "cc-1001",
        source: "resourceGroupOwner",
        path: "indirect",
        relatedScopes: expect.arrayContaining([
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-api",
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
          }
        ])
      },
      {
        ownerCandidateKey: "ownerGroup:worker-team",
        ownerDisplayName: "worker-team",
        source: "resourceGroupOwner",
        path: "indirect",
        relatedScopes: expect.arrayContaining([
          {
            subscriptionId: "sub-2",
            subscriptionName: "Development",
            resourceGroup: "rg-worker",
            principalId: "sp-rbac",
            scope: "/subscriptions/sub-2/resourceGroups/rg-worker",
            roleDefinitionName: "Contributor"
          }
        ])
      }
    ]
  });
  expect(readAzureResourceGroupOwnershipSqlRows).toHaveBeenCalledTimes(1);
  expect(readAzureResourceGroupOwnershipSqlRows).toHaveBeenCalledWith(
    {
      subscriptionIds: ["sub-1", "sub-2"],
      resourceGroups: ["rg-api", "rg-worker"],
      principalIds: ["sp-rbac"]
    },
    100
  );
});

test("returns resource group evidence for a managed identity with a resolved resource group", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-mi",
          location: "westeurope",
          tags: {
            ownerGroup: "identity-platform"
          }
        }
      ],
      userAssignedManagedIdentities: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceId: "/subscriptions/sub-1/resourceGroups/rg-mi/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-api",
          name: "uami-api",
          resourceGroup: "rg-mi",
          location: "westeurope",
          clientId: "mi-client-id",
          principalId: "mi-principal-id",
          tenantId: "tenant-1",
          tags: null
        }
      ]
    }),
    managedIdentities: [
      managedIdentity({
        id: "mi-principal-id",
        appId: "mi-client-id",
        displayName: "uami-api",
        resourceGroup: "rg-mi"
      })
    ],
    servicePrincipals: []
  });

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toEqual({
    target: {
      kind: "resourceGroup",
      id: "resourceGroup:sub-1:rg-mi",
      displayName: "rg-mi",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-mi"
    },
    evidence: [
      {
        key: "ownerGroup:identity-platform:ownergroup=identity-platform:",
        ownerCandidateKey: "ownerGroup:identity-platform",
        ownerDisplayName: "identity-platform",
        ownerType: "ownerGroup",
        confidence: "high",
        source: "tag",
        path: "direct",
        discoverySource: "tag",
        rank: 1,
        evidence: "ownerGroup=identity-platform",
        date: null,
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-mi"
          }
        ]
      }
    ]
  });
});

test("returns direct resource group cost center tag evidence", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-api",
          location: "westeurope",
          tags: {
            costCenter: "CC-1001"
          }
        }
      ]
    }),
    servicePrincipals: []
  });

  await expect(
    service.readOwnershipEvidence({
      kind: "resourceGroup",
      subscriptionId: "SUB-1",
      resourceGroup: "RG-API"
    })
  ).resolves.toEqual({
    target: {
      kind: "resourceGroup",
      id: "resourceGroup:sub-1:rg-api",
      displayName: "rg-api",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-api"
    },
    evidence: [
      {
        key: "ownerTag:cc-1001:costcenter=cc-1001:",
        ownerCandidateKey: "ownerTag:cc-1001",
        ownerDisplayName: "cc-1001",
        ownerType: "ownerTag",
        confidence: "high",
        source: "tag",
        path: "direct",
        discoverySource: "tag",
        rank: 1,
        evidence: "costCenter=CC-1001",
        date: null,
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-api"
          }
        ]
      }
    ]
  });
});

test("returns direct resource group evidence for each requested owner", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-api",
          location: "westeurope",
          tags: {
            ownerGroup: "platform-team",
            owner: "api-owner@example.test"
          }
        }
      ]
    }),
    servicePrincipals: []
  });

  await expect(
    service.readOwnershipEvidence({
      kind: "resourceGroup",
      subscriptionId: "sub-1",
      resourceGroup: "rg-api",
      page: 1,
      pageSize: 2
    })
  ).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerGroup:platform-team",
        ownerDisplayName: "platform-team",
        ownerType: "ownerGroup",
        confidence: "high",
        source: "tag",
        evidence: "ownerGroup=platform-team"
      },
      {
        ownerCandidateKey: "ownerTag:api-owner@example.test",
        ownerDisplayName: "api-owner@example.test",
        ownerType: "ownerTag",
        confidence: "medium",
        source: "tag",
        evidence: "owner=api-owner@example.test"
      }
    ]
  });
});

test("returns the same resource group owner evidence for a managed identity assigned to that resource group", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-mi",
          location: "westeurope",
          tags: {
            ownerUser: "alice@example.test",
            owner: "bob@example.test"
          }
        }
      ],
      userAssignedManagedIdentities: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceId: "/subscriptions/sub-1/resourceGroups/rg-mi/providers/Microsoft.ManagedIdentity/userAssignedIdentities/uami-api",
          name: "uami-api",
          resourceGroup: "rg-mi",
          location: "westeurope",
          clientId: "mi-client-id",
          principalId: "mi-principal-id",
          tenantId: "tenant-1",
          tags: null
        }
      ]
    }),
    managedIdentities: [
      managedIdentity({
        id: "mi-principal-id",
        appId: "mi-client-id",
        displayName: "uami-api",
        resourceGroup: "rg-mi"
      })
    ],
    servicePrincipals: []
  });

  const resourceGroupEvidence = await service.readOwnershipEvidence({
    kind: "resourceGroup",
    subscriptionId: "sub-1",
    resourceGroup: "rg-mi",
    page: 1,
    pageSize: 2
  });
  const managedIdentityEvidence = await service.readOwnershipEvidence({
    kind: "managedIdentity",
    principalId: "mi-principal-id"
  });

  expect(resourceGroupEvidence.evidence).toMatchObject([
    {
      ownerCandidateKey: "ownerUser:alice@example.test",
      ownerDisplayName: "alice@example.test",
      ownerType: "ownerUser",
      confidence: "high",
      source: "tag",
      evidence: "ownerUser=alice@example.test"
    },
    {
      ownerCandidateKey: "ownerTag:bob@example.test",
      ownerDisplayName: "bob@example.test",
      ownerType: "ownerTag",
      confidence: "medium",
      source: "tag",
      evidence: "owner=bob@example.test"
    }
  ]);
  expect(managedIdentityEvidence.evidence).toEqual(resourceGroupEvidence.evidence);
});

test("returns 404 when ownership evidence target does not exist", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({ resourceGroups: [] }),
    servicePrincipals: []
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "missing" })).rejects.toEqual(
    new RuntimeHttpError("Ownership evidence target was not found.", 404)
  );
});

function buildOwnershipEvidenceService({
  azureSnapshot,
  managedIdentities = [],
  servicePrincipals
}: {
  azureSnapshot: AzureSnapshot;
  managedIdentities?: ManagedIdentity[];
  servicePrincipals: ServicePrincipal[];
}): OwnershipEvidenceQueryService {
  const entraSnapshotValue = entraSnapshot({ servicePrincipals: [] });
  const entraRuntime = {
    readSnapshot: jest.fn().mockResolvedValue(entraSnapshotValue),
    readEntraServicePrincipals: jest.fn().mockResolvedValue(entraSnapshotValue.servicePrincipals),
    readServicePrincipals: jest.fn().mockResolvedValue(servicePrincipals),
    readManagedIdentities: jest.fn().mockResolvedValue(managedIdentities)
  };
  const azureResourcesRuntime = {
    readSnapshot: jest.fn().mockResolvedValue(azureSnapshot),
    readAzureResourceGroupOwnershipSqlRows: jest.fn(({ subscriptionIds, resourceGroups }, limit) =>
      Promise.resolve(readTestResourceGroupOwnershipSqlRows(azureSnapshot, { subscriptionIds, resourceGroups }, limit))
    ),
    readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue(azureSnapshot.userAssignedManagedIdentities)
  };
  const azureResourcesQueries = new AzureResourcesCollectionQueryService({
    entra: entraRuntime,
    azureResources: azureResourcesRuntime,
    disabledEvidenceStore: {
      readKeys: jest.fn().mockResolvedValue(new Set<string>())
    },
    exportService: {}
  } as unknown as ConstructorParameters<typeof AzureResourcesCollectionQueryService>[0]);
  const entraQueries = new EntraCollectionQueryService({
    entra: entraRuntime,
    azureResources: azureResourcesRuntime,
    azureResourcesQueries,
    zeroTrustAssessmentQueries: {
      readRemediationSummaries: jest.fn().mockResolvedValue(new Map()),
      readRemediationPackageSummariesByPrincipalId: jest.fn().mockResolvedValue(new Map())
    },
    exportService: {}
  } as unknown as ConstructorParameters<typeof EntraCollectionQueryService>[0]);

  return new OwnershipEvidenceQueryService({
    entraQueries,
    azureResources: azureResourcesRuntime
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);
}

function azureSnapshot({
  activityLogs = [],
  resourceGroups,
  userAssignedManagedIdentities = []
}: {
  activityLogs?: AzureSnapshot["activityLogs"];
  resourceGroups: AzureSnapshot["resourceGroups"];
  userAssignedManagedIdentities?: AzureSnapshot["userAssignedManagedIdentities"];
}): AzureSnapshot {
  return {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      activityDays: 30,
      activityStartTime: "2026-05-06T00:00:00.000Z",
      maxActivityRecords: 1000,
      requestedSubscriptions: ["sub-1"],
      subscriptionCount: 1,
      resourceGroupCount: resourceGroups.length,
      resourceCount: 0,
      userAssignedManagedIdentityCount: userAssignedManagedIdentities.length,
      roleAssignmentCount: 0,
      activityLogCount: activityLogs.length
    },
    subscriptions: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Production",
        tenantId: "tenant-1",
        state: "Enabled",
        tags: null
      }
    ],
    resourceGroups,
    resources: [],
    userAssignedManagedIdentities,
    roleAssignments: [],
    activityLogs
  };
}

function entraSnapshot({
  servicePrincipals
}: {
  servicePrincipals: EntraSnapshot["servicePrincipals"];
}): EntraSnapshot {
  return {
    meta: {
      provider: "entra",
      snapshotVersion: "0.4",
      createdAt: "2026-06-05T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "admin@example.test",
      scopes: [],
      servicePrincipalCount: servicePrincipals.length
    },
    servicePrincipals
  };
}

function servicePrincipal({
  id,
  displayName,
  servicePrincipalOwners = [],
  applicationOwners = [],
  roleAssignments
}: {
  id: string;
  displayName: string;
  servicePrincipalOwners?: NonNullable<ServicePrincipal["servicePrincipalOwners"]>;
  applicationOwners?: NonNullable<ServicePrincipal["applicationOwners"]>;
  roleAssignments: AzureRoleAssignment[];
}): ServicePrincipal {
  return {
    id,
    displayName,
    appId: `${id}-app`,
    appDisplayName: displayName,
    appOwnerOrganizationId: "tenant-1",
    accountEnabled: true,
    servicePrincipalType: "Application",
    servicePrincipalNames: [],
    servicePrincipalOwners,
    applicationOwners,
    replyUrls: [],
    tags: {},
    homepage: null,
    loginUrl: null,
    publisherName: null,
    roleAssignments,
    permissionRisk: "none",
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none",
    rbacRoleAssignmentCount: roleAssignments.length,
    rbacRoleLevel: "medium",
    rbacSubscriptionCount: 1,
    ztaRemediationCountAll: 0,
    ztaRemediationFailedCount: 0,
    ztaMaxRisk: "none"
  };
}

function managedIdentity({
  id,
  appId,
  displayName,
  resourceGroup
}: {
  id: string;
  appId: string;
  displayName: string;
  resourceGroup?: string;
}): ManagedIdentity {
  return {
    id,
    displayName,
    appId,
    appDisplayName: displayName,
    appOwnerOrganizationId: "tenant-1",
    accountEnabled: true,
    servicePrincipalType: "ManagedIdentity",
    servicePrincipalNames: [],
    servicePrincipalOwners: [],
    applicationOwners: [],
    replyUrls: [],
    tags: {},
    homepage: null,
    loginUrl: null,
    publisherName: null,
    roleAssignments: [],
    permissionRisk: "none",
    managedIdentityAssignments: [],
    assignedResourceGroups: resourceGroup ? [resourceGroup] : [],
    resourceGroup,
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none",
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none",
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none",
    rbacSubscriptionCount: 0,
    ztaRemediationCountAll: 0,
    ztaRemediationFailedCount: 0,
    ztaMaxRisk: "none"
  };
}

function roleAssignment({
  principalId,
  scope,
  roleDefinitionName,
  subscriptionId = "sub-1",
  subscriptionName = "Production"
}: {
  principalId: string;
  scope: string;
  roleDefinitionName: string;
  subscriptionId?: string;
  subscriptionName?: string;
}): AzureRoleAssignment {
  return {
    subscriptionId,
    subscriptionName,
    roleAssignmentId: null,
    scope,
    scopeType: "ResourceGroup",
    principalId,
    principalType: "ServicePrincipal",
    principalDisplayName: "RBAC App",
    signInName: null,
    roleDefinitionId: null,
    roleDefinitionName,
    canDelegate: null,
    condition: null,
    conditionVersion: null
  };
}

function getResourceGroupScope(subscriptionId: string, resourceGroup: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
}

function activityLog({
  caller,
  eventTimestamp,
  resourceGroupName
}: {
  caller: string;
  eventTimestamp: string;
  resourceGroupName: string;
}): AzureActivityLog {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Production",
    eventTimestamp,
    submissionTimestamp: null,
    caller,
    operationName: "Create or update resource",
    operationNameValue: "Microsoft.Resources/deployments/write",
    status: "Succeeded",
    subStatus: "OK",
    category: "Administrative",
    resourceGroupName,
    resourceId: `/subscriptions/sub-1/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/deploy-1`,
    resourceProviderName: "Microsoft.Resources",
    resourceType: "Microsoft.Resources/deployments",
    authorizationAction: "Microsoft.Resources/deployments/write",
    authorizationScope: `/subscriptions/sub-1/resourceGroups/${resourceGroupName}`
  };
}

function readTestResourceGroupOwnershipSqlRows(
  snapshot: AzureSnapshot,
  target: { subscriptionIds: string[]; resourceGroups: string[] },
  limit = 1
): Array<AzureSnapshot["resourceGroups"][number] & {
  targetKey: string;
  kind: "resourceGroup";
  owner: string | null;
  ownerCandidate: string | null;
  ownerDisplayName: string | null;
  confidence: "high" | "medium" | "low" | "none";
  source: string;
  evidence: Array<{ user: string; date: string | null }>;
}> {
  const normalizedSubscriptionIds = new Set(target.subscriptionIds.map((value) => value.trim().toLowerCase()));
  const normalizedResourceGroups = new Set(target.resourceGroups.map((value) => value.trim().toLowerCase()));
  const group = snapshot.resourceGroups.find(
    (candidate) =>
      normalizedSubscriptionIds.has(candidate.subscriptionId.trim().toLowerCase()) &&
      normalizedResourceGroups.has(candidate.resourceGroup.trim().toLowerCase())
  );

  if (!group) {
    return [];
  }

  const tags = getTestOwnerTags(group.tags).slice(0, Math.max(1, Math.trunc(limit)));

  if (tags.length === 0) {
    const latestActivity = getLatestTestOwnerActivity(snapshot.activityLogs, group);
    if (latestActivity?.caller) {
      return [
        {
          ...group,
          targetKey: `resourceGroup:${group.subscriptionId.toLowerCase()}:${group.resourceGroup.toLowerCase()}`,
          kind: "resourceGroup",
          owner: latestActivity.caller.trim().toLowerCase(),
          ownerCandidate: `${getActivityOwnerType(latestActivity)}:${latestActivity.caller.trim().toLowerCase()}`,
          ownerDisplayName: latestActivity.caller.trim().toLowerCase(),
          confidence: "low",
          source: "activity.lastModifier",
          evidence: [{ user: latestActivity.caller.trim().toLowerCase(), date: latestActivity.eventTimestamp }]
        }
      ];
    }

    return [
      {
        ...group,
        targetKey: `resourceGroup:${group.subscriptionId.toLowerCase()}:${group.resourceGroup.toLowerCase()}`,
        kind: "resourceGroup",
        owner: null,
        ownerCandidate: null,
        ownerDisplayName: null,
        confidence: "none",
        source: "none",
        evidence: []
      }
    ];
  }

  return tags.map((tag) => (
    {
      ...group,
      targetKey: `resourceGroup:${group.subscriptionId.toLowerCase()}:${group.resourceGroup.toLowerCase()}`,
      kind: "resourceGroup",
      owner: tag.value.trim().toLowerCase(),
      ownerCandidate: null,
      ownerDisplayName: tag.value.trim().toLowerCase(),
      confidence: tag.confidence,
      source: `tag.${tag.name}`,
      evidence: [{ user: `${tag.name}=${tag.value}`, date: null }]
    }
  ));
}

function getActivityOwnerType(activity: AzureActivityLog): "application" | "ownerUser" | "unknown" {
  if (activity.callerIdentityType?.trim().toLowerCase() === "app") {
    return "application";
  }

  if (activity.caller?.includes("@")) {
    return "ownerUser";
  }

  return "unknown";
}

function getLatestTestOwnerActivity(
  activityLogs: AzureSnapshot["activityLogs"],
  group: AzureSnapshot["resourceGroups"][number]
): AzureSnapshot["activityLogs"][number] | null {
  const matchingLogs = activityLogs.filter(
    (log) =>
      log.subscriptionId.trim().toLowerCase() === group.subscriptionId.trim().toLowerCase() &&
      log.resourceGroupName?.trim().toLowerCase() === group.resourceGroup.trim().toLowerCase() &&
      log.category === "Administrative" &&
      log.status === "Succeeded" &&
      log.caller?.trim()
  );

  return matchingLogs.sort((left, right) => right.eventTimestamp.localeCompare(left.eventTimestamp))[0] ?? null;
}

function getTestOwnerTags(tags: Record<string, string> | null): Array<{
  name: string;
  value: string;
  confidence: "high" | "medium";
}> {
  const ownerTags: Array<{
    name: string;
    value: string;
    confidence: "high" | "medium";
  }> = [];

  for (const tag of [
    { name: "ownerGroup", confidence: "high" as const },
    { name: "ownerUser", confidence: "high" as const },
    { name: "costCenter", confidence: "high" as const },
    { name: "owner", confidence: "medium" as const }
  ]) {
    const key = Object.keys(tags ?? {}).find((candidate) => candidate.toLowerCase() === tag.name.toLowerCase());
    const value = key ? tags?.[key]?.trim() : null;

    if (value) {
      ownerTags.push({ ...tag, value });
    }
  }

  return ownerTags;
}
