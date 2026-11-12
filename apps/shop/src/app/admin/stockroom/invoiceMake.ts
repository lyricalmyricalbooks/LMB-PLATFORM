// Stockroom › Stockists › Invoices: making, editing and filing an invoice inside the admin, with the stockroom's own rules
// (apps/stockroom/src/lib/invoices.js) so a number, a total or a recipient comes out exactly as the old app wrote it.
// Pure: the page is InvoiceDialogs.tsx; every change is a `mutate` for `saveBookState` (WRITING.md) and throws to refuse.
// The press's invoice details (name, address, terms, bank) used to live in one browser; they are now the stockroom
// setting `invoiceSettings`, so every device prints the same invoice.
import { collectUniqueConsignmentStores, stampLedgerInvoiceLink } from "@stockroom/consignment.js";
import {
  BILL_TO_PERSON, BILL_TO_STORE, billToPayload, billToPersonFrom, buildInvoiceNumber, clampPercent, computeInvoiceTotals,
  daysBetween, deriveInvoiceBookIds, dueDateFromTerms, invoiceBillToMode, invoiceNumberPrefix, lineItemBookId, neutralInvoicePrefix,
  nextInvoiceSeq, parseLooseNumber, type BillToPerson,
} from "@stockroom/invoices.js";
import { fmt, fmtD, getBookCurrencyCode, getSym, normalizeCurrencyCode } from "@stockroom/money.js";

import type { StockBook, StockroomRecords } from "./stockroomData";
import { addMoney, type Owed } from "./stockists";

type Rec = Record<string, any>;

export const INVOICE_SETTINGS_KEY = "invoiceSettings";
export const DEFAULT_TERMS = "Net 30. Payment by card, PayPal, or bank transfer.";

/** What prints at the top and foot of every invoice. Same field names as the old app's browser copy. */
export type InvoiceSettings = { name: string; email: string; addr: string; vat: string; web: string; terms: string; footer: string; bank: string };
export const SETTING_FIELDS = ["name", "email", "addr", "vat", "web", "terms", "footer", "bank"] as const;

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** The saved settings, every field a string; the press's name and the usual terms fill what was never set. */
export function cleanInvoiceSettings(raw: unknown, shopName = ""): InvoiceSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Rec;
  const out = {} as InvoiceSettings;
  for (const k of SETTING_FIELDS) out[k] = text(r[k]).trim();
  if (!out.name) out.name = shopName.trim();
  if (!out.terms) out.terms = DEFAULT_TERMS;
  return out;
}

/** For `updateSetting`: the new fields over what is stored, so anything else kept there (reminder choices) survives. */
export function invoiceSettingsChange(next: InvoiceSettings) {
  return (current: unknown) => {
    const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Rec) : {};
    const out: Rec = { ...base };
    for (const k of SETTING_FIELDS) out[k] = text(next[k]).trim();
    return out;
  };
}

// ── Reading the invoices on file ──────────────────────────────────────────────────────────────────────────────────

export type InvoiceRow = {
  id: string; num: string; ownerBookId: string; billedTo: string; person: boolean; date: string; dueDate: string;
  total: number; code: string; status: string; overdue: boolean; inv: Rec;
  /** When it was marked paid (ms), for paid invoices that recorded it. */ paidAt: number | null;
};

const localDay = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export const todayText = (now: Date = new Date()) => localDay(now);

