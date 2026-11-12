import { describe, expect, it } from "vitest";

import { buildShipping } from "./shipping";
import type { StockroomRecords } from "./stockroomData";
import { buildStockists, moneyText, recentMovements, stockistsSummary } from "./stockists";

const NOW = new Date(2026, 10, 11, 12);
const day = (ago: number) => new Date(NOW.getTime() - ago * 86_400_000).toISOString().slice(0, 10);
const book = (id: string, extra: object = {}) => ({ id, title: id, maxPrint: 100, currency: "CAD", ...extra });
const records = (states: StockroomRecords["states"], books = Object.keys(states).map((id) => book(id)), taxCenter: StockroomRecords["taxCenter"] = null): StockroomRecords => ({ books, states, taxCenter });
const ship = (id: number, storeId: number, qty: number, extra: object = {}) => ({ id, type: "Shipment", storeId, storeName: "Corner", date: day(30), qty, amountDue: 0, status: "OK", ...extra });
const sale = (id: number, storeId: number, qty: number, amountDue: number, status = "pending", extra: object = {}) => ({ id, type: "Sale", storeId, storeName: "Corner", date: day(10), qty, rate: 40, amountDue, status, ...extra });

describe("stockists", () => {
  const states = {
    a: {
      stores: [{ id: 1, name: "Corner", sent: 10, sold: 4, returned: 0, outstanding: 6, amountOwed: 48, rate: 40 }],
      ledger: [ship(1, 1, 10), sale(2, 1, 4, 48)],
      invoices: [
        { id: "i1", num: "INV-1", status: "sent", dueDate: day(20), total: 48, currency: "CAD", storeName: "Corner", storeId: 1, reminders: [{ status: "sent", at: 1 }] },
        { id: "i2", num: "INV-2", status: "paid", dueDate: day(40), total: 10, currency: "CAD", storeName: "corner", storeId: 1 },
        { id: "i3", num: "INV-3", status: "sent", dueDate: day(5), total: 7, currency: "CAD", billTo: "person", storeName: "A Person" },
      ],
    },
    b: { stores: [{ id: 9, name: "corner ", sent: 2, sold: 0, returned: 0, outstanding: 2, amountOwed: 5 }], ledger: [ship(5, 9, 2)] },
  };
  const view = buildStockists(records(states, [book("a"), book("b", { currency: "EUR" })]), NOW);

  it("merges one stockist across titles and keeps each currency apart", () => {
    expect(view.stockists).toHaveLength(1);
    const s = view.stockists[0];
    expect(s.sent).toBe(12);
    expect(s.onShelf).toBe(8);
    expect(moneyText(s.owed)).toBe("CA$48.00 + €5.00");
  });

  it("flags only a sent invoice past its due date, and counts a person's overdue invoice on the page", () => {
    const s = view.stockists[0];
    expect(s.overdue.map((i) => i.num)).toEqual(["INV-1"]);
    expect(s.overdue[0].daysLate).toBe(20);
    expect(s.overdue[0].chased).toBe(1);
    expect(s.state).toBe("overdue");
    expect(view.overdueCount).toBe(2);
    expect(view.otherOverdue).toBe(1);
  });

  it("flags a card whose totals disagree with the ledger, and a card that agrees is quiet", () => {
    const off = buildStockists(records({ a: { ...states.a, stores: [{ ...states.a.stores[0], sold: 3, outstanding: 7 }], invoices: [] } }), NOW).stockists[0];
    expect(off.mismatch).toBe(true);
    expect(off.state).toBe("mismatch");
    const ok = buildStockists(records({ a: { ...states.a, invoices: [] } }), NOW).stockists[0];
    expect(ok.mismatch).toBe(false);
    expect(ok.owedMismatch).toBe(false);
    expect(ok.state).toBe("owes");
  });

  it("does not count a voided sale as owed by the ledger", () => {
    const s = buildStockists(records({ a: { stores: states.a.stores, ledger: [ship(1, 1, 10), sale(2, 1, 4, 48, "pending", { voided: true })], invoices: [] } }), NOW).stockists[0];
    expect(s.titles[0].ledgerOwed).toEqual([]);
    expect(s.titles[0].owedMismatch).toBe(true);
  });

  it("is empty with no stores", () => {
    expect(buildStockists(records({ a: {} }), NOW).stockists).toEqual([]);
  });
});

