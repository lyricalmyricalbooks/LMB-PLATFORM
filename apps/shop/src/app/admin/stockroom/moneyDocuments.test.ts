// Quotes, repeating invoices and supplier bills: the rules, through the real write layer over the in-memory stockroom
// where they save book records (WRITING.md › Testing a page that writes), and the money-due list the forecast reads.
import { describe, expect, it } from "vitest";
import { assembleParts, stitchState } from "@stockroom/merge-state.js";

import { billDue, billFromNote, billsAlert, billsSummary, checkBill, deleteBill, payBill, saveBill, sortedBills, type BillForm } from "./bills";
import { cleanInvoiceSettings, invoiceList, type InvoiceForm } from "./invoiceMake";
import { invoicePaperHtml } from "./invoicePaper";
import { moneyDue, openBills, openInvoices } from "./moneyDue";
import type { BookState } from "./planSave";
import {
  acceptQuoteChange, blankQuote, declineQuoteChange, deleteQuoteChange, markQuoteSentChange, nextQuoteNumber, quoteEmail, quoteList, quotesSummary, reopenQuoteChange, saveQuoteChange,
} from "./quoteMake";
import {
  blankSchedule, describeRepeatRun, dueRepeats, madeInvoiceId, nextDay, pauseRepeatChange, repeatList, saveRepeatChange, scheduleProblem, sweepRepeating, upcomingRepeats,
} from "./recurringInvoices";
import type { StockroomRecords } from "./stockroomData";
import { MemoryStockroom } from "./stockroomMemory";
import { createStockroomWriter } from "./stockroomWrite";

const salt = { id: "salt-hours", title: "Salt Hours", currency: "CAD", listPrice: 20, maxPrint: 100 };
const start = (): BookState => ({
  ...stitchState({ metadata: { stock: 80 } }),
  stores: [{ id: 1, name: "Corner Books", email: "corner@example.com", city: "Toronto", sent: 10, sold: 6, returned: 0, outstanding: 4, amountOwed: 72 }],
  ledger: [],
  invoices: [],
  invoiceSeq: 0,
});
const settings = cleanInvoiceSettings({ name: "Moth Press", addr: "1 Example St\nToronto" });
// A Wednesday morning, inside the weekday 9 to 6 sending hours.
const now = new Date(2026, 10, 11, 10, 0);
const today = "2026-11-11";

function shop() {
  const mem = new MemoryStockroom();
  mem.putCatalog([salt]);
  mem.putBook("salt-hours", start());
  return mem;
}
const readBack = (mem: MemoryStockroom) => stitchState(assembleParts(mem.parts.get("salt-hours") ?? {}).parts) as Record<string, any>;
const recordsOf = (mem: MemoryStockroom): StockroomRecords => ({ books: [salt], states: { "salt-hours": readBack(mem) as any }, taxCenter: null });
const lines = (f: InvoiceForm): InvoiceForm => ({ ...f, items: [{ description: "Salt Hours", qty: "5", unitPrice: "12", discountPct: "", ledgerId: null, bookId: "" }] });

