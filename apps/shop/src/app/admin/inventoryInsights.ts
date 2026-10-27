// Inventory rules for the admin Inventory page. Pure (no Firestore): which rows a book gets
// (one per edition), how each row's stock is classified, how a count change is applied to the
// live book without undoing a sale made meanwhile, and the shared low-stock threshold.
import { isDigitalBook } from "./overview/overviewInsights";
import { bundleAvailable, isBundle, isGiftCardProduct } from "../features/site/promotions";

export type StockStatus = "out" | "low" | "reprint" | "ok" | "digital" | "untracked" | "bundle" | "giftCard";
/** What kind of row: a shelf count the owner edits, or something whose stock isn't counted here. */
export type RowKind = "stock" | "digital" | "untracked" | "bundle" | "giftCard";

export interface InventoryRow {
  /** Unique row key: the book id, or `<bookId>::<variantId>` for an edition. */
  id: string;
  bookId: string;
  variantId: string | null;
  title: string;
  /** Edition name for a variant row ("" for a book without editions). */
  edition: string;
  format: string;
  kind: RowKind;
  /** Shelf count for "stock" rows; sets available from parts for box sets (null = unlimited); 0 otherwise. */
  stock: number;
  bundleSets?: number | null;
  price: number; value: number;
  sold30: number; coverDays: number | null; status: StockStatus;
  digital: boolean; editable: boolean; backorder: boolean;
  archived: boolean; draft: boolean;
  shelfLocation: string;
  book: any;
}

export const DEFAULT_LOW_STOCK = 5;
export const STATUS_LABELS: Record<StockStatus, string> = {
  out: "Out of stock", low: "Low stock", reprint: "Reprint soon", ok: "In stock", digital: "Digital",
  untracked: "Not tracked", bundle: "Box set", giftCard: "Gift card",
};

/**
 * The shop's low-stock line, shared by Inventory, Overview and the book editor:
 * `settings.inventory.lowStockThreshold` (Inventory › "Low-stock at or below"), else 5.
 */
export function lowStockThreshold(settings: any): number {
  const raw = settings?.inventory?.lowStockThreshold;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.floor(n) : DEFAULT_LOW_STOCK;
}

export const rowKey = (bookId: string, variantId?: string | null) => (variantId ? `${bookId}::${variantId}` : bookId);

const DIGITAL_RE = /e-?book|epub|pdf|audiobook|digital/i;
const count = (v: any) => Math.max(0, Math.floor(Number(v) || 0));
/** A variant's stock, read the way the server does (stockLevel first, then stock). */
export const variantStock = (v: any) => count(v?.stockLevel !== undefined ? v.stockLevel : v?.stock);
const variantsOf = (b: any): any[] => (Array.isArray(b?.variants) ? b.variants.filter((v: any) => v && v.id) : []);
const isDigitalVariant = (b: any, v: any) => v?.digital === true || (v?.format ? DIGITAL_RE.test(String(v.format)) : isDigitalBook(b));

/** How a book (or one of its editions) is stocked. The server only counts stock when `trackInventory` is on. */
export function kindOf(book: any, variant?: any): RowKind {
  if (isGiftCardProduct(book)) return "giftCard";
  if (isBundle(book)) return "bundle";
  if (variant ? isDigitalVariant(book, variant) : isDigitalBook(book)) return "digital";
  if (!book?.trackInventory) return "untracked";
  return "stock";
}

export function statusOf(stock: number, coverDays: number | null, threshold: number, kind: RowKind | boolean): StockStatus {
  const k: RowKind = kind === true ? "digital" : kind === false ? "stock" : kind;
  if (k !== "stock") return k;
  if (stock <= 0) return "out";
  if (stock <= threshold) return "low";
  if (coverDays !== null && coverDays <= 30) return "reprint";
  return "ok";
}

