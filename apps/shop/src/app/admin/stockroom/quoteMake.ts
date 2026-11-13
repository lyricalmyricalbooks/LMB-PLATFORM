// Stockroom › Invoices › Quotes: a price offered before the sale. A quote has the same shape as an invoice (who, lines,
// discount, tax, notes, terms: invoiceMake.ts `formPayload`) and is filed the same way, in the `quotes` list of the
// book it is filed under. That list sits in the book's metadata, which the stockroom merges row by row by `id`
// (`@stockroom/merge-state.js` mergeMetadata), so a quote added on one device survives a save from another.
// Pure: the page is QuotesPage.tsx; every change is a `mutate` for `saveBookState` (WRITING.md) and throws to refuse.
//
// Status: draft → sent → accepted (turned into an invoice) or declined. "Expired" is never stored: a sent quote whose
// valid-until day has passed reads as expired, and can still be accepted if the customer says yes late.
import { dueDateFromTerms } from "@stockroom/invoices.js";
import { fmt, fmtD, getBookCurrencyCode, normalizeCurrencyCode } from "@stockroom/money.js";

import type { StockBook, StockroomRecords } from "./stockroomData";
import { addMoney, type Owed } from "./stockists";
import {
  blankForm, formFromInvoice, formPayload, nextNumber, saveInvoiceChange, storeIn, todayText, type InvoiceForm, type InvoiceSettings,
} from "./invoiceMake";

type Rec = Record<string, any>;
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export const QUOTE_VALID_DAYS = 30;
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export type QuoteRow = {
  id: string; num: string; ownerBookId: string; billedTo: string; person: boolean; date: string; validUntil: string;
  total: number; code: string; status: QuoteStatus; quote: Rec;
  /** The invoice it became, once accepted. */ invoiceId: string; invoiceNum: string;
};