describe("quotes", () => {
  it("numbers them in their own series and starts valid for 30 days", () => {
    const r = recordsOf(shop());
    expect(nextQuoteNumber(r, 2026)).toBe("Q-2026-001");
    const f = blankQuote(r, settings, { now });
    expect(f).toMatchObject({ stockist: "Corner Books", date: today, dueDate: "2026-12-11", num: "Q-2026-001" });
  });

  it("files a quote, reads as Expired once its day passes, and is never mistaken for an invoice", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    const r = recordsOf(mem);
    await writer.saveBookState("salt-hours", saveQuoteChange(lines(blankQuote(r, settings, { now })), "sent", { books: r.books, id: "quo-1", now: 1 }));
    const back = readBack(mem);
    expect(back.quotes[0]).toMatchObject({ id: "quo-1", num: "Q-2026-001", status: "sent", kind: "quote", validUntil: "2026-12-11", total: 60, sentAt: 1 });
    expect(back.quotes[0].dueDate).toBeUndefined();
    expect(back.invoices).toEqual([]);
    expect(invoiceList(recordsOf(mem), now)).toEqual([]);
    expect(quoteList(recordsOf(mem), now)[0].status).toBe("sent");
    expect(quoteList(recordsOf(mem), new Date(2026, 11, 12))[0].status).toBe("expired");
    expect(nextQuoteNumber(recordsOf(mem), 2026)).toBe("Q-2026-002");
  });

  it("an accepted quote becomes one draft invoice, however many times the button is pressed", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    let r = recordsOf(mem);
    await writer.saveBookState("salt-hours", saveQuoteChange(lines(blankQuote(r, settings, { now })), "sent", { books: r.books, id: "quo-1", now: 1 }));
    r = recordsOf(mem);
    const row = quoteList(r, now)[0];
    const accept = acceptQuoteChange(r, row, { invoiceId: "inv-q1", num: "INV-SALT-H-2026-001", now: 2, today });
    await writer.saveBookState("salt-hours", accept);
    await writer.saveBookState("salt-hours", accept);
    const back = readBack(mem);
    expect(back.invoices).toHaveLength(1);
    expect(back.invoices[0]).toMatchObject({ id: "inv-q1", status: "draft", total: 60, storeName: "Corner Books", date: today, dueDate: "2026-12-11", fromQuote: { id: "quo-1", num: "Q-2026-001" } });
    expect(back.quotes[0]).toMatchObject({ status: "accepted", invoiceId: "inv-q1", invoiceNum: "INV-SALT-H-2026-001" });
    // A second invoice id (another tab) is refused; an accepted quote can't be declined or deleted.
    expect(() => acceptQuoteChange(r, row, { invoiceId: "inv-other", num: "X", now: 3, today })(readBack(mem))).toThrow(/already invoice INV-SALT-H-2026-001/);
    expect(() => declineQuoteChange("quo-1", 3)(readBack(mem))).toThrow(/accepted/);
    expect(() => deleteQuoteChange("quo-1")(readBack(mem))).toThrow(/stays on file/);
  });

  it("declined, opened again, emailed: each is logged; the summary counts what is waiting and won", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    const r = recordsOf(mem);
    await writer.saveBookState("salt-hours", saveQuoteChange(lines(blankQuote(r, settings, { now })), "draft", { books: r.books, id: "quo-1", now: 1 }));
    await writer.saveBookState("salt-hours", markQuoteSentChange("quo-1", 2, { to: "corner@example.com" }));
    expect(readBack(mem).quotes[0]).toMatchObject({ status: "sent", sentAt: 2, emails: [{ at: 2, to: "corner@example.com" }] });
    await writer.saveBookState("salt-hours", declineQuoteChange("quo-1", 3));
    expect(quotesSummary(quoteList(recordsOf(mem), now)).counts.declined).toBe(1);
    await writer.saveBookState("salt-hours", reopenQuoteChange("quo-1", 4));
    const sum = quotesSummary(quoteList(recordsOf(mem), now), now.getTime());
    expect(sum).toMatchObject({ waitingCount: 1, waiting: [{ code: "CAD", amount: 60 }], won30Count: 0, expiredCount: 0 });
  });

  it("the email lists the lines and the valid-until day, and the paper says Quote with no way to pay", () => {
    const q = { num: "Q-2026-001", storeName: "Corner Books", storeEmail: "corner@example.com", total: 60, validUntil: "2026-12-11", items: [{ description: "Salt Hours", qty: 5, unitPrice: 12 }] };
    const mail = quoteEmail(q, settings, "CAD");
    expect(mail.to).toBe("corner@example.com");
    expect(mail.subject).toBe("Quote Q-2026-001 — Moth Press");
    expect(mail.text).toMatch(/Salt Hours × 5/);
    expect(mail.text).toMatch(/good until/);
    const html = invoicePaperHtml({ ...q, status: "sent", date: today, currencyCode: "CAD", paymentLink: "https://pay.example/x" }, { ...settings, bank: "Acct 123" }, today, { quote: true });
    expect(html).toMatch(/Quote/);
    expect(html).toMatch(/Valid until/);
    expect(html).not.toMatch(/pay\.example/);
    expect(html).not.toMatch(/Acct 123/);
  });
});

