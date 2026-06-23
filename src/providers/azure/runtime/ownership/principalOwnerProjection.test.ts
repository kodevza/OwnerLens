import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../../core/azure/resources";
import {
  projectManagedIdentityOwners,
  projectServicePrincipalOwners
} from "./principalOwnerProjection";

test("projects service principal owners from role assignment resource group ownership", () => {
  const projection = projectServicePrincipalOwners(
    [
      roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-high"),
      roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-medium"),
      roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-high")
    ],
    [
      resourceGroupOwnership("sub-1", "rg-high", "team-a@example.test", "high"),
      resourceGroupOwnership("sub-1", "rg-medium", "team-b@example.test", "medium")
    ]
  );

  expect(projection).toMatchObject({
    potentialOwners: ["team-a@example.test", "team-b@example.test"],
    ownerConfidence: "high"
  });
  expect(projection.ownerCandidates).toEqual([
    expect.objectContaining({
      displayName: "team-a@example.test",
      type: "ownerGroup",
      confidence: "high",
      source: "resourceGroupOwner",
      rank: 1,
      relatedScopes: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Subscription",
          resourceGroup: "rg-high",
          principalId: "sp-1",
          scope: "/subscriptions/sub-1/resourceGroups/rg-high",
          roleDefinitionName: "Contributor"
        }
      ]
    }),
    expect.objectContaining({
      displayName: "team-b@example.test",
      type: "ownerGroup",
      confidence: "medium",
      source: "resourceGroupOwner",
      rank: 2,
      relatedScopes: [
        {
          subscriptionId: "sub-1",
          subscriptionName: "Subscription",
          resourceGroup: "rg-medium",
          principalId: "sp-1",
          scope: "/subscriptions/sub-1/resourceGroups/rg-medium",
          roleDefinitionName: "Contributor"
        }
      ]
    })
  ]);
});

test("does not project service principal owners from subscription-scoped role assignments", () => {
  const projection = projectServicePrincipalOwners(
    [roleAssignment("sp-1", "/subscriptions/sub-1")],
    [
      resourceGroupOwnership("sub-1", "rg-a", "team-a@example.test", "medium"),
      resourceGroupOwnership("sub-1", "rg-b", "team-b@example.test", "low"),
      resourceGroupOwnership("sub-2", "rg-c", "team-c@example.test", "high")
    ]
  );

  expect(projection).toEqual({
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none"
  });
});

test("deduplicates the same service principal owner across resource groups", () => {
  const projection = projectServicePrincipalOwners(
    [
      roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-a"),
      roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-b")
    ],
    [
      resourceGroupOwnership("sub-1", "rg-a", "payments-team", "medium"),
      resourceGroupOwnership("sub-1", "rg-b", "payments-team", "high")
    ]
  );

  expect(projection.potentialOwners).toEqual(["payments-team"]);
  expect(projection.ownerConfidence).toBe("high");
  expect(projection.ownerCandidates).toEqual([
    expect.objectContaining({
      displayName: "payments-team",
      type: "ownerGroup",
      confidence: "high",
      rank: 1,
      relatedScopes: [
        expect.objectContaining({ resourceGroup: "rg-a" }),
        expect.objectContaining({ resourceGroup: "rg-b" })
      ],
      evidence: [
        { user: "ownerGroup=payments-team", date: null }
      ]
    })
  ]);
});

