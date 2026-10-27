// Books › edit: scheduled sales, paid add-ons, box sets and gift-card products. Pure, tested.
// The server (functions/shared/promotions.js) is the authority for prices and stock; these helpers
// only mirror its rules so the editor can explain what shoppers will see before saving.
import { shopDate } from "../features/site/preorder";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateOf = (value: unknown) => {
  const text = String(value || "").slice(0, 10);
  return DATE_ONLY.test(text) ? text : "";
};

// ── Scheduled sales ────────────────────────────────────────────────
export type SaleStatus = "off" | "scheduled" | "on" | "ended";

/** Same rule as promotions.saleWindowOpen: Toronto shop dates, both ends inclusive, blank = no limit. */
export function saleWindowOpen(book: any, now: Date = new Date()): boolean {
  const today = shopDate(now);
  const start = dateOf(book?.saleStartsAt);
  const end = dateOf(book?.saleEndsAt);
  if (start && start > today) return false;
  if (end && end < today) return false;
  return true;
}

/** What the "Sale pricing" card says about the sale right now. */
export function saleStatus(book: any, now: Date = new Date()): SaleStatus {
  if (!book?.isOnSale || !(Number(book.salePrice) > 0)) return "off";
  const today = shopDate(now);
  const start = dateOf(book.saleStartsAt);
  const end = dateOf(book.saleEndsAt);
  if (start && start > today) return "scheduled";
  if (end && end < today) return "ended";
  return "on";
}

export function saleWindowProblem(book: any): string {
  const start = dateOf(book?.saleStartsAt);
  const end = dateOf(book?.saleEndsAt);
  if (start && end && end < start) return "The sale's end date must be on or after its start date.";
  return "";
}

// ── Paid add-ons ───────────────────────────────────────────────────
export const MAX_ADD_ONS = 6;
export type AddOn = { id: string; label: string; price: number | ""; kind: "option" | "text"; maxLength?: number; enabled?: boolean };

const randomId = () => {
  try { return crypto.randomUUID().slice(0, 8); } catch { return Math.random().toString(36).slice(2, 10); }
};
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "extra";

export const ADD_ON_PRESETS: Array<{ key: string; label: string; price: number; kind: "option" | "text"; maxLength?: number }> = [
  { key: "signed", label: "Signed copy", price: 5, kind: "option" },
  { key: "inscription", label: "Personal inscription", price: 10, kind: "text", maxLength: 120 },
  { key: "giftwrap", label: "Gift wrap", price: 4, kind: "option" },
];

/** A new add-on with a stable, unique id (kept forever so old orders still match). */
export function newAddOn(preset?: { label: string; price: number; kind: "option" | "text"; maxLength?: number }): AddOn {
  const label = preset?.label || "";
  const kind = preset?.kind || "option";
  return {
    id: `${slug(label)}-${randomId()}`,
    label,
    price: preset ? preset.price : "",
    kind,
    ...(kind === "text" ? { maxLength: preset?.maxLength || 120 } : {}),
    enabled: true,
  };
}

export function addOnProblems(addOns: any[]): string[] {
  const problems: string[] = [];
  const list = Array.isArray(addOns) ? addOns : [];
  if (list.length > MAX_ADD_ONS) problems.push(`A book can have at most ${MAX_ADD_ONS} add-ons.`);
  list.forEach((addOn, i) => {
    const name = String(addOn?.label || "").trim() || `Add-on ${i + 1}`;
    if (!String(addOn?.label || "").trim()) problems.push(`Add-on ${i + 1} needs a name shoppers will see.`);
    const price = addOn?.price;
    if (price === "" || price == null || !Number.isFinite(Number(price)) || Number(price) < 0) problems.push(`“${name}” needs a price (0 or more).`);
    if (addOn?.kind === "text") {
      const max = Number(addOn.maxLength);
      if (!Number.isInteger(max) || max < 1 || max > 300) problems.push(`“${name}”: the message length must be a whole number from 1 to 300.`);
    }
  });
  return problems;
}

/** Clean add-ons for saving: numbers as numbers, unused fields dropped. */
export function cleanAddOns(addOns: any[]): any[] {
  return (Array.isArray(addOns) ? addOns : []).slice(0, MAX_ADD_ONS).map((a) => ({
    id: String(a.id),
    label: String(a.label || "").trim().slice(0, 80),
    price: Math.round((Number(a.price) || 0) * 100) / 100,
    kind: a.kind === "text" ? "text" : "option",
    ...(a.kind === "text" ? { maxLength: Math.max(1, Math.min(300, Math.floor(Number(a.maxLength) || 120))) } : {}),
    enabled: a.enabled !== false,
  }));
}

