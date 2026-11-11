// Recording a sale and voiding one from the admin's Sales records page. Pure: the form's checks, the row a sale adds
// (the shape the stockroom's own `addSaleToState` gives it) and the two `mutate` steps handed to `saveBookState`. The
// totals, stock and running `after` are not worked out here: the writer's derive step runs the stockroom's own
// `recomputeAfters` on the merged rows (WRITING.md rule 10). The page is SalesPage.tsx.
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { notesWithInvoiceDiscount } from "@stockroom/consignment.js";
import { localDay } from "@stockroom/calendar-day.js";

import type { BookState } from "./planSave";
import type { StockBook } from "./stockroomData";

/** The channels a hand-recorded sale can take, as the stockroom stores them (Sales records words "POS" as "In person"). */
export const SALE_CHANNELS: Array<{ value: string; label: string }> = [
  { value: "Direct", label: "Direct (by hand)" },
  { value: "Website", label: "Website" },
  { value: "POS", label: "In person" },
  { value: "Book Fair", label: "Fair or market" },
];

export type SaleForm = { bookId: string; qty: string; price: string; chan: string; date: string; num: string; notes: string };
export type SaleFormErrors = Partial<Record<keyof SaleForm, string>>;

/** A blank form: today's date, the only item picked when there is one, its list price filled in. */
export function blankSale(books: StockBook[], today = localDay()): SaleForm {
  const only = books.length === 1 ? books[0] : null;
  return { bookId: only?.id ?? "", qty: "1", price: only ? priceOf(only) : "", chan: "Direct", date: today, num: "", notes: "" };
}

/** An item's list price as the form shows it ("" when it has none). */
export function priceOf(book: StockBook | undefined): string {
  const n = Number(book?.listPrice);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

export type ValidSale = { bookId: string; qty: number; price: number; chan: string; date: string; num: string; notes: string };

/**
 * Check the form. `w` turns "book"/"copies" into the shop's own words. `onHand` is the item's copies on hand as last
 * read (absent: unknown); the save checks again against what is stored.
 */
export function checkSale(form: SaleForm, books: StockBook[], w: (s: string) => string = (s) => s, onHand?: number | null):
  { ok: true; sale: ValidSale } | { ok: false; errors: SaleFormErrors } {
  const errors: SaleFormErrors = {};
  if (!books.some((b) => b.id === form.bookId)) errors.bookId = w("Choose the book that was sold.");
  const qty = Number(form.qty);
  if (!form.qty.trim() || !Number.isInteger(qty) || qty < 1) errors.qty = "Enter a whole number, 1 or more.";
  else if (qty > 9999) errors.qty = "That is more than one sale can hold. Check the number.";
  else if (onHand != null && Number.isFinite(onHand) && qty > onHand) errors.qty = w(onHand > 0 ? `Only ${onHand} copies are on hand.` : "No copies are on hand.");
  const price = Number(form.price);
  if (!form.price.trim() || !Number.isFinite(price) || price < 0) errors.price = "Enter the price each, for example 20 or 19.50. Use 0 for a free copy.";
  else if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) errors.price = "Use at most two decimals.";
  if (!SALE_CHANNELS.some((c) => c.value === form.chan)) errors.chan = "Choose where the sale happened.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(form.date))) errors.date = "Choose the day of the sale.";
  else if (form.date > localDay()) errors.date = "The sale's day can't be in the future.";
  if (form.num.length > 60) errors.num = "Keep the order number under 60 characters.";
  if (form.notes.length > 500) errors.notes = "Keep the note under 500 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, sale: { bookId: form.bookId, qty, price: Math.round(price * 100) / 100, chan: form.chan, date: form.date, num: form.num.trim(), notes: form.notes.trim() } };
}

/** The stockroom's own id for a new row (`makeEventId` in its sheets bridge), made once per sale so a retry can't add it twice. */
export function newSaleId(now = Date.now(), random = Math.random) {
  return `evt-${now.toString(36)}-${random().toString(36).slice(2, 9)}`;
}

