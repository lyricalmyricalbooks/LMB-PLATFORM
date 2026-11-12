// Invoices in the admin: the old app's numbering, payload, ledger links and settings, through the real write layer over
// the in-memory stockroom (WRITING.md › Testing a page that writes).
import { describe, expect, it } from "vitest";
import { assembleParts, stitchState } from "@stockroom/merge-state.js";

import {
  blankForm, cleanInvoiceSettings, copyForm, DEFAULT_TERMS, invoiceEmail, deleteInvoiceChange, formFromInvoice, invoiceList, invoiceProblem, invoiceSettingsChange, inFilter, invoicesSummary,
  markSentChange, nextNumber, pendingSaleLines, saveInvoiceChange, type InvoiceForm,
} from "./invoiceMake";
import { invoicePaperHtml } from "./invoicePaper";
import type { BookState } from "./planSave";
import { invoiceSettingsFromCopy } from "./stockroomCopies";
import type { StockroomRecords } from "./stockroomData";
import { MemoryStockroom } from "./stockroomMemory";
import { createStockroomWriter } from "./stockroomWrite";

const salt = { id: "salt-hours", title: "Salt Hours", currency: "CAD", listPrice: 20, maxPrint: 100 };
const night = { id: "night-songs", title: "Night Songs", currency: "CAD", listPrice: 18, maxPrint: 100 };
const start = (): BookState => ({
  ...stitchState({ metadata: { stock: 80 } }),
  stores: [{ id: 1, name: "Corner Books", email: "corner@example.com", city: "Toronto", sent: 10, sold: 6, returned: 0, outstanding: 4, amountOwed: 72 }],
  ledger: [
    { id: 1, type: "Shipment", storeId: 1, storeName: "Corner Books", date: "2026-10-01", qty: 10, amountDue: 0, status: "OK", sheetsId: "s1" },
    { id: 2, type: "Sale", storeId: 1, storeName: "Corner Books", date: "2026-10-20", qty: 4, rate: 40, amountDue: 48, status: "pending", sheetsId: "s2" },
    { id: 3, type: "Sale", storeId: 1, storeName: "Corner Books", date: "2026-10-28", qty: 2, rate: 40, amountDue: 24, status: "pending", sheetsId: "s3", invoiceId: "old", invoiceNum: "INV-SALT-H-2026-001" },
  ],
  invoices: [{ id: "old", num: "INV-SALT-H-2026-001", status: "sent", date: "2026-10-29", total: 24, currency: "CA$", storeName: "Corner Books", storeId: 1, items: [{ _ledgerId: 3, qty: 2, unitPrice: 12 }] }],
  invoiceSeq: 1,
});
const records = (): StockroomRecords => ({ books: [salt, night], states: { "salt-hours": start() as any, "night-songs": {} }, taxCenter: null });
const settings = cleanInvoiceSettings({ name: "Moth Press", addr: "1 Example St\nToronto" });
const now = new Date(2026, 10, 11);

function shop() {
  const mem = new MemoryStockroom();
  mem.putCatalog([salt, night]);
  mem.putBook("salt-hours", start());
  return mem;
}
const readBack = (mem: MemoryStockroom) => stitchState(assembleParts(mem.parts.get("salt-hours") ?? {}).parts) as Record<string, any>;
const filled = (f: InvoiceForm): InvoiceForm => ({ ...f, items: [{ description: "Salt Hours", qty: "3", unitPrice: "12", discountPct: "", ledgerId: null, bookId: "" }] });

describe("invoice details", () => {
  it("fills the press's name and the usual terms, and saving keeps anything else stored beside them", () => {
    expect(cleanInvoiceSettings(null, "Moth Press")).toMatchObject({ name: "Moth Press", terms: DEFAULT_TERMS, bank: "" });
    const next = invoiceSettingsChange({ ...settings, bank: " Acct 123 " })({ remindAuto: true, name: "Old" });
    expect(next).toMatchObject({ remindAuto: true, name: "Moth Press", bank: "Acct 123" });
  });
  it("brings an old app's copy back without its card key", () => {
    expect(invoiceSettingsFromCopy({ name: "Moth Press", stripeKey: "sk_test_x" })).toEqual({ name: "Moth Press" });
    expect(invoiceSettingsFromCopy({ stripeKey: "sk_test_x" })).toBeUndefined();
  });
});

describe("numbering, as the old app numbers", () => {
  it("one title keeps its code and counts on; several titles get the press's initials", () => {
    expect(nextNumber(records(), "salt-hours", ["salt-hours"], "Moth Press", 2026)).toBe("INV-SALT-H-2026-002");
    expect(nextNumber(records(), "salt-hours", ["salt-hours", "night-songs"], "Moth Press", 2026)).toBe("INV-MP-2026-001");
  });
  it("a new form bills the first stockist, filed under a title it holds, due in 30 days", () => {
    const f = blankForm(records(), settings, { now });
    expect(f).toMatchObject({ billTo: "store", stockist: "Corner Books", ownerBookId: "salt-hours", num: "INV-SALT-H-2026-002", date: "2026-11-11", dueDate: "2026-12-11", terms: DEFAULT_TERMS, currencyCode: "CAD" });
  });
});

