
/** Search the full content tree, retaining its owning section and original position. */
export function outlineMatches(section: any, query: string, label = ""): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const strings = (value: any): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(strings).join(" ");
    if (value && typeof value === "object") return Object.values(value).map(strings).join(" ");
    return "";
  };
  return `${section.label || ""} ${label} ${section.type} ${strings(section.settings)}`.toLowerCase().includes(q);
}

/** A query searches every category; category browsing narrows only an empty query. */
export function filterSettingGroups<T extends { id: string; title: string; fields: { key: string; label: string }[] }>(groups: T[], query: string, category: string | null): T[] {
  const q = query.trim().toLowerCase();
  return groups.filter(g => q || !category || g.id === category).map(g => ({ ...g,
    fields: g.fields.filter(f => !q || `${g.title} ${f.label} ${f.key}`.toLowerCase().includes(q)),
  })).filter(g => g.fields.length > 0);
}
