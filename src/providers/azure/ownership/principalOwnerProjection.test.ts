import type {
  AzureRoleAssignment,
  AzureUserAssignedManagedIdentity,
  ResourceGroupOwnershipRow
} from "../../../core/azure/resources";
import {
  projectManagedIdentityOwners,
  projectServicePrincipalOwners
} from "./principalOwnerProjection";

test("projects service principal owners from role assignment resource group ownership", () => {
  expect(
    projectServicePrincipalOwners(
      [
        roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-high"),
        roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-medium"),
        roleAssignment("sp-1", "/subscriptions/sub-1/resourceGroups/rg-high")
      ],
      [
        resourceGroupOwnership("sub-1", "rg-high", "team-a@example.test", "high"),
        resourceGroupOwnership("sub-1", "rg-medium", "team-b@example.test", "medium")
      ]
    )
  ).toEqual({
    potentialOwners: ["team-a@example.test", "team-b@example.test"],
    ownerConfidence: "high"
  });
});

test("projects service principal owners from subscription-scoped role assignments", () => {
  expect(
    projectServicePrincipalOwners(
      [roleAssignment("sp-1", "/subscriptions/sub-1")],
      [
        resourceGroupOwnership("sub-1", "rg-a", "team-a@example.test", "medium"),
        resourceGroupOwnership("sub-1", "rg-b", "team-b@example.test", "low"),
        resourceGroupOwnership("sub-2", "rg-c", "team-c@example.test", "high")
      ]
    )
  ).toEqual({
    potentialOwners: ["team-a@example.test", "team-b@example.test"],
    ownerConfidence: "medium"
  });
});

test("projects managed identity owners from its resource group", () => {
  expect(
    projectManagedIdentityOwners(
      "principal-1",
      "client-1",
      [resourceGroupOwnership("sub-1", "rg-mi", "identity-owner@example.test", "high")],
      [userAssignedManagedIdentity("principal-1", "client-1", "rg-mi")]
    )
  ).toEqual({
    potentialOwners: ["identity-owner@example.test"],
    ownerConfidence: "high"
  });
});

test("returns no owners when a principal has no matching ownership context", () => {
  expect(projectServicePrincipalOwners([], [])).toEqual({
    potentialOwners: [],
    ownerConfidence: "none"
  });
  expect(projectManagedIdentityOwners("missing-principal", "missing-client", [], [])).toEqual({
    potentialOwners: [],
    ownerConfidence: "none"
  });
});

function resourceGroupOwnership(
  subscriptionId: string,
  resourceGroup: string,
  owner: string | null,
  confidence: ResourceGroupOwnershipRow["confidence"]
): ResourceGroupOwnershipRow {
  return {
    subscriptionId,
    subscriptionName: "Subscription",
    resourceGroup,
    location: "westeurope",
    tags: null,
    targetKey: `resourceGroup:${subscriptionId}:${resourceGroup}`,
    owner,
    confidence,
    source: owner ? "tag.ownerGroup" : "none",
    evidence: owner ? [{ user: `ownerGroup=${owner}`, date: null }] : []
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
