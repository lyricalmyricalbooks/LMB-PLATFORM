// A pretend test shop for the release check's tests: the shop's orders, books and email log, its stockroom (which
// brings orders in only while open), Stripe's test payments and refunds, and a pretend browser. Nothing here touches
// the network. `faults` breaks one part on purpose: "no-import", "no-email", "no-payment-event", "live-payment",
// "admin-hidden", "no-refund-event", "pages-broken".
import { TEST_PRINTED_IDS, TEST_STOCK } from "../setup/test-catalogue.js";

export function fakeTestShop({ faults = [], orders = {} } = {}) {
  const has = (fault) => faults.includes(fault);
  const world = {
    books: Object.fromEntries(TEST_PRINTED_IDS.map((id) => [id, { stockLevel: TEST_STOCK, trackInventory: true }])),
    orders: structuredClone(orders),
    emailLog: [],
    stockroom: { open: false, onHand: Object.fromEntries(TEST_PRINTED_IDS.map((id) => [id, TEST_STOCK])), published: false, websiteOrders: {} },
    calls: [],
    browserClosed: false,
  };
  let next = 1;
  // The stockroom does its work only while open: publishes counts and brings in waiting orders.
  const stockroomTick = () => {
    const room = world.stockroom;
    if (!room.open) return;
    room.published = true;
    for (const [id, doc] of Object.entries(room.websiteOrders)) {
      if (!doc.pending || has("no-import")) continue;
      for (const [bookId, qty] of Object.entries(doc.web.books)) room.onHand[bookId] -= doc.web.refunded ? -qty : qty;
      room.websiteOrders[id] = { ...doc, pending: false, imported: { at: "now" } };
    }
  };
  const browser = {
    async pagesLoad() {
      world.calls.push("pagesLoad");
      return { problems: has("pages-broken") ? ["the book page shows no price"] : [] };
    },
    async buy({ bookSlug, email }) {
      world.calls.push("buy");
      const orderId = `TEST-${next++}`;
      const paid = !has("no-payment-event");
      world.orders[orderId] = { paymentStatus: paid ? "paid" : "unpaid", sandboxPayment: !has("live-payment"), isTest: true, createdAt: new Date().toISOString(), items: [{ bookId: bookSlug, quantity: 1 }] };
      if (paid) {
        world.books[bookSlug].stockLevel -= 1;
        world.stockroom.websiteOrders[orderId] = { web: { books: { [bookSlug]: 1 } }, pending: true };
        if (!has("no-email")) world.emailLog.push({ orderId, kind: "orderConfirmed", status: "sent", to: email });
      }
      return { orderId };
    },
    async openStockroom({ session }) {
      world.calls.push(`openStockroom:${session.user.email}`);
      world.stockroom.open = true;
      return { close: async () => { world.stockroom.open = false; } };
    },
    async adminShowsOrder({ orderId }) {
      world.calls.push("adminShowsOrder");
      return !has("admin-hidden") && Boolean(world.orders[orderId]);
    },
    async close() {
      world.browserClosed = true;
    },
  };
  const shopData = {
    order: async (id) => structuredClone(world.orders[id] ?? null),
    book: async (id) => structuredClone(world.books[id] ?? null),
    orderEmails: async (id) => world.emailLog.filter((e) => e.orderId === id),
    testOrdersBefore: async (iso) => Object.entries(world.orders).filter(([, o]) => o.isTest === true && o.sandboxPayment === true && o.createdAt < iso).map(([id]) => id),
    async removeOrder(id) {
      world.calls.push(`removeOrder:${id}`);
      delete world.orders[id];
    },
  };
  const stockroomData = {
    async feed(bookId) {
      stockroomTick();
      return world.stockroom.published ? { onHand: world.stockroom.onHand[bookId] } : null;
    },
    async websiteOrder(id) {
      stockroomTick();
      return structuredClone(world.stockroom.websiteOrders[id] ?? null);
    },
  };
  const shopAdmin = {
    async refund(orderId) {
      world.calls.push(`refund:${orderId}`);
      if (has("no-refund-event")) return true;
      const order = world.orders[orderId];
      order.paymentStatus = "refunded";
      for (const { bookId, quantity } of order.items) world.books[bookId].stockLevel += quantity;
      const doc = world.stockroom.websiteOrders[orderId];
      world.stockroom.websiteOrders[orderId] = { web: { ...doc.web, refunded: true }, pending: true };
      return true;
    },
  };
  const session = { apiKey: "AIzaFakeKey", idToken: "id-token", user: { uid: "owner-uid", email: "owner@example.com" } };
  const clients = { browser, shopData, stockroomData, shopAdmin, session, profile: {}, urls: { site: "https://lmb-test-shop.web.app", stockroom: "https://lmb-test-shop-stockroom.web.app" } };
  return { world, clients };
}

/** A clock that moves only when the check waits, so timeouts are tested without waiting. */
export function fakeClock(start = "2026-10-28T12:00:00Z") {
  let at = new Date(start).getTime();
  return { now: () => new Date(at), sleep: async (ms) => { at += ms; } };
}