/** A save refused by the rules of the sale itself (not enough copies, a sale that must be voided elsewhere). */
export class SaleRefusal extends Error {
  constructor(message: string) { super(message); this.name = "SaleRefusal"; }
}

type Row = Record<string, unknown>;
const rowsOf = (state: BookState): Row[] => (Array.isArray(state.hist) ? (state.hist as Row[]) : (state.hist = []) as Row[]);

/**
 * `mutate` for recording a sale: adds the row the stockroom's `addSaleToState` adds for a sale typed in by the
 * publisher. Refuses when the item hasn't the copies (checked against what is stored now, not the page's copy).
 */
export function addSale(sale: ValidSale, book: StockBook, id: string, w: (s: string) => string = (s) => s, now = new Date()) {
  return (state: BookState): BookState => {
    const hist = rowsOf(state);
    // The same sale sent twice (a retry after a lost answer) is one sale.
    if (hist.some((h) => h.sheetsId === id)) return state;
    const stock = Number(state.stock);
    if (Number.isFinite(book.maxPrint as number) && Number.isFinite(stock) && sale.qty > stock) {
      throw new SaleRefusal(w(stock > 0 ? `Only ${stock} copies of ${book.title} are on hand now, so the sale wasn't recorded.` : `No copies of ${book.title} are on hand now, so the sale wasn't recorded.`));
    }
    // What the stockroom does before its recompute; the derive step then rebuilds stock and totals from the rows.
    state.stock = Math.max(0, (Number.isFinite(stock) ? stock : 0) - sale.qty);
    hist.unshift({
      recordedAt: now.toISOString(),
      num: sale.num, chan: sale.chan, qty: sale.qty, price: sale.price, after: state.stock,
      notes: notesWithInvoiceDiscount(state.invoices as unknown[] | undefined, sale.num, sale.notes),
      date: sale.date, payment: null, enteredBy: "Publisher", sheetsId: id, cur: bookCurrencyCode(book),
    });
    return state;
  };
}

/** Why a sale can't be voided from here (null: it can). The stockroom keeps these for its own screens. */
export function voidBlock(raw: Row, w: (s: string) => string = (s) => s): string | null {
  if (raw.voided) return "This sale is already voided.";
  if (!raw.sheetsId && !raw.uid) return "This sale has no record number, so it can't be picked out safely from here. Void it in the stockroom.";
  if (raw.consignmentLink) return "This sale came from a stockist. Void it from that stockist's records in the stockroom.";
  if (raw.webOrderId) return "This sale came from your website. Refund or cancel the order instead, and the sale follows.";
  if (raw.artistSettlementId) return w("This sale is part of an author settlement. Undo the settlement in the stockroom first.");
  if (raw.artistPending || raw.directToArtist || raw.enteredBy === "Artist") return w("The author recorded this sale. Void it in the stockroom, which also gives the copies back to the author.");
  return null;
}

const sameRow = (raw: Row) => (h: Row) => (raw.sheetsId ? h.sheetsId === raw.sheetsId : h.uid === raw.uid);

/** `mutate` for voiding a sale: marks it voided (never removes it), as the stockroom's `voidHistEntry` does. */
export function voidSale(raw: Row, w: (s: string) => string = (s) => s, now = Date.now()) {
  return (state: BookState): BookState => {
    const before = voidBlock({ ...raw, voided: false }, w);
    if (before) throw new SaleRefusal(before);
    const h = rowsOf(state).find(sameRow(raw));
    if (!h) throw new SaleRefusal("This sale isn't in the stockroom's records any more. Reload the page to see the latest.");
    if (h.voided) return state; // another device voided it first: nothing to do
    const blocked = voidBlock(h, w);
    if (blocked) throw new SaleRefusal(blocked);
    const stock = Number(state.stock);
    state.stock = (Number.isFinite(stock) ? stock : 0) + (Number(h.qty) || 0);
    h.voided = true;
    h.voidedAt = now;
    return state;
  };
}
