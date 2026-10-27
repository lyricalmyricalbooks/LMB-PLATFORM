import { describe, test, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const jobs = require("./inventoryLinkJobs");

import { fakeDb, fakeStore, tick, resetClock } from "./inventoryLink.fakes.mjs";
let now = new Date("2026-10-11T15:00:00Z");
const deps = (db, store, extra = {}) => ({ db, store, now: () => now, ...extra });
const STATE = { startDay: "2026-10-01", links: { b1: { _: "hound" } }, backfill: { done: true } };
const paidOrder = (extra = {}) => ({
  paymentStatus: "paid", paidAt: "2026-10-05T15:00:00.000Z", updatedAt: "2026-10-05T15:00:00.000Z",
  customer: { name: "Ana", email: "a@x.com", address: { street: "1 Main St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
  items: [{ id: "b1", quantity: 2, price: 40, title: "The Hound", format: "Paperback" }], subtotal: 80, total: 80, ...extra,
});
beforeEach(() => { resetClock(); now = new Date("2026-10-11T15:00:00Z"); });

describe("pushOrder", () => {
  test("records the copies first, then delivers; the same content is not sent twice", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder() });
    const store = fakeStore();
    const first = await jobs.pushOrder(deps(db, store), "A-1", STATE);
    expect(first).toMatchObject({ status: "delivered", net: { hound: 2 } });
    expect(db.docs["inventoryPushes/A-1"].data).toMatchObject({ net: { hound: 2 }, delivered: true, test: false });
    expect(store.orders["A-1"].web.books.hound.net).toBe(2);
    expect((await jobs.pushOrder(deps(db, store), "A-1", STATE)).status).toBe("same");
    expect(store.writes).toBe(1);
  });
  test("an unreachable inventory project leaves an undelivered record that still counts, retried by catch-up", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder() });
    const failing = fakeStore({ failWrites: true });
    expect((await jobs.pushOrder(deps(db, failing), "A-1", STATE)).status).toBe("failed");
    expect(db.docs["inventoryPushes/A-1"].data).toMatchObject({ net: { hound: 2 }, delivered: false, error: "PERMISSION_DENIED" });
    const store = fakeStore();
    const caught = await jobs.catchUp(deps(db, store), STATE, "2099-01-01T00:00:00Z");
    expect(caught.pushed).toBe(1);
    expect(db.docs["inventoryPushes/A-1"].data.delivered).toBe(true);
  });
  test("orders outside the link are skipped; refunds of pushed orders follow", async () => {
    const db = fakeDb({ "orders/old": paidOrder({ paidAt: "2026-09-01T12:00:00Z" }), "orders/unpaid": paidOrder({ paymentStatus: "unpaid" }) });
    const store = fakeStore();
    expect((await jobs.pushOrder(deps(db, store), "old", STATE)).status).toBe("skipped");
    expect((await jobs.pushOrder(deps(db, store), "unpaid", STATE)).status).toBe("skipped");
    const db2 = fakeDb({ "orders/A-1": paidOrder() });
    await jobs.pushOrder(deps(db2, store), "A-1", STATE);
    await db2.collection("orders").doc("A-1").set({ paymentStatus: "refunded", inventoryRestockedAt: "x", restockedItems: [{ id: "b1", quantity: 2 }] }, { merge: true });
    await jobs.pushOrder(deps(db2, store), "A-1", STATE);
    expect(db2.docs["inventoryPushes/A-1"].data.net).toEqual({ hound: 0 });
    expect(store.orders["A-1"].web).toMatchObject({ refundState: "full", books: { hound: { net: 0, restocked: 2 } } });
  });
  test("rehearsal test orders reach the app as tests and count nothing", async () => {
    const db = fakeDb({ "orders/T-1": paidOrder({ isTest: true, sandboxPayment: true }) });
    const store = fakeStore();
    expect((await jobs.pushOrder(deps(db, store), "T-1", STATE)).status).toBe("skipped");
    await jobs.pushOrder(deps(db, store), "T-1", { ...STATE, rehearsalUntil: "2026-10-12T00:00:00Z" });
    expect(store.orders["T-1"].web.test).toBe(true);
    expect(db.docs["inventoryPushes/T-1"].data).toMatchObject({ test: true, net: {} });
  });
});