/** Every invoice once, newest first, with the book whose record holds it (where it is saved). */
export function invoiceList(records: StockroomRecords, now: Date = new Date()): InvoiceRow[] {
  const today = localDay(now);
  const out: InvoiceRow[] = [];
  const seen = new Set<string>();
  for (const book of records.books) {
    const list = records.states[book.id]?.invoices;
    if (!Array.isArray(list)) continue;
    for (const inv of list as Rec[]) {
      if (!inv || seen.has(String(inv.id))) continue;
      seen.add(String(inv.id));
      const status = text(inv.status) || "draft";
      out.push({
        id: String(inv.id), num: text(inv.num), ownerBookId: book.id, billedTo: text(inv.storeName) || "—",
        person: invoiceBillToMode(inv) === BILL_TO_PERSON, date: text(inv.date), dueDate: text(inv.dueDate),
        total: Number(inv.total) || 0, code: normalizeCurrencyCode(inv.currencyCode || inv.currency, getBookCurrencyCode(book)), status,
        overdue: status === "sent" && !!inv.dueDate && String(inv.dueDate) < today, inv,
        paidAt: status === "paid" && Number(inv.paidAt) > 0 ? Number(inv.paidAt) : null,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.num.localeCompare(a.num));
}

/** v4 Invoices: the list's filter pills. Sent means owed and not yet past its due date. */
export type InvoiceFilter = "all" | "draft" | "sent" | "overdue" | "paid";
export const INVOICE_FILTERS: Array<{ id: InvoiceFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "draft", label: "Draft" }, { id: "sent", label: "Sent" }, { id: "overdue", label: "Overdue" }, { id: "paid", label: "Paid" },
];
export function inFilter(row: InvoiceRow, filter: InvoiceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return row.overdue;
  if (filter === "sent") return row.status === "sent" && !row.overdue;
  return row.status === filter;
}

/** v4 Invoices: the three tiles, from the rows. Money is kept per currency (never added across currencies). */
export type InvoicesSummary = {
  outstanding: Owed[]; outstandingCount: number; overdue: Owed[]; overdueCount: number; paid30: Owed[]; paid30Count: number;
  counts: Record<InvoiceFilter, number>;
};
export function invoicesSummary(rows: InvoiceRow[], now: number = Date.now()): InvoicesSummary {
  const out: InvoicesSummary = { outstanding: [], outstandingCount: 0, overdue: [], overdueCount: 0, paid30: [], paid30Count: 0,
    counts: { all: 0, draft: 0, sent: 0, overdue: 0, paid: 0 } };
  const since = now - 30 * 24 * 60 * 60 * 1000;
  for (const r of rows) {
    for (const f of INVOICE_FILTERS) if (inFilter(r, f.id)) out.counts[f.id] += 1;
    if (r.status === "sent") { addMoney(out.outstanding, r.code, r.total); out.outstandingCount += 1; }
    if (r.overdue) { addMoney(out.overdue, r.code, r.total); out.overdueCount += 1; }
    if (r.paidAt != null && r.paidAt >= since && r.paidAt <= now) { addMoney(out.paid30, r.code, r.total); out.paid30Count += 1; }
  }
  return out;
}

// ── The form ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type InvoiceLine = { description: string; qty: string; unitPrice: string; discountPct: string; ledgerId: unknown; bookId: string };
export type InvoiceForm = {
  editingId: string | null; ownerBookId: string; billTo: "store" | "person"; stockist: string; person: BillToPerson;
  num: string; autoNum: string; date: string; dueDate: string; items: InvoiceLine[];
  discountType: "percent" | "flat"; discountValue: string; taxRate: string; paymentLink: string; notes: string; terms: string;
  currencyCode: string; status: string;
};

const norm = (v: unknown) => text(v).trim().toLowerCase();
const blankPerson = (): BillToPerson => ({ name: "", email: "", phone: "", address: "", city: "", region: "", postal: "", country: "" });
export const blankLine = (bookId = ""): InvoiceLine => ({ description: "", qty: "1", unitPrice: "", discountPct: "", ledgerId: null, bookId });

/** The stockists to bill, by name across every book (the stockroom's own merge). */
export function stockistNames(records: StockroomRecords): string[] {
  return collectUniqueConsignmentStores(records.states, records.books).map((s) => text(s.name)).filter(Boolean);
}

/** The store record for a stockist in one book, or null. */
export function storeIn(state: Rec | undefined, stockist: string): Rec | null {
  const list = Array.isArray(state?.stores) ? (state!.stores as Rec[]) : [];
  return list.find((s) => norm(s?.name) === norm(stockist)) || null;
}

/** The books an invoice can be filed under: for a stockist, the books it holds copies of; for a person, any book. */
export function ownerChoices(records: StockroomRecords, form: Pick<InvoiceForm, "billTo" | "stockist">): StockBook[] {
  if (form.billTo === BILL_TO_PERSON) return records.books;
  return records.books.filter((b) => storeIn(records.states[b.id], form.stockist));
}

const bookPrefix = (bookId: string) => (bookId || "BOOK").slice(0, 6).toUpperCase();

/** The next free number, as the old app gives it: one title keeps its own code, several get the press's initials. */
export function nextNumber(records: StockroomRecords, ownerBookId: string, bookIds: string[], pressName: string, year: number): string {
  const prefix = bookIds.length > 1 ? neutralInvoicePrefix(pressName) : bookPrefix(bookIds[0] || ownerBookId);
  const all: Rec[] = [];
  for (const b of records.books) for (const inv of (records.states[b.id]?.invoices as Rec[] | undefined) || []) all.push(inv);
  const floor = prefix === bookPrefix(ownerBookId) ? Number(records.states[ownerBookId]?.invoiceSeq) || 0 : 0;
  return buildInvoiceNumber(prefix, year, Math.max(floor + 1, nextInvoiceSeq(all, prefix, year)));
}

/** The currency a new invoice filed under this book is in (the book's own). */
export const currencyFor = (records: StockroomRecords, bookId: string) => getBookCurrencyCode(records.books.find((b) => b.id === bookId) || null);
const currencyOf = currencyFor;

/** A new invoice: today, due in 30 days, the press's terms, filed under the first book that fits. */
export function blankForm(records: StockroomRecords, settings: InvoiceSettings, opts: { stockist?: string; person?: boolean; now?: Date } = {}): InvoiceForm {
  const now = opts.now || new Date();
  const date = localDay(now);
  const billTo = opts.person ? "person" : "store";
  const stockist = billTo === "store" ? opts.stockist || stockistNames(records)[0] || "" : "";
  const ownerBookId = ownerChoices(records, { billTo, stockist })[0]?.id || records.books[0]?.id || "";
  const num = ownerBookId ? nextNumber(records, ownerBookId, [ownerBookId], settings.name, now.getFullYear()) : "";
  return {
    editingId: null, ownerBookId, billTo, stockist, person: blankPerson(), num, autoNum: num, date, dueDate: dueDateFromTerms(date, 30),
    items: [blankLine()], discountType: "percent", discountValue: "", taxRate: "", paymentLink: "", notes: "",
    terms: settings.terms, currencyCode: currencyOf(records, ownerBookId), status: "draft",
  };
}

/** An invoice on file, back in the form (a hand-typed recipient comes back as typed, never as an empty store). */
export function formFromInvoice(records: StockroomRecords, row: Pick<InvoiceRow, "inv" | "ownerBookId">): InvoiceForm {
  const inv = row.inv;
  const person = invoiceBillToMode(inv) === BILL_TO_PERSON;
  const items = (Array.isArray(inv.items) ? inv.items : []) as Rec[];
  return {
    editingId: String(inv.id), ownerBookId: row.ownerBookId, billTo: person ? "person" : "store", stockist: person ? "" : text(inv.storeName),
    person: person ? billToPersonFrom(inv) : blankPerson(), num: text(inv.num), autoNum: "", date: text(inv.date), dueDate: text(inv.dueDate),
    items: items.map((it) => ({
      description: text(it.description), qty: String(it.qty ?? ""), unitPrice: String(it.unitPrice ?? ""),
      discountPct: clampPercent(it.discountPct) > 0 ? String(clampPercent(it.discountPct)) : "", ledgerId: it._ledgerId ?? null,
      bookId: lineItemBookId(it, row.ownerBookId, records.books),
    })),
    discountType: inv.discountType === "percent" ? "percent" : "flat",
    discountValue: inv.discountType === "percent" ? (inv.discountRate ? String(inv.discountRate) : "") : (Number(inv.discount) > 0 ? String(inv.discount) : ""),
    taxRate: Number(inv.taxRate) > 0 ? String(inv.taxRate) : "", paymentLink: text(inv.paymentLink), notes: text(inv.notes), terms: text(inv.terms),
    currencyCode: normalizeCurrencyCode(inv.currencyCode || inv.currency, currencyOf(records, row.ownerBookId)), status: text(inv.status) || "draft",
  };
}

const lineNumber = (v: string) => { const n = parseLooseNumber(v); return Number.isFinite(n) ? n : 0; };
const lineOut = (it: InvoiceLine) => {
  const line: Rec = { description: it.description.trim(), qty: lineNumber(it.qty), unitPrice: lineNumber(it.unitPrice), _ledgerId: it.ledgerId ?? null, bookId: it.bookId || null };
  const pct = clampPercent(it.discountPct);
  if (pct > 0) line.discountPct = pct;
  return line;
};

/** The figures the form adds up to, by the stockroom's one arithmetic. */
export function formTotals(form: InvoiceForm) {
  return computeInvoiceTotals({ items: form.items.map(lineOut), discountType: form.discountType, discountValue: form.discountValue, taxRate: form.taxRate });
}

/** The books a form bills (for its number): the book it is filed under plus each line's title. */
export const formBookIds = (form: InvoiceForm, books: StockBook[]) => deriveInvoiceBookIds({ items: form.items.map(lineOut) }, form.ownerBookId, books);

/** What stops a save, in plain words, or null. */
export function invoiceProblem(form: InvoiceForm, records: StockroomRecords): string | null {
  if (form.billTo === BILL_TO_PERSON) { if (!form.person.name.trim()) return "Enter who this invoice is for."; }
  else if (!form.stockist) return "Choose the stockist to bill.";
  if (!form.ownerBookId || !records.books.some((b) => b.id === form.ownerBookId)) return "Choose the title to file it under.";
  if (form.billTo !== BILL_TO_PERSON && !storeIn(records.states[form.ownerBookId], form.stockist)) return `${form.stockist} has no copies of that title. File it under one they hold.`;
  const lines = form.items.filter((it) => it.description.trim() || lineNumber(it.unitPrice) > 0);
  if (!lines.length) return "Add at least one line.";
  if (lines.some((it) => lineNumber(it.qty) <= 0)) return "Every line needs a quantity above zero.";
  if (formTotals(form).total <= 0) return "The total must be more than zero.";
  if (!form.date) return "Enter the issue date.";
  return null;
}

/** Unpaid consignment sales of this stockist in the filing book, as lines; sales already on another invoice are left out. */
export function pendingSaleLines(records: StockroomRecords, form: InvoiceForm): { lines: InvoiceLine[]; skipped: number } {
  const book = records.books.find((b) => b.id === form.ownerBookId);
  const state = records.states[form.ownerBookId] as Rec | undefined;
  const store = storeIn(state, form.stockist);
  if (!book || !state || !store) return { lines: [], skipped: 0 };
  const live = new Set(((state.invoices as Rec[]) || []).filter((i) => i && i.status !== "cancelled").map((i) => String(i.id)));
  let skipped = 0;
  const lines: InvoiceLine[] = [];
  for (const e of (state.ledger as Rec[]) || []) {
    if (!e || e.storeId !== store.id || e.type !== "Sale" || e.voided || e.status === "paid") continue;
    if (e.invoiceId && live.has(String(e.invoiceId)) && String(e.invoiceId) !== form.editingId) { skipped++; continue; }
    const qty = Number(e.qty) || 0;
    const sym = getSym(getBookCurrencyCode(book));
    lines.push({
      description: `${book.title} — consignment sale${e.date ? ` · ${fmtD(e.date)}` : ""} (qty ${qty} @ ${(100 - (Number(e.rate) || 0)).toFixed(0)}% net of ${sym}${text(book.listPrice)} retail)`,
      qty: String(qty), unitPrice: String(qty ? (Number(e.amountDue) || 0) / qty : 0), discountPct: "", ledgerId: e.id, bookId: book.id,
    });
  }
  return { lines, skipped };
}

// ── Saving ────────────────────────────────────────────────────────────────────────────────────────────────────────

const newId = (now: number) => `inv-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Save the form as an invoice ("draft", or "sent" for Save invoice) into the book it is filed under: the old app's
 * payload, ledger links and number counter. Editing keeps the payment, reminders and settlement already on record, and
 * never reopens a paid or cancelled invoice. `id` is fixed before the first try so a retry can't file it twice.
 */
export function saveInvoiceChange(form: InvoiceForm, status: "draft" | "sent", ctx: { books: StockBook[]; id: string; now: number }) {
  return (state: Rec) => {
    const invoices: Rec[] = Array.isArray(state.invoices) ? state.invoices : (state.invoices = []);
    let store: Rec | null = null;
    if (form.billTo !== BILL_TO_PERSON) {
      store = storeIn(state, form.stockist);
      if (!store) throw new Error(`${form.stockist} is no longer on this title's stockist list. Reload the page.`);
    }
    const totals = formTotals(form);
    const payload: Rec = {
      id: form.editingId || ctx.id,
      num: form.num.trim(),
      ...billToPayload(form.billTo === BILL_TO_PERSON ? BILL_TO_PERSON : BILL_TO_STORE, { store, person: form.person }),
      date: form.date, dueDate: form.dueDate,
      items: form.items.filter((it) => it.description.trim() || lineNumber(it.unitPrice) > 0).map(lineOut),
      subtotal: totals.subtotal, discount: totals.discount, discountType: totals.discountType || "flat", discountRate: totals.discountRate || 0,
      taxRate: totals.taxRate, tax: totals.tax, total: totals.total,
      currency: getSym(form.currencyCode), currencyCode: form.currencyCode,
      paymentLink: form.paymentLink.trim(), notes: form.notes.trim(), terms: form.terms.trim(),
      status, createdAt: ctx.now, updatedAt: ctx.now,
    };
    payload.bookIds = deriveInvoiceBookIds(payload, form.ownerBookId, ctx.books);
    let oldLedgerIds: unknown[] = [];
    const at = form.editingId ? invoices.findIndex((i) => i && String(i.id) === form.editingId) : -1;
    if (form.editingId) {
      if (at < 0) throw new Error("This invoice is no longer in the records (deleted on another device?). Reload the page.");
      const old = invoices[at];
      oldLedgerIds = ((old.items as Rec[]) || []).map((it) => it._ledgerId).filter((v) => v != null);
      payload.createdAt = old.createdAt || ctx.now;
      if (old.status === "paid" || old.status === "cancelled") payload.status = old.status;
      else if (old.status === "sent" && status === "draft") payload.status = "sent";
      for (const k of ["webOrderId", "payment", "remindAfter", "stripeChargeId"]) if (old[k]) payload[k] = old[k];
      payload.paidAt = old.paidAt || null;
      payload.paidMethod = old.paidMethod || null;
      if (Array.isArray(old.reminders) && old.reminders.length) payload.reminders = old.reminders;
      if (Array.isArray(old.stripePartPayments) && old.stripePartPayments.length) payload.stripePartPayments = old.stripePartPayments;
      // A Stripe link is for one exact amount: keep it only while the amount and currency are unchanged.
      const changed = Number(old.total || 0).toFixed(2) !== Number(payload.total || 0).toFixed(2) || old.currency !== payload.currency;
      if (old.stripe && !changed) payload.stripe = old.stripe;
      else if (old.stripe && payload.paymentLink && payload.paymentLink === (old.stripe.url || old.paymentLink)) payload.paymentLink = "";
      invoices[at] = payload;
    } else {
      if (invoices.some((i) => i && String(i.id) === payload.id)) return state; // already filed by an earlier try
      invoices.push(payload);
      const m = /-(\d+)$/.exec(payload.num);
      if (m && invoiceNumberPrefix(payload.num) === bookPrefix(form.ownerBookId)) state.invoiceSeq = Math.max(Number(state.invoiceSeq) || 0, parseInt(m[1], 10));
    }
    const newLedgerIds = (payload.items as Rec[]).map((it) => it._ledgerId).filter((v) => v != null);
    for (const id of oldLedgerIds) if (!newLedgerIds.includes(id)) stampLedgerInvoiceLink(state, id, null);
    for (const id of newLedgerIds) stampLedgerInvoiceLink(state, id, payload);
    return state;
  };
}

