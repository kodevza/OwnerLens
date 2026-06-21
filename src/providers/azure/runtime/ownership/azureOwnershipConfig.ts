import { appConfig } from "../../../../core/config";
import { azureOwnerAdapter } from "./resolveAzureOwner";
import type { AzureOwnerTagConfigMap, AzureReportConfig } from "./azureOwnershipTypes";

export const azureOwnershipConfig: AzureReportConfig = {
  tags: buildOwnerTagConfigMap(appConfig.azure.ownership.ownerTags),
  ownerTargets: [
    {
      kind: "subscription",
      adapter: azureOwnerAdapter
    },
    {
      kind: "resourceGroup",
      adapter: azureOwnerAdapter
    }
  ]
};

function buildOwnerTagConfigMap(ownerTags: typeof appConfig.azure.ownership.ownerTags): AzureOwnerTagConfigMap {
  return Object.fromEntries(ownerTags.map(({ name, confidence }) => [name, { confidence }]));
}