describe("planStock / applyStock", () => {
  const sumNet = db => async inv => Object.values(db.docs)
    .filter(d => d.data && d.data.net && !d.data.test).reduce((n, d) => n + (d.data.net[inv] || 0), 0);
  test("website stock = the app's count minus website copies it hasn't imported; a log row explains it", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 5 }, "inventoryPushes/A-1": { net: { hound: 1 } } });
    const store = fakeStore();
    store.feeds.hound = { onHand: 12, base: 12, webCopies: 0 };
    const d = deps(db, store, { sumNet: sumNet(db) });
    const plan = await jobs.planStock(d, STATE);
    expect(plan.rows[0]).toMatchObject({ from: 5, to: 11, hold: null });
    const applied = await jobs.applyStock(d, plan.rows, { mode: "auto" });
    expect(applied[0].result).toBe("applied");
    expect(db.docs["books/b1"].data.stockLevel).toBe(11);
    const log = Object.entries(db.docs).find(([p]) => p.startsWith("inventoryLog/"))[1].data;
    expect(log).toMatchObject({ bookId: "b1", from: 5, to: 11, delta: 6, reason: "Inventory app" });
    expect(log.note).toMatch(/12 on hand; 1 website copy not imported/);
  });
  test("a book changed after the run started (a sale a moment ago) is left alone", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 5 } });
    const store = fakeStore();
    store.feeds.hound = { onHand: 6, base: 6, webCopies: 0 };
    const d = deps(db, store, { sumNet: async () => 0 });
    const t0 = tick();
    const plan = await jobs.planStock(d, STATE);
    await db.collection("books").doc("b1").update({ stockLevel: 4 }); // the webhook took a copy
    expect((await jobs.applyStock(d, plan.rows, { t0 }))[0].result).toBe("changed");
    expect(db.docs["books/b1"].data.stockLevel).toBe(4);
  });
  test("automatic runs hold big changes and untracked books; the owner's confirmed apply does them", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", stockLevel: 2 }, "books/b2": { title: "Altrove", trackInventory: true, variants: [{ id: "pb", stockLevel: 1 }, { id: "hc", stockLevel: 1 }] } });
    const store = fakeStore();
    store.feeds.hound = { onHand: 3, base: 3 };
    store.feeds.pb = { onHand: 40, base: 40 };
    store.feeds.hc = { onHand: 2, base: 2 };
    const state = { ...STATE, links: { b1: { _: "hound" }, b2: { pb: "pb", hc: "hc" } } };
    const d = deps(db, store, { sumNet: async () => 0 });
    const plan = await jobs.planStock(d, state);
    expect(plan.rows.map(r => r.hold)).toEqual(["untracked", "big-change", null]);
    const auto = await jobs.applyStock(d, plan.rows, { mode: "auto" });
    expect(auto.map(r => r.result)).toEqual(["applied"]);
    const confirmed = await jobs.applyStock(d, (await jobs.planStock(d, state)).rows, { mode: "confirmed" });
    expect(confirmed.map(r => r.result).sort()).toEqual(["applied", "applied"]);
    expect(db.docs["books/b1"].data).toMatchObject({ stockLevel: 3, trackInventory: true });
    // Both editions of one book in one transaction: neither undoes the other.
    expect(db.docs["books/b2"].data.variants).toEqual([{ id: "pb", stockLevel: 40, stock: 40 }, { id: "hc", stockLevel: 2, stock: 2 }]);
  });
});

