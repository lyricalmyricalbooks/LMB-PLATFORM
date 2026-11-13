// Stockroom › Stockists, worked out inside the admin from the stockroom's own rules (consignment.js, payment-reminders.js),
// so what a shop owes here is what the stockroom said. Pure and read-only: the page is StockistsPage.tsx.
import { collectUniqueConsignmentStores, consignmentLedgerTotals, storeBalanceComparison } from "@stockroom/consignment.js";
import { BILL_TO_PERSON, invoiceBillToMode } from "@stockroom/invoices.js";
import { fmt, getBookCurrencyCode, normalizeCurrencyCode, roundCents } from "@stockroom/money.js";
import { daysLate, invoiceReminderState } from "@stockroom/payment-reminders.js";
import { settleInvoicePaid } from "@stockroom/invoice-settle.js";

import type { StockroomRecords } from "./stockroomData";
import { queueCardLinkClose } from "./cardLinkQueue";
import { SHOP_CURRENCY } from "../moneySign";

type Rec = Record<string, any>;

export type Owed = { code: string; amount: number };
export type StockistInvoice = {
  id: string; num: string; status: string; dueDate: string; date: string; total: number; code: string;
  overdue: boolean; daysLate: number | null; chased: number; promisedUntil: string; reminderFailed: boolean;
  /** The book whose record holds the invoice (where a payment is saved), and the stockist's email on the invoice. */
  bookId: string; email: string;
  /** When it was marked paid (ms), or null. */
  paidAt: number | null;
  /** Can be marked paid in one click: sent (or draft), in the book's own currency (else the stockroom asks for a rate). */
  payable: boolean;
};
export type StockistLedgerRow = {
  key: string; bookTitle: string; date: string; type: string; qty: number; rate: number | null; amountDue: number; code: string;
  status: string; voided: boolean; invoiceNum: string; notes: string;
};
export type StockistTitle = {
  bookId: string; bookTitle: string; code: string; sent: number; sold: number; returned: number; onShelf: number; owed: number;
  figures: Array<{ key: string; label: string; card: number; ledger: number; off: boolean }>;
  /** The card's running totals disagree with the ledger's paper trail (the stockroom's "Doesn't match"). */
  mismatch: boolean;
  /** What the ledger says is still unpaid, per currency, and whether it agrees with the card's "owed". */
  ledgerOwed: Owed[]; owedMismatch: boolean;
};
export type Stockist = {
  key: string; name: string; contact: string; email: string; phone: string; city: string; region: string; country: string;
  website: string; terms: string; rate: number; notes: string;
  titles: StockistTitle[]; sent: number; sold: number; returned: number; onShelf: number;
  owed: Owed[]; paid: Owed[]; mismatch: boolean; owedMismatch: boolean;
  invoices: StockistInvoice[]; overdue: StockistInvoice[]; ledger: StockistLedgerRow[];
  state: "overdue" | "mismatch" | "owes" | "settled" | "holding" | "new";
};
export type StockistsView = {
  stockists: Stockist[]; owed: Owed[]; onShelf: number; overdueCount: number; overdueTotals: Owed[];
  /** Overdue invoices that are not to a stockist (billed to a person) are counted in `overdueCount` too. */
  otherOverdue: number;
};

const norm = (name: unknown) => String(name ?? "").trim().toLowerCase();
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function addMoney(into: Owed[], code: string, amount: number) {
  if (!amount) return;
  const hit = into.find((o) => o.code === code);
  if (hit) hit.amount = roundCents(hit.amount + amount);
  else into.push({ code, amount: roundCents(amount) });
}
const sorted = (list: Owed[], first: string) => [...list].sort((a, b) => (a.code === first ? -1 : b.code === first ? 1 : a.code.localeCompare(b.code)));

/** Money in several currencies, never added together: "CA$20.40 + €5.00". */
export function moneyText(list: Owed[]): string {
  return list.length ? list.map((o) => fmt(o.amount, o.code)).join(" + ") : "";
}

