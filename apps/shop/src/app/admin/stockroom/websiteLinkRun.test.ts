// Website orders brought into the books by the admin, checked against the same expectations as the old app's
// tests (apps/stockroom/tests/website-link-import.test.js): the same order gives the same row, the same stock and the
// same "done" mark on the website's copy. The stockroom is a MemoryStockroom saved through the real write layer; the
// website's documents are a MemoryWebsiteLink whose publish runs the live transaction's decision.
import { afterEach, describe, expect, it, vi } from "vitest";
import { stitchState } from "@stockroom/merge-state.js";
import { recomputeAfters } from "@stockroom/recompute-afters.js";

import { MemoryStockroom } from "./stockroomMemory";
import { loadLinkBooks, loadStockroom } from "./stockroomData";
import { createStockroomWriter } from "./stockroomWrite";
import { MemoryWebsiteLink } from "./websiteLinkMemory";
import { createWebsiteLinkRunner, decide, linkView } from "./websiteLinkRun";

const BOOK = "harbour";
const catalogBook = { id: BOOK, title: "Harbour Lights", currency: "CA$", listPrice: 40, maxPrint: 100 };
type Row = Record<string, any>;

function webOrder(orderId: string, over: Row = {}) {
  return {
    v: 1, orderId, number: `#${orderId}`, hash: "h1", test: false,
    paidAt: "2026-10-11T15:00:00.000Z", paidDay: "2026-10-11", paymentMethod: "Stripe", paymentStatus: "paid",
    refundState: "none", refund: null, stripePaymentIntentId: `pi_${orderId}`,
    totals: { subtotal: 80, discount: 0, discountCode: "", shipping: 12, tax: 0, total: 92, giftCard: 0 },
    charged: { currency: "CAD", amountMinor: 9200 },
    customer: { name: "Dana Reader", email: "dana@example.com", phone: "", address: { street: "1 Main St", unit: "", city: "Toronto", state: "ON", zip: "M4B 1B3", country: "CA" } },
    fulfillment: { method: "shipping", status: "paid", trackingNumber: "", trackingCarrier: "", trackingUrl: "", shippedDay: null, labelSource: null },
    books: { [BOOK]: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80, preorder: false, titles: ["Harbour Lights"] } },
    firstBook: BOOK, unlinked: [],
    ...over,
  };
}

const stops: Array<() => void> = [];
afterEach(() => { while (stops.length) stops.pop()!(); });

function setUp(hist: Row[] = []) {
  const mem = new MemoryStockroom();
  mem.putCatalog([catalogBook]);
  const state = { ...stitchState({ metadata: { stock: 100 } }), hist: JSON.parse(JSON.stringify(hist)) };
  recomputeAfters(state, catalogBook);
  mem.putBook(BOOK, state);
  const link = new MemoryWebsiteLink(mem);
  const writer = createStockroomWriter(mem.device());
  const runner = createWebsiteLinkRunner({
    link: link.io(),
    loadBooks: () => loadLinkBooks(mem.device()),
    saveBook: (id, mutate) => writer.saveBookState(id, mutate),
    rate: async () => null,
    rates: () => ({}),
    chargeIntents: () => ({}),
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  });
  stops.push(runner.start());
  const state$ = async () => (await loadStockroom(mem.device())).states[BOOK] as Row;
  return { mem, link, runner, state: state$ };
}

const waitFor = (fn: () => unknown) => vi.waitFor(fn as () => void, { timeout: 4000, interval: 10 });