describe("repeating invoices", () => {
  it("steps by week, month, quarter and year, keeping the 31st in short months", () => {
    expect(nextDay("2026-11-11", "week")).toBe("2026-11-18");
    expect(nextDay("2027-01-31", "month")).toBe("2027-02-28");
    expect(nextDay("2027-02-28", "month", 31)).toBe("2027-03-31");
    expect(nextDay("2026-11-30", "quarter")).toBe("2027-02-28");
    expect(nextDay("2028-02-29", "year")).toBe("2029-02-28");
  });

  it("checks the schedule before saving", () => {
    const r = recordsOf(shop());
    const f = lines(blankQuote(r, settings, { now }));
    expect(scheduleProblem({ ...f, date: "2026-11-01" }, blankSchedule(), today)).toMatch(/can't be in the past/);
    expect(scheduleProblem({ ...f, date: "2026-12-01" }, { ...blankSchedule(), endDate: "2026-11-20" }, today)).toMatch(/last day is before/);
    expect(scheduleProblem({ ...f, date: today }, blankSchedule(), today)).toBeNull();
  });

  async function withPattern(mem: MemoryStockroom, schedule = blankSchedule()) {
    const r = recordsOf(mem);
    const f = { ...lines(blankQuote(r, settings, { now })), num: "", date: today, dueDate: "2026-11-25" };
    await createStockroomWriter(mem.device()).saveBookState("salt-hours", saveRepeatChange(f, schedule, { books: r.books, id: "rep-1", now: 1 }));
  }

  it("makes the invoice when its day comes, emails it once, moves to the next month and counts it as owed", async () => {
    const mem = shop();
    await withPattern(mem);
    const writer = createStockroomWriter(mem.device());
    const records = recordsOf(mem);
    expect(repeatList(records)[0]).toMatchObject({ every: "month", nextDate: today, dueDays: 14, total: 60, autoEmail: true });
    const sent: Array<{ to: string; subject: string }> = [];
    const deps = { save: (id: string, step: any) => writer.saveBookState(id, step), send: async (m: any) => { sent.push(m); }, now: () => now };
    const result = await sweepRepeating(records, settings, today, deps);
    expect(result).toMatchObject({ made: 1, emailed: 1, drafts: [], failed: [], problems: [] });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("corner@example.com");
    const back = readBack(mem);
    expect(back.invoices[0]).toMatchObject({ id: madeInvoiceId("rep-1", today), status: "sent", date: today, dueDate: "2026-11-25", total: 60, repeat: { id: "rep-1", date: today, email: "sent" } });
    expect(back.recurringInvoices[0]).toMatchObject({ nextDate: "2026-12-11", made: [{ date: today, invoiceId: madeInvoiceId("rep-1", today) }] });
    // A second run the same day (another tab, a reload) makes and sends nothing more.
    expect(await sweepRepeating(recordsOf(mem), settings, today, deps)).toBeNull();
    expect(sent).toHaveLength(1);
    // The made invoice is an ordinary open invoice for the forecast; the next ones are expected.
    const due = moneyDue(recordsOf(mem), today, "2027-01-31");
    expect(due.map((d) => [d.kind, d.dueDate])).toEqual([["invoice", "2026-11-25"], ["repeat", "2026-12-25"], ["repeat", "2027-01-25"]]);
    expect(describeRepeatRun(result!)).toMatchObject({ title: "1 repeating invoice was made", detail: "1 emailed.", tone: "info" });
  });

  it("an invoice set not to be emailed waits as a draft, and a failed email leaves it a draft to send", async () => {
    const mem = shop();
    await withPattern(mem, { ...blankSchedule(), autoEmail: false });
    const writer = createStockroomWriter(mem.device());
    const deps = { save: (id: string, step: any) => writer.saveBookState(id, step), send: async () => { throw new Error("no"); }, now: () => now };
    const r1 = await sweepRepeating(recordsOf(mem), settings, today, deps);
    expect(r1).toMatchObject({ made: 1, emailed: 0, drafts: ["INV-SALT-H-2026-001"] });
    expect(readBack(mem).invoices[0].status).toBe("draft");

    const mem2 = shop();
    await withPattern(mem2);
    const writer2 = createStockroomWriter(mem2.device());
    const r2 = await sweepRepeating(recordsOf(mem2), settings, today, { ...deps, save: (id: string, step: any) => writer2.saveBookState(id, step) });
    expect(r2).toMatchObject({ made: 1, emailed: 0, failed: ["INV-SALT-H-2026-001"] });
    expect(readBack(mem2).invoices[0]).toMatchObject({ status: "draft", repeat: { email: "failed" } });
    expect(describeRepeatRun(r2!).tone).toBe("warning");
  });

  it("ends after its last day, does nothing at the weekend, and starting again after a pause bills from today", async () => {
    const mem = shop();
    await withPattern(mem, { ...blankSchedule(), endDate: "2026-11-30", autoEmail: false });
    const writer = createStockroomWriter(mem.device());
    const deps = { save: (id: string, step: any) => writer.saveBookState(id, step), send: async () => undefined, now: () => now };
    expect(await sweepRepeating(recordsOf(mem), settings, today, { ...deps, now: () => new Date(2026, 10, 14, 10) })).toBeNull();
    await sweepRepeating(recordsOf(mem), settings, today, deps);
    expect(repeatList(recordsOf(mem))[0].status).toBe("ended");
    expect(upcomingRepeats(recordsOf(mem), today, "2027-06-01")).toEqual([]);

    const mem2 = shop();
    await withPattern(mem2);
    const w2 = createStockroomWriter(mem2.device());
    await w2.saveBookState("salt-hours", pauseRepeatChange("rep-1", true, today, 2));
    expect(dueRepeats(recordsOf(mem2), "2027-02-01")).toEqual([]);
    await w2.saveBookState("salt-hours", pauseRepeatChange("rep-1", false, "2027-02-01", 3));
    expect(repeatList(recordsOf(mem2))[0].nextDate).toBe("2027-02-01");
  });
});

describe("bills to pay", () => {
  const form = (over: Partial<BillForm> = {}): BillForm => ({ supplier: "Riso Print Co", desc: "Cover run", cat: "Printing & Production", amount: "240", currency: "CAD", billDate: "2026-11-01", dueDate: "2026-11-13", ref: "B-77", note: "", ...over });

  it("asks for a supplier, an amount and a due day", () => {
    const r = checkBill(form({ supplier: " ", amount: "0", dueDate: "" }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(["amount", "dueDate", "supplier"]);
    expect(checkBill(form())).toEqual({ ok: true, amount: 240 });
  });

  it("a bill from a noted cost clears the note in the same save", () => {
    const tc = { pendingExpenses: [{ id: 5, desc: "Cover run", cat: "Printing & Production", estAmount: 230, expectedDate: "2026-11-20" }] };
    const f = billFromNote(tc.pendingExpenses[0], "CAD", today);
    expect(f).toMatchObject({ desc: "Cover run", amount: "230", dueDate: "2026-11-20" });
    const out = saveBill(tc, { ...f, supplier: "Riso Print Co" }, 230, "bill-1", { now: 1, fromNote: 5 });
    expect(out.pendingExpenses).toEqual([]);
    expect(out.bills[0]).toMatchObject({ id: "bill-1", supplier: "Riso Print Co", amount: 230, status: "open" });
  });

  it("paying one logs the expense with the supplier and the bill's file, once", () => {
    let tc: Record<string, any> = saveBill(null, form(), 240, "bill-1", { now: 1, file: "https://files.example/bill.pdf" });
    tc = payBill(tc, "bill-1", { paidDate: "2026-11-12", expenseId: 900, now });
    expect(tc.businessExpenses).toHaveLength(1);
    expect(tc.businessExpenses[0]).toMatchObject({ id: 900, desc: "Riso Print Co — Cover run", amount: 240, date: "2026-11-12", vendor: "Riso Print Co", fromBill: "bill-1" });
    expect(JSON.stringify(tc.businessExpenses[0])).toMatch(/files\.example\/bill\.pdf/);
    expect(tc.bills[0]).toMatchObject({ status: "paid", paidDate: "2026-11-12", expenseId: 900 });
    // A retry is harmless; another try with a new id is refused; a paid bill can't be changed or deleted.
    expect(payBill(tc, "bill-1", { paidDate: "2026-11-12", expenseId: 900, now }).businessExpenses).toHaveLength(1);
    expect(() => payBill(tc, "bill-1", { paidDate: "2026-11-12", expenseId: 901, now })).toThrow(/already marked paid/);
    expect(() => saveBill(tc, form(), 240, "bill-1", { now: 2 })).toThrow(/paid/);
    expect(() => deleteBill(tc, "bill-1")).toThrow(/stays on file/);
  });

  it("sorts late first, warns three days ahead, and the alert names each bill", () => {
    let tc: Record<string, any> = saveBill(null, form({ supplier: "Paper Mill", dueDate: "2026-11-09", amount: "80" }), 80, "late", { now: 1 });
    tc = saveBill(tc, form({ dueDate: "2026-11-13" }), 240, "soon", { now: 2 });
    tc = saveBill(tc, form({ supplier: "Bindery", dueDate: "2026-12-20", amount: "50" }), 50, "later", { now: 3 });
    const rows = sortedBills(tc, today);
    expect(rows.map((r) => [r.bill.id, r.due.state])).toEqual([["late", "overdue"], ["soon", "soon"], ["later", "later"]]);
    expect(billDue(rows[0].bill, today).label).toBe("2 days late");
    expect(billsSummary(rows, now.getTime())).toMatchObject({ openCount: 3, lateCount: 1, soonCount: 1, open: [{ code: "CAD", amount: 370 }] });
    const alert = billsAlert(tc, today)!;
    expect(alert).toMatchObject({ id: "bills-due", late: 1, title: "A bill is past due, 1 more due soon" });
    expect(alert.detail).toMatch(/Paper Mill.*Riso Print Co/);
    expect(billsAlert(tc, "2026-11-01")).toBeNull();
    // The forecast sees each open bill as money going out.
    expect(openBills({ books: [], states: {}, taxCenter: tc }, today).map((b) => [b.id, b.direction, b.late])).toEqual([["later", "out", false], ["soon", "out", false], ["late", "out", true]]);
    expect(openInvoices({ books: [], states: {}, taxCenter: tc }, today)).toEqual([]);
  });
});