test("a confirmed apply switches counting on even when the number is already right; automatic runs don't", async () => {
  const db = fakeDb({ "books/h": { title: "The Hound", variants: [{ id: "signed", stockLevel: 62 }, { id: "unsigned", stockLevel: 62 }] } });
  const store = fakeStore();
  store.feeds.hound = { onHand: 62, base: 62 };
  const state = { ...STATE, links: { h: { signed: "hound", unsigned: "hound" } } };
  const d = deps(db, store, { sumNet: async () => 0 });
  const plan = await jobs.planStock(d, state);
  expect(plan.rows.map(r => [r.from, r.to, r.hold])).toEqual([[62, 62, "untracked"], [62, 62, "untracked"]]);
  expect(await jobs.applyStock(d, plan.rows, { mode: "auto" })).toEqual([]);
  expect(db.docs["books/h"].data.trackInventory).toBeUndefined();
  const confirmed = await jobs.applyStock(d, plan.rows, { mode: "confirmed" });
  expect(confirmed.map(r => r.result)).toEqual(["applied", "applied"]);
  expect(db.docs["books/h"].data.trackInventory).toBe(true);
  const log = Object.entries(db.docs).find(([p]) => p.startsWith("inventoryLog/"))[1].data;
  expect(log).toMatchObject({ from: 62, to: 62, delta: 0 });
  expect(log.note).toMatch(/^Counting switched on/);
});

describe("applyAppShipment", () => {
  const shipment = (extra = {}) => ({ hash: "h1", carrier: "Canada Post", trackingNumber: "1234", trackingUrl: "javascript:alert(1)", labelCostCAD: 18.4, labelSource: "canadapost", shippedAt: null, ...extra });
  test("a label is attached, then dispatched once marked shipped; answers reach the app", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder() });
    const store = fakeStore();
    const attached = await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: shipment() });
    expect(attached.result).toBe("attached");
    expect(db.docs["orders/A-1"].data).toMatchObject({ trackingNumber: "1234", trackingCarrier: "Canada Post", trackingUrl: "", trackingSource: "inventory-app" });
    expect(db.docs["orders/A-1"].data.fulfillmentStatus).toBeUndefined();
    expect(db.docs["order-operations/A-1"].data.externalLabel).toMatchObject({ trackingNumber: "1234", cost: 18.4, source: "canadapost" });
    // Sent again unchanged: nothing new happens.
    expect((await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: shipment() })).result).toBe("attached");
    const dispatched = await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: shipment({ hash: "h2", shippedAt: "2026-10-11" }) });
    expect(dispatched.result).toBe("dispatched");
    expect(db.docs["orders/A-1"].data).toMatchObject({ fulfillmentStatus: "shipped", status: "completed" });
    expect(db.docs["order-operations/A-1"].data).toMatchObject({ dispatchedFrom: "inventory-app" });
    expect(store.replies.map(r => [r.hash, r.result])).toEqual([["h1", "attached"], ["h1", "attached"], ["h2", "dispatched"]]);
    // Once shipped with this tracking, a repeat is a no-op.
    expect((await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: shipment({ hash: "h3", shippedAt: "2026-10-11" }) })).result).toBe("dispatched");
  });
  test("the website's safety checks refuse, with the reason sent back; nothing changes", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder({ customerRequest: { type: "return", status: "open" } }) });
    const store = fakeStore();
    const res = await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: shipment({ shippedAt: "2026-10-11" }) });
    expect(res).toMatchObject({ result: "refused", reason: expect.stringMatching(/return/) });
    expect(db.docs["orders/A-1"].data.trackingNumber).toBeUndefined();
    expect(store.replies[0]).toMatchObject({ result: "refused" });
  });
  test("a website label is never silently replaced; an app label can be", async () => {
    const db = fakeDb({ "orders/W": paidOrder({ trackingNumber: "W1", labelUrl: "https://x" }), "orders/A": paidOrder({ trackingNumber: "A1", trackingSource: "inventory-app" }) });
    const store = fakeStore();
    expect((await jobs.applyAppShipment(deps(db, store), { id: "W", shipment: shipment() })).result).toBe("refused");
    expect((await jobs.applyAppShipment(deps(db, store), { id: "A", shipment: shipment() })).result).toBe("attached");
    expect(db.docs["order-operations/A"].data.labelHistory[0]).toMatchObject({ trackingNumber: "A1", replacedBy: "inventory-app" });
  });
  test("test orders are only checked", async () => {
    const db = fakeDb({ "orders/T": paidOrder({ isTest: true, sandboxPayment: true }) });
    const store = fakeStore();
    const res = await jobs.applyAppShipment(deps(db, store), { id: "T", shipment: shipment({ shippedAt: "2026-10-11" }) });
    expect(res).toMatchObject({ result: "checked", reason: expect.stringMatching(/would dispatch/) });
    expect(db.docs["orders/T"].data.trackingNumber).toBeUndefined();
  });
  test("no tracking number: refused", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder() });
    expect((await jobs.applyAppShipment(deps(db, fakeStore()), { id: "A-1", shipment: shipment({ trackingNumber: " " }) })).result).toBe("refused");
  });
});