const DAY = 86_400_000;
const timeOf = (v: any) => {
  const t = v?.toDate ? v.toDate().getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** Copies sold in the last 30 days per row key (box-set lines count as the books inside them). */
export function soldLast30(paidOrders: any[], now = Date.now()): Map<string, number> {
  const out = new Map<string, number>();
  const add = (id: any, variantId: any, qty: number) => {
    if (!id || qty <= 0) return;
    const key = rowKey(String(id), variantId ? String(variantId) : null);
    out.set(key, (out.get(key) || 0) + qty);
  };
  for (const o of paidOrders || []) {
    if (now - timeOf(o?.createdAt) > 30 * DAY) continue;
    for (const item of o?.items || []) {
      if (!item) continue;
      const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
      if (Array.isArray(item.components) && item.components.length) {
        for (const part of item.components) add(part?.id, part?.variantId, qty * Math.max(1, Math.floor(Number(part?.quantity) || 1)));
      } else add(item.id, item.variantId, qty);
    }
  }
  return out;
}

/** One row per book, or per edition when the book is sold in editions. Drafts/archived are flagged, not dropped. */
export function buildInventory(books: any[], paidOrders: any[], threshold = DEFAULT_LOW_STOCK, now = Date.now()): InventoryRow[] {
  const sold = soldLast30(paidOrders, now);
  const byId = new Map((books || []).map((b) => [b?.id, b]));
  const rows: InventoryRow[] = [];
  for (const b of books || []) {
    if (!b?.id) continue;
    const base = {
      bookId: b.id, title: b.title || "Untitled", archived: b.status === "archived", draft: b.status === "draft",
      backorder: b.allowBackorder === true, book: b,
    };
    const bookPrice = Number(b.retailPrice ?? b.price) || 0;
    const make = (variant: any | null): InventoryRow => {
      const kind = kindOf(b, variant || undefined);
      const id = rowKey(b.id, variant?.id || null);
      const s30 = sold.get(id) || 0;
      let stock = 0;
      let bundleSets: number | null | undefined;
      if (kind === "stock") stock = variant ? variantStock(variant) : count(b.stockLevel);
      if (kind === "bundle") {
        const sets = bundleAvailable(b, (bid: string) => byId.get(bid));
        bundleSets = Number.isFinite(sets) ? Math.max(0, sets) : null;
      }
      const coverDays = kind === "stock" && s30 > 0 ? Math.floor(stock / (s30 / 30)) : null;
      const price = variant ? Number(variant.price) || bookPrice : bookPrice;
      return {
        ...base, id, variantId: variant?.id || null, edition: variant ? String(variant.name || variant.format || "Edition") : "",
        format: String(variant?.format || b.format || ""), kind, stock, bundleSets, price,
        value: kind === "stock" ? stock * price : 0, sold30: s30, coverDays,
        status: statusOf(stock, coverDays, threshold, kind), digital: kind === "digital", editable: kind === "stock",
        shelfLocation: String(variant?.shelfLocation || b.shelfLocation || "").trim(),
      };
    };
    const variants = variantsOf(b);
    // Box sets and gift cards are one row: their "editions" are amounts or parts, never shelf counts.
    if (variants.length && !isGiftCardProduct(b) && !isBundle(b)) variants.forEach((v) => rows.push(make(v)));
    else rows.push(make(null));
  }
  return rows;
}

export function inventorySummary(rows: InventoryRow[], costs: Record<string, number> = {}) {
  const counted = rows.filter((r) => r.kind === "stock");
  const atCost = counted.reduce((s, r) => s + (costs[r.bookId] > 0 ? r.stock * costs[r.bookId] : 0), 0);
  return {
    units: counted.reduce((s, r) => s + r.stock, 0),
    value: counted.reduce((s, r) => s + r.value, 0),
    costValue: atCost,
    costedRows: counted.filter((r) => costs[r.bookId] > 0).length,
    countedRows: counted.length,
    out: rows.filter((r) => r.status === "out").length,
    low: rows.filter((r) => r.status === "low").length,
    reprint: rows.filter((r) => r.status === "reprint").length,
  };
}

/** Clamp a manual stock edit to a whole number >= 0; null when the input isn't a number. */
export function parseStock(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n) || String(input).trim() === "") return null;
  return Math.max(0, Math.round(n));
}

/** A receiving entry: "+12" / "12" adds, "-3" removes, "=40" sets the count. null when unreadable or zero. */
export function parseReceive(input: string): StockChange | null {
  const s = String(input || "").trim().replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("=")) {
    const to = parseStock(s.slice(1));
    return to === null ? null : { kind: "set", to, expected: NaN };
  }
  const n = Number(s);
  if (!Number.isFinite(n) || Math.round(n) === 0) return null;
  return { kind: "delta", delta: Math.round(n) };
}

