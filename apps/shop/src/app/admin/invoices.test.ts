import { describe, expect, test } from "vitest";
import { invoiceLine, invoiceOpen, invoiceOverdue } from "./invoices";
import { buildAdminAlerts } from "./adminAlerts";

const DAY = 86400000;
const now = Date.parse("2026-12-20T12:00:00Z");
const order = (extra: any = {}) => ({ id: "o1", orderId: "O1", paymentStatus: "paid", status: "open", invoice: { days: 30, dueAt: "2026-12-10T00:00:00.000Z", paidAt: null }, ...extra });

describe("trade invoices", () => {
  test("an unpaid invoice is open until the owner records it, and cancelled or refunded ones are not owed", () => {
    expect(invoiceOpen(order())).toBe(true);
    expect(invoiceOpen(order({ invoice: { days: 30, dueAt: "x", paidAt: "2026-12-12T00:00:00Z" } }))).toBe(false);
    expect(invoiceOpen(order({ status: "cancelled" }))).toBe(false);
    expect(invoiceOpen(order({ paymentStatus: "refunded" }))).toBe(false);
    expect(invoiceOpen({ paymentStatus: "paid" })).toBe(false);
  });
  test("overdue means open and past its due date", () => {
    expect(invoiceOverdue(order(), now)).toBe(true);
    expect(invoiceOverdue(order({ invoice: { days: 30, dueAt: new Date(now + DAY).toISOString(), paidAt: null } }), now)).toBe(false);
    expect(invoiceOverdue(order({ invoice: { days: 30, dueAt: "nonsense", paidAt: null } }), now)).toBe(false);
  });
  test("the order page line says due, overdue or paid in plain words", () => {
    expect(invoiceLine(order(), now)).toBe("Invoice was due Dec 10, 2026. It is overdue.");
    expect(invoiceLine(order({ invoice: { days: 30, dueAt: "2026-12-30T00:00:00.000Z", paidAt: null } }), now)).toBe("Invoice due Dec 30, 2026.");
    expect(invoiceLine(order({ invoice: { days: 30, dueAt: "2026-12-10T00:00:00.000Z", paidAt: "2026-12-15T00:00:00.000Z" } }), now)).toBe("Invoice paid on Dec 15, 2026.");
    expect(invoiceLine({}, now)).toBe("");
  });
  test("an overdue invoice raises one alert listing its orders; a paid one does not", () => {
    const alerts = buildAdminAlerts([order(), order({ id: "o2", orderId: "O2", invoice: { days: 30, dueAt: "2026-12-01T00:00:00.000Z", paidAt: "2026-12-05T00:00:00.000Z" } })], null, now);
    const found = alerts.find(a => a.id === "invoice-overdue");
    expect(found?.orderIds).toEqual(["o1"]);
    expect(found?.title).toBe("1 invoice is overdue");
    expect(buildAdminAlerts([order({ invoice: { days: 30, dueAt: "2026-12-30T00:00:00.000Z", paidAt: null } })], null, now).some(a => a.id === "invoice-overdue")).toBe(false);
  });
});
