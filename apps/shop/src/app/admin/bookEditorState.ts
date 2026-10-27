// Book editor state rules that are easy to get wrong. Pure; BookEditor.tsx uses them.
import { sameValue } from "./bookStockMerge";
import { catalogPublishIssues } from "./catalogPublishReview";
import { validIsbn } from "./catalogImport";
import { metricWeightValue } from "../features/site/metricWeight";

const DERIVED_CURRENCY = ["usdPrice", "eurPrice", "usdCostPrice", "eurCostPrice", "usdSalePrice", "eurSalePrice"];

/**
 * What the "Unsaved changes" check compares. Opening a book recalculates reference-only values
 * (USD/EUR figures from the CAD price while overrides are off, the stock total of editions, the default
 * shipping profile for a book without one); those are not edits, so they are left out.
 */
export function comparableForm(form: any, opts: { defaultProfileId?: string; initialProfileId?: string } = {}): any {
  if (!form) return form;
  const out: any = { ...form };
  if (!form.manualCurrencyOverrides) {
    for (const k of DERIVED_CURRENCY) delete out[k];
    if (Array.isArray(form.variants)) out.variants = form.variants.map((v: any) => { const { usdPrice, eurPrice, ...rest } = v || {}; return rest; });
  }
  if (Array.isArray(form.variants) && form.variants.length) delete out.stockLevel;
  if (!opts.initialProfileId && (!form.shippingProfileId || form.shippingProfileId === opts.defaultProfileId)) delete out.shippingProfileId;
  return out;
}

export function editorDirty(form: any, initial: any, opts: { defaultProfileId?: string; extraDirty?: boolean } = {}): boolean {
  if (opts.extraDirty) return true;
  if (!initial) return false;
  const o = { defaultProfileId: opts.defaultProfileId, initialProfileId: initial.shippingProfileId };
  return !sameValue(comparableForm(form, o), comparableForm(initial, o));
}

/**
 * Whether saving should show the publish review: when the book becomes published, or when a published book
 * has a blocking problem or a warning it did not have when the editor opened. Routine edits of a published
 * book save directly.
 */
export function needsPublishReview(form: any, loaded: any): boolean {
  if (form?.status !== "published") return false;
  if (!loaded || loaded.status !== "published") return true;
  const now = catalogPublishIssues(form);
  if (now.some(i => i.blocking)) return true;
  const before = new Set(catalogPublishIssues(loaded).map(i => i.key));
  return now.some(i => !before.has(i.key));
}

/** A warning (never blocking) for an ISBN whose length or check digit is wrong; "" when fine or blank. */
export function isbnWarning(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.toUpperCase().replace(/[^0-9X]/g, "");
  if (![10, 13].includes(digits.length)) return "ISBNs are 10 or 13 characters long.";
  return validIsbn(digits) ? "" : "The check digit doesn't match — check for a typo. (It still saves.)";
}

/** Slug clash with another book in the loaded catalog (the URL would fall back to /books/<id>). */
export function slugClash(slug: string, id: string | undefined, catalog: any[]): string {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return "";
  const other = catalog.find(b => b.id !== id && String(b.slug || "").trim().toLowerCase() === s);
  return other ? `“${other.title || "Another book"}” already uses this web address.` : "";
}

/** The web address a title produces (lower case, letters and digits joined by dashes). */
export const slugifyTitle = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A published book's web address is frozen: shoppers, search engines and emailed links already use it, and
 * the site cannot redirect an old address. Only an explicit "Change web address" action unlocks it.
 */
export function slugLocked(stored: { status?: unknown; slug?: unknown } | null | undefined, unlocked = false): boolean {
  return !!stored && stored.status === "published" && !!String(stored.slug ?? "").trim() && !unlocked;
}

/** Whether typing a new title should also rewrite the web address (new or never-published books that follow the title). */
export function slugFollowsTitle(prev: { slug?: unknown; title?: unknown }, locked: boolean): boolean {
  if (locked) return false;
  const slug = String(prev?.slug ?? "");
  return !slug || slug === slugifyTitle(String(prev?.title ?? ""));
}

// ── Weight ───────────────────────────────────────────────────────

// Metric only. An older "1 lb" / "8 oz" value is shown as whole grams and saved that way (withMetricWeights).
export const WEIGHT_UNITS = ["g", "kg"] as const;
export type WeightUnit = typeof WEIGHT_UNITS[number];