/** Send a draft: it becomes money owed (and overdue after its due date). */
export function markSentChange(id: string, now: number) {
  return (state: Rec) => {
    const inv = ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === id);
    if (!inv) throw new Error("This invoice is no longer in the records. Reload the page.");
    if (inv.status !== "draft") throw new Error(`This invoice is already ${inv.status || "sent"}.`);
    inv.status = "sent";
    inv.updatedAt = now;
    return state;
  };
}

/** Delete an unpaid invoice and clear its links from the ledger. A paid one stays on file: it is part of the books. */
export function deleteInvoiceChange(id: string) {
  return (state: Rec) => {
    const list = (state.invoices as Rec[]) || [];
    const inv = list.find((i) => i && String(i.id) === id);
    if (!inv) throw new Error("This invoice is no longer in the records. Reload the page.");
    if (inv.status === "paid") throw new Error("A paid invoice stays on file, so it can't be deleted.");
    for (const it of (inv.items as Rec[]) || []) if (it?._ledgerId != null) stampLedgerInvoiceLink(state, it._ledgerId, null);
    state.invoices = list.filter((i) => i !== inv);
    return state;
  };
}

export { newId as newInvoiceId };

/**
 * Duplicate (old duplicateInvoiceFromView + fillInvoiceEditorFromCopy): the same recipient, lines, discount, tax, notes
 * and terms on a new draft dated today with the next number. The gap to the due date is kept ("Net 15" stays Net 15),
 * and links to consignment sales are dropped, because those sales stay billed on the original.
 */
