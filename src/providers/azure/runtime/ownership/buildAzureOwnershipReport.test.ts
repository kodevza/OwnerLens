import { buildAzureOwnershipReport } from "./buildAzureOwnershipReport";
import { azureOwnerAdapter } from "./resolveAzureOwner";
import type { EntraSnapshot } from "../../inputTransferObject/generated/EntraSnapshot";
import type { AzureSnapshot } from "../../inputTransferObject/generated/AzureSnapshot";

test("resolves owners from configurable tag names", () => {
  const report = buildAzureOwnershipReport(resourceSnapshot(), entraSnapshot(), {
    tags: {
      businessOwner: {
        confidence: "high"
      },
      technicalOwner: {
        confidence: "medium"
      }
    },
    ownerTargets: [
      {
        kind: "resourceGroup",
        adapter: azureOwnerAdapter
      }
    ]
  });

  expect(report.owners).toEqual([
    expect.objectContaining({
      resourceGroup: "rg-payments",
      owner: "sg-payments-platform",
      confidence: "high",
      source: "tag.businessOwner",
      evidence: [{ user: "businessOwner=sg-payments-platform", date: null }]
    }),
    expect.objectContaining({
      resourceGroup: "rg-billing",
      owner: "alice@example.com",
      confidence: "medium",
      source: "tag.technicalOwner",
      evidence: [{ user: "technicalOwner=Alice@Example.com", date: null }]
    })
  ]);
});

function resourceSnapshot(): AzureSnapshot {
  return {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-05-01T00:00:00.000Z",
      activityDays: 30,
      activityStartTime: "2026-04-01T00:00:00.000Z",
      maxActivityRecords: 1000,
      requestedSubscriptions: [],
      subscriptionCount: 1,
      resourceGroupCount: 2,
      resourceCount: 0,
      userAssignedManagedIdentityCount: 0,
      activityLogCount: 0
    },
    subscriptions: [],
    resourceGroups: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription Alpha",
        resourceGroup: "rg-payments",
        location: "westeurope",
        tags: {
          businessOwner: "sg-payments-platform"
        }
      },
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription Alpha",
        resourceGroup: "rg-billing",
        location: "westeurope",
        tags: {
          technicalOwner: "Alice@Example.com"
        }
      }
    ],
    resources: [],
    userAssignedManagedIdentities: [],
    roleAssignments: [],
    activityLogs: []
  };
}

function entraSnapshot(): EntraSnapshot {
  return {
    meta: {
      provider: "entra",
      snapshotVersion: "0.4",
      createdAt: "2026-05-01T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "admin@example.com",
      scopes: [],
      servicePrincipalCount: 0
    },
    servicePrincipals: []
  };
}
