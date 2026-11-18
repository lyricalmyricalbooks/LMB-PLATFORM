// The kinds of things a shop sells (product types plan, change 12): sign-up's "What do you sell? Pick all that fit.",
// kept as `firstWeek/start` › `productGroups` and changed in Settings › What you sell. The "What is it?" window offers
// those groups' types first. A shop that never picked any falls back to its one-word answer (sellsGroups).
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { currentSells } from "./sells";
import { TYPE_GROUPS, sellsGroups, type TypeGroupId } from "../../shared/productTypes";

export const GROUPS_CHANGED_EVENT = "colophon:product-groups-changed";

/** The groups a first-week record says the shop sells in, in the list's order. */
export function groupsFor(doc: { productGroups?: unknown; sells?: string | null; publishes?: string | null } | null | undefined): TypeGroupId[] {
  const picked = Array.isArray(doc?.productGroups) ? doc.productGroups : [];
  const own = TYPE_GROUPS.map((g) => g.id).filter((id) => picked.includes(id));
  return own.length ? own : sellsGroups(currentSells(doc ?? null));
}

let cache: TypeGroupId[] | null = null;
let loading: Promise<TypeGroupId[] | null> | null = null;

function load(): Promise<TypeGroupId[] | null> {
  if (cache) return Promise.resolve(cache);
  loading ??= Promise.resolve()
    .then(() => adminApi.getFirstWeek())
    .then((doc) => (cache = groupsFor(doc)))
    .catch(() => { loading = null; return null; });
  return loading;
}

/** The shop's product groups; `fallback` until the record loads (or when it can't). */
export function useProductGroups(fallback: readonly TypeGroupId[]): readonly TypeGroupId[] {
  const [groups, setGroups] = useState<readonly TypeGroupId[] | null>(cache);
  useEffect(() => {
    let live = true;
    void load().then((g) => { if (live && g) setGroups(g); });
    const changed = (e: Event) => { const next = (e as CustomEvent<TypeGroupId[]>).detail; cache = next; setGroups(next); };
    window.addEventListener(GROUPS_CHANGED_EVENT, changed);
    return () => { live = false; window.removeEventListener(GROUPS_CHANGED_EVENT, changed); };
  }, []);
  return groups ?? fallback;
}

/** Saves the shop's groups and tells every open window. */
export async function saveProductGroups(groups: TypeGroupId[]): Promise<void> {
  await adminApi.updateFirstWeek({ productGroups: groups });
  cache = groups;
  window.dispatchEvent(new CustomEvent(GROUPS_CHANGED_EVENT, { detail: groups }));
}