describe("the form", () => {
  it("says what stops a save", () => {
    const f = blankForm(records(), settings, { now });
    expect(invoiceProblem(f, records())).toBe("Add at least one line.");
    expect(invoiceProblem({ ...blankForm(records(), settings, { now, person: true }), items: filled(f).items }, records())).toBe("Enter who this invoice is for.");
    expect(invoiceProblem({ ...filled(f), ownerBookId: "night-songs" }, records())).toMatch(/no copies of that title/);
    expect(invoiceProblem(filled(f), records())).toBeNull();
  });
  it("adds only unpaid sales not already on another invoice", () => {
    const { lines, skipped } = pendingSaleLines(records(), blankForm(records(), settings, { now }));
    expect(skipped).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ qty: "4", unitPrice: "12", ledgerId: 2, bookId: "salt-hours" });
    expect(lines[0].description).toMatch(/^Salt Hours — consignment sale/);
  });
});

describe("saving through the write layer", () => {
  it("files a new invoice the old app can read, links its sales and moves the counter", async () => {
    const mem = shop();
    const r = records();
    const f = blankForm(r, settings, { now });
    const form = { ...f, items: pendingSaleLines(r, f).lines, discountType: "percent" as const, discountValue: "10", taxRate: "13" };
    const result = await createStockroomWriter(mem.device()).saveBookState("salt-hours", saveInvoiceChange(form, "sent", { books: r.books, id: "inv-new", now: 5 }));
    expect(result.status).toBe("saved");
    const back = readBack(mem);
    const inv = back.invoices.find((i: any) => i.id === "inv-new");
    expect(inv).toMatchObject({ num: "INV-SALT-H-2026-002", status: "sent", billTo: "store", storeId: 1, storeName: "Corner Books", storeEmail: "corner@example.com",
      subtotal: 48, discount: 4.8, discountType: "percent", discountRate: 10, taxRate: 13, tax: 5.62, total: 48.82, currency: "CA$", currencyCode: "CAD", bookIds: ["salt-hours"] });
    expect(back.invoiceSeq).toBe(2);
    expect(back.ledger[1]).toMatchObject({ invoiceId: "inv-new", invoiceNum: "INV-SALT-H-2026-002" });
    // A retry with the same id never files it twice.
    await createStockroomWriter(mem.device()).saveBookState("salt-hours", saveInvoiceChange(form, "sent", { books: r.books, id: "inv-new", now: 6 }));
    expect(readBack(mem).invoices.filter((i: any) => i.id === "inv-new")).toHaveLength(1);
    // Another tab that opened its form before this one was filed picked the same number: refused, nothing filed.
    expect(() => saveInvoiceChange(form, "sent", { books: r.books, id: "inv-other-tab", now: 7 })(readBack(mem))).toThrow(/was filed while this form was open/);
  });

  it("an edit keeps it paid, keeps its reminders, and unlinks a sale taken off it", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    await writer.saveBookState("salt-hours", (s: any) => { Object.assign(s.invoices[0], { status: "paid", paidAt: 9, reminders: [{ at: 1 }] }); return s; });
    const r = { ...records(), states: { ...records().states, "salt-hours": readBack(mem) } };
    const row = invoiceList(r, now).find((x) => x.id === "old")!;
    const form = { ...formFromInvoice(r, row), notes: "Thanks!", items: [{ description: "Fixed line", qty: "2", unitPrice: "12", discountPct: "", ledgerId: null, bookId: "" }] };
    await writer.saveBookState("salt-hours", saveInvoiceChange(form, "sent", { books: r.books, id: "unused", now: 10 }));
    const back = readBack(mem);
    expect(back.invoices[0]).toMatchObject({ id: "old", status: "paid", paidAt: 9, reminders: [{ at: 1 }], notes: "Thanks!", total: 24 });
    expect(back.ledger[2].invoiceId).toBeNull();
  });

  it("marks a draft sent, and refuses to delete a paid invoice with nothing written", async () => {
    const mem = shop();
    const writer = createStockroomWriter(mem.device());
    await writer.saveBookState("salt-hours", (s: any) => { s.invoices.push({ id: "d1", num: "D", status: "draft", items: [] }); return s; });
    await writer.saveBookState("salt-hours", markSentChange("d1", 7));
    expect(readBack(mem).invoices[1]).toMatchObject({ status: "sent", updatedAt: 7 });
    await writer.saveBookState("salt-hours", (s: any) => { s.invoices[0].status = "paid"; return s; });
    const before = JSON.stringify(readBack(mem));
    await expect(writer.saveBookState("salt-hours", deleteInvoiceChange("old"))).rejects.toThrow(/paid invoice stays on file/);
    expect(JSON.stringify(readBack(mem))).toBe(before);
  });

  it("deletes an unpaid invoice and frees its sales", async () => {
    const mem = shop();
    await createStockroomWriter(mem.device()).saveBookState("salt-hours", deleteInvoiceChange("old"));
    const back = readBack(mem);
    expect(back.invoices).toEqual([]);
    expect(back.ledger[2]).toMatchObject({ invoiceId: null, invoiceNum: null });
  });
});