/** Optional cost price (CAD per copy): blank clears (null), otherwise a non-negative number with cents. */
export function parseCost(input: string): number | null | undefined {
  const s = String(input ?? "").trim().replace(/^ca\$|^\$/i, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return undefined;
  return Math.round(n * 100) / 100;
}

// ── Applying a count change to the live book ─────────────────────────

/**
 * - delta: add/remove copies relative to whatever is live now (−/+ buttons, receiving, undo),
 *   so a sale made since the page loaded is kept.
 * - set: the owner typed a count. `expected` is the count they were looking at; if the live
 *   count differs (a sale?), the change is refused unless `force` (the owner confirmed).
 */
export type StockChange = { kind: "delta"; delta: number } | { kind: "set"; to: number; expected: number };

export type StockPlan =
  | { ok: true; from: number; to: number; patch: Record<string, any> }
  | { ok: false; reason: "missing" | "not-counted" | "conflict"; live?: number };

/** The live shelf count of a book or one of its editions; null when that edition no longer exists. */
export function liveStockOf(book: any, variantId: string | null): number | null {
  if (!book) return null;
  if (!variantId) return count(book.stockLevel);
  const v = variantsOf(book).find((x) => x.id === variantId);
  return v ? variantStock(v) : null;
}

/** Pure: what to write for a change against the live book. Writes only the stock field(s). */
export function planStockChange(live: any, variantId: string | null, change: StockChange, opts: { force?: boolean } = {}): StockPlan {
  if (!live) return { ok: false, reason: "missing" };
  const variant = variantId ? variantsOf(live).find((x) => x.id === variantId) : undefined;
  if (variantId && !variant) return { ok: false, reason: "missing" };
  if (kindOf(live, variant) !== "stock") return { ok: false, reason: "not-counted" };
  const from = liveStockOf(live, variantId) as number;
  let to: number;
  if (change.kind === "delta") to = Math.max(0, from + Math.round(change.delta));
  else {
    to = Math.max(0, Math.round(change.to));
    if (Number.isFinite(change.expected) && change.expected !== from && !opts.force) return { ok: false, reason: "conflict", live: from };
  }
  // The server writes both fields on an edition (functions/inventory.js); do the same.
  const patch = variantId
    ? { variants: (live.variants || []).map((v: any) => (v && v.id === variantId ? { ...v, stockLevel: to, stock: to } : v)) }
    : { stockLevel: to };
  return { ok: true, from, to, patch };
}

/** Does this change wake back-in-stock emails (onBookRestocked: 0 → available on a published book)? */
export const wakesRestockEmails = (book: any, from: number, to: number) =>
  from <= 0 && to > 0 && (!book?.status || book.status === "published") && book?.isTest !== true;

/** Readers waiting for this book/edition (stockAlerts rows the server would email). */
export function waitingReaders(alerts: any[], variantId: string | null): number {
  const emails = new Set<string>();
  for (const a of alerts || []) {
    if (!a || a.status !== "waiting") continue;
    if (String(a.variantId || "") !== String(variantId || "")) continue;
    emails.add(String(a.email || "").trim().toLowerCase());
  }
  return emails.size;
}

export const ADJUST_REASONS = ["Received", "Reprint", "Damaged", "Count correction", "Other"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number] | "Undo";

export function inventoryToCsv(rows: InventoryRow[]): string {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@\t\r])/, "'$1")}"`;
  const head = ["Title", "Edition", "Format", "Status", "On hand", "Shelf", "Price", "Stock value", "Sold (30d)", "Days of cover"];
  return [head.map(cell).join(","), ...rows.map((r) => [
    r.title, r.edition, r.format, STATUS_LABELS[r.status], r.kind === "stock" ? r.stock : r.kind === "bundle" ? (r.bundleSets ?? "") : "",
    r.shelfLocation, r.price.toFixed(2), r.value.toFixed(2), r.sold30, r.coverDays ?? "",
  ].map(cell).join(","))].join("\n");
}
