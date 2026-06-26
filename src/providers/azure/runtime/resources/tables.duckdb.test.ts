import type {
  AzureActivityLog,
  AzureResourceGroup
} from "../../inputTransferObject/generated/AzureSnapshot";
import type { EntraServicePrincipal } from "../../inputTransferObject/generated/EntraSnapshot";
import { insertEntraServicePrincipalRows } from "../entra/domain/servicePrincipalsTable";
import { prepareRuntimeSqlSchema } from "../SnapshotImporter";
import { disableOwnerEvidenceKey } from "../../../../core/runtime/DisabledOwnerEvidenceStore";
import {
  insertAzureActivityLogRows,
  insertAzureResourceGroupRows,
  readAzurePrincipalResourceGroupOwnerCandidateViewRows,
  readAzureResourceGroupOwnershipSqlRows
} from "./tables";
import {
  installDuckDbHandleCleanup,
  withDuckDb as withRawDuckDb,
  type DuckDbTestConnection
} from "../../../../../tests/support/duckdb";

installDuckDbHandleCleanup();

async function withDuckDb<T>(
  fn: (ctx: { connection: DuckDbTestConnection }) => Promise<T>
): Promise<T> {
  return withRawDuckDb(async ({ connection }) => {
    await prepareRuntimeSqlSchema(connection);
    return await fn({ connection });
  });
}

test("returns no ownership evidence for a resource group without matching tags or activity", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [resourceGroup("rg-empty")]);

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-empty"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      kind: "resourceGroup",
      targetKey: "resourceGroup:sub-1:rg-empty",
      owner: null,
      confidence: "none",
      source: "none",
      evidence: []
    })
  ]);
});

test("selects the strongest configured owner tag by priority", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-tagged", {
        owner: "fallback@example.test",
        costCenter: "cc-1001",
        ownerGroup: "Platform-Team"
      })
    ]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "last.modifier@example.test",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: "rg-tagged"
      })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: " sub-1 ",
      resourceGroup: " RG-TAGGED "
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "platform-team",
      ownerCandidate: "ownerGroup:platform-team",
      ownerType: "ownerGroup",
      evidenceKey: "resourceGroup:sub-1:rg-tagged:ownerGroup:platform-team",
      confidence: "high",
      source: "tag.ownerGroup",
      evidence: [
        expect.objectContaining({
          key: "resourceGroup:sub-1:rg-tagged:ownerGroup:platform-team",
          user: "ownerGroup=Platform-Team",
          date: null
        })
      ]
    })
  ]);
});

test("returns requested owner candidates by priority", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-tagged", {
        owner: "fallback@example.test",
        costCenter: "cc-1001",
        ownerGroup: "Platform-Team"
      })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(
      connection,
      {
        subscriptionId: "sub-1",
        resourceGroup: "rg-tagged"
      },
      3
    );
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "platform-team",
      ownerCandidate: "ownerGroup:platform-team",
      ownerType: "ownerGroup",
      confidence: "high",
      source: "tag.ownerGroup",
      evidence: [expect.objectContaining({ user: "ownerGroup=Platform-Team", date: null })]
    }),
    expect.objectContaining({
      owner: "cc-1001",
      ownerCandidate: "ownerTag:cc-1001",
      ownerType: "ownerTag",
      confidence: "high",
      source: "tag.costCenter",
      evidence: [expect.objectContaining({ user: "costCenter=cc-1001", date: null })]
    }),
    expect.objectContaining({
      owner: "fallback@example.test",
      ownerCandidate: "ownerUser:fallback@example.test",
      ownerType: "ownerUser",
      confidence: "medium",
      source: "tag.owner",
      evidence: [expect.objectContaining({ user: "owner=fallback@example.test", date: null })]
    })
  ]);
});

