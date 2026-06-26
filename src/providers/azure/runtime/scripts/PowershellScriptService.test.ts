import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";
import { PowershellScriptService } from "./PowershellScriptService";

function resourceGroupRow(input: {
  subscriptionId: string;
  resourceGroup: string;
  owner: string | null;
  confidence: "high" | "medium" | "low" | "none";
}): ResourceGroupOwnershipRow {
  return {
    subscriptionId: input.subscriptionId,
    subscriptionName: input.subscriptionId,
    resourceGroup: input.resourceGroup,
    location: "westeurope",
    tags: {},
    targetKey: `resourceGroup:${input.subscriptionId}:${input.resourceGroup}`,
    ownerCandidates: [],
    owner: input.owner,
    confidence: input.confidence,
    source: "tag.owner",
    evidence: [],
    roleAssignments: [],
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none"
  };
}

test("generates a resource group owner tag PowerShell script from filtered selected rows", async () => {
  const azureResourcesQueries = {
    queryResourceGroupOwnershipExportRows: jest.fn().mockResolvedValue([
      resourceGroupRow({
        subscriptionId: "sub-2",
        resourceGroup: "rg-web",
        owner: "alice@example.test",
        confidence: "high"
      })
    ])
  } as unknown as AzureResourcesCollectionQueryService;
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries,
    entraQueries: emptyEntraQueries()
  });

  await expect(
    service.generate({
      templateId: "setResourceGroupOwnerTag",
      selection: {
        filters: [{ column: "confidence", values: ["high"] }],
        selectedRowKeys: ["sub-2:rg-web"],
        sortRules: [{ columnId: "resourceGroup", direction: "asc" }]
      }
    })
  ).resolves.toMatchObject({
    kind: "powershellScript",
    templateId: "setResourceGroupOwnerTag",
    fileName: "ownerlens-set-resource-group-owner.ps1",
    contentType: "text/x-powershell; charset=utf-8",
    count: 1,
    targetIds: ["sub-2:rg-web"],
    body: expect.stringContaining("Set-AzResourceGroup -Name $target.ResourceGroupName -Tag $tags")
  });
  expect(azureResourcesQueries.queryResourceGroupOwnershipExportRows).toHaveBeenCalledWith({
    filters: [{ column: "confidence", values: ["high"] }],
    selectedRowKeys: ["sub-2:rg-web"],
    sortRules: [{ columnId: "resourceGroup", direction: "asc" }]
  });
});

test("generates the ownerGroup PowerShell template", async () => {
  const azureResourcesQueries = {
    queryResourceGroupOwnershipExportRows: jest.fn().mockResolvedValue([
      resourceGroupRow({
        subscriptionId: "sub-1",
        resourceGroup: "rg-api",
        owner: "alice@example.test",
        confidence: "high"
      })
    ])
  } as unknown as AzureResourcesCollectionQueryService;
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries,
    entraQueries: emptyEntraQueries()
  });

  await expect(
    service.generate({
      templateId: "setResourceGroupOwnerGroupTag",
      selection: {}
    })
  ).resolves.toMatchObject({
    kind: "powershellScript",
    templateId: "setResourceGroupOwnerGroupTag",
    fileName: "ownerlens-set-resource-group-owner-group.ps1",
    body: expect.stringContaining("[string]$TagName = 'ownerGroup'")
  });
});

test("escapes generated PowerShell single-quoted values", async () => {
  const azureResourcesQueries = {
    queryResourceGroupOwnershipExportRows: jest.fn().mockResolvedValue([
      resourceGroupRow({
        subscriptionId: "sub-1",
        resourceGroup: "rg-prod's",
        owner: null,
        confidence: "none"
      })
    ])
  } as unknown as AzureResourcesCollectionQueryService;
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries,
    entraQueries: emptyEntraQueries()
  });
  const script = await service.generate({
    templateId: "setResourceGroupOwnerTag",
    selection: {}
  });

  expect(script.body).toContain("[string]$TagName = 'owner'");
  expect(script.body).toContain("ResourceGroupName = 'rg-prod''s'");
  expect(script.body).toContain("Owner = ''");
});

