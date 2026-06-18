import azureSnapshotSchema from "../../../contracts/azure/snapshot.v0.4.schema.json";
import entraSnapshotSchema from "../../../contracts/entra/snapshot.v0.4.schema.json";

import { parseAndValidateSnapshot } from "./snapshotContractValidator";

describe("parseAndValidateSnapshot", () => {
  it("accepts a valid Azure snapshot", () => {
    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(validAzureSnapshot()), {
        fileName: "snapshot.json",
        schema: azureSnapshotSchema
      })
    ).not.toThrow();
  });

  it("accepts a valid Entra snapshot", () => {
    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(validEntraSnapshot()), {
        fileName: "entra-snapshot.json",
        schema: entraSnapshotSchema
      })
    ).not.toThrow();
  });

  it("accepts an Entra snapshot without a Graph account", () => {
    const snapshot = validEntraSnapshot();
    snapshot.meta.account = null;

    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(snapshot), {
        fileName: "entra-snapshot.json",
        schema: entraSnapshotSchema
      })
    ).not.toThrow();
  });

  it("accepts ServiceIdentity service principals from Microsoft Graph", () => {
    const snapshot = validEntraSnapshot();
    snapshot.servicePrincipals[0].servicePrincipalType = "ServiceIdentity";

    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(snapshot), {
        fileName: "entra-snapshot.json",
        schema: entraSnapshotSchema
      })
    ).not.toThrow();
  });

  it("rejects a wrong provider", () => {
    expect(() =>
      parseAndValidateSnapshot(JSON.stringify({ ...validAzureSnapshot(), meta: { ...validAzureSnapshot().meta, provider: "entra" } }), {
        fileName: "snapshot.json",
        schema: azureSnapshotSchema
      })
    ).toThrow("Invalid snapshot.json: /meta/provider");
  });

  it("rejects a wrong snapshot version", () => {
    expect(() =>
      parseAndValidateSnapshot(
        JSON.stringify({ ...validEntraSnapshot(), meta: { ...validEntraSnapshot().meta, snapshotVersion: "0.3" } }),
        {
          fileName: "entra-snapshot.json",
          schema: entraSnapshotSchema
        }
      )
    ).toThrow("Invalid entra-snapshot.json: /meta/snapshotVersion");
  });

  it("rejects a missing required collection", () => {
    const snapshot = validAzureSnapshot();
    const { resources: _resources, ...withoutResources } = snapshot;

    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(withoutResources), {
        fileName: "snapshot.json",
        schema: azureSnapshotSchema
      })
    ).toThrow("Invalid snapshot.json: / must have required property 'resources'");
  });

  it("rejects a field with the wrong type", () => {
    const snapshot = validEntraSnapshot();
    snapshot.servicePrincipals[0].id = 123;

    expect(() =>
      parseAndValidateSnapshot(JSON.stringify(snapshot), {
        fileName: "entra-snapshot.json",
        schema: entraSnapshotSchema
      })
    ).toThrow("Invalid entra-snapshot.json: /servicePrincipals/0/id must be string");
  });
});

type SnapshotFixture = {
  meta: Record<string, unknown>;
  [key: string]: unknown;
};

type AzureSnapshotFixture = SnapshotFixture & {
  resources: unknown[];
};

type EntraSnapshotFixture = SnapshotFixture & {
  servicePrincipals: Array<Record<string, unknown>>;
};

function validAzureSnapshot(): AzureSnapshotFixture {
  return {
    meta: {
      provider: "azure",
      snapshotVersion: "0.4",
      createdAt: "2026-06-16T00:00:00.000Z",
      activityDays: 30,
      activityStartTime: "2026-05-17T00:00:00.000Z",
      maxActivityRecords: 1000,
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
        subscriptionName: "Subscription",
        tenantId: "tenant-1",
        state: "Enabled",
        tags: null
      }
    ],
    resourceGroups: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription",
        resourceGroup: "rg-one",
        location: "westeurope",
        tags: {}
      }
    ],
    resources: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-one/providers/Microsoft.Web/sites/app-one",
        resourceName: "app-one",
        resourceGroup: "rg-one",
        resourceType: "Microsoft.Web/sites",
        kind: null,
        location: "westeurope",
        tags: null,
        identityType: null,
        identityPrincipalId: null,
        identityTenantId: null,
        userAssignedIdentityResourceIds: [],
        userAssignedIdentities: null
      }
    ],
    userAssignedManagedIdentities: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-one/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-one",
        name: "id-one",
        resourceGroup: "rg-one",
        location: "westeurope",
        clientId: "client-1",
        principalId: "principal-1",
        tenantId: "tenant-1",
        tags: null
      }
    ],
    roleAssignments: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription",
        roleAssignmentId: "assignment-1",
        scope: "/subscriptions/sub-1",
        principalId: "principal-1",
        principalType: "ServicePrincipal",
        principalDisplayName: "Principal",
        signInName: null,
        roleDefinitionId: "role-1",
        roleDefinitionName: "Reader",
        canDelegate: null,
        condition: null,
        conditionVersion: null
      }
    ],
    activityLogs: [
      {
        subscriptionId: "sub-1",
        subscriptionName: "Subscription",
        eventTimestamp: "2026-06-16T00:00:00.000Z",
        submissionTimestamp: null,
        caller: null,
        operationName: null,
        operationNameValue: null,
        status: null,
        subStatus: null,
        category: null,
        resourceGroupName: null,
        resourceId: null,
        resourceProviderName: null,
        resourceType: null,
        authorizationAction: null,
        authorizationScope: null
      }
    ]
  };
}

function validEntraSnapshot(): EntraSnapshotFixture {
  return {
    meta: {
      provider: "entra",
      snapshotVersion: "0.4",
      createdAt: "2026-06-16T00:00:00.000Z",
      tenantId: "tenant-1",
      account: "admin@example.com",
      scopes: ["Application.Read.All"],
      servicePrincipalCount: 1
    },
    servicePrincipals: [
      {
        id: "sp-1",
        appId: "app-1",
        displayName: "Service principal",
        appDisplayName: null,
        servicePrincipalType: "Application",
        publisherName: null,
        accountEnabled: true,
        appOwnerOrganizationId: null,
        homepage: null,
        loginUrl: null,
        replyUrls: [],
        servicePrincipalNames: [],
        tags: []
      }
    ]
  };
}