test("resource group owner candidate view joins tag and activity evidence with evidence keys", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-view", {
        ownerGroup: "Platform-Team"
      })
    ]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "activity.owner@example.test",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: "rg-view",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-view/providers/Microsoft.Web/sites/app-a"
      })
    ]);

    const reader = await connection.runAndReadAll(`
      select owner, owner_type, owner_candidate, evidence_key, source, evidence_value, evidence_date
      from azure_resource_group_owner_candidates
      where subscription_id = 'sub-1' and resource_group = 'rg-view'
      order by priority
    `);

    return reader.getRowObjectsJson();
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "platform-team",
      owner_type: "ownerGroup",
      owner_candidate: "ownerGroup:platform-team",
      evidence_key: "resourceGroup:sub-1:rg-view:ownerGroup:platform-team",
      source: "tag.ownerGroup",
      evidence_value: "ownerGroup=Platform-Team",
      evidence_date: null
    }),
    expect.objectContaining({
      owner: "activity.owner@example.test",
      owner_type: "ownerUser",
      owner_candidate: "ownerUser:activity.owner@example.test",
      evidence_key: "resourceGroup:sub-1:rg-view:ownerUser:activity.owner@example.test",
      source: "activity.lastModifier",
      evidence_value: "/subscriptions/sub-1/resourceGroups/rg-view/providers/Microsoft.Web/sites/app-a",
      evidence_date: "2026-06-05T10:00:00.000Z"
    })
  ]);
});

test("principal resource group owner candidate view scopes candidates to the requested principal and resource groups", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertEntraServicePrincipalRows(connection, [
      servicePrincipal("sp-1", "app-1", "Owner Lens App", {
        tags: ["owner=Direct-Tag-Team"],
        applicationOwners: [
          {
            id: "app-owner-1",
            displayName: "Application Owner",
            userPrincipalName: "app-owner@example.test",
            mail: null,
            ownerType: "User"
          }
        ],
        servicePrincipalOwners: [
          {
            id: "sp-owner-1",
            displayName: "Service Principal Owner",
            userPrincipalName: "sp-owner@example.test",
            mail: null,
            ownerType: "User"
          }
        ]
      })
    ]);
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-high", {
        ownerGroup: "Platform-Team",
        owner: "fallback@example.test"
      }),
      resourceGroup("rg-medium", {
        owner: "worker@example.test"
      }),
      resourceGroup("rg-unrelated", {
        ownerGroup: "Unrelated-Team"
      })
    ]);

    return readAzurePrincipalResourceGroupOwnerCandidateViewRows(
      connection,
      {
        principalId: "sp-1",
        subscriptionIds: ["sub-1", "sub-1"],
        resourceGroups: ["rg-medium", "rg-high"]
      },
      10
    );
  });

  expect(rows).toEqual([
    expect.objectContaining({
      principalId: "sp-1",
      resourceGroup: "rg-high",
      owner: "platform-team",
      ownerCandidate: "ownerGroup:platform-team",
      source: "resourceGroupOwner",
      path: "indirect",
      discoverySource: "tag",
      confidence: "high",
      evidenceKey: "resourceGroup:sub-1:rg-high:principal:sp-1:ownerGroup:platform-team"
    }),
    expect.objectContaining({
      principalId: "sp-1",
      path: "direct",
      discoverySource: "applicationOwner",
      resourceGroup: null,
      owner: "app-owner@example.test",
      ownerCandidate: "entraApplicationOwner:ownerUser:app-owner-1",
      source: "entraApplicationOwner",
      confidence: "high",
      evidenceKey: "entraApplicationOwner:ownerUser:app-owner-1:app-owner@example.test:"
    }),
    expect.objectContaining({
      principalId: "sp-1",
      path: "direct",
      discoverySource: "servicePrincipalOwner",
      resourceGroup: null,
      owner: "sp-owner@example.test",
      ownerCandidate: "entraServicePrincipalOwner:ownerUser:sp-owner-1",
      source: "entraServicePrincipalOwner",
      confidence: "high",
      evidenceKey: "entraServicePrincipalOwner:ownerUser:sp-owner-1:sp-owner@example.test:"
    }),
    expect.objectContaining({
      principalId: "sp-1",
      path: "direct",
      discoverySource: "tag",
      resourceGroup: null,
      owner: "direct-tag-team",
      ownerCandidate: "ownerUser:direct-tag-team",
      source: "tag",
      confidence: "medium",
      evidenceKey: "ownerUser:direct-tag-team:owner=Direct-Tag-Team:"
    }),
    expect.objectContaining({
      principalId: "sp-1",
      path: "indirect",
      resourceGroup: "rg-high",
      owner: "fallback@example.test",
      ownerCandidate: "ownerUser:fallback@example.test",
      source: "resourceGroupOwner",
      confidence: "medium"
    }),
    expect.objectContaining({
      principalId: "sp-1",
      path: "indirect",
      resourceGroup: "rg-medium",
      owner: "worker@example.test",
      ownerCandidate: "ownerUser:worker@example.test",
      source: "resourceGroupOwner",
      confidence: "medium"
    })
  ]);
});