test("generates a service principal owner tag PowerShell script from selected principals", async () => {
  const entraQueries = {
    queryServicePrincipalExportRows: jest.fn().mockResolvedValue([
      servicePrincipalRow({
        id: "sp-2",
        displayName: "Worker's app",
        potentialOwners: ["bob@example.test"]
      })
    ]),
    queryManagedIdentityExportRows: jest.fn().mockResolvedValue([])
  } as unknown as EntraCollectionQueryService;
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries: emptyAzureResourcesQueries(),
    entraQueries
  });

  await expect(
    service.generate({
      collectionId: "entra.servicePrincipals",
      templateId: "setServicePrincipalOwnerTag",
      selection: {
        selectedRowKeys: ["sp-2"]
      }
    })
  ).resolves.toMatchObject({
    kind: "powershellScript",
    templateId: "setServicePrincipalOwnerTag",
    fileName: "ownerlens-set-service-principal-owner.ps1",
    count: 1,
    targetIds: ["sp-2"],
    body: expect.stringContaining("Update-MgServicePrincipal -ServicePrincipalId $target.ServicePrincipalId -Tags $tags")
  });
  expect(entraQueries.queryServicePrincipalExportRows).toHaveBeenCalledWith({
    selectedRowKeys: ["sp-2"]
  });
});

test("generates a managed identity owner tag script using the service principal template target", async () => {
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries: emptyAzureResourcesQueries(),
    entraQueries: {
      queryServicePrincipalExportRows: jest.fn().mockResolvedValue([]),
      queryManagedIdentityExportRows: jest.fn().mockResolvedValue([
        managedIdentityRow({
          id: "mi-1",
          displayName: "Managed identity",
          potentialOwners: ["owner@example.test"]
        })
      ])
    } as unknown as EntraCollectionQueryService
  });

  const script = await service.generate({
    collectionId: "entra.managedIdentities",
    templateId: "setServicePrincipalOwnerTag",
    selection: {}
  });

  expect(script.body).toContain("ServicePrincipalId = 'mi-1'");
  expect(script.body).toContain("Owner = 'owner@example.test'");
});

test("rejects a resource group template for service principal collections", async () => {
  const service = new PowershellScriptService({
    appRoot: process.cwd(),
    azureResourcesQueries: emptyAzureResourcesQueries(),
    entraQueries: emptyEntraQueries()
  });

  await expect(
    service.generate({
      collectionId: "entra.servicePrincipals",
      templateId: "setResourceGroupOwnerTag",
      selection: {}
    })
  ).rejects.toThrow("PowerShell template target ResourceGroup cannot be used with collection entra.servicePrincipals.");
});

function emptyAzureResourcesQueries(): AzureResourcesCollectionQueryService {
  return {
    queryResourceGroupOwnershipExportRows: jest.fn().mockResolvedValue([])
  } as unknown as AzureResourcesCollectionQueryService;
}

function emptyEntraQueries(): EntraCollectionQueryService {
  return {
    queryServicePrincipalExportRows: jest.fn().mockResolvedValue([]),
    queryManagedIdentityExportRows: jest.fn().mockResolvedValue([])
  } as unknown as EntraCollectionQueryService;
}

function servicePrincipalRow(input: {
  id: string;
  displayName: string;
  potentialOwners?: string[];
}): ServicePrincipal {
  return {
    id: input.id,
    appId: `${input.id}-app`,
    displayName: input.displayName,
    appDisplayName: input.displayName,
    servicePrincipalType: "Application",
    publisherName: null,
    accountEnabled: true,
    appOwnerOrganizationId: null,
    homepage: null,
    loginUrl: null,
    replyUrls: [],
    servicePrincipalNames: [],
    tags: {},
    permissionRisk: "none",
    roleAssignments: [],
    oauthPermissionsCount: 0,
    appRolesPermissionCount: 0,
    entraPermissionRisk: "none",
    rbacRoleAssignmentCount: 0,
    rbacRoleLevel: "none",
    rbacSubscriptionCount: 0,
    potentialOwners: input.potentialOwners
  } as unknown as ServicePrincipal;
}

function managedIdentityRow(input: {
  id: string;
  displayName: string;
  potentialOwners?: string[];
}): ManagedIdentity {
  return {
    ...servicePrincipalRow(input),
    servicePrincipalType: "ManagedIdentity",
    managedIdentityAssignments: [],
    assignedResourceGroups: []
  } as unknown as ManagedIdentity;
}
