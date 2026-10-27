import { describe, it, expect } from "vitest";
import { buildAdminAlerts, alertSignature, settingsAlerts, inventoryLinkAlerts, backupAlert, alertRoute } from "./adminAlerts";
import { hashForRoute } from "./adminRoute";

const now = Date.parse("2026-10-06T21:00:00Z");
const ago = (min: number) => new Date(now - min * 60000).toISOString();
const ids = (a: any[]) => a.map((x) => x.id);

describe("buildAdminAlerts", () => {
  it("flags an unpaid order with a Stripe payment after 10 minutes", () => {
    const orders = [
      { id: "A", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(30) },
      { id: "B", paymentStatus: "unpaid", stripePaymentIntentId: "pi_2", createdAt: ago(2) },   // too new
      { id: "C", paymentStatus: "unpaid", createdAt: ago(30) },                               // never started paying
      { id: "D", paymentStatus: "unpaid", stripePaymentIntentId: "pi_4", createdAt: ago(30), isTest: true },
    ];
    const a = buildAdminAlerts(orders, null, now);
    expect(ids(a)).toEqual(["unpaid-stripe"]);
    expect(a[0]).toMatchObject({ tone: "danger", orderIds: ["A"], action: "order" });
  });

  it("puts amount mismatches and disputes first and leaves mismatched orders out of 'unpaid'", () => {
    const orders = [
      { id: "M", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(30), paymentMismatch: { ok: false } },
      { id: "X", paymentStatus: "paid", disputeStatus: "needs_response", status: "completed", createdAt: ago(9000) },
    ];
    expect(ids(buildAdminAlerts(orders, null, now))).toEqual(["mismatch", "dispute"]);
  });

  it("warns about inventory conflicts, late shipping, oversold and old manual payments", () => {
    const orders = [
      { id: "L", paymentStatus: "paid", fulfillmentStatus: "paid", createdAt: ago(5 * 1440) },
      { id: "S", paymentStatus: "paid", fulfillmentStatus: "shipped", createdAt: ago(5 * 1440) },
      { id: "O", paymentStatus: "paid", oversold: true, createdAt: ago(60) },
      { id: "I", paymentStatus: "unpaid", inventoryConflict: { provider: "Stripe" }, createdAt: ago(60) },
      { id: "G", paymentStatus: "unpaid", giftCardConflict: { reason: "balance", at: ago(60) }, createdAt: ago(60) },
      { id: "P", paymentStatus: "pending", status: "pending_payment", createdAt: ago(3 * 1440) },
    ];
    const a = buildAdminAlerts(orders, null, now);
    expect(ids(a)).toEqual(["inventory-conflict", "gift-card-conflict", "oversold", "ship-late", "manual-pending"]);
    expect(a.find((x) => x.id === "gift-card-conflict")!.orderIds).toEqual(["G"]);
    expect(a.find((x) => x.id === "ship-late")!.orderIds).toEqual(["L"]);
  });

  it("alerts when the latest webhook was rejected, not once one succeeds after", () => {
    expect(ids(buildAdminAlerts([], { lastFailureAt: ago(60), lastReceivedAt: ago(120) }, now))).toEqual(["webhook"]);
    expect(buildAdminAlerts([], { lastFailureAt: ago(120), lastReceivedAt: ago(60) }, now)).toEqual([]);
  });

  it("signature changes when a new order joins an alert", () => {
    const one = buildAdminAlerts([{ id: "A", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(30) }], null, now)[0];
    const two = buildAdminAlerts([{ id: "A", paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: ago(30) }, { id: "B", paymentStatus: "unpaid", stripePaymentIntentId: "pi_2", createdAt: ago(30) }], null, now)[0];
    expect(alertSignature(one)).not.toBe(alertSignature(two));
    expect(two.action).toBe("orders");
  });

  it("warns about a partial refund on an order not yet shipped", () => {
    const a = buildAdminAlerts([{ id: "R", paymentStatus: "paid", partiallyRefunded: true, createdAt: ago(60) }], null, now);
    expect(ids(a)).toEqual(["partial-refund"]);
  });
});

