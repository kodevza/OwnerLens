import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ManagedIdentity } from "../../../../core/azure/entra/managedIdentity";
import type { ServicePrincipal } from "../../../../core/azure/entra/servicePrincipal";
import type { ResourceGroupOwnershipRow } from "../../../../core/azure/resources";
import type { LocalReportCollectionQueryOptions } from "../../../../core/runtime/collections";
import { RuntimeHttpError } from "../../../../core/runtime/localSnapshotFiles";
import type { EntraCollectionQueryService } from "../entra/EntraCollectionQueryService";
import type { AzureResourcesCollectionQueryService } from "../resources/AzureResourcesCollectionQueryService";

export type PowerShellScriptTemplateId =
  | "setResourceGroupOwnerTag"
  | "setResourceGroupOwnerGroupTag"
  | "setServicePrincipalOwnerTag";

export type PowerShellScriptCollectionId =
  | "azureResources.resourceGroupOwnership"
  | "entra.servicePrincipals"
  | "entra.managedIdentities";

type PowerShellScriptTarget = "ResourceGroup" | "ServicePrincipal";

export type GeneratePowerShellScriptRequest = {
  collectionId?: PowerShellScriptCollectionId;
  templateId: PowerShellScriptTemplateId;
  selection: LocalReportCollectionQueryOptions;
};

export type RuntimePowerShellScript = {
  kind: "powershellScript";
  templateId: PowerShellScriptTemplateId;
  fileName: string;
  contentType: "text/x-powershell; charset=utf-8";
  body: string;
  count: number;
  targetIds: string[];
};

export type PowershellScriptServiceOptions = {
  appRoot: string;
  azureResourcesQueries: AzureResourcesCollectionQueryService;
  entraQueries: EntraCollectionQueryService;
};

type PowerShellTemplateDefinition = {
  fileName: string;
  outputFileName: string;
  tagName: string;
};

export class PowershellScriptService {
  private readonly appRoot: string;
  private readonly azureResourcesQueries: AzureResourcesCollectionQueryService;
  private readonly entraQueries: EntraCollectionQueryService;

  constructor(options: PowershellScriptServiceOptions) {
    this.appRoot = options.appRoot;
    this.azureResourcesQueries = options.azureResourcesQueries;
    this.entraQueries = options.entraQueries;
  }

  async generate(request: GeneratePowerShellScriptRequest): Promise<RuntimePowerShellScript> {
    const template = await this.readTemplate(request.templateId);
    const templateTarget = readTemplateTarget(template);

    if (templateTarget === "ResourceGroup") {
      return this.generateResourceGroupOwnerTagScript(request, template);
    }

    return this.generateServicePrincipalOwnerTagScript(request, template);
  }

  private async generateResourceGroupOwnerTagScript(
    request: GeneratePowerShellScriptRequest,
    template: string
  ): Promise<RuntimePowerShellScript> {
    assertTemplateCollection(request.collectionId ?? "azureResources.resourceGroupOwnership", "ResourceGroup");
    const rows = await this.azureResourcesQueries.queryResourceGroupOwnershipExportRows(request.selection);

    const templateDefinition = readTemplateDefinition(request.templateId);
    if (!isValidAzureTagName(templateDefinition.tagName)) {
      throw new RuntimeHttpError("Azure tag name must be 1-512 characters and cannot contain angle brackets.", 500);
    }

    return {
      kind: "powershellScript",
      templateId: request.templateId,
      fileName: templateDefinition.outputFileName,
      contentType: "text/x-powershell; charset=utf-8",
      body: renderPowerShellTemplate(template, {
        tagName: toPowerShellSingleQuotedLiteral(templateDefinition.tagName),
        targets: renderResourceGroupTargets(rows)
      }),
      count: rows.length,
      targetIds: rows.map(getResourceGroupOwnershipRowKey)
    };
  }

  private async generateServicePrincipalOwnerTagScript(
    request: GeneratePowerShellScriptRequest,
    template: string
  ): Promise<RuntimePowerShellScript> {
    const collectionId = request.collectionId ?? "entra.servicePrincipals";
    assertTemplateCollection(collectionId, "ServicePrincipal");
    const rows = await this.queryServicePrincipalExportRows(collectionId, request.selection);
    const templateDefinition = readTemplateDefinition(request.templateId);
    if (!isValidAzureTagName(templateDefinition.tagName)) {
      throw new RuntimeHttpError(
        "Service principal tag name must be 1-512 characters and cannot contain angle brackets.",
        500
      );
    }

    return {
      kind: "powershellScript",
      templateId: request.templateId,
      fileName: templateDefinition.outputFileName,
      contentType: "text/x-powershell; charset=utf-8",
      body: renderPowerShellTemplate(template, {
        tagName: toPowerShellSingleQuotedLiteral(templateDefinition.tagName),
        targets: renderServicePrincipalTargets(rows)
      }),
      count: rows.length,
      targetIds: rows.map(getServicePrincipalRowKey)
    };
  }

