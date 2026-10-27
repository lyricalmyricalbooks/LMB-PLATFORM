// Catalog merchandising rules, one copy for the shop and the server (src/shared/CLAUDE.md): scheduled
// sale windows, paid add-ons (signed copy, inscription, gift wrap), box sets / bundles and gift-card
// products. The server prices from its generated copy (functions/shared/promotions.js) with catalog data
// it read itself; the shop uses the same rules to decide what shoppers see.
import { shopDate } from "./preorder";
import { parseWeightGrams } from "./weightGrams";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A line option the catalog refuses. `message` mirrors the server; shoppers see Text & labels copy chosen by `code`. */
export class PromotionProblem extends Error {
  code: "addon_gone" | "addon_text_missing" | "gift_email";
  values: Record<string, string>;
  constructor(code: PromotionProblem["code"], message: string, values: Record<string, string> = {}) {
    super(message);
    this.name = "PromotionProblem";
    this.code = code;
    this.values = values;
  }
}

export type BookAddOn = { id: string; label: string; price: number; kind: "option" | "text"; maxLength?: number };
export type PickedAddOn = { id: string; label: string; price: number; text?: string };
export type BundlePart = { id: string; variantId: string | null; quantity: number };
export type GiftCardDetails = { recipientName: string; recipientEmail: string; senderName: string; message: string };

// ── Scheduled sales ────────────────────────────────────────────────
/** Books › edit › Pricing "Sale starts" / "Sale ends": Toronto shop dates, both inclusive; blank = open. */
export function saleWindowOpen(book: any, now: Date = new Date()): boolean {
  const today = shopDate(now);
  const start = String((book && book.saleStartsAt) || "").slice(0, 10);
  const end = String((book && book.saleEndsAt) || "").slice(0, 10);
  if (DATE_ONLY.test(start) && start > today) return false;
  if (DATE_ONLY.test(end) && end < today) return false;
  return true;
}

/** The sale price is charged only when this is true (functions/catalogPrice.js). */
export function saleActive(book: any, now: Date = new Date()): boolean {
  return !!book && !!book.isOnSale && Number(book.salePrice) > 0 && saleWindowOpen(book, now);
}

/** The sale's last day (YYYY-MM-DD) while a dated sale is on, else "". */
export function saleEndDate(book: any, now: Date = new Date()): string {
  if (!saleActive(book, now)) return "";
  const end = String(book.saleEndsAt || "").slice(0, 10);
  return DATE_ONLY.test(end) ? end : "";
}

// ── Paid add-ons ───────────────────────────────────────────────────
export const MAX_ADD_ONS = 6;

export function bookAddOns(book: any): BookAddOn[] {
  if (!book || isGiftCardProduct(book) || isBundle(book)) return [];
  const seen = new Set<string>();
  const out: BookAddOn[] = [];
  for (const raw of Array.isArray(book.addOns) ? book.addOns : []) {
    if (!raw || typeof raw.id !== "string" || !raw.id || seen.has(raw.id)) continue;
    const label = String(raw.label || "").trim().slice(0, 80);
    const price = Number(raw.price);
    if (!label || !Number.isFinite(price) || price < 0 || raw.enabled === false) continue;
    seen.add(raw.id);
    const kind = raw.kind === "text" ? "text" : "option";
    const maxLength = Math.max(1, Math.min(300, Math.floor(Number(raw.maxLength) || 120)));
    out.push({ id: raw.id.slice(0, 60), label, price: Math.round(price * 100) / 100, kind, ...(kind === "text" ? { maxLength } : {}) });
    if (out.length >= MAX_ADD_ONS) break;
  }
  return out;
}

/**
 * The add-ons picked for one line, checked against the catalog (same rule as the server).
 * Throws for an add-on that no longer exists or a missing inscription. `price` is per copy.
 */
export function addOnSelection(book: any, requested: any): { addOns: PickedAddOn[]; price: number } {
  const picked = Array.isArray(requested) ? requested : [];
  if (!picked.length) return { addOns: [], price: 0 };
  const offered = new Map(bookAddOns(book).map((addOn) => [addOn.id, addOn]));
  const seen = new Set<string>();
  const addOns: PickedAddOn[] = [];
  for (const choice of picked.slice(0, MAX_ADD_ONS)) {
    const id = choice && typeof choice.id === "string" ? choice.id : "";
    if (!id || seen.has(id)) continue;
    const addOn = offered.get(id);
    if (!addOn) throw new PromotionProblem("addon_gone", `An extra you picked for "${(book && book.title) || "this book"}" is no longer offered. Please remove the book and add it again.`, { id });
    seen.add(id);
    if (addOn.kind === "text") {
      const text = String((choice && choice.text) || "").replace(/\s+/g, " ").trim().slice(0, addOn.maxLength);
      if (!text) throw new PromotionProblem("addon_text_missing", `Add the wording for "${addOn.label}" on "${(book && book.title) || "this book"}".`, { id, label: addOn.label });
      addOns.push({ id, label: addOn.label, price: addOn.price, text });
    } else {
      addOns.push({ id, label: addOn.label, price: addOn.price });
    }
  }
  const price = Math.round(addOns.reduce((sum, addOn) => sum + addOn.price, 0) * 100) / 100;
  return { addOns, price };
}

