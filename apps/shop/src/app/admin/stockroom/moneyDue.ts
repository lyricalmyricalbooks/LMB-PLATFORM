// Money coming in and going out on known days, in one shape, for the cash flow forecast and the balance sheet:
//  - invoices sent and not paid (money owed to you: due day, amount, late or not),
//  - repeating invoices not made yet (money expected, from each schedule),
//  - bills from suppliers not paid yet (money you owe: due day, amount).
// Pure and read-only: give it the stockroom records, get rows back. Amounts stay in their own currency (never added
// across currencies); `code` says which. Paid, cancelled and draft invoices and paid bills are left out.
import type { StockroomRecords } from "./stockroomData";
import { invoiceList, todayText } from "./invoiceMake";
import { upcomingRepeats } from "./recurringInvoices";
import { billDue, billList } from "./bills";

export type MoneyDueRow = {
  /** "invoice" owed to you, "repeat" expected from a repeating invoice, "bill" you owe. */
  kind: "invoice" | "repeat" | "bill";
  direction: "in" | "out";
  id: string; who: string; amount: number; code: string;
  /** The day it is due to be paid (YYYY-MM-DD), or "" when none was set. */
  dueDate: string;
  late: boolean;
  /** Invoice or bill number when there is one. */ ref: string;
};

/** Invoices sent and not paid. */
export function openInvoices(records: StockroomRecords, today: string = todayText()): MoneyDueRow[] {
  return invoiceList(records, new Date(`${today}T12:00:00`)).filter((r) => r.status === "sent").map((r) => ({
    kind: "invoice", direction: "in", id: r.id, who: r.billedTo, amount: r.total, code: r.code, dueDate: r.dueDate, late: r.overdue, ref: r.num,
  }));
}

/** Supplier bills not paid yet. */
export function openBills(records: StockroomRecords, today: string = todayText()): MoneyDueRow[] {
  const tc = (records.taxCenter as Record<string, any> | null) ?? null;
  return billList(tc).filter((b) => b.status === "open").map((b) => ({
    kind: "bill", direction: "out", id: b.id, who: b.supplier, amount: b.amount, code: b.currency, dueDate: b.dueDate,
    late: billDue(b, today).state === "overdue", ref: b.ref,
  }));
}

/** Invoices the repeating schedules will make between today and `until`, each due on its own payment day. */
export function expectedRepeats(records: StockroomRecords, today: string, until: string): MoneyDueRow[] {
  return upcomingRepeats(records, today, until).map((u) => ({
    kind: "repeat", direction: "in", id: `${u.patternId}@${u.date}`, who: u.who, amount: u.total, code: u.code, dueDate: u.dueDate, late: false, ref: "",
  }));
}

/** Everything above, soonest first (no due day last). */
export function moneyDue(records: StockroomRecords, today: string, until: string): MoneyDueRow[] {
  return [...openInvoices(records, today), ...openBills(records, today), ...expectedRepeats(records, today, until)]
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
}
