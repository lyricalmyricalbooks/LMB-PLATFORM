/**
 * Saving a book must not put back a stock count the editor loaded earlier: a sale (the
 * Stripe webhook, functions/inventory.js) may have lowered it since. Stock the owner did
 * not change in the editor keeps the live value; stock the owner did change is saved as typed.
 * Pure; used by adminApi.updateBook.
 */
const variantStock = (v: any) => (v?.stockLevel !== undefined ? v.stockLevel : v?.stock);

export function keepLiveStock(form: any, initial: any, live: any): any {
  if (!form || !initial || !live) return form;
  const out = { ...form };
  if (sameNumber(form.stockLevel, initial.stockLevel) && live.stockLevel !== undefined) out.stockLevel = live.stockLevel;
  if (Array.isArray(form.variants)) {
    const before = new Map((initial.variants || []).map((v: any) => [v?.id, v]));
    const now = new Map((live.variants || []).map((v: any) => [v?.id, v]));
    out.variants = form.variants.map((v: any) => {
      const was: any = before.get(v?.id);
      const current: any = now.get(v?.id);
      if (!v?.id || !was || !current) return v;
      if (!sameNumber(variantStock(v), variantStock(was))) return v;
      const liveStock = variantStock(current);
      if (liveStock === undefined) return v;
      return { ...v, stock: liveStock, stockLevel: liveStock };
    });
  }
  return out;
}

/**
 * What a book save should write: only the fields the owner actually changed in the editor
 * (form differs from the snapshot it loaded, compared deeply), with stock merged through
 * keepLiveStock. Fields nobody touched keep whatever is live now, so a save never undoes a
 * change made elsewhere (another tab, the catalog list, an import, a sale) while the editor
 * was open. Pure; used by adminApi.updateBook.
 */
export function changedBookFields(form: any, initial: any, live: any): Record<string, any> {
  const merged = keepLiveStock(form, initial, live) || {};
  const out: Record<string, any> = {};
  for (const key of Object.keys(merged)) {
    if (key === "id" || key === "_lastDoc") continue;
    if (!sameValue(form?.[key], initial?.[key])) out[key] = merged[key];
  }
  // The editor shows defaults (Draft, tracked, taxed) for a flag the stored book never had, so the form
  // looks unchanged. Write what the editor showed once, otherwise the shop keeps behaving differently
  // from the screen (a missing trackInventory means untracked on the server). Only when truly missing now.
  if (live) {
    for (const key of WRITE_ONCE_DEFAULTS) {
      if (live[key] === undefined && form?.[key] !== undefined && !(key in out)) out[key] = merged[key];
    }
  }
  // A book sold in editions: its own count is the sum of the editions, worked out here from the merged
  // live editions. The editor's own sum is built from the stock it loaded, so it must never be written.
  if (Array.isArray(merged.variants) && merged.variants.length) {
    if ("variants" in out) out.stockLevel = merged.variants.reduce((n: number, v: any) => n + (Number(variantStock(v)) || 0), 0);
    else delete out.stockLevel;
  }
  return out;
}

/** Flags the editor displays with a default when the stored book has none (see changedBookFields). */
export const WRITE_ONCE_DEFAULTS = ["status", "trackInventory", "chargeTax", "allowBackorder"] as const;

/** Never removed by a save even when the form no longer carries them. */
const KEEP_KEYS = new Set(["id", "_lastDoc", "createdAt", "updatedAt"]);

/**
 * Fields the owner took away in the editor (they were on the book when it opened and are gone from the form,
 * e.g. switching a gift card back to a book drops productType). Writes only ever add or change keys, so these
 * must be deleted explicitly or the old value silently stays. Pure; used by adminApi.updateBook.
 */
export function removedBookFields(form: any, initial: any): string[] {
  if (!form || !initial) return [];
  return Object.keys(initial).filter((key) => !KEEP_KEYS.has(key) && initial[key] != null && !Object.prototype.hasOwnProperty.call(form, key));
}

/** Deep equality for plain book data (arrays, objects, dates); missing and null/undefined match. */
export function sameValue(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => sameValue(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    if (typeof a.isEqual === "function" && Object.getPrototypeOf(a) === Object.getPrototypeOf(b)) return a.isEqual(b);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!sameValue(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function sameNumber(a: any, b: any): boolean {
  return (a ?? null) === (b ?? null) || (a !== "" && b !== "" && a != null && b != null && Number(a) === Number(b));
}

/**
 * Books matched to the inventory app are counted there (Inventory › Inventory app link): a save from any
 * screen (editor, catalog table, CSV import) keeps their live stock and never writes a typed count.
 * `links` is systemStatus/inventoryLink.links. Pure; used inside adminApi.updateBook's transaction.
 */
export function lockLinkedStock(changes: Record<string, any>, live: any, links: Record<string, Record<string, string>> | null | undefined, bookId: string): Record<string, any> {
  const entry = links?.[bookId];
  if (!entry || !live) return changes;
  const out = { ...changes };
  if ("stockLevel" in out && entry["_"]) {
    if (live.stockLevel === undefined) delete out.stockLevel; else out.stockLevel = live.stockLevel;
  }
  if (Array.isArray(out.variants)) {
    const now = new Map((Array.isArray(live.variants) ? live.variants : []).map((v: any) => [v?.id, v]));
    out.variants = out.variants.map((v: any) => {
      if (!v?.id || !entry[v.id]) return v;
      const current: any = now.get(v.id);
      if (!current) return v;
      const stock = variantStock(current);
      return stock === undefined ? v : { ...v, stock, stockLevel: stock };
    });
    // The book's own count of an edition book is the editions' sum (changedBookFields).
    if (out.variants.length && "stockLevel" in out) out.stockLevel = out.variants.reduce((n: number, v: any) => n + (Number(variantStock(v)) || 0), 0);
  }
  return out;
}