// ── Box sets / bundles ─────────────────────────────────────────────
export const MAX_BUNDLE_PARTS = 20;

export function bundleComponents(book: any): BundlePart[] {
  if (!book || !Array.isArray(book.bundleItems)) return [];
  const out: BundlePart[] = [];
  for (const raw of book.bundleItems) {
    if (!raw || typeof raw.bookId !== "string" || !raw.bookId) continue;
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(raw.quantity) || 1)));
    out.push({ id: raw.bookId, variantId: typeof raw.variantId === "string" && raw.variantId ? raw.variantId : null, quantity });
    if (out.length >= MAX_BUNDLE_PARTS) break;
  }
  return out;
}

export const isBundle = (book: any): boolean => bundleComponents(book).length > 0;

/**
 * Order lines with every box set replaced by the books inside it, so stock holds, stock decrements and
 * restocks all count the real books. Lines without components pass through.
 */
export function stockLines<T extends { components?: any; quantity?: any }>(items: T[] | null | undefined): Array<T | { id: string; variantId: string | null; quantity: number }> {
  const out: Array<T | { id: string; variantId: string | null; quantity: number }> = [];
  for (const item of items || []) {
    if (!item) continue;
    if (Array.isArray(item.components) && item.components.length) {
      const sets = Math.max(0, Math.floor(Number(item.quantity) || 0));
      for (const part of item.components) {
        if (!part || typeof part.id !== "string" || !part.id) continue;
        out.push({ id: part.id, variantId: part.variantId || null, quantity: sets * Math.max(1, Math.floor(Number(part.quantity) || 1)) });
      }
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * A box set with no weight of its own weighs what its books weigh (each part at its chosen edition's
 * weight, times its quantity); null when any part has no weight. Mirrors the server (functions/index.js
 * `priceOrder` / `getShippoRates`), so the quote shown at checkout is the quote that is charged.
 */
export function bundleWeightGrams(book: any, booksById: { get(id: string): any }): number | null {
  const parts = bundleComponents(book);
  if (!parts.length) return null;
  let total = 0;
  for (const part of parts) {
    const partBook: any = booksById.get(part.id);
    if (!partBook) return null;
    const variant = part.variantId ? (partBook.variants || []).find((v: any) => v.id === part.variantId) : null;
    const grams = parseWeightGrams(variant?.weight) ?? parseWeightGrams(partBook.weight);
    if (grams == null) return null;
    total += grams * part.quantity;
  }
  return total;
}

function partStock(book: any, variantId: string | null): number {
  if (!book) return 0;
  if (book.trackInventory !== true || book.allowBackorder === true) return Infinity;
  if (variantId) {
    const variant = (book.variants || []).find((v: any) => v && v.id === variantId);
    return variant ? Math.max(0, Number(variant.stock ?? variant.stockLevel) || 0) : 0;
  }
  return Math.max(0, Number(book.stockLevel) || 0);
}

/** How many sets the parts' stock allows; Infinity when no part tracks stock. Needs raw catalog data. */
export function bundleAvailable(book: any, getBook: (id: string) => any): number {
  let sets = Infinity;
  for (const part of bundleComponents(book)) {
    const stock = partStock(getBook(part.id), part.variantId);
    sets = Math.min(sets, Math.floor(stock / part.quantity));
  }
  return sets;
}

// ── Gift-card products ─────────────────────────────────────────────
export const isGiftCardProduct = (book: any): boolean => !!book && book.productType === "giftCard";

/** Cleans the recipient form; throws when the email is filled in but malformed (blank = the buyer). */
export function giftCardDetails(requested: any): GiftCardDetails {
  const raw = requested && typeof requested === "object" ? requested : {};
  const recipientEmail = String(raw.recipientEmail || "").trim().toLowerCase().slice(0, 320);
  if (recipientEmail && !EMAIL.test(recipientEmail)) throw new PromotionProblem("gift_email", "Check the gift card recipient's email address.");
  return {
    recipientName: String(raw.recipientName || "").trim().slice(0, 100),
    recipientEmail,
    senderName: String(raw.senderName || "").trim().slice(0, 100),
    message: String(raw.message || "").trim().slice(0, 300),
  };
}
