import { useCallback, useMemo, useState } from "react";

import type { AzureResourceTags, ResourceGroupOwnershipRow } from "../../core/azure/resources";
import { appConfig } from "../../core/config";
import type { OwnerConfidence } from "../../core/ownership/types";
import type { OwnerEvidence } from "../../report/types";
import { azureOwnerColumnHelp } from "./azureReportConfig";
import { exportResourceGroupsCsv, readResourceGroups, updateDisabledOwnerEvidence } from "./api";
import { EvidenceList } from "../../report/components/EvidenceList";
import { SelectableGenericTable } from "../../report/components/SelectableGenericTable";
import type { ColumnFilters, SortRule } from "../../core/collectionControls";
import { Card } from "../../report/components/ui/card";
import { getOwnerEvidenceKey, isActivityOwnerRow } from "../../report/ownerManualPrecheck";
import type { ReportColumnRenderers } from "../../report/buildCollectionColumns";
import type { ReportFieldDescriptor } from "../../report/reportTypes";
import { OwnerBadge } from "./ServicePrincipalFieldRenderers";
import { CsvSelectionActionBar } from "./CsvSelectionActionBar";

const ownerConfidenceOptions: OwnerConfidence[] = ["high", "medium", "low", "none"];
const resourceGroupOwnerSourceOptions = [
  ...appConfig.azure.ownership.ownerTags.map((tag) => `tag.${tag.name}`),
  "activity.lastModifier",
  "none"
];

const resourceGroupFields: ReportFieldDescriptor<ResourceGroupOwnershipRow>[] = [
  {
    id: "resourceGroup",
    label: "Resource group",
    valueType: "text",
    getValue: (group) => group.resourceGroup,
    getFilterValue: (group) => ({
      resourceGroup: group.resourceGroup,
      subscriptionName: group.subscriptionName,
      subscriptionId: group.subscriptionId
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "resourceGroup", label: "Resource group", filterColumnId: "resourceGroup" },
        { id: "subscriptionName", label: "Subscription", filterColumnId: "subscriptionName" },
        { id: "subscriptionId", label: "Subscription ID", filterColumnId: "subscriptionId" }
      ]
    }
  },
  {
    id: "owner",
    label: "Owner",
    valueType: "text",
    getValue: (group) => group.owner,
    getFilterValue: (group) => ({
      owner: group.owner,
      confidence: group.confidence
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner", filterColumnId: "owner" },
        { id: "confidence", label: "Confidence", filterColumnId: "confidence", options: ownerConfidenceOptions }
      ]
    }
  },
  {
    id: "source",
    label: "Source",
    valueType: "text",
    getValue: (group) => group.source,
    filter: { kind: "multiSelect", options: resourceGroupOwnerSourceOptions }
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
      resourceGroup: (group) => (
        <div>
          <div>{group.resourceGroup}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{group.subscriptionName}</div>
        </div>
      ),
      owner: (group) => <OwnerBadge confidence={group.confidence} owners={group.owner ? [group.owner] : []} />,
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
    (input: { filters: ColumnFilters; page: number; signal: AbortSignal; sortRules: SortRule[] }) =>
      readResourceGroups(input),
    [refreshToken]
  );

  return (
    <>
      {toggleError ? <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-900">{toggleError}</Card> : null}
      <SelectableGenericTable
        columnHelp={azureOwnerColumnHelp}
        emptyMessage="No resource groups match the filter."
        fieldRenderers={resourceGroupFieldRenderers}
        fields={resourceGroupFields}
        getRowKey={getResourceGroupOwnershipRowKey}
        loadPage={loadResourceGroups}
        loadingMessage="Loading resource groups..."
        minWidthClassName="min-w-[1360px]"
        renderSelectionOverlay={({ filters, selectAllMatchingFilters, selectedRowKeys, sortRules }) => (
          <CsvSelectionActionBar
            filters={filters}
            itemLabel="resource groups"
            selectAllMatchingFilters={selectAllMatchingFilters}
            selectedRowKeys={selectedRowKeys}
            sortRules={sortRules}
            onExportCsv={exportResourceGroupsCsv}
          />
        )}
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