const localToday = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export function buildStockists(records: StockroomRecords, now: Date = new Date()): StockistsView {
  const today = localToday(now);
  const books = records.books;
  const merged = collectUniqueConsignmentStores(records.states, books);
  const firstCode = books.length ? getBookCurrencyCode(books[0]) : SHOP_CURRENCY;

  // Every invoice once (an invoice lives in one book's record but may bill several titles).
  const invoices: Array<{ inv: Rec; code: string; bookId: string; bookCode: string }> = [];
  const seen = new Set<string>();
  for (const book of books) {
    const list = records.states[book.id]?.invoices;
    if (!Array.isArray(list)) continue;
    for (const inv of list) {
      if (!inv || seen.has(String(inv.id))) continue;
      seen.add(String(inv.id));
      invoices.push({ inv, code: normalizeCurrencyCode(inv.currency, getBookCurrencyCode(book)), bookId: book.id, bookCode: getBookCurrencyCode(book) });
    }
  }
  const asInvoice = ({ inv, code, bookId, bookCode }: { inv: Rec; code: string; bookId: string; bookCode: string }): StockistInvoice => {
    // The stockroom's rule: only a sent invoice past its due date is overdue (a paid or cancelled one never is).
    const overdue = inv.status === "sent" && !!inv.dueDate && inv.dueDate < today;
    const reminders = invoiceReminderState(inv);
    return {
      id: String(inv.id), num: String(inv.num || ""), status: String(inv.status || "draft"), dueDate: String(inv.dueDate || ""), date: String(inv.date || ""),
      total: num(inv.total), code, overdue, daysLate: overdue ? daysLate(inv, today) : null, chased: reminders.count,
      promisedUntil: reminders.snoozedUntil && today <= reminders.snoozedUntil ? reminders.snoozedUntil : "", reminderFailed: reminders.lastStatus === "failed",
      bookId, email: String(inv.storeEmail || ""), paidAt: inv.status === "paid" && Number(inv.paidAt) > 0 ? Number(inv.paidAt) : null, payable: (inv.status === "sent" || inv.status === "draft") && code === bookCode,
    };
  };
  const byDue = (a: StockistInvoice, b: StockistInvoice) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");

  const stockists: Stockist[] = merged.map((m) => {
    const key = norm(m.name);
    const titles: StockistTitle[] = [];
    const ledger: StockistLedgerRow[] = [];
    const owed: Owed[] = [];
    const paid: Owed[] = [];
    for (const book of books) {
      const state = records.states[book.id];
      const st = Array.isArray(state?.stores) ? state.stores.find((s: Rec) => norm(s?.name) === key) : null;
      if (!st) continue;
      const code = getBookCurrencyCode(book);
      const rows: Rec[] = (Array.isArray(state?.ledger) ? state.ledger : []).filter((e: Rec) => e && e.storeId === st.id);
      // The stockroom's own tally of the ledger (voided rows move nothing).
      const tally = { sent: 0, sold: 0, returned: 0 };
      for (const e of rows) {
        if (e.voided) continue;
        if (e.type === "Shipment") tally.sent += num(e.qty);
        else if (e.type === "Sale") tally.sold += num(e.qty);
        else if (e.type === "Return") tally.returned += num(e.qty);
      }
      const outstanding = tally.sent - tally.sold - tally.returned;
      const figures = storeBalanceComparison(st, { ...tally, outstanding });
      const mismatch = (tally.sent > 0 || num(st.sent) > 0) && figures.some((f) => f.off && ["sent", "sold", "outstanding"].includes(f.key));
      const ledgerTotals = consignmentLedgerTotals(rows, code);
      const ledgerOwed = ledgerTotals.filter((t) => t.outstanding > 0).map((t) => ({ code: t.code, amount: roundCents(t.outstanding) }));
      ledgerTotals.forEach((t) => addMoney(paid, t.code, t.paid));
      // The card's "owed" is a single number in the book's currency; compare it with the ledger only when the ledger is too.
      const ledgerSame = ledgerTotals.every((t) => t.code === code);
      const ledgerSum = ledgerTotals.reduce((sum, t) => sum + t.outstanding, 0);
      const owedMismatch = ledgerSame && Math.abs(roundCents(num(st.amountOwed)) - roundCents(ledgerSum)) >= 0.01;
      addMoney(owed, code, num(st.amountOwed));
      titles.push({
        bookId: book.id, bookTitle: book.title || book.id, code, sent: num(st.sent), sold: num(st.sold), returned: num(st.returned), onShelf: num(st.outstanding),
        owed: roundCents(num(st.amountOwed)), figures, mismatch, ledgerOwed, owedMismatch,
      });
      rows.forEach((e, i) => {
        const entryCode = e.cur ? normalizeCurrencyCode(e.cur, code) : code;
        ledger.push({
          key: `${book.id}:${e.id ?? i}`, bookTitle: book.title || book.id, date: String(e.date || ""), type: String(e.type || ""), qty: num(e.qty),
          rate: e.type === "Sale" && e.rate != null ? num(e.rate) : null, amountDue: num(e.amountDue), code: entryCode, status: String(e.status || ""),
          voided: !!e.voided, invoiceNum: String(e.invoiceNum || ""), notes: [e.reason, e.notes].filter(Boolean).join(" · "),
        });
      });
    }
    // Newest first; entries on one day keep the stockroom's order (latest recorded on top).
    ledger.reverse();
    ledger.sort((a, b) => b.date.localeCompare(a.date));
    const mine = invoices
      .filter(({ inv }) => invoiceBillToMode(inv) !== BILL_TO_PERSON && norm(inv.storeName) === key)
      .map(asInvoice)
      .sort(byDue);
    const overdue = mine.filter((i) => i.overdue);
    const mismatch = titles.some((t) => t.mismatch);
    const owedMismatch = titles.some((t) => t.owedMismatch);
    const sent = num(m.totalSent), onShelf = num(m.totalOutstanding);
    const owesAny = owed.length > 0;
    const state: Stockist["state"] = overdue.length ? "overdue" : mismatch ? "mismatch" : owesAny ? "owes" : onShelf === 0 && sent > 0 ? "settled" : onShelf > 0 ? "holding" : "new";
    return {
      key, name: m.name, contact: m.contact, email: m.email, phone: m.phone, city: m.city, region: m.region, country: m.country, website: m.website,
      terms: m.terms, rate: num(m.rate), notes: m.notes, titles, sent, sold: num(m.totalSold), returned: num(m.totalReturned), onShelf,
      owed: sorted(owed, firstCode), paid: sorted(paid, firstCode), mismatch, owedMismatch, invoices: mine, overdue, ledger, state,
    };
  });

  // Page totals: what is owed (per currency), copies out, and every overdue invoice (also those billed to a person).
  const owedAll: Owed[] = [];
  stockists.forEach((s) => s.owed.forEach((o) => addMoney(owedAll, o.code, o.amount)));
  const overdueAll = invoices.map(asInvoice).filter((i) => i.overdue);
  const overdueTotals: Owed[] = [];
  overdueAll.forEach((i) => addMoney(overdueTotals, i.code, i.total));
  const stockistOverdue = stockists.reduce((n, s) => n + s.overdue.length, 0);
  return {
    stockists, owed: sorted(owedAll, firstCode), onShelf: stockists.reduce((n, s) => n + s.onShelf, 0),
    overdueCount: overdueAll.length, overdueTotals: sorted(overdueTotals, firstCode), otherOverdue: overdueAll.length - stockistOverdue,
  };
}