/** Every quote once, newest first, with the book whose record holds it. */
export function quoteList(records: StockroomRecords, now: Date = new Date()): QuoteRow[] {
  const today = todayText(now);
  const out: QuoteRow[] = [];
  const seen = new Set<string>();
  for (const book of records.books) {
    const list = (records.states[book.id] as Rec | undefined)?.quotes;
    if (!Array.isArray(list)) continue;
    for (const q of list as Rec[]) {
      if (!q || seen.has(String(q.id))) continue;
      seen.add(String(q.id));
      out.push(quoteRow(q, book, today));
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.num.localeCompare(a.num));
}

function quoteRow(q: Rec, book: StockBook, today: string): QuoteRow {
  const stored = text(q.status) || "draft";
  const validUntil = text(q.validUntil);
  const status: QuoteStatus = stored === "sent" && validUntil && validUntil < today ? "expired"
    : (["draft", "sent", "accepted", "declined"].includes(stored) ? stored : "draft") as QuoteStatus;
  return {
    id: String(q.id), num: text(q.num), ownerBookId: book.id, billedTo: text(q.storeName) || "—", person: q.billTo === "person",
    date: text(q.date), validUntil, total: Number(q.total) || 0,
    code: normalizeCurrencyCode(q.currencyCode || q.currency, getBookCurrencyCode(book)), status, quote: q,
    invoiceId: text(q.invoiceId), invoiceNum: text(q.invoiceNum),
  };
}

export type QuoteFilter = "all" | QuoteStatus;
export const QUOTE_FILTERS: Array<{ id: QuoteFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "draft", label: "Draft" }, { id: "sent", label: "Waiting" }, { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" }, { id: "expired", label: "Expired" },
];
export const inQuoteFilter = (row: QuoteRow, filter: QuoteFilter) => filter === "all" || row.status === filter;

export type QuotesSummary = { waiting: Owed[]; waitingCount: number; won30: Owed[]; won30Count: number; expiredCount: number; counts: Record<QuoteFilter, number> };
/** The three tiles: waiting on a reply, won in the last 30 days, gone past their date. Money kept per currency. */
export function quotesSummary(rows: QuoteRow[], now: number = Date.now()): QuotesSummary {
  const out: QuotesSummary = { waiting: [], waitingCount: 0, won30: [], won30Count: 0, expiredCount: 0,
    counts: { all: 0, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0 } };
  const since = now - 30 * 86_400_000;
  for (const r of rows) {
    for (const f of QUOTE_FILTERS) if (inQuoteFilter(r, f.id)) out.counts[f.id] += 1;
    if (r.status === "sent") { addMoney(out.waiting, r.code, r.total); out.waitingCount += 1; }
    if (r.status === "expired") out.expiredCount += 1;
    const at = Number(r.quote.acceptedAt) || 0;
    if (r.status === "accepted" && at >= since && at <= now) { addMoney(out.won30, r.code, r.total); out.won30Count += 1; }
  }
  return out;
}

// ── Numbers and the form ──────────────────────────────────────────────────────────────────────────────────────────

/** Q-2026-007: one series for the whole press, so a quote number never looks like an invoice number. */
export function nextQuoteNumber(records: StockroomRecords, year: number): string {
  let top = 0;
  const re = new RegExp(`^Q-${year}-(\\d+)$`);
  for (const b of records.books) for (const q of ((records.states[b.id] as Rec | undefined)?.quotes as Rec[] | undefined) || []) {
    const m = re.exec(text(q?.num).trim());
    if (m) top = Math.max(top, parseInt(m[1], 10));
  }
  return `Q-${year}-${String(top + 1).padStart(3, "0")}`;
}

/** A new quote: today, valid for 30 days, the press's terms. The form's `dueDate` holds the valid-until day. */
export function blankQuote(records: StockroomRecords, settings: InvoiceSettings, opts: { stockist?: string; person?: boolean; now?: Date } = {}): InvoiceForm {
  const now = opts.now || new Date();
  const f = blankForm(records, settings, opts);
  const num = nextQuoteNumber(records, now.getFullYear());
  return { ...f, num, autoNum: num, dueDate: dueDateFromTerms(f.date, QUOTE_VALID_DAYS), paymentLink: "" };
}

/** A quote on file, back in the form (valid-until in `dueDate`). */
export function formFromQuote(records: StockroomRecords, row: Pick<QuoteRow, "quote" | "ownerBookId">): InvoiceForm {
  return formFromInvoice(records, { ownerBookId: row.ownerBookId, inv: { ...row.quote, dueDate: row.quote.validUntil } });
}

/** What stops a quote being saved, or null. Same checks as an invoice, in a quote's words. */
export function quoteProblem(problem: string | null): string | null {
  return problem ? problem.replace(/invoice/g, "quote") : null;
}

export const newQuoteId = (now: number) => `quo-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const findQuote = (state: Rec, id: string) => {
  const q = ((state.quotes as Rec[]) || []).find((x) => x && String(x.id) === id);
  if (!q) throw new Error("This quote is no longer in the records (deleted on another device?). Reload the page.");
  return q;
};

/** Save the form as a quote ("draft" or "sent"). Editing keeps an accepted or declined quote as it was. */
export function saveQuoteChange(form: InvoiceForm, status: "draft" | "sent", ctx: { books: StockBook[]; id: string; now: number }) {
  return (state: Rec) => {
    const quotes: Rec[] = Array.isArray(state.quotes) ? state.quotes : (state.quotes = []);
    let store: Rec | null = null;
    if (form.billTo !== "person") {
      store = storeIn(state, form.stockist);
      if (!store) throw new Error(`${form.stockist} is no longer on this title's stockist list. Reload the page.`);
    }
    const payload = formPayload(form, store, status, { books: ctx.books, id: form.editingId || ctx.id, now: ctx.now });
    payload.validUntil = payload.dueDate;
    delete payload.dueDate;
    delete payload.paymentLink;
    payload.kind = "quote";
    if (form.editingId) {
      const at = quotes.findIndex((q) => q && String(q.id) === form.editingId);
      if (at < 0) throw new Error("This quote is no longer in the records (deleted on another device?). Reload the page.");
      const old = quotes[at];
      payload.createdAt = old.createdAt || ctx.now;
      if (old.status === "accepted" || old.status === "declined") payload.status = old.status;
      else if (old.status === "sent" && status === "draft") payload.status = "sent";
      for (const k of ["sentAt", "acceptedAt", "declinedAt", "invoiceId", "invoiceNum", "emails"]) if (old[k] != null) payload[k] = old[k];
      quotes[at] = payload;
    } else {
      if (quotes.some((q) => q && String(q.id) === payload.id)) return state; // already filed by an earlier try
      if (payload.num && quotes.some((q) => q && text(q.num).trim() === payload.num)) throw new Error(`Quote ${payload.num} was filed while this form was open. Change the number and save again.`);
      if (status === "sent") payload.sentAt = ctx.now;
      quotes.push(payload);
    }
    return state;
  };
}

/** Mark sent (from a draft), or note an email on it. `email` is logged on the quote, like an invoice's reminders. */
export function markQuoteSentChange(id: string, now: number, email?: { to: string }) {
  return (state: Rec) => {
    const q = findQuote(state, id);
    if (q.status === "accepted" || q.status === "declined") throw new Error(`This quote is already ${q.status}.`);
    if (q.status !== "sent") { q.status = "sent"; q.sentAt = now; }
    if (email) (q.emails = Array.isArray(q.emails) ? q.emails : []).push({ at: now, to: email.to });
    q.updatedAt = now;
    return state;
  };
}