describe("shipping", () => {
  const web = (num: string, ago: number, extra: object = {}) => ({ id: 1, chan: "Website", num, date: day(ago), qty: 1, shipName: "Ada", shipAddr1: "1 St", shipCity: "Toronto", shipCountry: "Canada", shippingPaid: 8, ...extra });
  const postage = (num: string, amount: number) => ({ id: `p${num}`, cat: "Shipping & Postage", desc: "Canada Post label", amount, baseAmount: amount, shippingMatchStatus: "matched", shippingOrderNumber: num });
  const state = { hist: [web("WEB-1", 9), web("WEB-1", 9, { id: 2 }), web("WEB-2", 1), web("WEB-3", 12, { shipped: true }), web("WEB-4", 5), web("WEB-5", 6, { shipAddr1: "", shipCity: "" })] };

  it("lists paid website orders still unsent, oldest first, one line per parcel", () => {
    const v = buildShipping(records({ a: state }, [book("a")], { businessExpenses: [postage("WEB-4", 14)] }), NOW);
    expect(v.waiting.map((o) => o.num)).toEqual(["WEB-1"]);
    expect(v.waiting[0]).toMatchObject({ qty: 2, days: 9, late: true });
  });

  it("flags a parcel that cost over 50 cents more than the customer paid, not one within the margin", () => {
    const v = buildShipping(records({ a: { hist: [web("WEB-4", 5), web("WEB-6", 5)] } }, [book("a")], { businessExpenses: [postage("WEB-4", 14.5), postage("WEB-6", 8.4)] }), NOW);
    expect(v.losses.map((l) => [l.num, l.gap])).toEqual([["WEB-4", 6.5]]);
    expect(v.lossTotal).toBe(6.5);
  });

  it("leaves a euro book out of the dollar comparison", () => {
    const v = buildShipping(records({ a: { hist: [web("WEB-4", 5)] } }, [book("a", { currency: "EUR" })], { businessExpenses: [postage("WEB-4", 30)] }), NOW);
    expect(v.losses).toEqual([]);
  });
});


describe("Stockists v4 summary", () => {
  const states = {
    a: {
      stores: [{ id: 1, name: "Corner", sent: 10, sold: 6, returned: 0, outstanding: 4, amountOwed: 24, rate: 40 }],
      ledger: [ship(1, 1, 10), sale(2, 1, 4, 48, "paid"), sale(3, 1, 2, 24), sale(4, 1, 5, 60, "pending", { voided: true, date: day(1) })],
      invoices: [
        { id: "i1", num: "INV-1", status: "paid", paidAt: new Date(2026, 3, 2).getTime(), total: 48, currency: "CAD", storeName: "Corner", storeId: 1 },
        { id: "i0", num: "INV-0", status: "paid", paidAt: new Date(2025, 11, 30).getTime(), total: 12, currency: "CAD", storeName: "Corner", storeId: 1 },
        { id: "i2", num: "INV-2", status: "sent", total: 24, currency: "CAD", storeName: "Corner", storeId: 1 },
      ],
    },
  };
  const view = buildStockists(records(states), NOW);

  it("counts copies out, sold-not-paid copies and what was settled this year", () => {
    const sum = stockistsSummary(view, NOW);
    expect(sum.unitsOut).toBe(4);
    expect(sum.pendingUnits).toBe(2);
    expect(moneyText(sum.settledThisYear)).toBe("CA$48.00");
    expect(sum.settledCount).toBe(1);
    expect(sum.lastSettled.corner).toBe(new Date(2026, 3, 2).getTime());
  });

  it("lists the newest movements first and leaves voided ones out", () => {
    const rows = recentMovements(view, 2);
    expect(rows.map((r) => r.qty)).toEqual([2, 4]);
    expect(rows[0].shop).toBe("Corner");
  });
});