/**
 * The change "mark this invoice paid" makes to the book holding it, for `saveBookState`: the stockroom's own rule
 * (invoice-settle.js: the invoice, its linked pending sales and the stockist's owed balance). Throws to refuse, so
 * nothing is written (WRITING.md rule 4).
 */
export function markInvoicePaid(invoiceId: string, paidAt: number) {
  return (state: Rec) => {
    const done = settleInvoicePaid(state, invoiceId, { method: "Other", paidAt });
    if (!done.ok) {
      throw new Error(done.reason === "paid" ? "This invoice is already marked paid (perhaps on another device)."
        : done.reason === "cancelled" ? "This invoice was cancelled, so it can't be marked paid."
          : "This invoice is no longer in the records. Reload the page.");
    }
    // Paid another way: its emailed card link must stop taking money (closed at the next check of card payments).
    queueCardLinkClose(state, ((state.invoices as Rec[]) || []).find((i) => i && String(i.id) === invoiceId), "paid", paidAt);
    return state;
  };
}

/** v4 Stockists: the three tiles, each stockist's last settlement and sold-not-paid copies, and the newest movements. */
export type StockistsSummary = {
  unitsOut: number; pendingUnits: number; owed: Owed[]; settledThisYear: Owed[]; settledCount: number;
  lastSettled: Record<string, number | null>; pendingByStockist: Record<string, number>;
};

/** Sold-not-paid copies are pending, non-voided ledger sales; "settled" is an invoice marked paid (its paidAt). */
export function stockistsSummary(view: StockistsView, now: Date = new Date()): StockistsSummary {
  const year = now.getFullYear();
  const settledThisYear: Owed[] = [];
  let settledCount = 0, pendingUnits = 0;
  const lastSettled: Record<string, number | null> = {};
  const pendingByStockist: Record<string, number> = {};
  for (const s of view.stockists) {
    let last: number | null = null;
    for (const i of s.invoices) {
      if (i.paidAt == null) continue;
      if (last == null || i.paidAt > last) last = i.paidAt;
      if (new Date(i.paidAt).getFullYear() === year) { addMoney(settledThisYear, i.code, i.total); settledCount += 1; }
    }
    lastSettled[s.key] = last;
    const pending = s.ledger.filter((r) => r.type === "Sale" && r.status === "pending" && !r.voided).reduce((n, r) => n + r.qty, 0);
    pendingByStockist[s.key] = pending;
    pendingUnits += pending;
  }
  return { unitsOut: view.onShelf, pendingUnits, owed: view.owed, settledThisYear, settledCount, lastSettled, pendingByStockist };
}

/** The newest ledger entries across every stockist (voided ones left out), newest first. */
export function recentMovements(view: StockistsView, count = 8): Array<StockistLedgerRow & { shop: string }> {
  return view.stockists.flatMap((s) => s.ledger.filter((r) => !r.voided).map((r) => ({ ...r, shop: s.name })))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, count);
}
