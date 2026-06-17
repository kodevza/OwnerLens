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
            scope: "/subscriptions/sub-1/resourceGroups/rg-api",
            roleDefinitionName: "Contributor"
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
  servicePrincipals
}: {
  azureSnapshot: AzureSnapshot;
  servicePrincipals: ServicePrincipal[];
}): OwnershipEvidenceQueryService {
  const entraSnapshotValue = entraSnapshot({ servicePrincipals: [] });
  const entraRuntime = {
    readSnapshot: jest.fn().mockResolvedValue(entraSnapshotValue),
    readServicePrincipals: jest.fn().mockResolvedValue(servicePrincipals),
    readManagedIdentities: jest.fn().mockResolvedValue([])
  };
  const azureResourcesRuntime = {
    readSnapshot: jest.fn().mockResolvedValue(azureSnapshot),
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
    azureResourcesQueries
  });
}

function azureSnapshot({
  activityLogs = [],
  resourceGroups
}: {
  activityLogs?: AzureSnapshot["activityLogs"];
  resourceGroups: AzureSnapshot["resourceGroups"];
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
      userAssignedManagedIdentityCount: 0,
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
    userAssignedManagedIdentities: [],
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
  roleAssignments
}: {
  id: string;
  displayName: string;
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
    servicePrincipalOwners: [],
    applicationOwners: [],
    replyUrls: [],
    tags: [],
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

function roleAssignment({
  principalId,
  scope,
  roleDefinitionName
}: {
  principalId: string;
  scope: string;
  roleDefinitionName: string;
}): AzureRoleAssignment {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Production",
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
