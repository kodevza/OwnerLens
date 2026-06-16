import { buildZeroTrustAssessmentAuditFindingTarget } from "../../../core/ownership/OwnershipTarget";
import type { EntraServicePrincipal } from "../inputTransferObject/generated/EntraSnapshot";
import type { AzureUserAssignedManagedIdentity } from "../../../core/azure/resources";
import {
  buildAzureManagedIdentityOwnershipTargets,
  buildEntraServicePrincipalOwnershipTargets
} from "./buildAzureOwnershipTargets";

test("maps Azure managed identities to generic ownership targets", () => {
  const identity: AzureUserAssignedManagedIdentity = {
    subscriptionId: "sub-1",
    subscriptionName: "Production",
    resourceId: "/subscriptions/sub-1/resourceGroups/rg-1/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-1",
    name: "id-1",
    resourceGroup: "rg-1",
    location: "westeurope",
    clientId: "client-1",
    principalId: "principal-1",
    tenantId: "tenant-1",
    tags: null
  };

  expect(buildAzureManagedIdentityOwnershipTargets([identity])).toEqual([
    {
      id: identity.resourceId,
      kind: "azure.managedIdentity",
      displayName: "id-1",
      sourceProvider: "azure",
      technicalId: "principal-1",
      refs: [
        { type: "azure.subscription", id: "sub-1", label: "Production" },
        { type: "azure.resourceGroup", id: "rg-1" },
        { type: "entra.servicePrincipal", id: "principal-1" },
        { type: "entra.application", id: "client-1" },
        { type: "entra.tenant", id: "tenant-1" }
      ]
    }
  ]);
});

test("maps Entra service principals to generic ownership targets", () => {
  const servicePrincipal: EntraServicePrincipal = {
    id: "sp-1",
    appId: "app-1",
    displayName: "Payroll API",
    appDisplayName: "Payroll",
    servicePrincipalType: "Application",
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: "tenant-1",
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: []
  };

  expect(buildEntraServicePrincipalOwnershipTargets([servicePrincipal])).toEqual([
    {
      id: "sp-1",
      kind: "entra.servicePrincipal",
      displayName: "Payroll API",
      sourceProvider: "entra",
      technicalId: "app-1",
      refs: [
        { type: "entra.application", id: "app-1", label: "Payroll" },
        { type: "entra.tenant", id: "tenant-1" }
      ]
    }
  ]);
});

test("creates a Zero Trust Assessment audit finding ownership target placeholder", () => {
  expect(
    buildZeroTrustAssessmentAuditFindingTarget({
      id: "finding-1",
      displayName: "Missing accountable owner",
      riskLevel: "high"
    })
  ).toEqual({
    id: "finding-1",
    kind: "zta.auditFinding",
    displayName: "Missing accountable owner",
    sourceProvider: "zeroTrustAssessment",
    riskLevel: "high"
  });
});