describe("runSweep", () => {
  test("one run at a time", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE, lease: { until: "2026-10-11T15:02:00Z", runId: "other" } } });
    expect(await jobs.runSweep(deps(db, fakeStore()))).toEqual({ busy: true });
  });
  test("does nothing before the owner sets the link up", async () => {
    const db = fakeDb({});
    const store = fakeStore();
    expect(await jobs.runSweep(deps(db, store))).toMatchObject({ inactive: true });
    expect(store.heartbeats).toBe(0);
    expect(db.docs["systemStatus/inventoryLink"]?.data?.lease).toBeUndefined();
    expect(db.docs["systemStatus/inventoryLink"]).toBeUndefined(); // nothing written while the link is off
  });
  test("pushes, sends labels' answers, and applies automatic stock; releases the lease", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { ...STATE, autoSync: true, lastCatchUpAt: "2026-10-11T14:00:00Z" },
      "orders/A-1": paidOrder({ updatedAt: "2026-10-11T14:30:00Z" }),
      "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 9 },
    });
    const store = fakeStore();
    store.feeds.hound = { onHand: 12, base: 12, webCopies: 0 };
    store.shipments = [{ id: "A-1", shipment: { hash: "s1", carrier: "Canada Post", trackingNumber: "77", shippedAt: null } }];
    const d = deps(db, store, { sumNet: async inv => Object.values(db.docs).reduce((n, doc) => n + ((doc.data?.net || {})[inv] || 0), 0) });
    const out = await jobs.runSweep(d);
    expect(out.catchUp.pushed).toBeGreaterThan(0);
    expect(out.shipments[0].result).toBe("attached");
    expect(db.docs["books/b1"].data.stockLevel).toBe(10); // 12 on hand − 2 website copies not imported yet
    const state = db.docs["systemStatus/inventoryLink"].data;
    expect(state.lease).toBeUndefined();
    expect(state.lastSync.changes[0]).toMatchObject({ from: 9, to: 10 });
    expect(state.connection.ok).toBe(true);
  });
  test("stock waits until sales are being sent", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { links: STATE.links, autoSync: true } });
    const out = await jobs.runSweep(deps(db, fakeStore(), { sumNet: async () => 0 }), { stock: "preview" });
    expect(out.stock).toEqual({ notReady: true });
  });
  test("apply refuses a preview whose numbers moved", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": STATE, "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 9 } });
    const store = fakeStore();
    store.feeds.hound = { onHand: 12, base: 12 };
    const d = deps(db, store, { sumNet: async () => 0 });
    const preview = await jobs.runSweep(d, { stock: "preview" });
    store.feeds.hound = { onHand: 11, base: 11 };
    const out = await jobs.runSweep(d, { stock: "apply", confirmHash: preview.stock.hash });
    expect(out.stock.changed).toBe(true);
    expect(db.docs["books/b1"].data.stockLevel).toBe(9);
    const again = await jobs.runSweep(d, { stock: "apply", confirmHash: out.stock.hash });
    expect(again.stock.applied[0].result).toBe("applied");
    expect(db.docs["books/b1"].data.stockLevel).toBe(11);
    expect(db.docs["systemStatus/inventoryLink"].data.firstApplyAt).toBeTruthy();
  });
});

