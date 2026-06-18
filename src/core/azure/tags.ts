export type Tags = Record<string, string>;

export function buildTags(tags: readonly string[] | null | undefined): Tags {
  if (!tags) {
    return {};
  }

  return Object.fromEntries(
    tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => [tag, ""])
  );
}

export function getTagEntries(tags: Tags | null | undefined): Array<[string, string]> {
  return Object.entries(tags ?? {}).filter(([key]) => key.trim().length > 0);
}

export function getTagNames(tags: Tags | null | undefined): string[] {
  return getTagEntries(tags).map(([key]) => key);
}
