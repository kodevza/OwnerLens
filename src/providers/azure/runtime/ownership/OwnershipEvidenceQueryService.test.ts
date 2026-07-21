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
        key: "resourceGroup:sub-1:rg-api:principal:sp-rbac:ownerTag:cc-1001",
        statusKey: "resourceGroup:sub-1:rg-api:principal:sp-rbac:ownerTag:cc-1001",
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
            principalId: "sp-rbac"
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
        key: "resourceGroup:sub-1:rg-api:principal:sp-rbac:ownerUser:alice@example.test",
        statusKey: "resourceGroup:sub-1:rg-api:principal:sp-rbac:ownerUser:alice@example.test",
        ownerCandidateKey: "ownerUser:alice@example.test",
        ownerDisplayName: "alice@example.test",
        ownerType: "ownerUser",
        confidence: "low",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "activityLog",
        rank: 1,
        evidence: "/subscriptions/sub-1/resourceGroups/rg-api/providers/Microsoft.Resources/deployments/deploy-1",
        date: "2026-06-05T10:00:00.000Z",
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-api",
            principalId: "sp-rbac"
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
        key: `resourceGroup:${subscriptionId}:${resourceGroup}:principal:sp-rbac:application:${callerObjectId}`,
        statusKey: `resourceGroup:${subscriptionId}:${resourceGroup}:principal:sp-rbac:application:${callerObjectId}`,
        ownerCandidateKey: `application:${callerObjectId}`,
        ownerDisplayName: callerObjectId,
        ownerType: "application",
        confidence: "low",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "activityLog",
        rank: 1,
        evidence: threatProtectionScope,
        date: "2026-06-13T14:19:58.4125071Z",
        relatedScopes: [
          {
            subscriptionId,
            subscriptionName: "Test",
            resourceGroup,
            principalId: "sp-rbac"
          }
        ]
      }
    ]
  });
});

test("returns direct service principal, application, and tag owner evidence for a service principal", async () => {
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
        id: "sp-direct",
        displayName: "Direct Owner App",
        tags: {
          owner: "platform-team"
        },
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
        roleAssignments: [
          roleAssignment({
            principalId: "sp-direct",
            scope: "/subscriptions/sub-1",
            roleDefinitionName: "Contributor"
          })
        ]
      })
    ]
  });

  await expect(service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-DIRECT" })).resolves.toEqual({
    target: {
      kind: "servicePrincipal",
      id: "sp-direct",
      displayName: "Direct Owner App"
    },
    evidence: [
      {
        key: "entraApplicationOwner:ownerUser:app-owner-1:app-owner@example.test:",
        statusKey: "entraApplicationOwner:ownerUser:app-owner-1:app-owner@example.test:",
        ownerCandidateKey: "entraApplicationOwner:ownerUser:app-owner-1",
        ownerDisplayName: "app-owner@example.test",
        ownerType: "ownerUser",
        confidence: "high",
        source: "entraApplicationOwner",
        path: "direct",
        discoverySource: "applicationOwner",
        rank: 1,
        evidence: "app-owner@example.test",
        date: null,
        relatedScopes: []
      },
      {
        key: "entraServicePrincipalOwner:ownerUser:sp-owner-1:sp-owner@example.test:",
        statusKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1:sp-owner@example.test:",
        ownerCandidateKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1",
        ownerDisplayName: "sp-owner@example.test",
        ownerType: "ownerUser",
        confidence: "high",
        source: "entraServicePrincipalOwner",
        path: "direct",
        discoverySource: "servicePrincipalOwner",
        rank: 2,
        evidence: "sp-owner@example.test",
        date: null,
        relatedScopes: []
      },
      {
        key: "ownerUser:platform-team:owner=platform-team:",
        statusKey: "ownerUser:platform-team:owner=platform-team:",
        ownerCandidateKey: "ownerUser:platform-team",
        ownerDisplayName: "platform-team",
        ownerType: "ownerUser",
        confidence: "medium",
        source: "tag",
        path: "direct",
        discoverySource: "tag",
        rank: 3,
        evidence: "owner=platform-team",
        date: null,
        relatedScopes: []
      }
    ]
  });
});