export function copyForm(records: StockroomRecords, settings: InvoiceSettings, row: Pick<InvoiceRow, "inv" | "ownerBookId">, now: Date = new Date()): InvoiceForm & { linkedDropped: number } {
  const f = formFromInvoice(records, row);
  const date = localDay(now);
  const gap = daysBetween(text(row.inv.date), text(row.inv.dueDate));
  const num = nextNumber(records, f.ownerBookId, [f.ownerBookId], settings.name, now.getFullYear());
  const linkedDropped = f.items.filter((it) => it.ledgerId != null).length;
  return {
    ...f, editingId: null, num, autoNum: num, date, dueDate: gap != null && gap >= 0 ? dueDateFromTerms(date, gap) : f.dueDate && dueDateFromTerms(date, 30),
    items: f.items.map((it) => ({ ...it, ledgerId: null })), paymentLink: "", status: "draft", linkedDropped,
  };
}

/** Email (old invoiceEmailPlainText and emailInvoice's subject): who it goes to and the plain words, for the mail app. */
export function invoiceEmail(inv: Rec, settings: InvoiceSettings, code: string) {
  const sender = settings.name;
  const pay = text(inv.paymentLink) || text(inv.stripe?.url);
  const body = [
    `Hi ${inv.storeContact || inv.storeName || "there"},`, "",
    `Your invoice ${inv.num} for ${fmt(Number(inv.total) || 0, code)} is below. Issued ${fmtD(inv.date)}${inv.dueDate ? ", due " + fmtD(inv.dueDate) : ""}.`,
    ...(pay ? ["", `Pay securely online: ${pay}`] : []),
    ...(inv.notes ? ["", `Notes: ${inv.notes}`] : []),
    "", "Thank you,", sender,
  ].join("\n");
  return { to: text(inv.storeEmail), subject: `Invoice ${inv.num} — ${sender}`, body };
}
