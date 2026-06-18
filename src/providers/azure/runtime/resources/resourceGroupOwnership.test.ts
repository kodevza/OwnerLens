import type { EntraServicePrincipal, ServicePrincipalType } from "../../../../core/azure/entra/types";
import type { AzureResourceGroup, AzureRoleAssignment } from "../../../../core/azure/resources";
import type { OwnerReportRow } from "../../ownership/azureOwnerReportTypes";
import { buildResourceGroupOwnershipRows } from "./resourceGroupOwnership";

test("classifies configured non-principal owner tags as ownerTag", () => {
  const [row] = buildResourceGroupOwnershipRows(
    [resourceGroup("rg-cost-center")],
    [ownerRow("rg-cost-center", "tag.costCenter", "cc-1001", "high")]
  );

  expect(row.ownerCandidates).toEqual([
    expect.objectContaining({
      key: "ownerTag:cc-1001",
      displayName: "cc-1001",
      type: "ownerTag",
      confidence: "high",
      evidence: [{ user: "costCenter=cc-1001", date: null }]
    })
  ]);
});

test("classifies configured ownerGroup tag as ownerGroup", () => {
  const [row] = buildResourceGroupOwnershipRows(
    [resourceGroup("rg-platform")],
    [ownerRow("rg-platform", "tag.ownerGroup", "platform-team", "high")]
  );

  expect(row.ownerCandidates).toEqual([
    expect.objectContaining({
      key: "ownerGroup:platform-team",
      displayName: "platform-team",
      type: "ownerGroup",
      confidence: "high",
      evidence: [{ user: "ownerGroup=platform-team", date: null }]
    })
  ]);
});

test("summarizes service principal and managed identity RBAC assignments scoped to the resource group", () => {
  const [row] = buildResourceGroupOwnershipRows(
    [resourceGroup("rg-app")],
    [],
    [
      roleAssignment("sp-app", "Owner", "/subscriptions/sub-1/resourceGroups/rg-app", "ServicePrincipal"),
      roleAssignment(
        "mi-app",
        "Reader",
        "/subscriptions/sub-1/resourceGroups/rg-app/providers/Microsoft.Storage/storageAccounts/appstorage",
        "ServicePrincipal"
      ),
      roleAssignment("user-1", "Owner", "/subscriptions/sub-1/resourceGroups/rg-app", "User"),
      roleAssignment("group-1", "Contributor", "/subscriptions/sub-1/resourceGroups/rg-app", "Group"),
      roleAssignment("sp-other", "Owner", "/subscriptions/sub-1/resourceGroups/rg-other", "ServicePrincipal"),
      roleAssignment("sp-sub", "Owner", "/subscriptions/sub-1", "ServicePrincipal")
    ],
    [servicePrincipal("sp-app", "Application"), servicePrincipal("mi-app", "ManagedIdentity")]
  );

  expect(row.rbacRoleAssignmentCount).toBe(2);
  expect(row.rbacRoleLevel).toBe("high");
  expect(row.roleAssignments.map((assignment) => assignment.principalId)).toEqual(["sp-app", "mi-app"]);
});

function resourceGroup(resourceGroupName: string): AzureResourceGroup {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription 1",
    resourceGroup: resourceGroupName,
    location: "westeurope",
    tags: null
  };
}

function roleAssignment(
  principalId: string,
  roleDefinitionName: string,
  scope: string,
  principalType: string
): AzureRoleAssignment {
  return {
    subscriptionId: "sub-1",
    subscriptionName: "Subscription 1",
    roleAssignmentId: `${principalId}:${roleDefinitionName}:${scope}`,
    scope,
    scopeType: scope.includes("/providers/") ? "Resource" : scope.includes("/resourceGroups/") ? "ResourceGroup" : "Subscription",
    scopeSubscriptionId: "sub-1",
    scopeResourceGroup: scope.match(/\/resourceGroups\/([^/]+)/i)?.[1] ?? null,
    principalId,
    principalType,
    principalDisplayName: principalId,
    signInName: null,
    roleDefinitionId: `role-${roleDefinitionName}`,
    roleDefinitionName,
    canDelegate: null,
    condition: null,
    conditionVersion: null
  };
}

function servicePrincipal(id: string, servicePrincipalType: ServicePrincipalType): EntraServicePrincipal {
  return {
    id,
    appId: `${id}-app`,
    displayName: id,
    appDisplayName: null,
    servicePrincipalType,
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: null,
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: {}
  };
}

function ownerRow(
  resourceGroupName: string,
  source: string,
  owner: string,
  confidence: OwnerReportRow["confidence"]
): OwnerReportRow {
  const tagName = source.replace(/^tag\./, "");

  return {
    kind: "resourceGroup",
    targetKey: `resourceGroup:sub-1:${resourceGroupName}`,
    subscriptionId: "sub-1",
    subscriptionName: "Subscription 1",
    resourceGroup: resourceGroupName,
    owner,
    confidence,
    source,
    evidence: [{ user: `${tagName}=${owner}`, date: null }]
  };
}
