// Customers › saved groups (gap list 19): the filters on the Customers page (segment, search, marketing consent, tag,
// country, sort) saved under a name, so "Toronto VIPs on the newsletter" is one click next time. Pure rules here; the
// list is kept in the admin-only `adminPrefs/customerGroups` (customerGroupsStore.ts).

export const SEGMENTS = ["all", "vip", "vip-lapsed", "returning", "new", "at-risk", "moved"] as const;
export const CONSENTS = ["all", "subscribed", "none", "opted-out"] as const;
export const SORTS = ["spent", "orders", "recent", "name"] as const;
export const MAX_GROUPS = 30;

export type GroupFilters = {
  seg: (typeof SEGMENTS)[number];
  q: string;
  consent: (typeof CONSENTS)[number];
  tag: string;
  country: string;
  sort: (typeof SORTS)[number];
};
export type CustomerGroup = GroupFilters & { id: string; name: string };

const pick = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (v as T[number]) : fallback;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export function cleanFilters(f: any): GroupFilters {
  return {
    seg: pick(SEGMENTS, f?.seg, "all"),
    q: text(f?.q, 100),
    consent: pick(CONSENTS, f?.consent, "all"),
    tag: text(f?.tag, 60),
    country: text(f?.country, 60),
    sort: pick(SORTS, f?.sort, "spent"),
  };
}

/** The saved list as read back: anything malformed is dropped, never shown. */
export function readGroups(raw: unknown): CustomerGroup[] {
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { return []; } }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: CustomerGroup[] = [];
  for (const g of list) {
    const id = text(g?.id, 40), name = text(g?.name, 60);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, ...cleanFilters(g) });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

/** A problem with the name, or null. */
export function groupNameProblem(name: string, groups: CustomerGroup[], replacing = false): string | null {
  const n = name.trim();
  if (!n) return "Give the group a name.";
  if (n.length > 60) return "Keep the name under 60 characters.";
  if (!replacing && groups.length >= MAX_GROUPS && !groups.some((g) => g.name.toLowerCase() === n.toLowerCase())) return `You can keep up to ${MAX_GROUPS} groups. Delete one first.`;
  return null;
}

/** Saves the filters under a name; the same name (any case) is updated in place rather than added twice. */
export function saveGroup(groups: CustomerGroup[], name: string, filters: GroupFilters, newId: () => string): CustomerGroup[] {
  const n = name.trim().slice(0, 60);
  const same = groups.find((g) => g.name.toLowerCase() === n.toLowerCase());
  const group = { id: same?.id || newId(), name: n, ...cleanFilters(filters) };
  return same ? groups.map((g) => (g.id === same.id ? group : g)) : [...groups, group].slice(0, MAX_GROUPS);
}

export const removeGroup = (groups: CustomerGroup[], id: string) => groups.filter((g) => g.id !== id);

/** The saved group these filters are exactly, if any (so the page can offer to delete it). */
export function matchingGroup(groups: CustomerGroup[], filters: GroupFilters): CustomerGroup | null {
  const f = cleanFilters(filters);
  return groups.find((g) => SEGMENT_KEYS.every((k) => g[k] === f[k])) || null;
}
const SEGMENT_KEYS: (keyof GroupFilters)[] = ["seg", "q", "consent", "tag", "country", "sort"];