describe("a new website order", () => {
  it("is added as a sale, stock goes down, and the order is marked done from the saved rows", async () => {
    const { link, state } = setUp();
    link.push(webOrder("WEB-NEW1"));
    await waitFor(() => expect(link.docs["WEB-NEW1"].pending).toBe(false));
    const s = await state();
    const row = s.hist.find((h: Row) => h.webOrderId === "WEB-NEW1");
    expect(row).toMatchObject({
      uid: `web-WEB-NEW1-${BOOK}`, sheetsId: `web-WEB-NEW1-${BOOK}`, chan: "Website", num: "#WEB-NEW1",
      qty: 2, price: 40, date: "2026-10-11", fulfilledOnWebsite: true, enteredBy: "Website", shippingPaid: 12,
    });
    expect(s.stock).toBe(98);
    expect(link.docs["WEB-NEW1"].imported).toMatchObject({ hash: "h1", effect: { [BOOK]: 2 } });
    expect(link.feeds[BOOK]).toBeTruthy();
    expect(linkView().lastRun).toMatchObject({ added: 1 });
  });

  it("is never added twice when the inbox delivers it again", async () => {
    const { link, state } = setUp();
    link.push(webOrder("WEB-TWICE"));
    await waitFor(() => expect(link.docs["WEB-TWICE"].pending).toBe(false));
    link.docs["WEB-TWICE"].pending = true; // another device hadn't seen it yet
    link.deliver();
    await waitFor(() => expect(link.docs["WEB-TWICE"].pending).toBe(false));
    const s = await state();
    expect(s.hist.filter((h: Row) => h.webOrderId === "WEB-TWICE")).toHaveLength(1);
    expect(s.stock).toBe(98);
  });

  it("is never brought in from a cached snapshot; the server's snapshot brings it in", async () => {
    const { link, state } = setUp();
    link.fromCache = true;
    link.push(webOrder("WEB-CACHE"));
    await new Promise((r) => setTimeout(r, 50));
    expect((await state()).hist).toHaveLength(0);
    link.fromCache = false;
    link.deliver();
    await waitFor(() => expect(link.docs["WEB-CACHE"].pending).toBe(false));
    expect((await state()).stock).toBe(98);
  });
});

describe("an order already in the books by hand", () => {
  it("is linked to the website's copy, never counted twice", async () => {
    const { link, state } = setUp([{ num: "#WEB-HAND", chan: "Website", qty: 2, price: 38, date: "2026-10-11", sheetsId: "stripe-ch_9", notes: "Stripe" }]);
    link.push(webOrder("WEB-HAND"));
    await waitFor(() => expect(link.docs["WEB-HAND"].pending).toBe(false));
    const s = await state();
    expect(s.hist).toHaveLength(1);
    expect(s.hist[0]).toMatchObject({ webOrderId: "WEB-HAND", uid: `web-WEB-HAND-${BOOK}`, sheetsId: "stripe-ch_9", price: 38, notes: "Stripe" });
    expect(s.stock).toBe(98);
  });

  it("a look-alike waits under Needs you until the owner says they are different sales", async () => {
    const { link, state } = setUp([{ num: "", chan: "In Person", qty: 2, price: 35, date: "2026-10-10", shipEmail: "dana@example.com", sheetsId: "pos-1" }]);
    link.push(webOrder("WEB-LOOK"));
    await waitFor(() => expect(linkView().review.map((p) => p.orderId)).toEqual(["WEB-LOOK"]));
    expect((await state()).hist).toHaveLength(1);
    expect(link.docs["WEB-LOOK"].pending).toBe(true);

    decide("WEB-LOOK", BOOK, "different");
    await waitFor(() => expect(link.docs["WEB-LOOK"].pending).toBe(false));
    const s = await state();
    expect(s.hist).toHaveLength(2);
    expect(s.stock).toBe(96);
    expect(link.docs["WEB-LOOK"].imported.decisions).toEqual({ [BOOK]: { choice: "different" } });
  });

  it("\"Same sale\" links the look-alike instead", async () => {
    const { link, state } = setUp([{ num: "", chan: "In Person", qty: 2, price: 35, date: "2026-10-10", shipEmail: "dana@example.com", sheetsId: "pos-2" }]);
    link.push(webOrder("WEB-SAME"));
    await waitFor(() => expect(linkView().review).toHaveLength(1));
    const key = linkView().review[0].reasons[0].candidates![0].key;
    decide("WEB-SAME", BOOK, "same", key);
    await waitFor(() => expect(link.docs["WEB-SAME"].pending).toBe(false));
    const s = await state();
    expect(s.hist).toHaveLength(1);
    expect(s.hist[0]).toMatchObject({ webOrderId: "WEB-SAME", chan: "Website", price: 35, sheetsId: "pos-2" });
    expect(s.stock).toBe(98);
  });
});

