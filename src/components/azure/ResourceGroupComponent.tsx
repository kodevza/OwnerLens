import { useCallback, useMemo, useState } from "react";

import type { AzureResourceTags } from "../../providers/azure/domain/resources/AzureResourceGroup";
import type { ResourceGroupOwnershipRow } from "../../providers/azure/runtime/resources/resourceGroupOwnership";
import type { OwnerEvidence } from "../../report/types";
import { readResourceGroups, updateDisabledOwnerEvidence } from "./api";
import { EvidenceList } from "../../report/components/EvidenceList";
import { GenericTable } from "../../report/components/GenericTable";
import type { ColumnFilters } from "../../report/components/reportTableControls";
import { getOwnerEvidenceKey, isActivityOwnerRow } from "../../report/ownerManualPrecheck";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import type { ReportFieldDescriptor } from "../../report/reportTypes";

const resourceGroupFields: ReportFieldDescriptor<ResourceGroupOwnershipRow>[] = [
  {
    id: "resourceGroup",
    label: "Resource group",
    valueType: "text",
    getValue: (group) => group.resourceGroup,
    filter: { kind: "text" }
  },
  {
    id: "subscriptionName",
    label: "Subscription",
    valueType: "text",
    getValue: (group) => group.subscriptionName,
    filter: { kind: "text" }
  },
  {
    id: "owner",
    label: "Owner",
    valueType: "text",
    getValue: (group) => group.owner,
    filter: { kind: "text" }
  },
  {
    id: "confidence",
    label: "Confidence",
    valueType: "ownerConfidence",
    getValue: (group) => group.confidence,
    filter: { kind: "multiSelect" }
  },
  {
    id: "source",
    label: "Source",
    valueType: "text",
    getValue: (group) => group.source,
    filter: { kind: "multiSelect" }
  },
  {
    id: "evidence",
    label: "Evidence",
    valueType: "list",
    getValue: (group) => group.evidence.map((entry) => [entry.user, entry.date]),
    filter: { kind: "text" }
  },
  {
    id: "location",
    label: "Location",
    valueType: "text",
    getValue: (group) => group.location,
    filter: { kind: "multiSelect" }
  },
  {
    id: "subscriptionId",
    label: "Subscription ID",
    valueType: "text",
    getValue: (group) => group.subscriptionId,
    filter: { kind: "text" }
  },
  {
    id: "tags",
    label: "Tags",
    valueType: "text",
    getValue: (group) => formatAzureTags(group.tags),
    filter: { kind: "text" }
  }
];

export function ResourceGroupComponent() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const handleOwnerEvidenceDisabledChange = useCallback(
    async (row: ResourceGroupOwnershipRow, entry: OwnerEvidence, disabled: boolean) => {
      setToggleError(null);

      try {
        await updateDisabledOwnerEvidence({
          disabled,
          key: getOwnerEvidenceKey(row, entry)
        });
        setRefreshToken((current) => current + 1);
      } catch (error) {
        setToggleError(error instanceof Error ? error.message : "Could not update owner candidate.");
      }
    },
    []
  );
  const resourceGroupFieldRenderers = useMemo<ReportColumnRenderers<ResourceGroupOwnershipRow>>(
    () => ({
      evidence: (group) => (
        <EvidenceList
          canDisable={isActivityOwnerRow(group)}
          evidence={group.evidence}
          onDisabledChange={(entry, disabled) => {
            void handleOwnerEvidenceDisabledChange(group, entry, disabled);
          }}
        />
      )
    }),
    [handleOwnerEvidenceDisabledChange]
  );
  const loadResourceGroups = useCallback(
    (input: { filters: ColumnFilters; page: number; signal: AbortSignal }) => readResourceGroups(input),
    [refreshToken]
  );

  return (
    <>
      {toggleError ? <div className="alert">{toggleError}</div> : null}
      <GenericTable
        emptyMessage="No resource groups match the filter."
        fieldRenderers={resourceGroupFieldRenderers}
        fields={resourceGroupFields}
        getRowKey={getResourceGroupOwnershipRowKey}
        loadPage={loadResourceGroups}
        loadingMessage="Loading resource groups..."
        minWidthClassName="min-w-[1360px]"
      />
    </>
  );
}

function getResourceGroupOwnershipRowKey(row: Pick<ResourceGroupOwnershipRow, "subscriptionId" | "resourceGroup">) {
  return `${row.subscriptionId}:${row.resourceGroup}`;
}

function formatAzureTags(tags: AzureResourceTags | null): string {
  if (!tags) {
    return "";
  }

  return Object.entries(tags)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
