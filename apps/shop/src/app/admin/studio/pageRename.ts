// When a custom page's address changes (Studio › Pages › URL slug), links to the old address would quietly break:
// menu links of type "page" store the slug, and shoppers' bookmarks / search results use /page/<old>.
// Pure helpers: Studio rewrites the draft's menus and adds a URL redirect from the old address.
import { normalizePath, redirectProblem, type Redirect } from "../../features/site/redirects";

type MenuItem = { type?: string; value?: string; children?: MenuItem[]; [k: string]: any };

function renameItems(items: MenuItem[] | undefined, from: string, to: string): MenuItem[] | undefined {
  if (!Array.isArray(items)) return items;
  let changed = false;
  const next = items.map(item => {
    let out = item;
    if (item?.type === "page" && item.value === from) out = { ...out, value: to };
    const kids = renameItems(item?.children, from, to);
    if (kids !== item?.children) out = { ...out, children: kids };
    if (out !== item) changed = true;
    return out;
  });
  return changed ? next : items;
}

/** The menus with every "page" link to `from` pointing at `to`; the same object when nothing links to it. */
export function renamePageInMenus<T extends Record<string, any> | undefined>(menus: T, from: string, to: string): T {
  if (!menus || !from || !to || from === to) return menus;
  let changed = false;
  const next: Record<string, any> = {};
  for (const [key, items] of Object.entries(menus)) {
    const renamed = renameItems(items as MenuItem[], from, to);
    if (renamed !== items) changed = true;
    next[key] = renamed;
  }
  return (changed ? next : menus) as T;
}

/** How many menu links point at a page slug (for the confirmation message). */
export function menuLinksTo(menus: Record<string, any> | undefined, slug: string): number {
  const count = (items: MenuItem[] | undefined): number => (Array.isArray(items) ? items : [])
    .reduce((n, item) => n + (item?.type === "page" && item.value === slug ? 1 : 0) + count(item?.children), 0);
  return Object.values(menus || {}).reduce((n: number, items) => n + count(items as MenuItem[]), 0);
}

/**
 * The redirect list after a page moved from /page/<from> to /page/<to>: old links forward to the new address,
 * redirects that ended at the old address now end at the new one (no chains), and a redirect away from the new
 * address is dropped (the page lives there now). Null when nothing needs saving.
 */
export function redirectsAfterRename(list: Redirect[], from: string, to: string): Redirect[] | null {
  if (!from || !to || from === to) return null;
  const oldPath = normalizePath(`/page/${from}`), newPath = `/page/${to}`;
  let next = list
    .filter(r => normalizePath(r.from) !== normalizePath(newPath))
    .map(r => normalizePath(r.to) === oldPath ? { ...r, to: newPath } : r)
    .filter(r => normalizePath(r.from) !== normalizePath(r.to));
  const others = next.filter(r => normalizePath(r.from) !== oldPath);
  const add = { from: oldPath, to: newPath };
  if (!redirectProblem(add, others)) next = [...others, add];
  const same = next.length === list.length && next.every((r, i) => r.from === list[i].from && r.to === list[i].to);
  return same ? null : next;
}