test("keeps the selected principal owner as the first candidate in the evidence list", async () => {
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(servicePrincipal({
        id: "sp-ranked",
        displayName: "Ranked Owner App",
        roleAssignments: []
      }))
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows: jest.fn().mockResolvedValue([
        {
          principalId: "sp-ranked",
          subscriptionId: null,
          subscriptionName: null,
          resourceGroup: null,
          owner: "selected-direct-owner",
          ownerCandidate: "ownerUser:selected-direct-owner",
          ownerType: "ownerUser",
          evidenceKey: "ownerUser:selected-direct-owner:owner=selected-direct-owner:",
          confidence: "medium",
          source: "tag",
          path: "direct",
          discoverySource: "tag",
          evidenceValue: "owner=selected-direct-owner",
          evidenceDate: null,
          priority: 1
        },
        {
          principalId: "sp-ranked",
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-api",
          owner: "indirect-high-owner",
          ownerCandidate: "ownerGroup:indirect-high-owner",
          ownerType: "ownerGroup",
          evidenceKey: "resourceGroup:sub-1:rg-api:principal:sp-ranked:ownerGroup:indirect-high-owner",
          confidence: "high",
          source: "resourceGroupOwner",
          path: "indirect",
          discoverySource: "tag",
          evidenceValue: "ownerGroup=indirect-high-owner",
          evidenceDate: null,
          priority: 1001
        }
      ])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  const response = await service.readOwnershipEvidence({
    kind: "servicePrincipal",
    principalId: "sp-ranked"
  });

  expect(response.evidence.map((item) => item.ownerDisplayName)).toEqual([
    "selected-direct-owner",
    "indirect-high-owner"
  ]);
});

test("reads resource group owner evidence for distinct Azure RBAC resource groups of a service principal", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-api",
      principalId: "sp-rbac",
      owner: "cc-1001",
      ownerCandidate: "ownerTag:cc-1001",
      ownerType: "ownerTag",
      evidenceKey: "resourceGroup:sub-1:rg-api:principal:sp-rbac:ownerTag:cc-1001",
      confidence: "high",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "costCenter=CC-1001",
      evidenceDate: null,
      priority: 1
    },
    {
      subscriptionId: "sub-2",
      subscriptionName: "Development",
      resourceGroup: "rg-worker",
      principalId: "sp-rbac",
      owner: "worker-team",
      ownerCandidate: "ownerGroup:worker-team",
      ownerType: "ownerGroup",
      evidenceKey: "resourceGroup:sub-2:rg-worker:principal:sp-rbac:ownerGroup:worker-team",
      confidence: "high",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "ownerGroup=Worker-Team",
      evidenceDate: null,
      priority: 2
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(
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
      )
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([])
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
            principalId: "sp-rbac"
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
            principalId: "sp-rbac"
          }
        ])
      }
    ]
  });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledTimes(1);
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "sp-rbac"
    },
    100
  );
});

test("keeps Azure RBAC resource group lookup targets paired when subscription ids repeat", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(
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
              scope: "/subscriptions/sub-1/resourceGroups/rg-worker",
              roleDefinitionName: "Reader"
            })
          ]
        })
      )
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-RBAC" })
  ).resolves.toMatchObject({ evidence: [] });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "sp-rbac"
    },
    100
  );
});

test("returns direct service principal owner evidence without an Azure RBAC toggle", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "sp-direct",
      subscriptionId: null,
      subscriptionName: null,
      resourceGroup: null,
      owner: "sp-owner@example.test",
      ownerCandidate: "entraServicePrincipalOwner:ownerUser:sp-owner-1",
      ownerType: "ownerUser",
      evidenceKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1:sp-owner@example.test:",
      confidence: "high",
      source: "entraServicePrincipalOwner",
      path: "direct",
      discoverySource: "servicePrincipalOwner",
      evidenceValue: "sp-owner@example.test",
      evidenceDate: null,
      priority: 1
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(
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
              ownerType: "Application"
            }
          ],
          roleAssignments: [
            roleAssignment({
              principalId: "sp-direct",
              scope: "/subscriptions/sub-1",
              roleDefinitionName: "Contributor"
            })
          ]
        })
      )
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-DIRECT" })
  ).resolves.toMatchObject({
    target: {
      kind: "servicePrincipal",
      id: "sp-direct"
    },
    evidence: [
      {
        ownerCandidateKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1",
        path: "direct"
      }
    ]
  });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "sp-direct"
    },
    100
  );
});