test("filters resource group ownership rows by subscription and resource group lists", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-one", { ownerGroup: "Team-One" }),
      resourceGroup("rg-two", { ownerGroup: "Team-Two" }, { subscriptionId: "sub-2" }),
      resourceGroup("rg-three", { ownerGroup: "Team-Three" }, { subscriptionId: "sub-3" })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(
      connection,
      {
        subscriptionIds: [" SUB-1 ", "sub-2"],
        resourceGroups: ["rg-one", " RG-TWO "]
      },
      2
    );
  });

  expect(rows.map((row) => `${row.subscriptionId}/${row.resourceGroup}:${row.owner}`)).toEqual([
    "sub-1/rg-one:team-one",
    "sub-2/rg-two:team-two"
  ]);
});

test("filters resource group ownership rows by requested subscription/resource group pairs", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-one", { ownerGroup: "Team-One" }, { subscriptionId: "sub-1" }),
      resourceGroup("rg-two", { ownerGroup: "Team-Two" }, { subscriptionId: "sub-1" }),
      resourceGroup("rg-one", { ownerGroup: "Team-Three" }, { subscriptionId: "sub-2" }),
      resourceGroup("rg-two", { ownerGroup: "Team-Four" }, { subscriptionId: "sub-2" })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(
      connection,
      {
        subscriptionIds: ["sub-1", "sub-2"],
        resourceGroups: ["rg-one", "rg-two"]
      },
      2
    );
  });

  expect(rows.map((row) => `${row.subscriptionId}/${row.resourceGroup}:${row.owner}`)).toEqual([
    "sub-1/rg-one:team-one",
    "sub-2/rg-two:team-four"
  ]);
});

test("uses the latest successful write or action activity when tags are absent", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [resourceGroup("rg-activity")]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "older@example.test",
        eventTimestamp: "2026-06-04T10:00:00.000Z",
        resourceGroupName: "rg-activity"
      }),
      activityLog({
        caller: "reader@example.test",
        eventTimestamp: "2026-06-06T10:00:00.000Z",
        resourceGroupName: "rg-activity",
        authorizationAction: "Microsoft.Resources/subscriptions/resourceGroups/read",
        operationNameValue: "Microsoft.Resources/subscriptions/resourceGroups/read"
      }),
      activityLog({
        caller: "failed@example.test",
        eventTimestamp: "2026-06-07T10:00:00.000Z",
        resourceGroupName: "rg-activity",
        status: "Failed"
      }),
      activityLog({
        caller: "latest@example.test",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: "rg-activity",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-activity/providers/Microsoft.KeyVault/vaults/latest-vault",
        authorizationAction: "Microsoft.Authorization/roleAssignments/action",
        operationNameValue: "Microsoft.Authorization/roleAssignments/action"
      })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-activity"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "latest@example.test",
      ownerCandidate: "ownerUser:latest@example.test",
      ownerType: "ownerUser",
      confidence: "low",
      source: "activity.lastModifier",
      evidence: [
        expect.objectContaining({
          key: "resourceGroup:sub-1:rg-activity:ownerUser:latest@example.test",
          user: "/subscriptions/sub-1/resourceGroups/rg-activity/providers/Microsoft.KeyVault/vaults/latest-vault",
          date: "2026-06-05T10:00:00.000Z"
        })
      ]
    })
  ]);
});

