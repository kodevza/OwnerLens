import type { ZtaRelatedObject, ZtaReportTest } from "../../core/azure/ztaReport";
import { Badge } from "../../report/components/ui/badge";
import type { ReportFilterDescriptor, ReportObjectFieldFilterDescriptor } from "../../report/reportTypes";

export const ztaRelatedObjectFilterFields: ReportObjectFieldFilterDescriptor[] = [
  { id: "id", label: "ID" },
  { id: "object_id", label: "Object ID" },
  { id: "displayName", label: "Display name" },
  { id: "servicePrincipalId", label: "Service principal ID" },
  { id: "applicationId", label: "Application ID" },
  { id: "tags", label: "Tags" },
  { id: "userPrincipalName", label: "User principal name" }
];

export const ztaRelatedObjectFieldFilter: ReportFilterDescriptor = {
  kind: "objectFields",
  fields: ztaRelatedObjectFilterFields
};

export function RelatedObjectBadges({
  objects,
  onRelatedObjectClick
}: {
  objects: ZtaRelatedObject[];
  onRelatedObjectClick?: (relatedObject: ZtaRelatedObject) => void;
}) {
  if (objects.length === 0) {
    return "-";
  }

  return (
    <div className="flex max-w-96 flex-wrap gap-1">
      {objects.map((object) => {
        const id = getRelatedObjectId(object);
        const label = getRelatedObjectLabel(object);
        const title = getRelatedObjectTooltipTitle(object);

        if (!onRelatedObjectClick) {
          return (
            <Badge key={id} className="max-w-full font-medium" title={title} variant="outline">
              <span className="truncate">{label}</span>
            </Badge>
          );
        }

        return (
          <button
            key={id}
            aria-label={`Open related object ${label}`}
            className="inline-flex max-w-full cursor-pointer items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={title}
            type="button"
            onClick={() => onRelatedObjectClick(object)}
          >
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function getRelatedObjectSearchValues(test: Pick<ZtaReportTest, "RelatedObjects">): string[] {
  return getRelatedObjectsWithIds(test).flatMap(getRelatedObjectSearchValuesForObject);
}

export function getRelatedObjectSearchValuesForObject(object: ZtaRelatedObject): string[] {
  return [
    object.id,
    object.object_id,
    object.servicePrincipalId,
    object.applicationId,
    object.displayName,
    object.servicePrincipalType,
    object.userPrincipalName,
    ...(object.tags ?? [])
  ].filter(isNonEmptyString);
}

export function getRelatedObjectsWithIds(test: Pick<ZtaReportTest, "RelatedObjects">): ZtaRelatedObject[] {
  return (test.RelatedObjects ?? []).filter((object): object is ZtaRelatedObject & ({ id: string } | { object_id: string }) =>
    isNonEmptyString(getRelatedObjectId(object))
  );
}

export function getRelatedObjectId(object: ZtaRelatedObject): string {
  return object.id ?? object.object_id ?? "";
}

export function getRelatedObjectLabel(object: ZtaRelatedObject): string {
  return (object.displayName ?? object.userPrincipalName ?? object.servicePrincipalId ?? getRelatedObjectId(object)) || "-";
}

export function getRelatedObjectTooltipTitle(object: ZtaRelatedObject): string {
  return [
    ["id", object.id],
    ["object_id", object.object_id],
    ["servicePrincipalId", object.servicePrincipalId],
    ["tags", object.tags],
    ["applicationId", object.applicationId],
    ["displayName", object.displayName],
    ["servicePrincipalType", object.servicePrincipalType],
    ["userPrincipalName", object.userPrincipalName]
  ]
    .map(([label, value]) => `${label}: ${formatTooltipValue(value)}`)
    .join("\n");
}

function formatTooltipValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "-";
  }

  return isNonEmptyString(value) ? value : "-";
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
