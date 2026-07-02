import type { OwnershipEvidenceItem } from "../../../core/ownership/types";
import type { ReportFieldDescriptor } from "../../../report/reportTypes";
import { formatOwnershipEvidenceScope, getEvidenceStatusLabel } from "./ownershipEvidenceFormatters";

export const ownershipEvidenceFields: ReportFieldDescriptor<OwnershipEvidenceItem>[] = [
  {
    id: "ownerDisplayName",
    label: "Owner candidate",
    valueType: "text",
    getValue: (evidence) => evidence.ownerDisplayName,
    getFilterValue: (evidence) => ({
      owner: evidence.ownerDisplayName,
      type: evidence.ownerType
    }),
    filter: {
      kind: "objectFields",
      fields: [
        { id: "owner", label: "Owner candidate", filterColumnId: "ownerDisplayName" },
        {
          id: "type",
          label: "Type",
          filterColumnId: "ownerType",
          options: ["ownerUser", "ownerGroup", "ownerTag", "application", "unknown", "ownerCustom", "ownerCustomLog"]
        }
      ]
    }
  },
  {
    id: "status",
    label: "Evidence Status",
    valueType: "text",
    getValue: (evidence) => getEvidenceStatusLabel(evidence),
    filter: { kind: "multiSelect", options: ["Active", "Inactive"] }
  },
  {
    id: "confidence",
    label: "Confidence",
    valueType: "ownerConfidence",
    getValue: (evidence) => evidence.confidence,
    filter: { kind: "multiSelect", options: ["high", "medium", "low", "none"] }
  },
  {
    id: "source",
    label: "Source",
    valueType: "text",
    getValue: (evidence) => evidence.source,
    filter: {
      kind: "multiSelect",
      options: [
        "resourceGroupOwner",
        "subscriptionOwner",
        "entraServicePrincipalOwner",
        "entraApplicationOwner",
        "activity",
        "tag",
        "ownerCustom"
      ]
    }
  },
  {
    id: "path",
    label: "Path",
    valueType: "text",
    getValue: (evidence) => evidence.path,
    filter: { kind: "multiSelect", options: ["direct", "indirect"] }
  },
  {
    id: "discoverySource",
    label: "Found by",
    valueType: "text",
    getValue: (evidence) => evidence.discoverySource,
    filter: {
      kind: "multiSelect",
      options: ["azureRbac", "activityLog", "tag", "applicationOwner", "servicePrincipalOwner", "ownerCustom"]
    }
  },
  {
    id: "evidence",
    label: "Evidence",
    valueType: "text",
    getValue: (evidence) => evidence.evidence,
    filter: { kind: "text" }
  },
  {
    id: "relatedScopes",
    label: "Evidence location",
    valueType: "text",
    getValue: (evidence) => evidence.relatedScopes.map(formatOwnershipEvidenceScope).join(", "),
    filter: { kind: "text" }
  },
  {
    id: "date",
    label: "Evidence date",
    valueType: "date",
    getValue: (evidence) => evidence.date,
    filter: { kind: "text" }
  },
];