test("matches activity by authorization scope when resource group name is missing", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [resourceGroup("rg-scope")]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "scope.writer@example.test",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: null,
        authorizationScope: "/subscriptions/sub-1/resourceGroups/rg-scope/providers/Microsoft.Web/sites/app-a"
      })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-scope"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "scope.writer@example.test",
      confidence: "low",
      source: "activity.lastModifier"
    })
  ]);
});

test("enriches activity owner display name for service principal callers", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [resourceGroup("rg-service-principal")]);
    await insertEntraServicePrincipalRows(connection, [
      servicePrincipal("sp-object-1", "app-client-1", "Deployment Bot")
    ]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "APP-CLIENT-1",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: "rg-service-principal",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-service-principal/providers/Microsoft.Web/sites/app-api"
      })
    ]);

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-service-principal"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "Deployment Bot (app-client-1)",
      ownerCandidate: "application:app-client-1",
      ownerType: "application",
      confidence: "low",
      source: "activity.lastModifier",
      evidence: [
        expect.objectContaining({
          user: "/subscriptions/sub-1/resourceGroups/rg-service-principal/providers/Microsoft.Web/sites/app-api",
          date: "2026-06-05T10:00:00.000Z"
        })
      ]
    })
  ]);
});

test("falls back to the next owner candidate when the strongest tag candidate is disabled", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-disabled-tag", {
        ownerGroup: "platform-team",
        owner: "fallback@example.test"
      })
    ]);
    await disableResourceGroupOwnerCandidate(connection, "rg-disabled-tag", "ownerGroup:platform-team");

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-disabled-tag"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "fallback@example.test",
      confidence: "medium",
      source: "tag.owner",
      evidence: [expect.objectContaining({ user: "owner=fallback@example.test", date: null })]
    })
  ]);
});

test("orders active owner candidates before disabled evidence rows", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-disabled-tag-order", {
        ownerGroup: "platform-team",
        costCenter: "cc-1001",
        owner: "fallback@example.test"
      })
    ]);
    await disableResourceGroupOwnerCandidate(connection, "rg-disabled-tag-order", "ownerGroup:platform-team");

    return readAzureResourceGroupOwnershipSqlRows(
      connection,
      {
        subscriptionId: "sub-1",
        resourceGroup: "rg-disabled-tag-order"
      },
      3
    );
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "cc-1001",
      confidence: "high",
      source: "tag.costCenter",
      evidence: [expect.objectContaining({ user: "costCenter=cc-1001", date: null })]
    }),
    expect.objectContaining({
      owner: "fallback@example.test",
      confidence: "medium",
      source: "tag.owner",
      evidence: [expect.objectContaining({ user: "owner=fallback@example.test", date: null })]
    }),
    expect.objectContaining({
      owner: null,
      confidence: "none",
      source: "tag.ownerGroup",
      evidence: [expect.objectContaining({ user: "ownerGroup=platform-team", date: null, disabled: true })]
    })
  ]);
});