test("returns custom principal owner evidence from runtime rows", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "sp-custom",
      subscriptionId: null,
      subscriptionName: null,
      resourceGroup: null,
      owner: "platform-team",
      ownerCandidate: "ownerGroup:platform-team",
      ownerType: "ownerGroup",
      evidenceKey: "ownerCustom:sp-custom:serviceNow:platform-team",
      confidence: "high",
      source: "ownerCustom",
      path: "direct",
      discoverySource: "ownerCustom",
      evidenceValue: "CMDB assignment",
      evidenceDate: "2026-06-30T12:00:00.000Z",
      priority: 50
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(
        servicePrincipal({
          id: "sp-custom",
          displayName: "Custom Owner App",
          roleAssignments: []
        })
      )
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "servicePrincipal", principalId: "SP-CUSTOM" })
  ).resolves.toMatchObject({
    target: {
      kind: "servicePrincipal",
      id: "sp-custom"
    },
    evidence: [
      {
        ownerCandidateKey: "ownerGroup:platform-team",
        ownerDisplayName: "platform-team",
        ownerType: "ownerGroup",
        confidence: "high",
        source: "ownerCustom",
        path: "direct",
        discoverySource: "ownerCustom",
        evidence: "CMDB assignment",
        date: "2026-06-30T12:00:00.000Z"
      }
    ]
  });
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
      kind: "managedIdentity",
      id: "mi-principal-id",
      displayName: "uami-api"
    },
    evidence: [
      {
        ownerCandidateKey: "ownerGroup:identity-platform",
        ownerDisplayName: "identity-platform",
        ownerType: "ownerGroup",
        confidence: "high",
        source: "resourceGroupOwner",
        path: "indirect",
        discoverySource: "tag",
        rank: 1,
        evidence: "ownerGroup=identity-platform",
        date: null,
        key: "resourceGroup:sub-1:rg-mi:principal:mi-principal-id:ownerGroup:identity-platform",
        statusKey: "resourceGroup:sub-1:rg-mi:principal:mi-principal-id:ownerGroup:identity-platform",
        relatedScopes: [
          {
            subscriptionId: "sub-1",
            subscriptionName: "Production",
            resourceGroup: "rg-mi",
            principalId: "mi-principal-id"
          }
        ]
      }
    ]
  });
});

test("returns direct managed identity owner evidence without an Azure RBAC toggle", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "mi-principal-id",
      subscriptionId: null,
      subscriptionName: null,
      resourceGroup: null,
      owner: "mi-owner@example.test",
      ownerCandidate: "entraServicePrincipalOwner:ownerUser:mi-owner-1",
      ownerType: "ownerUser",
      evidenceKey: "entraServicePrincipalOwner:ownerUser:mi-owner-1:mi-owner@example.test:",
      confidence: "high",
      source: "entraServicePrincipalOwner",
      path: "direct",
      discoverySource: "servicePrincipalOwner",
      evidenceValue: "mi-owner@example.test",
      evidenceDate: null,
      priority: 1
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      readManagedIdentityRows: jest.fn().mockResolvedValue([
        managedIdentity({
          id: "mi-principal-id",
          appId: "mi-client-id",
          displayName: "uami-api",
          resourceGroup: "rg-mi",
          servicePrincipalOwners: [
            {
              id: "mi-owner-1",
              displayName: "Managed Identity Owner",
              userPrincipalName: "mi-owner@example.test",
              mail: null,
              ownerType: "User"
            }
          ]
        })
      ])
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toMatchObject({
    target: {
      kind: "managedIdentity",
      id: "mi-principal-id"
    },
    evidence: [
      {
        ownerCandidateKey: "entraServicePrincipalOwner:ownerUser:mi-owner-1",
        path: "direct"
      }
    ]
  });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "mi-principal-id"
    },
    100
  );
});

test("returns Azure RBAC evidence for a managed identity without using direct owner fallback", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "mi-principal-id",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-mi",
      owner: "resource-group-owner",
      ownerCandidate: "ownerGroup:resource-group-owner",
      ownerType: "ownerGroup",
      evidenceKey: "resourceGroup:sub-1:rg-mi:ownerGroup:resource-group-owner",
      confidence: "high",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "ownerGroup=resource-group-owner",
      evidenceDate: null,
      priority: 1
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      readManagedIdentityRows: jest.fn().mockResolvedValue([
        managedIdentity({
          id: "mi-principal-id",
          appId: "mi-client-id",
          displayName: "uami-api",
          resourceGroup: "rg-mi",
          tags: {
            ownerGroup: "identity-platform"
          }
        })
      ])
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([
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
      ])
    },
    disabledEvidenceStore: {
      readKeys: jest.fn().mockResolvedValue(new Set(["ownerGroup:identity-platform"]))
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerGroup:resource-group-owner",
        ownerDisplayName: "resource-group-owner",
        confidence: "high",
        evidence: "ownerGroup=resource-group-owner"
      }
    ]
  });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "mi-principal-id"
    },
    100
  );
});

