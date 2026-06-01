import {
  type ReportExportArtifact,
  type ReportExportFormat,
  type ReportProvider
} from "../../../report/reportTypes";
import { ownershipTargetCollection } from "../../../report/ownershipTargetCollection";
import {
  buildEntraConsentInventoryExport,
  buildManagedIdentityExport,
  buildServicePrincipalExport,
  type AzureReportExportMeta,
  isTenantOwned
} from "../azureReportUtils";
import { azureExportedCollections, type AzureExportedCollectionId } from "../exportedCollections";
import { buildAzureManagedIdentityAssignmentIndex, buildRoleAssignmentIndex } from "../identities";
import {
  buildAzureAccessRisk,
  buildAzureEntraConsentInventory,
  buildAzureManagedIdentities,
  buildAzureServicePrincipals
} from "./azureReportRows";
import { consentInventoryCollection } from "./consentInventoryCollection";
import { managedIdentityCollection } from "./managedIdentityCollection";
import { ownersCollection } from "./ownersCollection";
import { servicePrincipalCollection } from "./servicePrincipalCollection";
import type { AzureReportInput, AzureReportOverview } from "./azureReportTypes";

type AzureProviderExportedCollectionId = Exclude<AzureExportedCollectionId, "owners" | "ownershipTargets">;

export type { AzureReportInput, AzureReportOverview } from "./azureReportTypes";

export const azureReportProvider: ReportProvider<AzureReportInput> = {
  id: "azure",
  collections: [
    ownersCollection,
    ownershipTargetCollection,
    managedIdentityCollection,
    servicePrincipalCollection,
    consentInventoryCollection
  ],
  buildExport: (ctx, collectionId, format) => buildAzureReportExport(ctx, collectionId, format)
};

export function buildAzureReportOverview(ctx: AzureReportInput): AzureReportOverview {
  const servicePrincipals = buildAzureServicePrincipals(ctx);

  return {
    managedIdentityCount: buildAzureManagedIdentities(ctx).length,
    servicePrincipalCount: servicePrincipals.length,
    tenantOwnedServicePrincipalCount: servicePrincipals.filter((sp) => isTenantOwned(sp, ctx.identitySnapshot)).length
  };
}

function buildAzureReportExport(
  ctx: AzureReportInput,
  collectionId: string,
  format: ReportExportFormat
): ReportExportArtifact | null {
  if (!isAzureExportedCollectionId(collectionId)) {
    return null;
  }

  switch (collectionId) {
    case "managedIdentities":
      return buildManagedIdentityReportExport(ctx, format);
    case "servicePrincipals":
      return buildServicePrincipalReportExport(ctx, format);
    case "entraConsentInventory":
      return buildEntraConsentInventoryReportExport(ctx, format);
  }
}

function buildManagedIdentityReportExport(ctx: AzureReportInput, format: ReportExportFormat): ReportExportArtifact {
  const exportableReport = buildManagedIdentityExport(
    buildAzureManagedIdentities(ctx),
    buildAzureManagedIdentityAssignmentIndex(ctx.resourceSnapshot),
    buildAzureAccessRisk(ctx),
    ctx.resourceSnapshot,
    ctx.report.owners,
    buildAzureReportExportMeta(ctx)
  );
  const fileBaseName = getAzureCollectionFileBaseName("managedIdentities");

  if (format === "csv") {
    return {
      kind: "csv",
      fileName: `${fileBaseName}.csv`,
      rows: exportableReport.managedIdentities
    };
  }

  return {
    kind: "json",
    fileName: `${fileBaseName}.json`,
    data: exportableReport
  };
}

function buildServicePrincipalReportExport(ctx: AzureReportInput, format: ReportExportFormat): ReportExportArtifact {
  const exportableReport = buildServicePrincipalExport(
    buildAzureServicePrincipals(ctx),
    ctx.identitySnapshot,
    buildRoleAssignmentIndex(ctx.resourceSnapshot),
    buildAzureAccessRisk(ctx),
    ctx.report.owners,
    buildAzureReportExportMeta(ctx)
  );
  const fileBaseName = getAzureCollectionFileBaseName("servicePrincipals");

  if (format === "csv") {
    return {
      kind: "csv",
      fileName: `${fileBaseName}.csv`,
      rows: exportableReport.servicePrincipals
    };
  }

  return {
    kind: "json",
    fileName: `${fileBaseName}.json`,
    data: exportableReport
  };
}

function buildEntraConsentInventoryReportExport(ctx: AzureReportInput, format: ReportExportFormat): ReportExportArtifact {
  const exportableReport = buildEntraConsentInventoryExport(
    buildAzureEntraConsentInventory(ctx),
    buildRoleAssignmentIndex(ctx.resourceSnapshot),
    ctx.report.owners,
    buildAzureReportExportMeta(ctx)
  );
  const fileBaseName = getAzureCollectionFileBaseName("entraConsentInventory");

  if (format === "csv") {
    return {
      kind: "csv",
      fileName: `${fileBaseName}.csv`,
      rows: exportableReport.entraConsentInventory
    };
  }

  return {
    kind: "json",
    fileName: `${fileBaseName}.json`,
    data: exportableReport
  };
}

function buildAzureReportExportMeta(ctx: AzureReportInput): AzureReportExportMeta {
  return {
    resourceSnapshotCreatedAt: ctx.resourceSnapshot.meta.createdAt ?? null,
    entraSnapshotCreatedAt: ctx.identitySnapshot.meta.createdAt ?? null,
    subscriptionCount: ctx.resourceSnapshot.subscriptions.length,
    resourceGroupCount: ctx.resourceSnapshot.resourceGroups.length,
    activityLogCount: ctx.resourceSnapshot.activityLogs.length,
    servicePrincipalCount: ctx.identitySnapshot.servicePrincipals.length
  };
}

function getAzureCollectionFileBaseName(id: AzureExportedCollectionId): string {
  const collection = azureExportedCollections.find((entry) => entry.id === id);
  if (!collection) {
    throw new Error(`Unknown Azure report collection: ${id}`);
  }

  return collection.fileBaseName;
}

function isAzureExportedCollectionId(id: string): id is AzureProviderExportedCollectionId {
  return id === "managedIdentities" || id === "servicePrincipals" || id === "entraConsentInventory";
}