test("falls back to earlier activity when the latest activity candidate is disabled", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [resourceGroup("rg-disabled-activity")]);
    await insertAzureActivityLogRows(connection, [
      activityLog({
        caller: "older@example.test",
        eventTimestamp: "2026-06-04T10:00:00.000Z",
        resourceGroupName: "rg-disabled-activity",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-disabled-activity/providers/Microsoft.Storage/storageAccounts/olderstore"
      }),
      activityLog({
        caller: "latest@example.test",
        eventTimestamp: "2026-06-05T10:00:00.000Z",
        resourceGroupName: "rg-disabled-activity",
        resourceId: "/subscriptions/sub-1/resourceGroups/rg-disabled-activity/providers/Microsoft.Storage/storageAccounts/lateststore"
      })
    ]);
    await disableResourceGroupOwnerCandidate(connection, "rg-disabled-activity", "ownerUser:latest@example.test");

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-disabled-activity"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: "older@example.test",
      confidence: "low",
      source: "activity.lastModifier",
      evidence: [
        expect.objectContaining({
          user: "/subscriptions/sub-1/resourceGroups/rg-disabled-activity/providers/Microsoft.Storage/storageAccounts/olderstore",
          date: "2026-06-04T10:00:00.000Z"
        })
      ]
    })
  ]);
});

test("applies disabled owner candidates only to the matching principal scope", async () => {
  const rowsWithoutPrincipal = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-principal-disabled", {
        ownerGroup: "platform-team"
      })
    ]);
    await disableOwnerEvidenceKey(
      connection,
      "azure",
      "resourceGroup:sub-1:rg-principal-disabled:principal:sp-1:ownerGroup:platform-team"
    );

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-principal-disabled"
    });
  });

  expect(rowsWithoutPrincipal).toEqual([
    expect.objectContaining({
      owner: "platform-team",
      confidence: "high",
      evidence: [expect.objectContaining({ user: "ownerGroup=platform-team", date: null })]
    })
  ]);

  const rowsForPrincipal = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-principal-disabled", {
        ownerGroup: "platform-team"
      })
    ]);
    await disableOwnerEvidenceKey(
      connection,
      "azure",
      "resourceGroup:sub-1:rg-principal-disabled:principal:sp-1:ownerGroup:platform-team"
    );

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-principal-disabled",
      principalId: "SP-1"
    });
  });

  expect(rowsForPrincipal).toEqual([
    expect.objectContaining({
      owner: null,
      principalId: "sp-1",
      confidence: "none",
      evidence: [expect.objectContaining({
        key: "resourceGroup:sub-1:rg-principal-disabled:principal:sp-1:ownerGroup:platform-team",
        user: "ownerGroup=platform-team",
        date: null,
        disabled: true
      })]
    })
  ]);
});

test("falls back to the next owner candidate when a principal-scoped ownerGroup tag is disabled", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-principal-disabled-fallback", {
        ownerGroup: "platform-team",
        owner: "fallback@example.test"
      })
    ]);
    await disableOwnerEvidenceKey(
      connection,
      "azure",
      "resourceGroup:sub-1:rg-principal-disabled-fallback:principal:mi-1:ownerGroup:platform-team"
    );

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-principal-disabled-fallback",
      principalId: "MI-1"
    });
  });

  expect(rows[0]).toEqual(
    expect.objectContaining({
      owner: "fallback@example.test",
      principalId: "mi-1",
      confidence: "medium",
      source: "tag.owner",
      evidence: [expect.objectContaining({
        key: "resourceGroup:sub-1:rg-principal-disabled-fallback:principal:mi-1:ownerUser:fallback@example.test",
        user: "owner=fallback@example.test",
        date: null
      })]
    })
  );
});

test("returns no active owner when both owner user and owner group tag candidates are disabled", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-disabled-user-and-group", {
        ownerGroup: "platform-team",
        owner: "fallback@example.test"
      })
    ]);
    await disableResourceGroupOwnerCandidate(
      connection,
      "rg-disabled-user-and-group",
      "ownerGroup:platform-team"
    );
    await disableResourceGroupOwnerCandidate(
      connection,
      "rg-disabled-user-and-group",
      "ownerUser:fallback@example.test"
    );

    return readAzureResourceGroupOwnershipSqlRows(
      connection,
      {
        subscriptionId: "sub-1",
        resourceGroup: "rg-disabled-user-and-group"
      },
      2
    );
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: null,
      confidence: "none",
      source: "tag.ownerGroup",
      evidence: [expect.objectContaining({ user: "ownerGroup=platform-team", date: null, disabled: true })]
    }),
    expect.objectContaining({
      owner: null,
      confidence: "none",
      source: "tag.owner",
      evidence: [expect.objectContaining({ user: "owner=fallback@example.test", date: null, disabled: true })]
    })
  ]);
});