describe("review fixes", () => {
  const sumAll = db => async inv => Object.entries(db.docs).filter(([p]) => p.startsWith("inventoryPushes/")).reduce((n, [, d]) => n + ((d.data?.net || {})[inv] || 0), 0);

  test("stock waits while a recent sale couldn't be recorded (it would be put back on sale)", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { ...STATE, autoSync: true, lastCatchUpAt: "2026-10-11T14:00:00Z" },
      "orders/A-1": paidOrder({ updatedAt: "2026-10-11T14:30:00Z" }),
      "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 7 },
    });
    const store = fakeStore();
    store.feeds.hound = { onHand: 12, base: 12 };
    // Reading this order fails, so its two copies are not in the website's count yet.
    const realCollection = db.collection;
    db.collection = col => {
      const c = realCollection(col);
      if (col !== "orders") return c;
      return { ...c, doc: id => ({ ...c.doc(id), get: async () => { throw new Error("unavailable"); } }) };
    };
    const out = await jobs.runSweep(deps(db, store, { sumNet: sumAll(db) }), { stock: "force" });
    expect(out.catchUp.complete).toBe(false);
    expect(out.stock).toEqual({ catchingUp: true });
    expect(db.docs["books/b1"].data.stockLevel).toBe(7);
    // The window doesn't move on past the order it couldn't record.
    expect(db.docs["systemStatus/inventoryLink"].data.lastCatchUpAt).toBe("2026-10-11T14:00:00Z");
  });

  test("after new matches, every order with unmatched copies is sent again, page by page", async () => {
    const seed = { "systemStatus/inventoryLink": { ...STATE, relinkPending: true, lastCatchUpAt: "2026-10-11T14:59:00Z" } };
    for (let i = 0; i < 305; i++) {
      const id = `O-${String(i).padStart(4, "0")}`;
      seed[`orders/${id}`] = paidOrder({ items: [{ id: i < 304 ? "zine" : "b1", quantity: 1, price: 10, title: "Zine" }] });
      seed[`inventoryPushes/${id}`] = { net: {}, unlinkedCount: 1, lineLinks: {}, hash: "old", delivered: true, sourceUpdatedAt: "2000-01-01T00:00:00.000Z" };
    }
    const db = fakeDb(seed);
    const store = fakeStore();
    const d = deps(db, store, { sumNet: async () => 0 });
    const first = await jobs.runSweep(d, { stock: "none" });
    expect(first.relink).toMatchObject({ done: false });
    expect(db.docs["systemStatus/inventoryLink"].data.relinkPending).toBe(true);
    const second = await jobs.runSweep(d, { stock: "none" });
    expect(second.relink).toMatchObject({ done: true });
    expect(db.docs["systemStatus/inventoryLink"].data.relinkPending).toBe(false);
    // The order beyond the first page reached the inventory app with its newly matched book.
    expect(store.orders["O-0304"].web.books.hound.net).toBe(1);
  });

  test("an app label is refused while the website is buying one (no second paid label)", async () => {
    const db = fakeDb({ "orders/A-1": paidOrder(), "order-operations/A-1": { labelPurchasePending: true } });
    const store = fakeStore();
    const res = await jobs.applyAppShipment(deps(db, store), { id: "A-1", shipment: { hash: "h", carrier: "Canada Post", trackingNumber: "9", shippedAt: "2026-10-11" } });
    expect(res).toMatchObject({ result: "refused", reason: expect.stringMatching(/two labels/) });
    expect(db.docs["orders/A-1"].data.trackingNumber).toBeUndefined();
  });

  test("stock counting isn't turned on for a book whose e-book or unmatched editions it would block", async () => {
    const db = fakeDb({
      "books/b2": { title: "Altrove", variants: [{ id: "pb", name: "Paperback", stockLevel: 1 }, { id: "eb", name: "Ebook", digital: true }] },
      "books/b3": { title: "Twin", variants: [{ id: "pb", stockLevel: 1 }, { id: "hc", stockLevel: 1 }] },
    });
    const store = fakeStore();
    store.feeds.alt = { onHand: 4, base: 4 };
    store.feeds.tpb = { onHand: 5, base: 5 };
    store.feeds.thc = { onHand: 6, base: 6 };
    const state = { ...STATE, links: { b2: { pb: "alt" }, b3: { pb: "tpb", hc: "thc" } } };
    const d = deps(db, store, { sumNet: async () => 0 });
    const plan = await jobs.planStock(d, state);
    expect(plan.rows.map(r => r.hold)).toEqual(["untracked-mixed", "untracked", "untracked"]);
    const applied = await jobs.applyStock(d, plan.rows, { mode: "confirmed" });
    expect(applied.map(r => r.bookId)).toEqual(["b3", "b3"]);
    expect(db.docs["books/b2"].data.trackInventory).toBeUndefined();
    expect(db.docs["books/b3"].data.trackInventory).toBe(true);
  });

  test("a book matched as a whole that is now sold in editions is held", async () => {
    const db = fakeDb({ "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 2, variants: [{ id: "pb", stockLevel: 2 }] } });
    const store = fakeStore();
    store.feeds.hound = { onHand: 3, base: 3 };
    const plan = await jobs.planStock(deps(db, store, { sumNet: async () => 0 }), STATE);
    expect(plan.rows[0].hold).toBe("now-has-editions");
  });

  test("refused-label alerts expire after a week even when no label is sent", async () => {
    const db = fakeDb({ "systemStatus/inventoryLink": { ...STATE, lastCatchUpAt: "2026-10-11T14:59:00Z", shipmentIssues: [
      { orderId: "old", reason: "x", at: "2026-10-01T00:00:00Z" }, { orderId: "new", reason: "y", at: "2026-10-10T00:00:00Z" },
    ] } });
    await jobs.runSweep(deps(db, fakeStore(), { sumNet: async () => 0 }), { stock: "none" });
    expect(db.docs["systemStatus/inventoryLink"].data.shipmentIssues.map(i => i.orderId)).toEqual(["new"]);
  });
});