describe("operational alerts", () => {
  it("ages fulfillment from payment, with legacy creation fallback", () => {
    const rows = buildAdminAlerts([
      { id: "recent", paymentStatus: "paid", createdAt: ago(8 * 1440), paidAt: ago(60) },
      { id: "late", paymentStatus: "paid", createdAt: ago(8 * 1440), paidAt: ago(4 * 1440) },
    ], null, now);
    expect(rows.find(a => a.id === "ship-late")?.orderIds).toEqual(["late"]);
  });
  it("keeps uncertain label purchases visible and links failures to notifications", () => {
    const rows = buildAdminAlerts([{ id: "label", operations: { labelPurchasePending: true } }], null, now, [{ id: "email", status: "failed", at: ago(10) }]);
    expect(rows.find(a => a.id === "label-purchase-uncertain")?.orderIds).toEqual(["label"]);
    expect(rows.find(a => a.id === "email-failed")?.action).toBe("notifications");
  });
  it("warns about emails waiting to retry, and stops once the queue delivered one", () => {
    const waiting = buildAdminAlerts([], null, now, [{ id: "q", status: "queued", outboxId: "o1", at: ago(10) }]);
    expect(waiting.find(a => a.id === "email-queued")?.action).toBe("notifications");
    const delivered = buildAdminAlerts([], null, now, [{ id: "s", status: "sent", outboxId: "o1", at: ago(1) }, { id: "f", status: "failed", outboxId: "o1", at: ago(5) }, { id: "q", status: "queued", outboxId: "o1", at: ago(10) }]);
    expect(delivered.find(a => a.id === "email-queued")).toBeUndefined();
    expect(delivered.find(a => a.id === "email-failed")).toBeUndefined();
  });
  it("does not alarm when Gmail missed but the backup sender delivered", () => {
    const rows = buildAdminAlerts([], null, now, [{ id: "g", status: "fallback", at: ago(10) }, { id: "r", status: "sent", at: ago(10) }]);
    expect(rows.find(a => a.id === "email-failed")).toBeUndefined();
  });
});

it("surfaces provider reconciliation without claiming it marks an order paid", () => {
  const rows = buildAdminAlerts([{ id: "P", paymentStatus: "unpaid", reconciliationPending: { provider: "stripe" }, createdAt: ago(1) }], null, now);
  expect(rows.find(a => a.id === "payment-reconciliation")?.orderIds).toEqual(["P"]);
  expect(rows.find(a => a.id === "payment-reconciliation")?.detail).toMatch(/signed webhook/);
});

describe("gift cards not issued", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const paid = (minsAgo: number, extra: any = {}) => ({ id: "o1", paymentStatus: "paid", paidAt: new Date(now - minsAgo * 60000).toISOString(), items: [{ id: "gc", giftCard: true }], ...extra });
  it("warns when a paid gift card order has no card after 10 minutes", () => {
    expect(buildAdminAlerts([paid(11)], null, now).map(a => a.id)).toContain("gift-cards-not-issued");
  });
  it("stays quiet while issuing may still be running, once issued, and for test orders", () => {
    for (const order of [paid(5), paid(30, { giftCardsIssuedAt: "t" }), paid(30, { isTest: true })]) {
      expect(buildAdminAlerts([order], null, now).map(a => a.id)).not.toContain("gift-cards-not-issued");
    }
  });
});

describe("settings alerts", () => {
  it("warns site-wide while test mode is on", () => {
    expect(settingsAlerts({ payments: { testMode: true } })).toEqual([expect.objectContaining({ id: "test-mode", action: "payments" })]);
    expect(settingsAlerts({ payments: { testMode: false } })).toEqual([]);
    expect(settingsAlerts(null)).toEqual([]);
  });
});