// ── Box sets ───────────────────────────────────────────────────────
export const MAX_BUNDLE_PARTS = 20;
export type BundleItem = { bookId: string; variantId?: string | null; quantity: number };

export const isGiftCardProduct = (book: any) => !!book && book.productType === "giftCard";
export const isBoxSet = (book: any) => Array.isArray(book?.bundleItems) && book.bundleItems.some((p: any) => p && p.bookId);

/** Why a catalog book can't go inside this box set, or "" when it can. */
export function bundlePartProblem(candidate: any, selfId?: string | null): string {
  if (!candidate) return "That book is no longer in the catalog.";
  if (selfId && candidate.id === selfId) return "A box set can't contain itself.";
  if (isGiftCardProduct(candidate)) return "Gift cards can't go in a box set.";
  if (isBoxSet(candidate)) return "A box set can't contain another box set.";
  return "";
}

function partStock(book: any, variantId?: string | null): number {
  if (!book) return 0;
  if (book.trackInventory !== true || book.allowBackorder === true) return Infinity;
  if (variantId) {
    const variant = (book.variants || []).find((v: any) => v && v.id === variantId);
    return variant ? Math.max(0, Number(variant.stock ?? variant.stockLevel) || 0) : 0;
  }
  return Math.max(0, Number(book.stockLevel) || 0);
}

/** Same rule as promotions.bundleAvailable: sets sellable from the books' stock (Infinity = no part tracks stock). */
export function bundleAvailable(book: any, getBook: (id: string) => any): number {
  let sets = Infinity;
  for (const raw of (Array.isArray(book?.bundleItems) ? book.bundleItems : []).slice(0, MAX_BUNDLE_PARTS)) {
    if (!raw || typeof raw.bookId !== "string" || !raw.bookId) continue;
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
    const variantId = typeof raw.variantId === "string" && raw.variantId ? raw.variantId : null;
    sets = Math.min(sets, Math.floor(partStock(getBook(raw.bookId), variantId) / quantity));
  }
  return sets;
}

export function bundleProblems(book: any, getBook: (id: string) => any): string[] {
  const problems: string[] = [];
  const parts = Array.isArray(book?.bundleItems) ? book.bundleItems : [];
  if (parts.length > MAX_BUNDLE_PARTS) problems.push(`A box set can hold at most ${MAX_BUNDLE_PARTS} different books.`);
  parts.forEach((part: any, i: number) => {
    const candidate = getBook(part?.bookId);
    const title = candidate?.title || `Book ${i + 1}`;
    const why = candidate ? bundlePartProblem(candidate, book?.id) : "";
    if (why) problems.push(`${title}: ${why}`);
    const q = Number(part?.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 20) problems.push(`${title}: the quantity must be a whole number from 1 to 20.`);
    if (candidate && (candidate.variants || []).length && !part?.variantId) problems.push(`${title} is sold in editions: choose which edition goes in the set.`);
  });
  return problems;
}

// ── Gift-card products ─────────────────────────────────────────────
export function giftCardProblems(book: any): string[] {
  const amounts = Array.isArray(book?.variants) ? book.variants : [];
  if (!amounts.length) return ["A gift card needs at least one amount. Add one on the Amounts tab (e.g. CA$25)."];
  return amounts
    .filter((v: any) => !(Number(v?.price) > 0))
    .map((v: any, i: number) => `Gift card amount ${v?.name || i + 1} must be more than $0.`);
}

/**
 * The book as it should be saved: gift cards are digital, untracked and never carry add-ons or
 * box-set parts; box sets have no stock of their own and no add-ons (the server ignores them anyway).
 */
export function productForSave(form: any): any {
  const out = { ...form };
  if (isGiftCardProduct(out)) {
    out.trackInventory = false;
    out.allowBackorder = false;
    out.preorder = false;
    out.chargeTax = false;
    out.isOnSale = false;
    out.addOns = [];
    out.bundleItems = [];
    out.variants = (out.variants || []).map((v: any) => ({ ...v, digital: true, stock: 0, stockLevel: 0 }));
    return out;
  }
  if (out.productType !== "giftCard") delete out.productType;
  if (isBoxSet(out)) {
    out.trackInventory = false;
    out.allowBackorder = false;
    out.addOns = [];
    out.bundleItems = out.bundleItems
      .filter((p: any) => p && p.bookId)
      .slice(0, MAX_BUNDLE_PARTS)
      .map((p: any) => ({ bookId: p.bookId, variantId: p.variantId || null, quantity: Math.max(1, Math.min(20, Math.floor(Number(p.quantity) || 1))) }));
  } else {
    out.bundleItems = [];
    out.addOns = cleanAddOns(out.addOns || []);
  }
  out.saleStartsAt = dateOf(out.saleStartsAt);
  out.saleEndsAt = dateOf(out.saleEndsAt);
  return out;
}
