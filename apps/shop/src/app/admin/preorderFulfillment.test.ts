import { describe, it, expect, vi, afterEach } from "vitest";
import { queueOf, dispatchProblem, addressKey, packingKey, preorderShipDate } from "./fulfillment";
import { deskOrders, rowStatus } from "./ordersDesk";
import { buildAdminAlerts as adminAlerts } from "./adminAlerts";
import { repriceCart } from "../CartContext";
import { restampPreorderItems, preorderClockStart, waitingPreorderLines } from "../features/site/preorder";
// @ts-ignore
import * as serverRule from "../../../functions/shared/preorder.js";
const srvRule: any = (serverRule as any).default ?? serverRule;
// @ts-ignore - CommonJS server modules
import * as guard from "../../../functions/fulfillmentGuard.js";
// @ts-ignore
import * as digest from "../../../functions/orderDigest.js";
const { labelProblem } = (guard as any).default ?? guard;
const { buildOrderDigest } = (digest as any).default ?? digest;

const NOW = new Date("2026-10-08T16:00:00Z");
afterEach(() => vi.useRealTimers());

const address = { street: "1 King St W", city: "Toronto", state: "ON", zip: "M5H 1A1", country: "CA" };
function paidOrder(items: any[], extra: any = {}) {
  const o: any = { id: "o1", orderId: "LM-1", paymentStatus: "paid", status: "paid", paidAt: "2026-09-01T12:00:00Z", customer: { name: "R", email: "r@x.ca", address }, items, ...extra };
  o.operations = { addressReviewed: addressKey(o), ...(extra.operations || {}) };
  return o;
}
const pre = { id: "b1", title: "Coming Soon", quantity: 1, price: 20, format: "Paperback", preorder: true, releaseDate: "2026-11-12" };

describe("pre-orders in the fulfillment desk", () => {
  it("waits in Awaiting release, can't be dispatched, then joins Ready to pack on release day", () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const o = paidOrder([pre]);
    expect(queueOf(o)).toBe("Awaiting release");
    expect(preorderShipDate(o)).toBe("2026-11-12");
    expect(dispatchProblem(o)).toMatch(/Pre-order/);
    expect(deskOrders([o], "needs")).toEqual([]);
    expect(deskOrders([o], "preorders").map((x) => x.id)).toEqual(["o1"]);
    expect(rowStatus(o).text).toContain("2026-11-12");
    vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
    expect(queueOf(o)).toBe("Ready to pack");
  });

  it("“Ready to ship now” releases it early", () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    expect(queueOf(paidOrder([pre], { operations: { preorderReleased: true } }))).toBe("Ready to pack");
  });

  it("digital pre-orders and ordinary books never hold a parcel", () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    expect(queueOf(paidOrder([{ ...pre, format: "E-book (EPUB)", digital: true }]))).toBe("Completed");
    expect(queueOf(paidOrder([{ ...pre, preorder: false, releaseDate: null }]))).toBe("Ready to pack");
  });

  it("the server refuses a carrier label until release (or early release)", () => {
    const o = paidOrder([pre]);
    const ops = { addressReviewed: addressKey(o), packed: packingKey(o) };
    expect(labelProblem(o, ops)).toMatch(/pre-order/);
    expect(labelProblem(o, { ...ops, preorderReleased: true })).toBe("");
  });

  it("no “waited over 3 days” alert before release; the clock starts on release day", () => {
    const o = paidOrder([pre]);
    expect(adminAlerts([o], null, NOW.getTime()).some((a: any) => a.id === "ship-late")).toBe(false);
    expect(adminAlerts([o], null, Date.parse("2026-11-13T16:00:00Z")).some((a: any) => a.id === "ship-late")).toBe(false);
    expect(adminAlerts([o], null, Date.parse("2026-11-16T16:00:00Z")).some((a: any) => a.id === "ship-late")).toBe(true);
    const d = buildOrderDigest([o], new Map(), NOW.getTime());
    expect(d.unshipped).toEqual([]);
  });
});

describe("review fixes", () => {
  it("a digital pre-order next to an in-stock paperback doesn't silence the ship-late alert or digest", () => {
    const o = paidOrder([{ id: "p", title: "Ready", quantity: 1, price: 10, format: "Paperback" }, { ...pre, id: "e", format: "E-book (EPUB)", digital: true, releaseDate: "2026-12-31" }]);
    expect(queueOf(o)).not.toBe("Awaiting release");
    expect(adminAlerts([o], null, NOW.getTime()).some((a: any) => a.id === "ship-late")).toBe(true);
    expect(buildOrderDigest([o], new Map(), NOW.getTime()).unshipped.map((x: any) => x.id)).toEqual(["o1"]);
  });

  it("“Ready to ship now” starts the ship-late clock at the early release, for dated and undated pre-orders", () => {
    for (const releaseDate of ["2026-12-31", null]) {
      const o = paidOrder([{ ...pre, releaseDate }], { preorderReleasedAt: "2026-10-01T12:00:00Z" });
      expect(waitingPreorderLines(o)).toEqual([]);
      expect(preorderClockStart(o)).toBe(srvRule.preorderClockStart(o));
      expect(adminAlerts([o], null, Date.parse("2026-10-03T12:00:00Z")).some((a: any) => a.id === "ship-late")).toBe(false);
      expect(adminAlerts([o], null, NOW.getTime()).some((a: any) => a.id === "ship-late")).toBe(true);
      expect(buildOrderDigest([o], new Map(), NOW.getTime()).unshipped.length).toBe(1);
    }
  });

  it("changing a book's release date carries onto paid, unsent pre-orders only", () => {
    const tba = paidOrder([{ ...pre, releaseDate: null }, { id: "other", title: "X", quantity: 1, price: 5, preorder: false, releaseDate: null }]);
    const dated = restampPreorderItems(tba, "b1", { preorder: true, publishDate: "2026-12-05" }, NOW)!;
    expect(dated[0].releaseDate).toBe("2026-12-05");
    expect(dated[1]).toBe(tba.items[1]);
    // Pre-order switched off (books arrived): released today, still marked as a pre-order.
    const off = restampPreorderItems(tba, "b1", { preorder: false, publishDate: "2026-12-05" }, NOW)!;
    expect(off[0]).toMatchObject({ preorder: true, releaseDate: "2026-10-08" });
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    expect(queueOf({ ...tba, items: off })).toBe("Ready to pack");
    expect(restampPreorderItems({ ...tba, fulfillmentStatus: "shipped" }, "b1", { preorder: false }, NOW)).toBeNull();
    expect(restampPreorderItems({ ...tba, paymentStatus: "unpaid" }, "b1", { preorder: false }, NOW)).toBeNull();
    expect(restampPreorderItems(tba, "b1", { preorder: true, publishDate: "" }, NOW)).toBeNull();
  });
});

describe("pre-orders in the bag", () => {
  it("a released book loses its pre-order note when the bag is re-checked", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-20T16:00:00Z"));
    const book = { id: "b1", title: "Coming Soon", retailPrice: 20, preorder: true, publishDate: "2026-11-12" };
    const r = repriceCart([{ id: "b1", title: "Coming Soon", price: 20, quantity: 1, photoUrl: "", preorder: true, releaseDate: "2026-11-12" }], [book]);
    expect(r.changed).toBe(true);
    expect(r.cart[0].preorder).toBe(false);
    expect(r.repriced).toEqual([]);
  });
});
