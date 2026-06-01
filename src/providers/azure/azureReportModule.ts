import type { ReportProviderModule } from "../../report/reportProviderModule";
import type { EntraSnapshot } from "./domain/entra";
import type { AzureSnapshot } from "./domain/resources";
import { azureExportedCollections } from "./exportedCollections";
import {
  buildAzureManagedIdentityOwnershipTargets,
  buildAzureOwnershipReport,
  buildEntraServicePrincipalOwnershipTargets
} from "./ownership";
import { azureReportProvider, buildAzureReportOverview, type AzureReportInput } from "./reporting/azureReportProvider";

export const azureReportModule: ReportProviderModule<AzureReportInput, AzureSnapshot, EntraSnapshot> = {
  id: "azure",
  snapshots: {
    resourceFileName: "snapshot.json",
    identityFileName: "entra-snapshot.json",
    resourceProvider: "azure",
    identityProvider: "entra"
  },
  buildOwnershipReport: buildAzureOwnershipReport,
  buildProviderContext: ({ identitySnapshot, query, report, resourceSnapshot }) => ({
    identitySnapshot,
    ownershipTargets: [
      ...buildAzureManagedIdentityOwnershipTargets(resourceSnapshot.userAssignedManagedIdentities),
      ...buildEntraServicePrincipalOwnershipTargets(
        identitySnapshot.servicePrincipals.filter(
          (servicePrincipal) => servicePrincipal.servicePrincipalType !== "ManagedIdentity"
        )
      )
    ],
    query,
    report,
    resourceSnapshot
  }),
  buildOverview: buildAzureReportOverview,
  collectionTabs: azureExportedCollections,
  providers: [azureReportProvider]
};
