// Taking a product import back (13 November 2026). Pure. Every import run in Products › Import keeps a small record of
// what it did, in this browser: the drafts it added, and for each product it changed, the fields it wrote with what
// they held before. Taking it back deletes only drafts the run added that are still drafts, and puts back only fields
// that still hold what the run wrote: anything published, sold or changed since stays as it is, and the owner is told.
// Stock numbers are never put back: copies sold since the import would come back as if unsold.

export interface ImportRunChange { id: string; title: string; before: Record<string, any>; after: Record<string, any> }
export interface ImportRun {
  id: string;
  /** ISO time the run finished. */
  at: string;
  file: string;
  created: { id: string; title: string }[];
  updated: ImportRunChange[];
  /** Old shop addresses the run added to URL redirects. */
  redirects: string[];
}

export interface UndoPlan {
  remove: { id: string; title: string }[];
  restore: { id: string; title: string; patch: Record<string, any> }[];
  /** What stays, in the owner's words. */
  kept: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
/** Fields an undo never writes: live counts, and fields the save works out by itself. */
const NEVER_RESTORED = new Set(["stockLevel", "updatedAt", "createdAt"]);

/** What a field goes back to when the product had nothing there before the import. */
const blankLike = (value: unknown) => (Array.isArray(value) ? [] : typeof value === "number" ? 0 : typeof value === "boolean" ? false : "");

/** `books` = the catalog as it is now. */
export function planUndo(run: ImportRun, books: any[]): UndoPlan {
  const byId = new Map(books.map(b => [String(b.id), b]));
  const remove: UndoPlan["remove"] = [];
  const restore: UndoPlan["restore"] = [];
  let live = 0, changedSince = 0, stock = 0;
  for (const c of run.created) {
    const book = byId.get(c.id);
    if (!book) continue; // already deleted
    if ((book.status || "draft") !== "draft") { live += 1; continue; }
    remove.push({ id: c.id, title: String(book.title || c.title) });
  }
  for (const u of run.updated) {
    const book = byId.get(u.id);
    if (!book) continue;
    const patch: Record<string, any> = {};
    for (const [field, wrote] of Object.entries(u.after)) {
      if (NEVER_RESTORED.has(field)) { if (!same(u.before[field], wrote)) stock += 1; continue; }
      if (same(u.before[field], wrote)) continue;
      if (!same(book[field], wrote)) { changedSince += 1; continue; }
      patch[field] = u.before[field] === undefined || u.before[field] === null ? blankLike(wrote) : u.before[field];
    }
    if (Object.keys(patch).length) restore.push({ id: u.id, title: String(book.title || u.title), patch });
  }
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const kept: string[] = [];
  if (live) kept.push(`${n(live, "product this import added is", "products this import added are")} no longer a draft, so ${live === 1 ? "it stays" : "they stay"}.`);
  if (changedSince) kept.push(`${n(changedSince, "detail was", "details were")} changed again after the import, so ${changedSince === 1 ? "it stays" : "they stay"} as ${changedSince === 1 ? "it is" : "they are"} now.`);
  if (stock) kept.push(`Stock numbers the import set (${n(stock, "product", "products")}) stay: copies sold since would come back as unsold.`);
  return { remove, restore, kept };
}

/** True when there is nothing left to take back. */
export const nothingToUndo = (plan: UndoPlan) => !plan.remove.length && !plan.restore.length;

/** "12 new drafts and changes to 3 products". */
export function undoWords(plan: UndoPlan): string {
  const parts: string[] = [];
  if (plan.remove.length) parts.push(`${plan.remove.length} new draft${plan.remove.length === 1 ? "" : "s"}`);
  if (plan.restore.length) parts.push(`changes to ${plan.restore.length} product${plan.restore.length === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

/** The record of one run, from what was saved. `loaded` = each changed product as it was before the save. */
export function runRecord(id: string, at: string, file: string, created: { id: string; title: string }[], updated: { id: string; title: string; patch: Record<string, any>; loaded: any }[], redirects: string[]): ImportRun {
  return {
    id, at, file: file.slice(0, 120), created, redirects,
    updated: updated.map(u => ({
      id: u.id, title: u.title, after: u.patch,
      before: Object.fromEntries(Object.keys(u.patch).filter(f => u.loaded?.[f] !== undefined).map(f => [f, u.loaded[f]])),
    })),
  };
}

// ── Kept in this browser ──────────────────────────────────────────

const KEY = "lm:product-imports";
const MAX_RUNS = 5;
const MAX_BYTES = 600_000;
/** An import can be taken back for this long; after that the catalog has moved on too far for it to be safe. */
export const UNDO_DAYS = 14;

type Store = Pick<Storage, "getItem" | "setItem">;
const store = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function savedRuns(now = Date.now(), from: Store | null = store()): ImportRun[] {
  try {
    const list = JSON.parse(from?.getItem(KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter((r: any) => r && typeof r.id === "string" && Array.isArray(r.created) && Array.isArray(r.updated) && now - Date.parse(r.at) < UNDO_DAYS * 86400000);
  } catch { return []; }
}

/**
 * Keeps the newest runs. A list too large for the browser drops the oldest runs first; a single run too large on its
 * own keeps the drafts it added (the part most worth taking back) and lets its changes go.
 */
export function rememberRun(run: ImportRun, to: Store | null = store(), now = Date.now()): void {
  if (!to || (!run.created.length && !run.updated.length)) return;
  let list = [run, ...savedRuns(now, to).filter(r => r.id !== run.id)].slice(0, MAX_RUNS);
  while (list.length > 1 && JSON.stringify(list).length > MAX_BYTES) list = list.slice(0, -1);
  if (JSON.stringify(list).length > MAX_BYTES) list = [{ ...list[0], updated: [] }];
  try { to.setItem(KEY, JSON.stringify(list)); } catch { /* a full or private browser: the result screen still offers it */ }
}

export function forgetRun(id: string, to: Store | null = store(), now = Date.now()): void {
  if (!to) return;
  try { to.setItem(KEY, JSON.stringify(savedRuns(now, to).filter(r => r.id !== id))); } catch { /* nothing to do */ }
}