test("keeps the active high-confidence service principal owner ahead of later inactive candidates for the same resource group", () => {
  const projection = projectServicePrincipalOwners(
    [roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/serverless-test")],
    [
      resourceGroupOwnership("sub-1", "serverless-test", "simple", "high"),
      resourceGroupOwnership("sub-1", "serverless-test", "kzawadka@konradsoft4pm.onmicrosoft.com", "none", {
        source: "activity.lastModifier",
        evidence: [
          {
            user: "/subscriptions/sub-1/resourceGroups/serverless-test/providers/Microsoft.Web/sites/app-n67chf4j3h7eg",
            date: "2026-04-30T10:40:57.628Z",
            disabled: true
          }
        ]
      })
    ]
  );

  expect(projection.ownerConfidence).toBe("high");
  expect(projection.potentialOwners[0]).toBe("simple");
  expect(projection.ownerCandidates[0]).toEqual(
    expect.objectContaining({
      displayName: "simple",
      type: "ownerGroup",
      confidence: "high",
      rank: 1
    })
  );
});

test("returns no service principal owners without resource group ownership context", () => {
  const projection = projectServicePrincipalOwners(
    [],
    []
  );

  expect(projection).toEqual({
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none"
  });
});

test("projects managed identity owners from its resource group", () => {
  const projection = projectManagedIdentityOwners(
    "principal-1",
    "client-1",
    [resourceGroupOwnership("sub-1", "rg-mi", "identity-owner@example.test", "high")],
    [userAssignedManagedIdentity("principal-1", "client-1", "rg-mi")]
  );

  expect(projection).toMatchObject({
    resourceGroup: "rg-mi",
    potentialOwners: ["identity-owner@example.test"],
    ownerConfidence: "high"
  });
  expect(projection.ownerCandidates).toEqual([
    expect.objectContaining({
      displayName: "identity-owner@example.test",
      type: "ownerGroup",
      confidence: "high",
      relatedScopes: [
        expect.objectContaining({
          subscriptionId: "sub-1",
          resourceGroup: "rg-mi",
          scope: "/subscriptions/sub-1/resourceGroups/rg-mi/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-1",
          roleDefinitionName: null
        })
      ]
    })
  ]);
});

test("returns no owners when a principal has no matching ownership context", () => {
  expect(projectServicePrincipalOwners([], [])).toEqual({
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none"
  });
  expect(projectManagedIdentityOwners("missing-principal", "missing-client", [], [])).toEqual({
    ownerCandidates: [],
    potentialOwners: [],
    ownerConfidence: "none"
  });
});

function resourceGroupOwnership(
  subscriptionId: string,
  resourceGroup: string,
  owner: string | null,
  confidence: ResourceGroupOwnershipRow["confidence"],
  options: Partial<Pick<ResourceGroupOwnershipRow, "source" | "evidence">> = {}
): ResourceGroupOwnershipRow {
  const source = options.source ?? "tag.ownerGroup";
  const evidence = options.evidence ?? [{ user: `ownerGroup=${owner}`, date: null }];

  return {
    subscriptionId,
    subscriptionName: "Subscription",
    resourceGroup,
    location: "westeurope",
    tags: null,
    targetKey: `resourceGroup:${subscriptionId}:${resourceGroup}`,
    ownerCandidates: owner
      ? [
          {
            key: `ownerGroup:${owner.toLowerCase()}`,
            displayName: owner,
            type: "ownerGroup",
            confidence,
            source: source.startsWith("activity.") ? "activity" : "tag",
            rank: 1,
            evidence,
            relatedScopes: [
              {
                subscriptionId,
                subscriptionName: "Subscription",
                resourceGroup
              }
            ]
          }
        ]
      : [],
    owner,
    confidence,
    source: owner ? source : "none",
    evidence: owner ? evidence : [],
    roleAssignments: [],
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none"
  };
}

function roleAssignment(principalId: string, scope: string): AzureRoleAssignment {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription",
    roleAssignmentId: null,
    scope,
    scopeType: "ResourceGroup",
    principalId,
    principalType: "ServicePrincipal",
    principalDisplayName: "App",
    signInName: null,
    roleDefinitionId: null,
    roleDefinitionName: "Contributor",
    canDelegate: null,
    condition: null,
    conditionVersion: null
  };
}

function userAssignedManagedIdentity(
  principalId: string,
  clientId: string,
  resourceGroup: string
): AzureUserAssignedManagedIdentity {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription",
    resourceId: `/subscriptions/sub-1/resourceGroups/${resourceGroup}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-1`,
    name: "id-1",
    resourceGroup,
    location: "westeurope",
    clientId,
    principalId,
    tenantId: "tenant-1",
    tags: null
  };
}