/** "450 g" → { amount: "450", unit: "g" }; "1 lb" → { amount: "454", unit: "g" }; anything parseWeightGrams can't read is reported as `unreadable`. */
export function splitWeight(raw: unknown, fallbackUnit: WeightUnit = "g"): { amount: string; unit: WeightUnit; unreadable?: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { amount: "", unit: fallbackUnit };
  const m = text.toLowerCase().match(/^([\d.]+)\s*(kg|g|lbs?|oz)?$/);
  if (!m || !Number.isFinite(parseFloat(m[1]))) return { amount: "", unit: fallbackUnit, unreadable: text };
  if (m[2] === "oz" || m[2]?.startsWith("lb")) return { amount: String(Math.round(parseFloat(m[1]) * (m[2] === "oz" ? 28.3495 : 453.592))), unit: "g" };
  return { amount: m[1], unit: (m[2] || "g") as WeightUnit };
}

/** The stored format the shipping engines read (shippingEngine.parseWeightGrams): "450 g", "0.5 kg", "" when blank. */
export function joinWeight(amount: string, unit: WeightUnit): string {
  const n = String(amount ?? "").trim();
  if (!n || !Number.isFinite(Number(n)) || Number(n) < 0) return "";
  return `${n} ${unit}`;
}

/** The book (and its editions) with any older lb/oz weight saved as whole grams; same object when nothing changes. */
export function withMetricWeights<T extends { weight?: unknown; variants?: unknown }>(book: T): T {
  const imperial = (w: unknown) => typeof w === "string" && /(lb|oz)/i.test(w) && metricWeightValue(w) !== w.trim();
  let out: any = book;
  if (imperial(book.weight)) out = { ...out, weight: metricWeightValue(book.weight) };
  if (Array.isArray(book.variants) && book.variants.some((v: any) => imperial(v?.weight))) {
    out = { ...out, variants: book.variants.map((v: any) => (imperial(v?.weight) ? { ...v, weight: metricWeightValue(v.weight) } : v)) };
  }
  return out;
}

// ── Fill from ISBN ───────────────────────────────────────────────

export interface IsbnFacts { title?: string; contributors?: string; pageCount?: number; publisher?: string; publishDate?: string; coverUrl?: string }

const isoDate = (raw: unknown): string => {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // "May 3, 2001": a full day only (a year or month alone isn't a publication date to copy).
  if (!/[a-z]/i.test(s) || !/\b\d{1,2}\b/.test(s) || !/\d{4}/.test(s)) return "";
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Open Library `api/books?jscmd=data` response. */
export function parseOpenLibrary(json: any, isbn: string): IsbnFacts | null {
  const rec = json?.[`ISBN:${isbn}`];
  if (!rec) return null;
  return {
    title: rec.title || undefined,
    contributors: (rec.authors || []).map((a: any) => a?.name).filter(Boolean).join(", ") || undefined,
    pageCount: Number(rec.number_of_pages) > 0 ? Number(rec.number_of_pages) : undefined,
    publisher: rec.publishers?.[0]?.name || undefined,
    publishDate: isoDate(rec.publish_date) || undefined,
    coverUrl: rec.cover?.large || rec.cover?.medium || undefined,
  };
}

/** Google Books `volumes?q=isbn:` response. */
export function parseGoogleBooks(json: any): IsbnFacts | null {
  const info = json?.items?.[0]?.volumeInfo;
  if (!info) return null;
  return {
    title: [info.title, info.subtitle].filter(Boolean).join(": ") || undefined,
    contributors: (info.authors || []).join(", ") || undefined,
    pageCount: Number(info.pageCount) > 0 ? Number(info.pageCount) : undefined,
    publisher: info.publisher || undefined,
    publishDate: isoDate(info.publishedDate) || undefined,
    coverUrl: (info.imageLinks?.thumbnail || "").replace(/^http:/, "https:") || undefined,
  };
}

/** Only the empty fields get the looked-up facts; says which were filled. The cover is a suggestion, never applied. */
export function fillEmpty(form: any, facts: IsbnFacts): { patch: Record<string, any>; filled: string[] } {
  const patch: Record<string, any> = {};
  const filled: string[] = [];
  const blank = (v: any) => v === undefined || v === null || String(v).trim() === "" || v === 0;
  const put = (key: string, label: string, value: any) => { if (value !== undefined && value !== "" && blank(form?.[key])) { patch[key] = value; filled.push(label); } };
  put("title", "title", facts.title);
  put("subtitle", "contributors", facts.contributors);
  put("pageCount", "page count", facts.pageCount);
  put("publisher", "publisher", facts.publisher);
  put("publishDate", "publication date", facts.publishDate);
  return { patch, filled };
}

export async function lookupIsbn(isbn: string, fetcher: typeof fetch = fetch): Promise<IsbnFacts | null> {
  const clean = String(isbn).toUpperCase().replace(/[^0-9X]/g, "");
  if (!clean) return null;
  try {
    const r = await fetcher(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`);
    if (r.ok) { const found = parseOpenLibrary(await r.json(), clean); if (found) return found; }
  } catch { /* fall back */ }
  try {
    const r = await fetcher(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
    if (r.ok) return parseGoogleBooks(await r.json());
  } catch { /* none */ }
  return null;
}