  private async queryServicePrincipalExportRows(
    collectionId: PowerShellScriptCollectionId,
    selection: LocalReportCollectionQueryOptions
  ): Promise<Array<ServicePrincipal | ManagedIdentity>> {
    if (collectionId === "entra.servicePrincipals") {
      return (await this.entraQueries.queryServicePrincipalExportRows(selection)) as unknown as ServicePrincipal[];
    }

    if (collectionId === "entra.managedIdentities") {
      return (await this.entraQueries.queryManagedIdentityExportRows(selection)) as unknown as ManagedIdentity[];
    }

    throw new RuntimeHttpError(`Unsupported PowerShell collection for service principal template: ${collectionId}`, 400);
  }

  private async readTemplate(templateId: PowerShellScriptTemplateId): Promise<string> {
    const templateDefinition = readTemplateDefinition(templateId);
    const templatePath = path.join(
      this.appRoot,
      "powershell",
      "OwnerLens",
      "Templates",
      templateDefinition.fileName
    );

    try {
      return await readFile(templatePath, "utf8");
    } catch {
      throw new RuntimeHttpError(
        `PowerShell template file was not found or could not be read: ${templateDefinition.fileName}`,
        500,
        "runtime.templateReadFailed"
      );
    }
  }
}

function renderResourceGroupTargets(rows: ResourceGroupOwnershipRow[]): string {
  return rows
    .map(
      (row) =>
        `  [pscustomobject]@{ SubscriptionId = '${escapePowerShellSingleQuotedString(row.subscriptionId)}'; ResourceGroupName = '${escapePowerShellSingleQuotedString(row.resourceGroup)}'; Owner = '${escapePowerShellSingleQuotedString(row.owner ?? "")}' }`
    )
    .join(",\n");
}

function renderServicePrincipalTargets(rows: Array<ServicePrincipal | ManagedIdentity>): string {
  return rows
    .map(
      (row) =>
        `  [pscustomobject]@{ ServicePrincipalId = '${escapePowerShellSingleQuotedString(row.id)}'; DisplayName = '${escapePowerShellSingleQuotedString(row.displayName)}'; Owner = '${escapePowerShellSingleQuotedString(readPrincipalOwner(row))}' }`
    )
    .join(",\n");
}

function renderPowerShellTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (placeholder, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      throw new RuntimeHttpError(`PowerShell template variable is not available: ${name}`, 500);
    }

    return value;
  });
}

function getResourceGroupOwnershipRowKey(row: ResourceGroupOwnershipRow): string {
  return `${row.subscriptionId}:${row.resourceGroup}`;
}

function getServicePrincipalRowKey(row: ServicePrincipal | ManagedIdentity): string {
  return row.id;
}

function readPrincipalOwner(row: ServicePrincipal | ManagedIdentity): string {
  return row.potentialOwners?.[0] ?? row.ownerCandidates?.[0]?.displayName ?? "";
}

function escapePowerShellSingleQuotedString(value: string): string {
  return value.replace(/'/g, "''");
}

function toPowerShellSingleQuotedLiteral(value: string): string {
  return `'${escapePowerShellSingleQuotedString(value)}'`;
}

function isValidAzureTagName(value: string): boolean {
  return value.length > 0 && value.length <= 512 && !/[<>]/.test(value);
}

function readTemplateDefinition(templateId: PowerShellScriptTemplateId): PowerShellTemplateDefinition {
  const templateDefinition = powerShellTemplateDefinitions[templateId];
  if (!templateDefinition) {
    throw new RuntimeHttpError(`Unsupported PowerShell template: ${templateId}`, 400);
  }

  return templateDefinition;
}

function readTemplateTarget(template: string): PowerShellScriptTarget {
  const firstLine = template.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = /^#\s*Target\s*=\s*(ResourceGroup|ServicePrincipal)\s*$/i.exec(firstLine);
  const target = match?.[1]?.toLowerCase();
  if (target === "resourcegroup") {
    return "ResourceGroup";
  }

  if (target === "serviceprincipal") {
    return "ServicePrincipal";
  }

  throw new RuntimeHttpError(
    "PowerShell template first line must declare '# Target = ResourceGroup' or '# Target = ServicePrincipal'.",
    500,
    "runtime.templateTargetMissing"
  );
}

function assertTemplateCollection(collectionId: PowerShellScriptCollectionId, target: PowerShellScriptTarget): void {
  if (target === "ResourceGroup" && collectionId === "azureResources.resourceGroupOwnership") {
    return;
  }

  if (
    target === "ServicePrincipal" &&
    (collectionId === "entra.servicePrincipals" || collectionId === "entra.managedIdentities")
  ) {
    return;
  }

  throw new RuntimeHttpError(`PowerShell template target ${target} cannot be used with collection ${collectionId}.`, 400);
}

const powerShellTemplateDefinitions: Record<PowerShellScriptTemplateId, PowerShellTemplateDefinition> = {
  setResourceGroupOwnerTag: {
    fileName: "Set-ResourceGroupOwnerTag.ps1",
    outputFileName: "ownerlens-set-resource-group-owner.ps1",
    tagName: "owner"
  },
  setResourceGroupOwnerGroupTag: {
    fileName: "Set-ResourceGroupOwnerGroupTag.ps1",
    outputFileName: "ownerlens-set-resource-group-owner-group.ps1",
    tagName: "ownerGroup"
  },
  setServicePrincipalOwnerTag: {
    fileName: "Set-ServicePrincipalOwnerTag.ps1",
    outputFileName: "ownerlens-set-service-principal-owner.ps1",
    tagName: "owner"
  }
};