describe("runSweep: new books to match", () => {
  test("suggests a match for a book added to both shops, at most once an hour, minus pairs left out", async () => {
    const db = fakeDb({
      "systemStatus/inventoryLink": { ...STATE, lastCatchUpAt: "2026-10-11T14:00:00Z" },
      "books/b1": { title: "The Hound", trackInventory: true, stockLevel: 9 },
      "books/b2": { title: "Un fantastico altrove", isbn: "978-1-23456-789-7" },
      "books/b3": { title: "Altrove", status: "archived" },
    });
    const store = fakeStore();
    store.catalog = [{ id: "hound", title: "The Hound" }, { id: "altrove", title: "Altrove (2nd printing)", isbn: "9781234567897" }];
    const d = deps(db, store, { sumNet: async () => 0 });
    await jobs.runSweep(d);
    let state = db.docs["systemStatus/inventoryLink"].data;
    expect(state.newMatches).toMatchObject({ at: now.toISOString(), count: 1 });
    expect(state.newMatches.items).toEqual([{ key: "b2|", bookId: "b2", variantId: null, title: "Un fantastico altrove", edition: "", inventoryBookId: "altrove", inventoryTitle: "Altrove (2nd printing)" }]);

    // Within the hour the list stays as it was.
    db.docs["systemStatus/inventoryLink"].data.ignoredMatches = { "b2|": "altrove" };
    now = new Date(now.getTime() + 10 * 60 * 1000);
    await jobs.runSweep(d);
    expect(db.docs["systemStatus/inventoryLink"].data.newMatches.count).toBe(1);

    now = new Date(now.getTime() + 60 * 60 * 1000);
    await jobs.runSweep(d);
    state = db.docs["systemStatus/inventoryLink"].data;
    expect(state.newMatches.count).toBe(0);
  });
});

test("with no matches left, old suggestions are cleared", async () => {
  const db = fakeDb({ "systemStatus/inventoryLink": { startDay: "2026-10-01", links: {}, connection: { ok: true }, backfill: { done: true },
    newMatches: { at: "2026-10-11T14:00:00Z", count: 1, items: [{ key: "b2|", bookId: "b2", variantId: null, inventoryBookId: "altrove" }] } } });
  await jobs.runSweep(deps(db, fakeStore(), { sumNet: async () => 0 }));
  expect(db.docs["systemStatus/inventoryLink"].data.newMatches).toBeNull();
});