test("returns direct service principal owner and tag evidence for a managed identity", async () => {
  const service = buildOwnershipEvidenceService({
    azureSnapshot: azureSnapshot({
      resourceGroups: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Production",
          resourceGroup: "rg-mi",
          location: "westeurope",
          tags: null
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
        resourceGroup: "rg-mi",
        tags: {
          owner: "identity-platform"
        },
        servicePrincipalOwners: [
          {
            id: "sp-owner-1",
            displayName: "Managed Identity Owner",
            userPrincipalName: "mi-owner@example.test",
            mail: null,
            ownerType: "User"
          }
        ]
      })
    ],
    servicePrincipals: []
  });

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toEqual({
    target: {
      kind: "managedIdentity",
      id: "mi-principal-id",
      displayName: "uami-api"
    },
    evidence: [
      {
        key: "entraServicePrincipalOwner:ownerUser:sp-owner-1:mi-owner@example.test:",
        statusKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1:mi-owner@example.test:",
        ownerCandidateKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1",
        ownerDisplayName: "mi-owner@example.test",
        ownerType: "ownerUser",
        confidence: "high",
        source: "entraServicePrincipalOwner",
        path: "direct",
        discoverySource: "servicePrincipalOwner",
        rank: 1,
        evidence: "mi-owner@example.test",
        date: null,
        relatedScopes: []
      },
      {
        key: "ownerUser:identity-platform:owner=identity-platform:",
        statusKey: "ownerUser:identity-platform:owner=identity-platform:",
        ownerCandidateKey: "ownerUser:identity-platform",
        ownerDisplayName: "identity-platform",
        ownerType: "ownerUser",
        confidence: "medium",
        source: "tag",
        path: "direct",
        discoverySource: "tag",
        rank: 2,
        evidence: "owner=identity-platform",
        date: null,
        relatedScopes: []
      }
    ]
  });
});

test("reads managed identity ownership evidence with a principal-scoped resource group lookup", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "mi-principal-id",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-mi",
      owner: "identity-platform",
      ownerCandidate: "ownerGroup:identity-platform",
      ownerType: "ownerGroup",
      evidenceKey: "resourceGroup:sub-1:rg-mi:ownerGroup:identity-platform",
      confidence: "high",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "ownerGroup=identity-platform",
      evidenceDate: null,
      priority: 1
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      readManagedIdentityRows: jest.fn().mockResolvedValue([
        managedIdentity({
          id: "mi-principal-id",
          appId: "mi-client-id",
          displayName: "uami-api",
          resourceGroup: "rg-mi"
        })
      ])
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([
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
      ])
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerGroup:identity-platform",
        relatedScopes: [
          {
            principalId: "mi-principal-id"
          }
        ]
      }
    ]
  });
  expect(readAzurePrincipalResourceGroupOwnerCandidateViewRows).toHaveBeenCalledWith(
    {
      principalId: "mi-principal-id"
    },
    100
  );
});

test("applies stored principal-scoped disabled state to final managed identity ownership evidence", async () => {
  const readAzurePrincipalResourceGroupOwnerCandidateViewRows = jest.fn().mockResolvedValue([
    {
      principalId: "mi-principal-id",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-mi",
      owner: "platform-team",
      ownerCandidate: "ownerGroup:platform-team",
      ownerType: "ownerGroup",
      evidenceKey: "resourceGroup:sub-1:rg-mi:ownerGroup:platform-team",
      confidence: "high",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "ownerGroup=platform-team",
      evidenceDate: null,
      priority: 1
    },
    {
      principalId: "mi-principal-id",
      subscriptionId: "sub-1",
      subscriptionName: "Production",
      resourceGroup: "rg-mi",
      owner: "fallback@example.test",
      ownerCandidate: "ownerTag:fallback@example.test",
      ownerType: "ownerTag",
      evidenceKey: "resourceGroup:sub-1:rg-mi:ownerTag:fallback@example.test",
      confidence: "medium",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      evidenceValue: "owner=fallback@example.test",
      evidenceDate: null,
      priority: 2
    }
  ]);
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      readManagedIdentityRows: jest.fn().mockResolvedValue([
        managedIdentity({
          id: "mi-principal-id",
          appId: "mi-client-id",
          displayName: "uami-api",
          resourceGroup: "rg-mi"
        })
      ])
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows,
      readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue([
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
      ])
    },
    disabledEvidenceStore: {
      readKeys: jest.fn().mockResolvedValue(new Set([
        "resourceGroup:sub-1:rg-mi:principal:mi-principal-id:ownerGroup:platform-team"
      ]))
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({ kind: "managedIdentity", principalId: "MI-PRINCIPAL-ID" })
  ).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerTag:fallback@example.test",
        ownerDisplayName: "fallback@example.test",
        evidence: "owner=fallback@example.test"
      },
      {
        ownerCandidateKey: "ownerGroup:platform-team",
        ownerDisplayName: "platform-team",
        evidence: "ownerGroup=platform-team",
        disabled: true
      }
    ]
  });
});