/** The customer said no. A declined quote stays on file. */
export function declineQuoteChange(id: string, now: number) {
  return (state: Rec) => {
    const q = findQuote(state, id);
    if (q.status === "accepted") throw new Error("This quote was accepted and is an invoice now.");
    q.status = "declined"; q.declinedAt = now; q.updatedAt = now;
    return state;
  };
}

/** Open a declined quote again (they changed their mind): back to waiting. */
export function reopenQuoteChange(id: string, now: number) {
  return (state: Rec) => {
    const q = findQuote(state, id);
    if (q.status !== "declined") throw new Error("Only a declined quote can be opened again.");
    q.status = "sent"; delete q.declinedAt; q.updatedAt = now;
    return state;
  };
}

/** Delete a quote that never became an invoice. */
export function deleteQuoteChange(id: string) {
  return (state: Rec) => {
    const q = findQuote(state, id);
    if (q.status === "accepted") throw new Error("This quote became an invoice, so it stays on file.");
    state.quotes = ((state.quotes as Rec[]) || []).filter((x) => x !== q);
    return state;
  };
}

/**
 * Accepted: the quote becomes a draft invoice in the same save, with the same customer, lines, discount, tax, notes and
 * terms, dated today and due in `dueDays` (30 by default). The quote is stamped accepted with the invoice's id and
 * number, so it can never be turned into a second invoice. `invoiceId` and `num` are fixed before the first try.
 */
export function acceptQuoteChange(records: StockroomRecords, row: Pick<QuoteRow, "id" | "quote" | "ownerBookId">, ctx: { invoiceId: string; num: string; now: number; today: string; dueDays?: number }) {
  const base = formFromQuote(records, row);
  const form: InvoiceForm = {
    ...base, editingId: null, num: ctx.num, autoNum: ctx.num, date: ctx.today, dueDate: dueDateFromTerms(ctx.today, ctx.dueDays ?? 30),
    items: base.items.map((it) => ({ ...it, ledgerId: null })), status: "draft",
  };
  return (state: Rec) => {
    const q = findQuote(state, row.id);
    if (q.status === "accepted" || q.invoiceId) {
      if (q.invoiceId === ctx.invoiceId) return state; // an earlier try already made it
      throw new Error(`This quote is already invoice ${q.invoiceNum || ""}.`.replace(" .", "."));
    }
    const made = saveInvoiceChange(form, "draft", { books: records.books, id: ctx.invoiceId, now: ctx.now })(state);
    const inv = ((made.invoices as Rec[]) || []).find((i) => i && String(i.id) === ctx.invoiceId);
    if (inv) inv.fromQuote = { id: String(q.id), num: text(q.num) };
    q.status = "accepted"; q.acceptedAt = ctx.now; q.invoiceId = ctx.invoiceId; q.invoiceNum = ctx.num; q.updatedAt = ctx.now;
    return made;
  };
}

/** The invoice number an accepted quote gets (the invoices' own series). */
export const invoiceNumberFor = (records: StockroomRecords, row: Pick<QuoteRow, "ownerBookId" | "quote">, settings: InvoiceSettings, now: Date = new Date()) =>
  nextNumber(records, row.ownerBookId, (row.quote.bookIds as string[] | undefined)?.length ? row.quote.bookIds : [row.ownerBookId], settings.name, now.getFullYear());

/** The email sent from the shop's own address: the lines in words, the total and the valid-until day. */
export function quoteEmail(q: Rec, settings: InvoiceSettings, code: string) {
  const items = (Array.isArray(q.items) ? q.items : []) as Rec[];
  const lines = items.map((it) => `• ${text(it.description) || "Item"} × ${Number(it.qty) || 0} — ${fmt((Number(it.qty) || 0) * (Number(it.unitPrice) || 0) * (1 - (Number(it.discountPct) || 0) / 100), code)}`);
  const body = [
    `Hi ${q.storeContact || q.storeName || "there"},`, "",
    `Here is our quote ${q.num} for ${fmt(Number(q.total) || 0, code)}${q.validUntil ? `, good until ${fmtD(q.validUntil)}` : ""}.`, "",
    ...lines,
    ...(Number(q.discount) > 0 ? [`Discount: −${fmt(Number(q.discount), code)}`] : []),
    ...(Number(q.tax) > 0 ? [`Tax: ${fmt(Number(q.tax), code)}`] : []),
    `Total: ${fmt(Number(q.total) || 0, code)}`,
    ...(q.notes ? ["", String(q.notes)] : []),
    ...(q.terms ? ["", `Terms: ${q.terms}`] : []),
    "", "Reply to this email to accept it, and we'll send the invoice.", "", "Thank you,", settings.name,
  ].join("\n");
  return { to: text(q.storeEmail).trim(), subject: `Quote ${q.num} — ${settings.name}`, text: body };
}