describe("the printed invoice", () => {
  it("prints the press, who it bills, every figure and the bank details, escaped", () => {
    const html = invoicePaperHtml({ num: "INV-1", status: "sent", date: "2026-10-01", dueDate: "2026-10-31", storeName: "Corner <Books>", currencyCode: "CAD",
      items: [{ description: "Salt Hours", qty: 3, unitPrice: 12, discountPct: 10 }], subtotal: 32.4, discount: 0, taxRate: 13, tax: 4.21, total: 36.61, paymentLink: "pay@example.com" },
      { ...settings, bank: "Acct 123", footer: "Thank you." }, "2026-11-11");
    expect(html).toContain("Moth Press");
    expect(html).toContain("Corner &lt;Books&gt;");
    expect(html).toContain("INV-1 · Overdue");
    expect(html).toContain("Disc.");
    expect(html).toContain("$36.61");
    expect(html).toContain("Interac e-Transfer");
    expect(html).toContain("Acct 123");
    expect(html).toContain("Thank you.");
  });
});

describe("duplicate and email an invoice (old duplicateInvoiceFromView, invoiceEmailPlainText)", () => {
  it("copies to a new draft dated today, keeps the due gap and drops sale links", () => {
    const r = records();
    const row = invoiceList(r, now).find((x) => x.id === "old")!;
    const inv = { ...row.inv, dueDate: "2026-11-13" };
    const f = copyForm(r, cleanInvoiceSettings({}, "Test Press"), { ...row, inv }, new Date(2026, 10, 11));
    expect(f).toMatchObject({ editingId: null, date: "2026-11-11", dueDate: "2026-11-26", status: "draft", linkedDropped: 1 });
    expect(f.num).not.toBe(row.num);
    expect(f.items.every((it) => it.ledgerId === null)).toBe(true);
  });
  it("writes the old email words", () => {
    const m = invoiceEmail({ num: "INV-1", total: 24, date: "2026-10-29", storeName: "Corner Books", storeEmail: "corner@example.com" }, cleanInvoiceSettings({}, "Test Press"), "CAD");
    expect(m.to).toBe("corner@example.com");
    expect(m.subject).toBe("Invoice INV-1 — Test Press");
    expect(m.body.startsWith("Hi Corner Books,\n\nYour invoice INV-1 for")).toBe(true);
    expect(m.body.endsWith("Thank you,\nTest Press")).toBe(true);
  });
});

describe("v4 Invoices tiles and filters", () => {
  const now = new Date(2026, 10, 12, 12);
  const recs = (): StockroomRecords => {
    const st = start() as any;
    st.invoices = [
      { id: "a", num: "A", status: "draft", date: "2026-11-10", total: 10, currency: "CA$", storeName: "Corner Books" },
      { id: "b", num: "B", status: "sent", date: "2026-11-01", dueDate: "2026-11-20", total: 20, currency: "CA$", storeName: "Corner Books" },
      { id: "c", num: "C", status: "sent", date: "2026-10-01", dueDate: "2026-10-15", total: 30, currency: "CA$", storeName: "Corner Books" },
      { id: "d", num: "D", status: "paid", date: "2026-10-20", total: 40, currency: "CA$", paidAt: now.getTime() - 5 * 86400000, storeName: "Corner Books" },
      { id: "e", num: "E", status: "paid", date: "2026-08-01", total: 50, currency: "CA$", paidAt: now.getTime() - 60 * 86400000, storeName: "Corner Books" },
    ];
    return { books: [salt, night], states: { "salt-hours": st, "night-songs": {} }, taxCenter: null };
  };
  it("counts each filter and adds money from the rows", () => {
    const rows = invoiceList(recs(), now);
    const sum = invoicesSummary(rows, now.getTime());
    expect(sum.counts).toEqual({ all: 5, draft: 1, sent: 1, overdue: 1, paid: 2 });
    expect(sum.outstanding).toEqual([{ code: "CAD", amount: 50 }]);
    expect(sum.outstandingCount).toBe(2);
    expect(sum.overdue).toEqual([{ code: "CAD", amount: 30 }]);
    expect(sum.paid30).toEqual([{ code: "CAD", amount: 40 }]);
    expect(sum.paid30Count).toBe(1);
    expect(rows.filter((r) => inFilter(r, "sent")).map((r) => r.num)).toEqual(["B"]);
  });
});