describe("refunds from the website", () => {
  it("voids the sale when every copy came back, and brings it back if the bank rejects the refund", async () => {
    const { link, state } = setUp();
    link.push(webOrder("WEB-REF"));
    await waitFor(() => expect(link.docs["WEB-REF"].pending).toBe(false));
    expect((await state()).stock).toBe(98);

    link.push(webOrder("WEB-REF", { hash: "h2", paymentStatus: "refunded", refundState: "full", books: { [BOOK]: { net: 0, sold: 2, restocked: 2, unitCAD: 40, merchCAD: 80 } } }));
    await waitFor(() => expect(link.docs["WEB-REF"].imported.hash).toBe("h2"));
    let s = await state();
    expect(s.hist.find((h: Row) => h.webOrderId === "WEB-REF").voided).toBe(true);
    expect(s.stock).toBe(100);

    link.push(webOrder("WEB-REF", { hash: "h3" }));
    await waitFor(() => expect(link.docs["WEB-REF"].imported.hash).toBe("h3"));
    s = await state();
    expect(s.hist.find((h: Row) => h.webOrderId === "WEB-REF").voided).toBe(false);
    expect(s.stock).toBe(98);
    expect(s.hist.filter((h: Row) => h.webOrderId === "WEB-REF")).toHaveLength(1);
  });

  it("keeps the copies gone at no money when they did not come back", async () => {
    const { link, state } = setUp();
    link.push(webOrder("WEB-GONE"));
    await waitFor(() => expect(link.docs["WEB-GONE"].pending).toBe(false));
    link.push(webOrder("WEB-GONE", { hash: "h2", paymentStatus: "refunded", refundState: "full", books: { [BOOK]: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80 } } }));
    await waitFor(() => expect(link.docs["WEB-GONE"].imported.hash).toBe("h2"));
    const s = await state();
    expect(s.hist.find((h: Row) => h.webOrderId === "WEB-GONE")).toMatchObject({ price: 0, qty: 2, voided: false, webRefunded: true, gratuity: true });
    expect(s.stock).toBe(98);
    expect(s.revenue).toBe(0);
  });
});

describe("the first time", () => {
  it("records when the link was switched on, and keeps a day already on record", async () => {
    const { link } = setUp();
    link.setStatus({ website: { at: "2026-11-01T00:00:00.000Z" }, app: {} });
    link.push(webOrder("WEB-FIRST"));
    await waitFor(() => expect(link.docs["WEB-FIRST"].pending).toBe(false));
    expect(link.status.app?.importConsentAt).toBe("2026-11-11T12:00:00.000Z");
  });
});

describe("rehearsal orders", () => {
  it("are listed as a dry run and never recorded", async () => {
    const { link, state } = setUp();
    link.push(webOrder("WEB-TEST", { test: true }));
    await waitFor(() => expect(linkView().tests.map((p) => p.orderId)).toEqual(["WEB-TEST"]));
    await new Promise((r) => setTimeout(r, 30));
    expect((await state()).hist).toHaveLength(0);
    expect(link.docs["WEB-TEST"].pending).toBe(true);
  });
});

describe("stock sent to the website", () => {
  it("publishes every book's count when the admin opens, before any order", async () => {
    const { link } = setUp();
    await waitFor(() => expect(link.feeds[BOOK]).toBeTruthy());
    expect(link.feeds[BOOK]).toMatchObject({ bookId: BOOK, build: "admin" });
  }, 8000);
});