describe("inventory app link alerts", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  it("say nothing until sales are switched on", () => {
    expect(inventoryLinkAlerts({ connection: { ok: false } }, now)).toEqual([]);
    expect(inventoryLinkAlerts(null, now)).toEqual([]);
  });
  it("flag a broken connection, stalled checks, sales waiting a day and refused labels", () => {
    const alerts = inventoryLinkAlerts({
      startDay: "2026-10-01", connection: { ok: false }, lastRunAt: "2026-10-11T13:00:00Z",
      pendingImport: { count: 3, oldestSince: "2026-10-09T12:00:00Z" }, lastPush: { failed: 2 },
      shipmentIssues: [{ orderId: "A-1", reason: "Resolve the active return before dispatching the order.", at: "2026-10-11T14:00:00Z" }],
    }, now);
    expect(alerts.map((a) => a.id)).toEqual(["inventory-link-down", "inventory-link-stalled", "inventory-link-waiting", "inventory-link-push", "inventory-label-A-1"]);
    expect(alerts[0]).toMatchObject({ tone: "danger", action: "inventory" });
    expect(alerts[4]).toMatchObject({ action: "order", orderIds: ["A-1"] });
  });
  it("extra website sales in the app only alert once nothing waits to be imported (a refund may be on its way)", () => {
    const base = { startDay: "2026-10-01", connection: { ok: true }, lastRunAt: "2026-10-11T14:58:00Z", lastSync: { appAhead: [{ title: "The Hound" }] } };
    expect(inventoryLinkAlerts({ ...base, pendingImport: { count: 1, oldestSince: "2026-10-11T14:00:00Z" } }, now).map((a) => a.id)).toEqual([]);
    expect(inventoryLinkAlerts({ ...base, pendingImport: { count: 0 } }, now).map((a) => a.id)).toEqual(["inventory-link-ahead"]);
  });
  it("books that can be matched, until they are", () => {
    const base = { startDay: "2026-10-01", connection: { ok: true }, lastRunAt: "2026-10-11T14:58:00Z" };
    const items = [{ key: "b2|", bookId: "b2", variantId: null, title: "Altrove", edition: "", inventoryBookId: "altrove" }];
    const [alert] = inventoryLinkAlerts({ ...base, newMatches: { items }, links: { b1: { _: "hound" } } }, Date.parse("2026-10-11T15:00:00Z"));
    expect(alert).toMatchObject({ id: "inventory-link-new-books", tone: "info", action: "inventory", title: "1 book can be matched to the inventory app" });
    expect(inventoryLinkAlerts({ ...base, newMatches: { items }, links: { b2: { _: "altrove" } } }, Date.parse("2026-10-11T15:00:00Z"))).toEqual([]);
    // No links at all (Unmatch all), or the inventory app book already matched elsewhere: nothing to offer.
    expect(inventoryLinkAlerts({ ...base, newMatches: { items }, links: {} }, Date.parse("2026-10-11T15:00:00Z"))).toEqual([]);
    expect(inventoryLinkAlerts({ ...base, newMatches: { items }, links: { b9: { _: "altrove" } } }, Date.parse("2026-10-11T15:00:00Z"))).toEqual([]);
  });
  it("a healthy link is quiet", () => {
    expect(inventoryLinkAlerts({ startDay: "2026-10-01", connection: { ok: true }, lastRunAt: "2026-10-11T14:58:00Z", pendingImport: { count: 1, oldestSince: "2026-10-11T14:00:00Z" } }, now)).toEqual([]);
  });
});

describe("alertRoute", () => {
  const hash = (a: any) => { const r = alertRoute(a); return r ? hashForRoute(r) : null; };
  it("opens the sub tab that holds the fix", () => {
    expect(hash(inventoryLinkAlerts({ startDay: "2026-10-01", connection: { ok: false } }, now)[0])).toBe("#inventory/link");
    const emails = buildAdminAlerts([], null, now, [
      { id: "e1", status: "failed", at: ago(60) },
      { id: "e2", status: "queued", outboxId: "q1", at: ago(30) },
    ]);
    expect(hash(emails.find((a) => a.id === "email-failed"))).toBe("#settings/notifications/deliveries");
    expect(hash(emails.find((a) => a.id === "email-queued"))).toBe("#settings/notifications/deliveries");
    expect(hash({ action: "webhook" })).toBe("#settings/payments/methods");
    // Test mode is switched off on the first Payments tab.
    expect(hash(settingsAlerts({ payments: { testMode: true } })[0])).toBe("#settings/payments");
    expect(hash(backupAlert({ lastAttemptAt: "2026-10-06T07:17:00Z", ok: false, error: "x" } as any, now))).toBe("#settings/general/tools");
  });
  it("leaves order, orders and retry buttons to their own handlers", () => {
    expect(alertRoute({ action: "order" })).toBeNull();
    expect(alertRoute({ action: "orders" })).toBeNull();
    expect(alertRoute({ action: "retry" })).toBeNull();
  });
});

describe("held stock alert", () => {
  const state = (holds: any[]) => ({ startDay: "2026-10-01", autoSync: true, lastRunAt: new Date().toISOString(), lastSync: { holds } });
  const hold = { bookId: "b1", variantId: "", title: "Injured", hold: "big-change", from: 3, to: 40 };

  it("names the book and stays hidden until the held change itself changes", () => {
    const [a] = inventoryLinkAlerts(state([hold]));
    expect(a.detail).toContain("Injured");
    expect(alertSignature(inventoryLinkAlerts(state([hold]))[0])).toBe(alertSignature(a));
    expect(alertSignature(inventoryLinkAlerts(state([{ ...hold, to: 41 }]))[0])).not.toBe(alertSignature(a));
    expect(alertSignature(inventoryLinkAlerts(state([hold, { ...hold, bookId: "b2", title: "Salt" }]))[0])).not.toBe(alertSignature(a));
  });
});
