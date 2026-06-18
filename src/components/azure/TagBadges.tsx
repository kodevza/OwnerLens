import type { Tags } from "../../core/azure/tags";
import { getTagEntries } from "../../core/azure/tags";
import { appConfig } from "../../core/config";
import { formatValue } from "../../lib/utils";
import { Badge } from "../../report/components/ui/badge";
import type { BadgeProps } from "../../report/components/ui/badge";

const ownerTagNames = new Set(appConfig.azure.ownership.ownerTags.map((tag) => tag.name.toLowerCase()));

type TagBadgeValue = string[] | Tags | null | undefined;

export function TagBadges({ tags }: { tags: TagBadgeValue }) {
  const visibleTags = normalizeTags(tags);

  if (visibleTags.length === 0) {
    return formatValue(null);
  }

  return (
    <div className="flex max-w-96 flex-wrap gap-1">
      {visibleTags.map((tag) => (
        <Badge key={tag} className="max-w-full font-medium" title={tag} variant={getTagBadgeVariant(tag)}>
          <span className="truncate">{tag}</span>
        </Badge>
      ))}
    </div>
  );
}

function normalizeTags(tags: TagBadgeValue): string[] {
  if (!tags) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }

  return getTagEntries(tags)
    .map(([key, value]) => formatTag(key, value))
    .filter((tag) => tag !== ":");
}

function formatTag(key: string, value: string): string {
  const tagName = key.trim();
  const tagValue = value.trim();
  return tagValue.length > 0 ? `${tagName}:${tagValue}` : tagName;
}

function getTagBadgeVariant(tag: string): BadgeProps["variant"] {
  return ownerTagNames.has(getTagName(tag).toLowerCase()) ? "high" : "none";
}

function getTagName(tag: string): string {
  return tag.split(":", 1)[0].trim();
}