test("returns no active owner when every candidate is disabled", async () => {
  const rows = await withDuckDb(async ({ connection }) => {
    await insertAzureResourceGroupRows(connection, [
      resourceGroup("rg-all-disabled", {
        ownerGroup: "platform-team"
      })
    ]);
    await disableResourceGroupOwnerCandidate(connection, "rg-all-disabled", "ownerGroup:platform-team");

    return readAzureResourceGroupOwnershipSqlRows(connection, {
      subscriptionId: "sub-1",
      resourceGroup: "rg-all-disabled"
    });
  });

  expect(rows).toEqual([
    expect.objectContaining({
      owner: null,
      confidence: "none",
      source: "tag.ownerGroup",
      evidence: [expect.objectContaining({ user: "ownerGroup=platform-team", date: null, disabled: true })]
    })
  ]);
});

async function disableResourceGroupOwnerCandidate(
  connection: DuckDbTestConnection,
  resourceGroupName: string,
  ownerCandidate: string
): Promise<void> {
  await disableOwnerEvidenceKey(connection, "azure", `resourceGroup:sub-1:${resourceGroupName}:${ownerCandidate}`);
}

function resourceGroup(
  resourceGroupName: string,
  tags: AzureResourceGroup["tags"] = null,
  options: Partial<Pick<AzureResourceGroup, "subscriptionId" | "subscriptionName">> = {}
): AzureResourceGroup {
  return {
    subscriptionId: options.subscriptionId ?? "sub-1",
    subscriptionName: options.subscriptionName ?? "Subscription One",
    resourceGroup: resourceGroupName,
    location: "westeurope",
    tags
  };
}

function activityLog(options: {
  caller: string;
  eventTimestamp: string;
  resourceGroupName: string | null;
  authorizationAction?: string;
  authorizationScope?: string | null;
  category?: string | null;
  operationNameValue?: string | null;
  resourceId?: string | null;
  status?: string | null;
}): AzureActivityLog {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription One",
    eventTimestamp: options.eventTimestamp,
    submissionTimestamp: options.eventTimestamp,
    caller: options.caller,
    callerUserPrincipalName: null,
    callerName: null,
    callerEmail: null,
    callerObjectId: null,
    callerIdentityType: null,
    callerAppId: null,
    callerIpAddress: null,
    callerTenantId: null,
    operationName: options.operationNameValue ?? "Write resource group",
    operationNameValue: options.operationNameValue ?? "Microsoft.Resources/subscriptions/resourceGroups/write",
    status: options.status ?? "Succeeded",
    subStatus: null,
    category: options.category ?? "Administrative",
    resourceGroupName: options.resourceGroupName,
    resourceId: options.resourceId ?? null,
    resourceProviderName: "Microsoft.Resources",
    resourceType: "Microsoft.Resources/subscriptions/resourceGroups",
    authorizationAction: options.authorizationAction ?? "Microsoft.Resources/subscriptions/resourceGroups/write",
    authorizationScope:
      options.authorizationScope ?? `/subscriptions/sub-1/resourceGroups/${options.resourceGroupName ?? "unknown"}`
  };
}

function servicePrincipal(
  id: string,
  appId: string,
  displayName: string,
  options: Partial<Pick<EntraServicePrincipal, "applicationOwners" | "servicePrincipalOwners" | "tags">> = {}
): EntraServicePrincipal {
  return {
    id,
    appId,
    displayName,
    appDisplayName: null,
    servicePrincipalType: "Application",
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: "tenant-1",
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: options.tags ?? [],
    appRoles: [],
    servicePrincipalOwners: options.servicePrincipalOwners ?? [],
    applicationOwners: options.applicationOwners ?? [],
    metadata: null
  };
}