test("applies disabled evidence through the direct service principal owner wrapper", async () => {
  const service = new OwnershipEvidenceQueryService({
    entraQueries: {
      findServicePrincipalById: jest.fn().mockResolvedValue(servicePrincipal({
        id: "sp-direct",
        displayName: "Direct Owner App",
        tags: {
          owner: "platform-team"
        },
        roleAssignments: []
      }))
    },
    azureResources: {
      readAzurePrincipalResourceGroupOwnerCandidateViewRows: jest.fn().mockResolvedValue([
        {
          principalId: "sp-direct",
          subscriptionId: null,
          subscriptionName: null,
          resourceGroup: null,
          owner: "platform-team",
          ownerCandidate: "ownerUser:platform-team",
          ownerType: "ownerUser",
          evidenceKey: "ownerUser:platform-team:owner=platform-team:",
          confidence: "medium",
          source: "tag",
          path: "direct",
          discoverySource: "tag",
          evidenceValue: "owner=platform-team",
          evidenceDate: null,
          priority: 1
        }
      ])
    },
    disabledEvidenceStore: {
      readKeys: jest.fn().mockResolvedValue(new Set(["ownerUser:platform-team:owner=platform-team:"]))
    }
  } as unknown as ConstructorParameters<typeof OwnershipEvidenceQueryService>[0]);

  await expect(
    service.readOwnershipEvidence({
      kind: "servicePrincipal",
      principalId: "sp-direct"
    })
  ).resolves.toMatchObject({
    evidence: [
      {
        ownerCandidateKey: "ownerUser:platform-team",
        ownerDisplayName: "platform-team",
        confidence: "medium",
        evidence: "owner=platform-team",
        disabled: true
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
        key: "resourceGroup:sub-1:rg-api:ownerTag:cc-1001",
        statusKey: "resourceGroup:sub-1:rg-api:ownerTag:cc-1001",
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
        ownerCandidateKey: "ownerUser:api-owner@example.test",
        ownerDisplayName: "api-owner@example.test",
        ownerType: "ownerUser",
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
      ownerCandidateKey: "ownerUser:bob@example.test",
      ownerDisplayName: "bob@example.test",
      ownerType: "ownerUser",
      confidence: "medium",
      source: "tag",
      evidence: "owner=bob@example.test"
    }
  ]);
  expect(managedIdentityEvidence.evidence).toMatchObject([
    {
      ownerCandidateKey: "ownerUser:alice@example.test",
      key: "resourceGroup:sub-1:rg-mi:principal:mi-principal-id:ownerUser:alice@example.test",
      relatedScopes: [
        {
          principalId: "mi-principal-id"
        }
      ]
    },
    {
      ownerCandidateKey: "ownerUser:bob@example.test",
      key: "resourceGroup:sub-1:rg-mi:principal:mi-principal-id:ownerUser:bob@example.test",
      relatedScopes: [
        {
          principalId: "mi-principal-id"
        }
      ]
    }
  ]);
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
    readServicePrincipals: jest.fn().mockResolvedValue(servicePrincipals),
    findServicePrincipalById: jest.fn((principalId: string) => Promise.resolve(
      servicePrincipals.find((candidate) => candidate.id.toLowerCase() === principalId.toLowerCase()) ?? null
    )),
    readManagedIdentities: jest.fn().mockResolvedValue(managedIdentities)
  };
  const azureResourcesRuntime = {
    readSnapshot: jest.fn().mockResolvedValue(azureSnapshot),
    readAzureResourceGroupOwnerCandidateViewRows: jest.fn(({ subscriptionId, resourceGroup }, limit) =>
      Promise.resolve(readTestResourceGroupOwnerCandidateViewRows(azureSnapshot, { subscriptionId, resourceGroup }, limit))
    ),
    readAzurePrincipalResourceGroupOwnerCandidateViewRows: jest.fn(({ principalId }, limit) =>
      Promise.resolve(readTestPrincipalResourceGroupOwnerCandidateViewRows(
        azureSnapshot,
        [...servicePrincipals, ...managedIdentities],
        { principalId },
        limit
      ))
    ),
    readAzureResourceGroupOwnershipSqlRows: jest.fn(({ subscriptionIds, resourceGroups }, limit) =>
      Promise.resolve(readTestResourceGroupOwnershipSqlRows(azureSnapshot, { subscriptionIds, resourceGroups }, limit))
    ),
    readAzureResourceGroupOwnershipCollectionSqlRows: jest.fn((limit) =>
      Promise.resolve(readTestResourceGroupOwnershipSqlRows(azureSnapshot, {
        subscriptionIds: azureSnapshot.resourceGroups.map((group) => group.subscriptionId),
        resourceGroups: azureSnapshot.resourceGroups.map((group) => group.resourceGroup)
      }, limit))
    ),
    readAzureUserAssignedManagedIdentities: jest.fn().mockResolvedValue(azureSnapshot.userAssignedManagedIdentities)
  };
  const entraQueries = new EntraCollectionQueryService({
    entra: entraRuntime,
    zeroTrustAssessmentQueries: {
      readRemediationSummaries: jest.fn().mockResolvedValue(new Map()),
      readRemediationPackageSummariesByPrincipalId: jest.fn().mockResolvedValue(new Map())
    },
    disabledEvidenceStore: {
      readKeys: jest.fn().mockResolvedValue(new Set<string>())
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
  tags = {},
  roleAssignments
}: {
  id: string;
  displayName: string;
  servicePrincipalOwners?: NonNullable<ServicePrincipal["servicePrincipalOwners"]>;
  applicationOwners?: NonNullable<ServicePrincipal["applicationOwners"]>;
  tags?: ServicePrincipal["tags"];
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
    tags,
    homepage: null,
    loginUrl: null,
    publisherName: null,
    roleAssignments,
    permissionRisk: "none",
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionCount: 0,
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
  resourceGroup,
  servicePrincipalOwners = [],
  applicationOwners = [],
  tags = {}
}: {
  id: string;
  appId: string;
  displayName: string;
  resourceGroup?: string;
  servicePrincipalOwners?: NonNullable<ManagedIdentity["servicePrincipalOwners"]>;
  applicationOwners?: NonNullable<ManagedIdentity["applicationOwners"]>;
  tags?: ManagedIdentity["tags"];
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
    servicePrincipalOwners,
    applicationOwners,
    replyUrls: [],
    tags,
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
    entraPermissionCount: 0,
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

function readTestResourceGroupOwnerCandidateViewRows(
  snapshot: AzureSnapshot,
  target: { subscriptionId: string; resourceGroup: string },
  limit = 1
): Array<{
  subscriptionId: string;
  subscriptionName: string;
  resourceGroup: string;
  owner: string;
  ownerType: "ownerUser" | "ownerGroup" | "ownerTag" | "application" | "unknown";
  ownerCandidate: string;
  evidenceKey: string;
  confidence: "high" | "medium" | "low";
  source: string;
  evidenceValue: string;
  evidenceDate: string | null;
  priority: number;
}> {
  const group = snapshot.resourceGroups.find(
    (candidate) =>
      candidate.subscriptionId.trim().toLowerCase() === target.subscriptionId.trim().toLowerCase() &&
      candidate.resourceGroup.trim().toLowerCase() === target.resourceGroup.trim().toLowerCase()
  );

  if (!group) {
    return [];
  }

  const tagRows = getTestOwnerTags(group.tags).map((tag, index) => {
    const owner = tag.value.trim().toLowerCase();
    const ownerCandidate = `${tag.type}:${owner}`;

    return {
      subscriptionId: group.subscriptionId,
      subscriptionName: group.subscriptionName,
      resourceGroup: group.resourceGroup,
      owner,
      ownerType: tag.type,
      ownerCandidate,
      evidenceKey: getTestResourceGroupEvidenceKey(group, ownerCandidate),
      confidence: tag.confidence,
      source: `tag.${tag.name}`,
      evidenceValue: `${tag.name}=${tag.value}`,
      evidenceDate: null,
      priority: index + 1
    };
  });

  if (tagRows.length > 0) {
    return tagRows.slice(0, Math.max(1, Math.trunc(limit)));
  }

  const latestActivity = getLatestTestOwnerActivity(snapshot.activityLogs, group);
  if (!latestActivity?.caller) {
    return [];
  }

  const owner = latestActivity.caller.trim().toLowerCase();
  const ownerCandidate = `${getActivityOwnerType(latestActivity)}:${owner}`;

  return [
    {
      subscriptionId: group.subscriptionId,
      subscriptionName: group.subscriptionName,
      resourceGroup: group.resourceGroup,
      owner,
      ownerType: getActivityOwnerType(latestActivity),
      ownerCandidate,
      evidenceKey: getTestResourceGroupEvidenceKey(group, ownerCandidate),
      confidence: "low",
      source: "activity.lastModifier",
      evidenceValue: latestActivity.resourceId ?? owner,
      evidenceDate: latestActivity.eventTimestamp,
      priority: 1001
    }
  ];
}

function readTestPrincipalResourceGroupOwnerCandidateViewRows(
  snapshot: AzureSnapshot,
  principals: Array<ServicePrincipal | ManagedIdentity>,
  target: { principalId: string },
  limit = 100
): Array<{
  principalId: string;
  subscriptionId: string | null;
  subscriptionName: string | null;
  resourceGroup: string | null;
  owner: string;
  ownerType: "ownerUser" | "ownerGroup" | "ownerTag" | "application" | "unknown";
  ownerCandidate: string;
  evidenceKey: string;
  confidence: "high" | "medium" | "low";
  source: "resourceGroupOwner" | "entraApplicationOwner" | "entraServicePrincipalOwner" | "activity" | "tag";
  path: "direct" | "indirect";
  discoverySource: "activityLog" | "tag" | "applicationOwner" | "servicePrincipalOwner";
  evidenceValue: string;
  evidenceDate: string | null;
  priority: number;
}> {
  const principal = principals.find((candidate) => candidate.id.toLowerCase() === target.principalId.toLowerCase());
  const directRows = principal ? readTestDirectPrincipalOwnerCandidateViewRows(principal) : [];
  const resourceGroupTargets = principal ? getTestPrincipalResourceGroupTargets(snapshot, principal) : [];
  const indirectRows = resourceGroupTargets.flatMap(({ subscriptionId, resourceGroup }) =>
    readTestResourceGroupOwnerCandidateViewRows(
      snapshot,
      {
        subscriptionId,
        resourceGroup
      },
      limit
    ).map((row) => ({
      ...row,
      principalId: target.principalId.trim().toLowerCase(),
      evidenceKey: [
        "resourceGroup",
        row.subscriptionId.trim().toLowerCase(),
        row.resourceGroup.trim().toLowerCase(),
        "principal",
        target.principalId.trim().toLowerCase(),
        row.ownerCandidate
      ].join(":"),
      source: "resourceGroupOwner" as const,
      path: "indirect" as const,
      discoverySource: row.source.startsWith("activity.") ? "activityLog" as const : "tag" as const,
      priority: 1000 + row.priority
    }))
  );

  return [...directRows, ...indirectRows]
    .sort(compareTestPrincipalCandidateRows)
    .slice(0, Math.max(1, Math.trunc(limit)));
}

function getTestPrincipalResourceGroupTargets(
  snapshot: AzureSnapshot,
  principal: ServicePrincipal | ManagedIdentity
): Array<{ subscriptionId: string; resourceGroup: string }> {
  const targets = new Map<string, { subscriptionId: string; resourceGroup: string }>();
  const addTarget = (subscriptionId: string | null | undefined, resourceGroup: string | null | undefined): void => {
    const trimmedSubscriptionId = subscriptionId?.trim();
    const trimmedResourceGroup = resourceGroup?.trim();
    if (!trimmedSubscriptionId || !trimmedResourceGroup) {
      return;
    }

    targets.set(`${trimmedSubscriptionId.toLowerCase()}:${trimmedResourceGroup.toLowerCase()}`, {
      subscriptionId: trimmedSubscriptionId,
      resourceGroup: trimmedResourceGroup
    });
  };

  for (const identity of snapshot.userAssignedManagedIdentities) {
    if (
      identity.principalId.toLowerCase() === principal.id.toLowerCase() ||
      identity.clientId.toLowerCase() === principal.appId.toLowerCase()
    ) {
      addTarget(identity.subscriptionId, identity.resourceGroup);
    }
  }

  for (const assignment of principal.roleAssignments ?? []) {
    addTarget(
      assignment.scopeSubscriptionId ?? assignment.scope.match(/\/subscriptions\/([^/]+)/i)?.[1] ?? assignment.subscriptionId,
      assignment.scopeResourceGroup ?? assignment.scope.match(/\/resourceGroups\/([^/]+)/i)?.[1]
    );
  }

  return [...targets.values()];
}

function readTestDirectPrincipalOwnerCandidateViewRows(
  principal: ServicePrincipal | ManagedIdentity
): ReturnType<typeof readTestPrincipalResourceGroupOwnerCandidateViewRows> {
  const principalId = principal.id.trim().toLowerCase();
  const tagRows = getTestOwnerTags(readTestPrincipalTags(principal.tags)).map((tag, index) => {
    const owner = tag.value.trim().toLowerCase();
    const ownerCandidate = `${tag.type}:${owner}`;

    return {
      principalId,
      subscriptionId: null,
      subscriptionName: null,
      resourceGroup: null,
      owner,
      ownerType: tag.type,
      ownerCandidate,
      evidenceKey: `${ownerCandidate}:${tag.name}=${tag.value}:`,
      confidence: tag.confidence,
      source: "tag" as const,
      path: "direct" as const,
      discoverySource: "tag" as const,
      evidenceValue: `${tag.name}=${tag.value}`,
      evidenceDate: null,
      priority: index + 1
    };
  });
  const applicationOwnerRows = readTestEntraOwnerRows(
    principalId,
    principal.applicationOwners ?? [],
    "entraApplicationOwner",
    "applicationOwner",
    100
  );
  const servicePrincipalOwnerRows = readTestEntraOwnerRows(
    principalId,
    principal.servicePrincipalOwners ?? [],
    "entraServicePrincipalOwner",
    "servicePrincipalOwner",
    200
  );

  return [...tagRows, ...applicationOwnerRows, ...servicePrincipalOwnerRows];
}

function readTestPrincipalTags(tags: ServicePrincipal["tags"] | ManagedIdentity["tags"]): Record<string, string> | null {
  if (!Array.isArray(tags)) {
    return tags;
  }

  const entries = tags.flatMap((tag) => {
    const match = tag.match(/^([^=:]+)\s*[=:]\s*(.+)$/);
    return match ? [[match[1], match[2]] as const] : [];
  });

  return Object.fromEntries(entries);
}

function readTestEntraOwnerRows(
  principalId: string,
  owners: NonNullable<ServicePrincipal["applicationOwners"]>,
  source: "entraApplicationOwner" | "entraServicePrincipalOwner",
  discoverySource: "applicationOwner" | "servicePrincipalOwner",
  priorityOffset: number
): ReturnType<typeof readTestPrincipalResourceGroupOwnerCandidateViewRows> {
  return owners.flatMap((owner, index) => {
    const ownerValue = owner.userPrincipalName ?? owner.mail ?? owner.displayName ?? owner.id;
    if (!ownerValue) {
      return [];
    }

    const ownerType = inferTestEntraOwnerType(owner);
    const ownerKey = (owner.id ?? owner.userPrincipalName ?? owner.mail ?? owner.displayName ?? ownerValue).trim().toLowerCase();
    const ownerCandidate = `${source}:${ownerType}:${ownerKey}`;

    return [
      {
        principalId,
        subscriptionId: null,
        subscriptionName: null,
        resourceGroup: null,
        owner: ownerValue,
        ownerType,
        ownerCandidate,
        evidenceKey: `${ownerCandidate}:${ownerValue}:`,
        confidence: "high" as const,
        source,
        path: "direct" as const,
        discoverySource,
        evidenceValue: ownerValue,
        evidenceDate: null,
        priority: priorityOffset + index + 1
      }
    ];
  });
}

function inferTestEntraOwnerType(owner: NonNullable<ServicePrincipal["applicationOwners"]>[number]): "ownerUser" | "ownerGroup" | "unknown" {
  const ownerType = owner.ownerType?.trim().toLowerCase() ?? "";
  if (ownerType === "user" || ownerType.endsWith(".user") || owner.userPrincipalName?.includes("@") || owner.mail?.includes("@")) {
    return "ownerUser";
  }
  if (ownerType === "group" || ownerType.endsWith(".group")) {
    return "ownerGroup";
  }
  return "unknown";
}

function compareTestPrincipalCandidateRows(
  left: ReturnType<typeof readTestPrincipalResourceGroupOwnerCandidateViewRows>[number],
  right: ReturnType<typeof readTestPrincipalResourceGroupOwnerCandidateViewRows>[number]
): number {
  const confidenceRank = { high: 3, medium: 2, low: 1 };
  const sourceRank = {
    tag: 5,
    resourceGroupOwner: 5,
    entraApplicationOwner: 4,
    entraServicePrincipalOwner: 3,
    activity: 1
  };

  return (
    confidenceRank[right.confidence] - confidenceRank[left.confidence] ||
    sourceRank[right.source] - sourceRank[left.source] ||
    left.priority - right.priority ||
    left.ownerCandidate.localeCompare(right.ownerCandidate)
  );
}

function getTestResourceGroupEvidenceKey(
  group: AzureSnapshot["resourceGroups"][number],
  ownerCandidate: string
): string {
  return [
    "resourceGroup",
    group.subscriptionId.trim().toLowerCase(),
    group.resourceGroup.trim().toLowerCase(),
    ownerCandidate
  ].join(":");
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
  type: "ownerUser" | "ownerGroup" | "ownerTag";
}> {
  const ownerTags: Array<{
    name: string;
    value: string;
    confidence: "high" | "medium";
    type: "ownerUser" | "ownerGroup" | "ownerTag";
  }> = [];

  for (const tag of [
    { name: "ownerGroup", confidence: "high" as const, type: "ownerGroup" as const },
    { name: "ownerUser", confidence: "high" as const, type: "ownerUser" as const },
    { name: "costCenter", confidence: "high" as const, type: "ownerTag" as const },
    { name: "owner", confidence: "medium" as const, type: "ownerUser" as const }
  ]) {
    const key = Object.keys(tags ?? {}).find((candidate) => candidate.toLowerCase() === tag.name.toLowerCase());
    const value = key ? tags?.[key]?.trim() : null;

    if (value) {
      ownerTags.push({ ...tag, value });
    }
  }

  return ownerTags;
}
