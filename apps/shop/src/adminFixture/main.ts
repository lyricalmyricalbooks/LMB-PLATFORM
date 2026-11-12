// Development-only entry for admin-fixture.html: the real admin (signed in through the dev-only ?debug=true door) with
// sample orders and books. Every other admin call answers with nothing, as an offline shop would, so the check sees
// each screen's real empty and error states too. Nothing here reaches Firestore.
import { adminApi } from "../app/admin/api";
import { teamApi } from "../app/admin/teamApi";
import { A11Y_BOOKS } from "../a11yFixture/books";
import { inventoryLinkApi } from "../app/admin/inventoryLinkApi";
import { addressKey } from "../app/admin/fulfillment";
import { googleConnectApi, readGoogleStatus } from "../app/admin/googleConnect";
import { appsApi } from "../app/admin/appActivity";
import { loadStockroom, stockroomApi, type StockroomRecords } from "../app/admin/stockroom/stockroomData";
import { MemoryStockroom } from "../app/admin/stockroom/stockroomMemory";
import { createStockroomWriter, stockroomWriteApi } from "../app/admin/stockroom/stockroomWrite";
import { recomputeAfters } from "@stockroom/recompute-afters.js";
import { stockistReceiptApi } from "../app/admin/stockroom/stockistReceipt"; // stockist-pay
import { qrCodesStore } from "../app/admin/stockroom/qrCodesStore";
import { sheetsStore } from "../app/admin/stockroom/sheetsStore";
import { nightlyBackupApi } from "../app/admin/BackupsExportCard";
import { copiesIO, readManifest, snapshotOf } from "../app/admin/stockroom/stockroomCopies";

// Stockroom › To-do: two titles, one nearly sold out and one with nothing waiting (`?stock=empty`: nothing at all).
const EMPTY_STOCKROOM = new URLSearchParams(window.location.search).get("stock") === "empty";
stockroomApi.load = async (): Promise<StockroomRecords> => (EMPTY_STOCKROOM ? { books: [], states: {}, taxCenter: null } : {
  books: [{ id: "salt-hours", title: "Salt Hours", author: "Ada Example", maxPrint: 200, threshold: 10, listPrice: 20 }, { id: "night-songs", title: "Night Songs", author: "Ben Example", maxPrint: 150, threshold: 10, listPrice: 18 }],
  states: { "salt-hours": { hist: [{ id: 1, qty: 196, channel: "web", amount: 0 }] }, "night-songs": { hist: [{ id: 2, qty: 12, channel: "web", amount: 0 }, ...[["W-1041", 9, "Cleo Example"], ["W-1042", 4, "Dev Example"]].map(([num, days, name], i) => ({ id: 10 + i, num, qty: 1, price: 18, chan: "Website", date: new Date(Date.now() - Number(days) * 864e5).toISOString().slice(0, 10), shipName: name, shipAddr1: "1 Example St" }))], openCall: [{}, {}] } },
  taxCenter: null,
  // Author entries waiting on a title (the old stockroom's author inbox).
  submissions: { "night-songs": { sales: { s1: true }, expenses: { e1: true, e2: true } } },
});

// ── Stockroom › QR codes (?page=stockroom/qrcodes): two items with a card payment link, one without, and one own code
// kept in memory (nothing reaches Firestore). ──
if (/page=stockroom(\/|%2F)qrcodes/.test(window.location.search) && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", listPrice: 20, stripeLink: "https://buy.stripe.com/test_salt" },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", listPrice: 18, paymentLink: "https://paypal.me/yourpress/18" },
      { id: "ink-maps", title: "Ink Maps", author: "Cleo Example", listPrice: 22 },
    ],
    states: { "salt-hours": { hist: [] }, "night-songs": { hist: [] }, "ink-maps": { hist: [] } }, taxCenter: null,
  });
  let own = [{ id: "c1", name: "Join the mailing list", url: "https://example.com/newsletter" }];
  qrCodesStore.load = async () => own;
  qrCodesStore.save = async (codes) => { own = codes; };
}

// --- Stockroom money pages (Tax centre, Expenses, Ask about your sales): sample records, only for those pages ---
if (/page=stockroom(\/|%2F)(tax[a-z]+|expenses|intel)/.test(window.location.search) && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", currency: "CA$", maxPrint: 200, threshold: 10, listPrice: 20 },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", currency: "€", maxPrint: 150, threshold: 10, listPrice: 18 },
    ],
    states: {
      "salt-hours": {
        hist: [
          { id: 1, date: "2026-03-04", num: "A1", qty: 2, price: 20, chan: "Direct", shippingPaid: 6 },
          { id: 2, date: "2025-11-02", num: "A0", qty: 1, price: 20, chan: "Website" },
          { id: 3, date: "2026-05-01", num: "V1", qty: 1, price: 20, chan: "Direct", voided: true },
          { id: 4, date: "2026-06-12", num: "A2", qty: 4, price: 20, chan: "Book fair" },
          { id: 6, date: "2026-10-18", num: "P1", qty: 5, price: 20, chan: "Book Fair" },
          { id: 7, date: "2026-11-02", num: "C1", qty: 3, price: 12, chan: "Consignment" },
        ],
        expenses: [
          { id: 11, date: "2026-02-10", desc: "Print run", cat: "Printing", amount: 300, currency: "CAD", baseAmount: 300, receipt: "cloud://receipts/print-run.pdf" },
          { id: 12, date: "2026-04-01", desc: "Freight to warehouse", cat: "Shipping & Postage", amount: 64.5, currency: "CAD", baseAmount: 64.5 },
        ],
        artistPayouts: [{ id: 21, date: "2026-07-01", amount: 50, method: "e-transfer" }],
      },
      "night-songs": {
        hist: [{ id: 5, date: "2026-03-09", num: "B1", qty: 3, price: 10, chan: "Direct" }],
        expenses: [{ id: 13, date: "2026-03-15", desc: "Cover design", cat: "Design", amount: 120, currency: "EUR", received: false }],
      },
    },
    taxCenter: {
      settings: { baseCurrency: "CAD", rates: { EUR_CAD: 1.5, USD_CAD: 1.35 } },
      trips: [{ name: "Toronto Book Fair", destination: "Toronto", startDate: "2026-06-11", endDate: "2026-06-13" }],
      businessExpenses: [
        { id: 31, date: "2026-06-11", desc: "Booth fee", cat: "Booths & Fairs", amount: 250, currency: "CAD", baseAmount: 250, trip: "Toronto Book Fair", receipt: "cloud://receipts/booth.pdf" },
        { id: 32, date: "2026-06-12", desc: "Team lunch", cat: "Meals & Entertainment", amount: 80, currency: "CAD", baseAmount: 80, trip: "Toronto Book Fair" },
        { id: 33, date: "2026-08-02", desc: "Mailing supplies", cat: "Supplies", amount: 40, currency: "USD", baseAmount: 54 },
        { id: 34, date: "2025-09-09", desc: "Website hosting", cat: "Software", amount: 20, currency: "CAD", baseAmount: 20 },
      ],
      recurring: [{ id: "r1", desc: "Website hosting", vendor: "Host Example", cat: "Software", amount: 20, currency: "CAD", frequency: "monthly", startDate: "2026-01-01", day: 1 }],
    },
  });
}
// --- end of the stockroom money pages block ---
// ── Stockroom › Stock and sales fixture (only for ?page=stockroom/dashboard): four items, one with a stale saved count,
// a voided sale, a store holding copies, a write-off and a held artist payment; one sold out.
if (new URLSearchParams(window.location.search).get("page") === "stockroom/dashboard" && !EMPTY_STOCKROOM) {
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: [
      { id: "salt-hours", title: "Salt Hours", author: "Ada Example", maxPrint: 200, threshold: 10, listPrice: 20, currency: "$" },
      { id: "night-songs", title: "Night Songs", author: "Ben Example", maxPrint: 150, threshold: 10, listPrice: 18, currency: "$" },
      { id: "tide-tables", title: "Tide Tables", author: "Cleo Example", maxPrint: 60, threshold: 8, listPrice: 12, currency: "€" },
      { id: "last-light", title: "Last Light", author: "Dev Example", maxPrint: 40, threshold: 5, listPrice: 25, currency: "$" },
    ],
    states: {
      "salt-hours": { stock: 999, hist: [{ id: 1, qty: 120, price: 20, chan: "Website", date: "2026-10-01" }, { id: 2, qty: 5, price: 20, chan: "Fair", date: "2026-10-04" }, { id: 3, qty: 9, price: 20, chan: "Website", voided: true }], ledger: [], stores: [] },
      "night-songs": {
        hist: [{ id: 1, qty: 40, price: 18, chan: "Website", date: "2026-10-02" }, { id: 2, qty: 6, price: 18, chan: "Consignment", consignmentLink: true, notes: "Corner Books", date: "2026-10-09" }],
        ledger: [{ id: "s1", type: "Shipment", storeId: "st1", storeName: "Corner Books", qty: 30, date: "2026-10-05" }, { id: "s2", type: "Sale", storeId: "st1", storeName: "Corner Books", qty: 6, amountDue: 108, date: "2026-10-09" }, { id: "w1", type: "Inventory Disposal", qty: 4, date: "2026-10-11", status: "written off" }],
        stores: [{ id: "st1", name: "Corner Books", sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      },
      "tide-tables": { authorStock: 10, hist: [{ id: 1, qty: 38, price: 12, chan: "Website" }, { id: 2, qty: 2, price: 0, chan: "Gift", gratuity: true }], artistTransfers: [{ chan: "Fair", qty: 4, price: 12, total: 48 }], ledger: [], stores: [] },
      "last-light": { hist: [{ id: 1, qty: 40, price: 25, chan: "Website" }], ledger: [], stores: [] },
    },
    taxCenter: null,
  });
}

// ── Stockroom › Sales records + Customers sample (sales worker): a third title with real-shaped sales (order number,
// channel, price, date, email), a voided one, a gift, one recorded in US dollars, a consignment shipment, repeat buyers,
// and enough rows to page. Added on top of whatever the block above loaded.
{
  const base = stockroomApi.load;
  stockroomApi.load = async (): Promise<StockroomRecords> => {
    const records = await base();
    if (EMPTY_STOCKROOM) return records;
    const people = [["Ada Example", "ada@example.com"], ["Ben Example", "ben@example.com"], ["Cleo Example", "cleo@example.com"], ["Dee Example", "dee@example.com"]];
    const hist: Array<Record<string, unknown>> = Array.from({ length: 64 }, (_, i) => {
      const [name, email] = people[i % people.length];
      const day = String(1 + (i % 28)).padStart(2, "0");
      return { num: `${1100 + i}`, chan: ["Website", "POS", "Direct", "Book Fair"][i % 4], qty: 1 + (i % 3), price: 22, date: `2026-10-${day}`, shipName: name, shipEmail: email, notes: i % 9 === 0 ? "Signed copy" : "", enteredBy: "Publisher" };
    });
    hist.push(
      { num: "1200", chan: "Website", qty: 2, price: 22, date: "2026-10-30", shipName: "Eve Example", shipEmail: "eve@example.com", voided: true, voidedAt: Date.parse("2026-10-31T12:00:00Z") },
      { num: "1201", chan: "Gratuity", qty: 1, price: 0, date: "2026-10-29", notes: "Gift to a reviewer", gratuity: true },
      { num: "1202", chan: "Website", qty: 1, price: 25, date: "2026-10-28", cur: "USD", shipName: "Fay Example", shipEmail: "fay@example.com", payment: { currency: "USD", amount: 25, convertedTotal: 25 } },
    );
    return {
      ...records,
      books: [...records.books, { id: "paper-moons", title: "Paper Moons", author: "Cleo Example", maxPrint: 400, threshold: 20, listPrice: 22, currency: "CAD" }],
      states: { ...records.states, "paper-moons": { hist, ledger: [{ type: "Shipment", storeName: "Corner Books", qty: 20, date: "2026-10-05", notes: "First delivery" }] } },
    };
  };
}

// ── Stockists / Shipping / Open call samples (block of the stockists page; adds to the records above) ──
{
  const base = stockroomApi.load;
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
  stockroomApi.load = async () => {
    const r = await base();
    if (!r.books.length) return r;
    r.books = r.books.map((b) => ({ currency: "CAD", ...b }));
    const [salt, night] = ["salt-hours", "night-songs"];
    const sale = (id: number, storeId: number, storeName: string, ago: number, qty: number, status: string) => ({ id, type: "Sale", storeId, storeName, date: day(ago), qty, rate: 40, amountDue: qty * 12, status, sheetsId: `s${id}` });
    const ship = (id: number, storeId: number, storeName: string, ago: number, qty: number) => ({ id, type: "Shipment", storeId, storeName, date: day(ago), qty, amountDue: 0, status: "OK", sheetsId: `s${id}` });
    const web = (num: string, ago: number, extra: object = {}) => ({ id: Number(num.slice(4)), chan: "Website", num, date: day(ago), qty: 1, shipName: `Customer ${num}`, shipAddr1: "1 Example St", shipCity: "Toronto", shipCountry: "Canada", shippingPaid: 8, ...extra });
    r.states[salt] = {
      ...r.states[salt],
      stores: [
        { id: 1, name: "Corner Books", city: "Toronto", region: "ON", country: "Canada", rate: 40, sent: 10, sold: 4, returned: 0, outstanding: 6, amountOwed: 48 },
        { id: 2, name: "Harbour Gifts", city: "Halifax", region: "NS", country: "Canada", rate: 40, sent: 6, sold: 6, returned: 0, outstanding: 0, amountOwed: 0 },
        { id: 3, name: "Lakeside Co-op", city: "Kingston", region: "ON", country: "Canada", rate: 35, sent: 8, sold: 2, returned: 0, outstanding: 5, amountOwed: 24 },
      ],
      ledger: [ship(1, 1, "Corner Books", 90, 10), sale(2, 1, "Corner Books", 40, 4, "pending"), ship(3, 2, "Harbour Gifts", 80, 6), sale(4, 2, "Harbour Gifts", 30, 6, "paid"), ship(5, 3, "Lakeside Co-op", 60, 8), sale(6, 3, "Lakeside Co-op", 20, 2, "pending")],
      invoices: [
        { id: "i1", num: "INV-2026-001", status: "sent", date: day(60), dueDate: day(20), total: 48, currency: "CAD", storeName: "Corner Books", storeId: 1, storeEmail: "shop@example.com", items: [{ _ledgerId: 2 }], reminders: [{ status: "sent", at: Date.now() - 5 * 86_400_000, kind: "auto" }] },
        { id: "i2", num: "INV-2026-002", status: "paid", date: day(70), dueDate: day(40), total: 72, currency: "CAD", storeName: "Harbour Gifts", storeId: 2 },
        { id: "i3", num: "INV-2026-003", status: "sent", date: day(10), dueDate: day(-20), total: 24, currency: "CAD", storeName: "Lakeside Co-op", storeId: 3 },
      ],
      hist: [...((r.states[salt] as { hist?: unknown[] }).hist || []), web("WEB-1041", 9), web("WEB-1042", 4), web("WEB-1043", 1), web("WEB-1044", 12, { trackingNumber: "7023110000451" }), web("WEB-1045", 6, { shipName: "Ben Example" })],
    };
    r.states[night] = {
      ...r.states[night],
      stores: [{ id: 11, name: "Corner Books", city: "Toronto", region: "ON", country: "Canada", rate: 40, sent: 5, sold: 1, returned: 0, outstanding: 4, amountOwed: 12 }],
      ledger: [ship(21, 11, "Corner Books", 50, 5), sale(22, 11, "Corner Books", 15, 1, "pending")],
      openCall: [
        { id: "c1", name: "Mira Example", email: "mira@example.com", selectionSent: true, creditReceived: false, createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString() },
        { id: "c2", name: "Theo Example", email: "theo@example.com", selectionSent: false, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
        { id: "c3", name: "Noor Example", email: "", selectionSent: true, creditReceived: true, cmykSent: false, createdAt: new Date(Date.now() - 12 * 86_400_000).toISOString() },
        { id: "c4", name: "Ana Example", email: "ana@example.com", selectionSent: true, creditReceived: true, cmykSent: true, filesReceived: true, preorderSent: true, createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString() },
      ],
    };
    const postage = (num: string, amount: number) => ({ id: `p${num}`, cat: "Shipping & Postage", desc: "Canada Post label", amount, baseAmount: amount, shippingMatchStatus: "matched", shippingOrderNumber: num });
    r.taxCenter = { ...(r.taxCenter || {}), businessExpenses: [postage("WEB-1044", 14.5), postage("WEB-1045", 8.2)] };
    return r;
  };
}

// ── Stockroom › Till: six titles, one sold out (?page=stockroom/pos) ──
if (/page=stockroom(\/|%2F)pos/.test(window.location.search) && !EMPTY_STOCKROOM) {
  const titles: Array<[string, string, number, number]> = [
    ["salt", "Salt Almanac", 18, 38], ["tide", "Tidewrack", 12, 22], ["ferry", "The Ferry Poems", 10, 40],
    ["lantern", "Lantern Season", 22, 0], ["weather", "Small Weather", 7, 60], ["atlas", "Harbour Atlas", 28, 14],
  ];
  stockroomApi.load = async (): Promise<StockroomRecords> => ({
    books: titles.map(([id, title, listPrice, stock]) => ({ id, title, listPrice, currency: "CA$", maxPrint: stock })),
    states: Object.fromEntries(titles.map(([id, , , stock]) => [id, { stock, hist: [] }])),
    taxCenter: null,
  });
}

// ── Stockroom writes (record a sale / void, sales worker): the records above go into an in-memory stockroom
// (stockroomMemory.ts) the first time a page reads them, and every page reads and saves through it from then on, so
// ?page=stockroom/history can record and void sales with nothing reaching Firestore. `?stocksave=offline` makes every
// save fail as an unreachable server does; `window.__stockroomMemory` is the stockroom, for checks. ──
{
  const base = stockroomApi.load;
  let memory: MemoryStockroom | null = null;
  const offline = new URLSearchParams(window.location.search).get("stocksave") === "offline";
  const ready = async () => {
    if (memory) return memory;
    const records = await base();
    const mem = new MemoryStockroom();
    mem.putCatalog(records.books);
    for (const [id, state] of Object.entries(records.states)) {
      const book = records.books.find((b) => b.id === id) ?? null;
      const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
      // Ids the old app gives every sale (its first load adds any missing), and its totals, as a stored book has them.
      if (Array.isArray(copy.hist)) (copy.hist as Array<Record<string, unknown>>).forEach((h, i) => { h.sheetsId ??= `fixture-${id}-${i}`; });
      recomputeAfters(copy, book);
      mem.putBook(id, copy);
    }
    (window as unknown as { __stockroomMemory?: MemoryStockroom }).__stockroomMemory = mem;
    return (memory = mem);
  };
  stockroomApi.load = async () => {
    if (EMPTY_STOCKROOM) return base();
    const records = await base();
    const fresh = await loadStockroom((await ready()).device());
    return { ...records, states: { ...records.states, ...fresh.states }, invoiceSettings: fresh.invoiceSettings ?? records.invoiceSettings ?? null };
  };
  const writer = async () => createStockroomWriter((await ready()).device({ offline }));
  stockroomWriteApi.saveBookState = async (bookId, mutate) => (await writer()).saveBookState(bookId, mutate);
  stockroomWriteApi.commitBookState = async (pending) => createStockroomWriter((await ready()).device()).commitBookState(pending);
  stockroomWriteApi.updateSetting = async (key, mutate) => (await writer()).updateSetting(key, mutate);
  stockroomWriteApi.saveSetting = async (key, value, opts) => (await writer()).saveSetting(key, value, opts);

  // Exchange rates: no rate services are asked from the fixture. A logged expense in another currency takes 1.4, and
  // the Tax centre's background refresh finds nothing to do.
  const { taxRatesApi } = await import("../app/admin/stockroom/taxRates");
  taxRatesApi.expenseRatesFor = async (items) => Object.fromEntries(items.map((i) => [`${i.currency.toUpperCase()}@${i.date}`, 1.4]));
  taxRatesApi.refreshTaxRates = async () => null;

  // Website orders (Stock and sales › Website orders): the website's inbox in memory, with one paid order for the
  // first book, brought in through the same write layer. `window.__websiteLink` is the inbox, for checks.
  const { websiteLinkApi } = await import("../app/admin/stockroom/WebsiteOrders");
  const { MemoryWebsiteLink } = await import("../app/admin/stockroom/websiteLinkMemory");
  const { loadLinkBooks } = await import("../app/admin/stockroom/stockroomData");
  const { onStockroomSaved } = await import("../app/admin/stockroom/stockroomWrite");
  websiteLinkApi.deps = () => {
    let link: InstanceType<typeof MemoryWebsiteLink> | null = null;
    const linked = async () => {
      if (link) return link;
      const mem = await ready();
      link = new MemoryWebsiteLink(mem);
      (window as unknown as { __websiteLink?: unknown }).__websiteLink = link;
      const first = [...mem.parts.keys()][0];
      if (first) link.push({
        v: 1, orderId: "WEB-2001", number: "#2001", hash: "f1", test: false, paidAt: new Date().toISOString(), paidDay: new Date().toISOString().slice(0, 10),
        paymentMethod: "Stripe", paymentStatus: "paid", refundState: "none", refund: null,
        totals: { subtotal: 20, discount: 0, discountCode: "", shipping: 8, tax: 0, total: 28, giftCard: 0 }, charged: { currency: "CAD", amountMinor: 2800 },
        customer: { name: "Sam Reader", email: "sam@example.com", phone: "", address: { city: "Toronto", state: "ON", country: "CA" } },
        fulfillment: { method: "shipping", status: "paid", trackingNumber: "", trackingCarrier: "", trackingUrl: "", shippedDay: null, labelSource: null },
        books: { [first]: { net: 1, sold: 1, restocked: 0, unitCAD: 20, merchCAD: 20, preorder: false, titles: [] } }, firstBook: first, unlinked: [],
      });
      return link;
    };
    const lazyIO = {
      watchPending: (cb: any, onError: any) => { let stop = () => {}; void linked().then((l) => { stop = l.io().watchPending(cb, onError); }); return () => stop(); },
      watchStatus: (cb: any, onError: any) => { let stop = () => {}; void linked().then((l) => { stop = l.io().watchStatus(cb, onError); }); return () => stop(); },
      markSwitchedOn: async (at: string) => (await linked()).io().markSwitchedOn(at),
      publish: async (args: any) => (await linked()).io().publish(args),
    };
    return {
      link: lazyIO,
      loadBooks: async () => loadLinkBooks((await ready()).device()),
      // Straight into the in-memory stockroom (a later sample block swaps stockroomWriteApi for its own save).
      saveBook: async (id, mutate) => createStockroomWriter((await ready()).device()).saveBookState(id, mutate),
      rate: async () => null,
      rates: () => ({}),
      chargeIntents: () => ({}),
      onSaved: onStockroomSaved,
    };
  };
  // The runner is mounted for the shop's owner only; `?weblink=1` starts it for the fixture's own user.
  if (new URLSearchParams(location.search).get("weblink") === "1") {
    const { createWebsiteLinkRunner } = await import("../app/admin/stockroom/websiteLinkRun");
    createWebsiteLinkRunner(websiteLinkApi.deps()).start();
  }
}

// ── Stockists › Mark paid (block of the stockist-pay page): saves into memory, receipts are only recorded ──
{
  const saved: Record<string, any> = {};
  const load = stockroomApi.load;
  stockroomApi.load = async () => { const r = await load(); Object.assign(r.states, saved); return r; };
  stockroomWriteApi.saveBookState = async (bookId: string, mutate: (s: any) => any) => {
    const r = await stockroomApi.load();
    const before = r.states[bookId];
    if (!before) return { status: "refused", reason: "unknown-book", message: "That book isn't in the stockroom." } as any;
    try {
      const state = (await mutate(structuredClone(before))) ?? before;
      saved[bookId] = state;
      return { status: "saved", state, merged: false, conflicts: [], written: ["invoices", "ledger", "stores"] } as any;
    } catch (error) {
      return { status: "refused", reason: "no-permission", message: (error as Error).message } as any;
    }
  };
  stockistReceiptApi.send = async (receipt) => { ((window as any).__fixtureReceipts ||= []).push(receipt); return { to: receipt.to }; };
  stockistReceiptApi.sendNote = async (note) => { ((window as any).__fixtureReceipts ||= []).push(note); return { to: note.to }; };
}

const order = (n: number, status: string, name: string) => ({
  id: `o${n}`, orderId: `FIXTURE-${n}`, status, paymentStatus: "paid", createdAt: new Date(Date.now() - n * 3_600_000).toISOString(),
  customer: { name, email: `buyer${n}@example.com` },
  items: [{ id: "b1", title: "Salt Hours", quantity: n, price: 20 }], total: 20 * n, subtotal: 20 * n, currency: "CAD",
  // Sales tax and the card fee as the server records them (Stockroom › Tax centre reads these).
  tax: 2.6 * n, taxLines: [{ name: "HST ON", cents: 260 * n }], fee: 88 * n, payoutId: n < 3 ? "po_fixture" : "po_fixture_2", payoutDate: new Date(Date.now() - (n < 3 ? 2 : 9) * 86_400_000).toISOString(), ...(n === 3 ? { net: 6000 - 264 - 1500 } : {}),
  shippingAddress: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "Canada" },
  trackingKey: `key${n}`, fulfillmentStatus: status === "shipped" ? "shipped" : "unfulfilled",
});
const ORDERS = [order(1, "paid", "Ada Example"), { ...order(2, "paid", "Ben Example"), locale: "fr-CA" } as any, order(3, "shipped", "Cleo Example")];

// One open order with its address reviewed, two lines and a parcel already sent ahead (Send part now, plan 24.5).
function orderDetail(id: string) {
  const base: any = ORDERS.find((o) => o.id === id);
  if (!base) return null;
  const o: any = {
    ...base, customer: { ...base.customer, address: base.shippingAddress },
    items: [...base.items, { id: "b2", title: "Night Songs", quantity: 1, price: 18 }],
    ...(id === "o2" ? { partShipments: [{ id: "p1", lines: [{ line: 0, title: "Salt Hours", quantity: 1 }], trackingCarrier: "Canada Post", trackingNumber: "7023 1100 0045", trackingUrl: "", shippedAt: new Date(Date.now() - 86_400_000).toISOString() }] } : {}),
  };
  o.operations = { addressReviewed: addressKey(o) };
  return o;
}

const known: Record<string, (...a: any[]) => any> = {
  getOrderById: async (id: string) => orderDetail(id),
  // Marketing › Discounts as in the mockup: two live codes, one automatic offer and one that ended.
  getDiscounts: async () => [
    { id: "d1", code: "WINTER10", method: "code", type: "percentage", value: 10, minOrderAmount: 30, isActive: true, usageCount: 4 },
    { id: "d2", code: "LAUNCH", method: "code", type: "freeship", isActive: true, expiryDate: "2026-11-01", usageCount: 31 },
    { id: "d3", method: "automatic", title: "Two zines for $12", type: "fixed", value: 4, minQuantity: 2, isActive: true },
    { id: "d4", code: "FRIENDS", method: "code", type: "fixed", value: 5, isActive: false },
  ],
  // Marketing › Gift cards as in the mockup: an unspent card, a part-spent one and one you turned off.
  getGiftCards: async () => [
    { id: "g1", last4: "4F2A", balanceMinor: 2500, initialMinor: 2500, source: "order", orderId: "o1", recipientName: "Cleo Example", createdAt: "2026-11-09T10:00:00.000Z" },
    { id: "g2", last4: "77B1", balanceMinor: 850, initialMinor: 3000, source: "manual", createdAt: "2026-11-02T10:00:00.000Z" },
    { id: "g3", last4: "0C9D", balanceMinor: 5000, initialMinor: 5000, source: "manual", enabled: false, createdAt: "2026-10-20T10:00:00.000Z" },
  ],
  // o2's customer added a book after paying (plan 24.6): an open payment-link order that ships with it.
  getOrdersShippingWith: async (id: string) => (id === "o2" ? [{ id: "o2-add", orderId: "ADD-2", shipsWith: "o2", paymentStatus: "unpaid", status: "pending_payment", items: [{ id: "b2", title: "Night Songs", quantity: 1 }], paymentLink: { expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() } }] : []),
  getOrders: async () => ORDERS,
  getAllOrders: async () => ORDERS,
  getFulfillmentOrders: async () => ORDERS,
  getRecentFulfillmentOrders: async () => ORDERS,
  getBooks: async () => A11Y_BOOKS,
  // A screenshot of the post composer sets __fixtureWebPhotos: the composer only offers web (https) photos, which the
  // check's own page.route answers; every other check keeps the offline pictures.
  getAllBooks: async () => ((window as any).__fixtureWebPhotos
    ? A11Y_BOOKS.map((b: any, i: number) => ({ ...b, photos: (b.photos || []).map((p: any) => ({ ...p, url: `https://photos.example/cover-${i + 1}.jpg` })) }))
    : A11Y_BOOKS),
  getSettings: async () => ({}),
  // Analytics: the shop's own visit counter for every day asked, with a steady made-up pattern (no Google here).
  getDailyAnalyticsBetween: async (from: string, to: string) => {
    const rows: any[] = [];
    for (let k = from, i = 0; k <= to && i < 900; i++, k = new Date(Date.parse(`${k}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
      const visits = 18 + ((i * 7) % 23) + (new Date(`${k}T12:00:00Z`).getUTCDay() === 6 ? 14 : 0);
      rows.push({ id: k, date: k, visits,
        sources: { instagram: Math.round(visits * 0.4), direct: Math.round(visits * 0.3), "google com": Math.round(visits * 0.2), newsletter: Math.round(visits * 0.1) },
        devices: { phone: Math.round(visits * 0.7), computer: Math.round(visits * 0.25), tablet: Math.round(visits * 0.05) },
        bookViews: { b1: Math.round(visits * 0.3), b2: Math.round(visits * 0.2), b3: Math.round(visits * 0.1) },
        funnel: { view: Math.round(visits * 0.6), add_to_cart: Math.round(visits * 0.12), checkout_start: Math.round(visits * 0.06), purchase: i % 5 === 0 ? 1 : 0 },
        searches: { poetry: 2, riso: 1, ...(i % 3 === 0 ? { "night songs": 1 } : {}) }, noResults: i % 4 === 0 ? { "cook book": 1 } : {} });
    }
    return rows;
  },
  // A list, though its name doesn't end like one: the Overview's alerts read it on the way back from an order.
  getRecentEmailLog: async () => [],
  getAdminBadgeCounts: async () => ({ pendingReviews: 0, unreadMessages: 0, openPrivacyRequests: 0 }),
  listNewsletterIssues: async () => [
    { id: "n2", subject: "Spring list and where to find us", status: "paused", audience: 42, sent: 18, lastError: "Sending stopped after 5 failed tries in a row. Check Settings › Email sender, then press Resume.", createdAt: new Date(Date.now() - 600_000).toISOString() },
    { id: "n1", subject: "Winter sale", status: "sent", audience: 40, sent: 40, createdAt: "2026-10-01T15:00:00Z", finishedAt: "2026-10-01T15:30:00Z" },
  ],
  // Sales channels and Social posts (plan 27.5, 27.6): Facebook & Instagram and Pinterest connected, TikTok not, and a
  // post of each kind in the list.
  social: async (step: string) => {
    const img = (A11Y_BOOKS[0] as any).photos[0].url;
    if (step === "status") return { enabled: true, networks: [
      { network: "meta", name: "Facebook & Instagram", available: true, connected: true, problem: null, accountName: "Ada Example", canSendCatalog: true,
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "ig:222", kind: "instagram", name: "@examplepress" }],
        catalog: { sentAt: new Date(Date.now() - 86_400_000).toISOString(), feedUrl: "https://example.web.app/social-product-feed.csv" } },
      { network: "pinterest", name: "Pinterest", available: true, connected: true, problem: null, accountName: "examplepress", canSendCatalog: true,
        places: [{ id: "pin:900", kind: "pinterestBoard", name: "New books" }], catalog: null },
      { network: "tiktok", name: "TikTok", available: true, connected: false, problem: null, accountName: null, places: [], catalog: null, canSendCatalog: false },
    ] };
    if (step === "posts") return { posts: [
      { id: "p1", bookId: "b1", bookTitle: "Salt Hours", imageUrl: img, caption: "Salt Hours, new this week.\n\n$20.00. Link in the post.", status: "scheduled",
        sendAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), createdAt: new Date().toISOString(), results: {},
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "ig:222", kind: "instagram", name: "@examplepress" }] },
      { id: "p2", bookId: "b2", bookTitle: "Night Songs", imageUrl: img, caption: "Night Songs is back in stock.", status: "partly",
        sendAt: new Date(Date.now() - 3_600_000).toISOString(), createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        places: [{ id: "fb:111", kind: "facebookPage", name: "Example Press" }, { id: "pin:900", kind: "pinterestBoard", name: "New books" }],
        results: { "fb:111": { state: "posted" }, "pin:900": { state: "failed", message: "Pinterest turned that down. Check the photo and the words, then try again." } } },
    ] };
    return {};
  },
  newsletterAdmin: async (op: string) => (op === "audience" ? { audience: 42 } : { ok: true, to: "owner@example.com", audience: 42 }),
};
// Lists answer with an empty list and everything else with nothing, as an offline shop would.
const quiet = (key: string) => async () => (/^(get|list)\w*(s|Orders|List)$/.test(key) || /^(getShippingProfiles|getDiscounts|getGiftCards)$/.test(key) ? [] : null);
for (const key of Object.keys(adminApi as any)) {
  const original = (adminApi as any)[key];
  if (typeof original !== "function" || key === "onAuthStateChange") continue;
  (adminApi as any)[key] = known[key] || quiet(key);
}
// Matches with the stockroom (Inventory app link): none, unless a check sets `window.__fixtureLinks` before loading.
const links = () => ((window as any).__fixtureLinks ||= {});
inventoryLinkApi.links = async () => links();
inventoryLinkApi.state = async () => ({ links: links() });
inventoryLinkApi.linkNewBook = async (bookId: string, inventoryBookId: string) => {
  links()[bookId] = { _: inventoryBookId };
  return { links: links(), already: false };
};
(window as any).__adminFixture = { orders: ORDERS };

// Settings › Team: the fixture signs in as the owner, with three people on the Team.
(adminApi as any).myRole = async () => "owner";
teamApi.list = async () => [
  { email: "ada.example@example.com", role: "staff" },
  { email: "ben.example@example.com", role: "bookkeeper" },
  { email: "cleo@example.com", role: "fairHelper", until: new Date(Date.now() + 36e5).toISOString() },
];

// ── Stockroom › Shipping › Buy label (block of the labels-from-shipping page): two waiting rows are website orders here,
// WEB-1041 ready for a label and WEB-1042 not packed yet. Rates and the purchase are fakes recorded in
// `window.__adminFixture.labelCalls`; nothing reaches a carrier.
{
  const api = adminApi as any;
  const labelCalls: any[] = ((window as any).__adminFixture.labelCalls = []);
  const shipOrder = (id: string, name: string, packed: boolean) => {
    const o: any = {
      id, orderId: id, status: "paid", paymentStatus: "paid", fulfillmentStatus: "unfulfilled", shippingMethod: "Canada Post Expedited Parcel", shipping: 14,
      createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(), currency: "CAD", total: 34, subtotal: 20,
      customer: { name, email: "buyer@example.com", address: { street: "1 Example St", city: "Toronto", state: "ON", zip: "M5V 1A1", country: "CA" } },
      items: [{ id: "salt-hours", title: "Salt Hours", quantity: 1, price: 20, weightGrams: 400 }],
    };
    o.operations = { addressReviewed: addressKey(o), packed: packed ? JSON.stringify(o.items.map((i: any) => [i.id, "", i.quantity])) : "" };
    return o;
  };
  const shipOrders: Record<string, any> = { "WEB-1041": shipOrder("WEB-1041", "Customer WEB-1041", true), "WEB-1042": shipOrder("WEB-1042", "Customer WEB-1042", false) };
  const before = api.getOrderById;
  api.getOrderById = async (id: string) => shipOrders[id] ?? before(id);
  api.getCanadaPostLabelRates = async (orderId: string, parcel: any) => {
    labelCalls.push(["rates", orderId, parcel]);
    return { shipmentId: "shp_fixture", rates: [
      { id: "rate_exp", name: "Expedited Parcel", carrier: "Canada Post", amount: "12.40", currency: "CAD", estimatedDays: 2 },
      { id: "rate_reg", name: "Regular Parcel", carrier: "Canada Post", amount: "10.15", currency: "CAD", estimatedDays: 5 },
    ] };
  };
  api.buyCanadaPostLabel = async (orderId: string, shipmentId: string, rateId: string) => {
    labelCalls.push(["buy", orderId, shipmentId, rateId]);
    shipOrders[orderId] = { ...shipOrders[orderId], labelUrl: "https://labels.example/fixture.pdf", trackingNumber: "7023110000999" };
    return {};
  };
}

// ?move=1 (scripts/move-check.mjs): a press that brought its shop with it and finished Get started, so the Overview shows
// Your move so far. Its firstWeek/start lives here in memory, with the calls each bring-over window makes recorded in
// `window.__adminFixture.calls`; the shop's server (oldShopApi's actions) is answered by the check's own page.route.
if (new URLSearchParams(location.search).get("move")) {
  const at = "2026-11-01T10:00:00.000Z";
  const week: any = { plan: "both", sellingToday: "online", publishes: "books", details: { at }, bring: { at, from: "online" },
    welcome: { at, themeId: "riso" }, google: { at, skipped: true }, payments: { at, skipped: true }, shipping: { at, skipped: true }, finalCheck: { at } };
  const calls: any[] = [];
  (window as any).__adminFixture.calls = calls;
  (window as any).__adminFixture.firstWeek = week;
  const record = (name: string, answer: (...a: any[]) => any) => async (...a: any[]) => { calls.push([name, ...a]); return answer(...a); };
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = record("updateFirstWeek", (change: any) => {
    const { done, ...rest } = change;
    Object.assign(week, rest);
    if (done) week.done = { ...week.done, ...done };
  });
  api.untickFirstWeek = record("untickFirstWeek", (id: string) => { if (week.done) delete week.done[id]; });
  api.saveCustomerNote = record("saveCustomerNote", () => undefined);
  api.getMarketingConsent = async () => ({ subscribed: new Set<string>(), optedOutHashes: new Set<string>() });
  api.addImportedSubscriber = record("addImportedSubscriber", () => true);
  api.giftCardAdmin = record("giftCardAdmin", (_op: string, body: any) => ({ added: body?.cards?.length || 0, emailed: 0, emailFailed: 0, skipped: [] }));
  api.getPages = async () => [];
  // What came over, counted from the calls above (past orders live on the check's pretend server, so none here).
  api.movedCounts = async () => ({
    customers: new Set(calls.filter((c) => c[0] === "saveCustomerNote").map((c) => c[1])).size,
    giftCards: calls.filter((c) => c[0] === "giftCardAdmin").reduce((n, c) => n + (c[2]?.cards?.length || 0), 0),
    orders: null,
  });
  // One order brought over from the old shop, sold in US dollars (plans 23.33, 23.34): its page says which file it came
  // from and shows its rate.
  ORDERS.push({
    ...order(4, "delivered", "Dee Example"), id: "past-1004", orderId: "PAST-1004", source: "import", oldOrderNumber: "#1004",
    paymentMethod: "Old shop", fulfillmentStatus: "delivered", importBatch: "run-fixture-1", importedFile: "old-shop-orders.csv",
    paidIn: { currency: "USD", total: 14.6, rate: 1.3712 }, total: 20.02, subtotal: 20.02, shippingAddress: undefined,
  } as any);
  api.getOrderById = async (id: string) => ORDERS.find((o) => o.id === id || o.orderId === id) ?? null;
  // oldShopApi asks the server with the signed-in person's token; the fixture's pretend owner has one (development only).
  (globalThis as any).__fixtureIdToken = "fixture-token";
}

// ?guide=1 (Set up your shop screenshots): a private shop that finished Get started, with books and a logo, so Home
// shows the setup guide part way through.
if (new URLSearchParams(location.search).get("guide")) {
  const at = "2026-11-01T10:00:00.000Z";
  const week: any = { plan: "both", sellingToday: "starting", publishes: "books", details: { at }, bring: { at, skipped: true },
    welcome: { at, theme: "riso" }, google: { at, skipped: true }, payments: { at, skipped: true }, shipping: { at, skipped: true }, finalCheck: { at } };
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = async (change: any) => { const { done, ...rest } = change; Object.assign(week, rest); if (done) week.done = { ...week.done, ...done }; };
  api.getSettings = async () => ({ design: { showUnderConstruction: true, logoUrl: "https://photos.example/logo.png" } });
}

// ?start=details|bring|look|shipping|final (Get started screenshots): a new private shop part way through the run.
const startAt = new URLSearchParams(location.search).get("start");
if (startAt) {
  const at = "2026-11-01T10:00:00.000Z";
  const order = ["details", "bring", "look", "shipping", "final"];
  const upTo = Math.max(0, order.indexOf(startAt));
  const marks: Record<string, any> = { details: { at }, bring: { at, skipped: true }, look: { at, theme: "riso" }, shipping: { at, skipped: true } };
  const week: any = { plan: "both", sellingToday: "starting", publishes: "books" };
  order.slice(0, upTo).forEach((step) => { week[step === "look" ? "welcome" : step] = marks[step]; });
  const api = adminApi as any;
  api.getFirstWeek = async () => JSON.parse(JSON.stringify(week));
  api.updateFirstWeek = async (change: any) => { Object.assign(week, change); };
  api.getShippingProfiles = async () => [];
  api.getSettings = async () => ({ info: { name: "Moth Press", email: "hello@mothpress.example" }, design: { showUnderConstruction: true },
    location: { street: "12 Queen Street", city: "Toronto", state: "ON", zip: "M5H 2N2", country: "Canada" } });
}

// ?shipping=1 (Settings › Shipping screenshots): two profiles with zones and rates, saved only in this page.
if (new URLSearchParams(location.search).get("shipping")) {
  const api = adminApi as any;
  let profiles: any[] = [
    { id: "general-profile", name: "General", freeShippingOver: 75, handlingFee: 1, defaultItemWeightG: 350, zones: [
      { id: "z-ca", name: "Canada", countries: ["CA"], rates: [
        { id: "r-std", name: "Standard", type: "flat", base: 8, additional: 3, deliveryDays: "3-7" },
        { id: "r-exp", name: "Express", type: "flat", base: 18, additional: 4, deliveryDays: "1-3", minPrice: 20 },
        { id: "r-pick", name: "Pick up in Toronto", type: "pickup", base: 0, additional: 0 }] },
      { id: "z-us", name: "United States", countries: ["US"], rates: [{ id: "r-us", name: "Tracked", type: "flat", base: 14, additional: 4, deliveryDays: "5-10" }] },
      { id: "z-row", name: "Rest of world", countries: [], restOfWorld: true, rates: [] }] },
    { id: "heavy", name: "Heavy books", zones: [] },
  ];
  api.getShippingProfiles = async () => JSON.parse(JSON.stringify(profiles));
  api.updateShippingProfile = async (id: string, p: any) => { profiles = profiles.map((x) => (x.id === id ? p : x)); };
}

// ?gstate=coming|ready|connected|trouble (Settings › Google screenshots): a pretend Google link, nothing reaches Google.
// coming: not switched on yet · ready: switched on, not connected · connected: all working · trouble: needs a look.
const gstate = new URLSearchParams(location.search).get("gstate");
if (gstate) {
  const offered = ["businessProfile", "drive", "youtube", "calendar", "ads"];
  const done = (step: string, detail: string) => ({ step, state: "done", detail, at: "2026-11-03T15:00:00Z" });
  const steps = [
    done("firebase", "Your shop is ready for Google."),
    done("analytics", "Visits are counted for visitors who agree."),
    done("searchConsole", "Google knows about your shop and 24 books."),
    done("merchantCenter", "24 books sent to Google Shopping today."),
    done("email", "Emails go out from hello@yourpress.example."),
    gstate === "trouble" ? { step: "domain", state: "waiting", detail: "Waiting for yourpress.example to open your shop." } : done("domain", "yourpress.example is counted with your shop."),
    done("businessProfile", "Your hours and link are on Google Maps."),
    gstate === "trouble" ? { step: "drive", state: "failed", detail: "Google didn't allow the Drive folder. Try again, or switch it off." } : done("drive", "Last copy saved last night."),
  ];
  const answer: any = gstate === "coming" ? { enabled: false } : {
    enabled: true, extrasOffered: offered,
    ...(gstate === "ready" ? { connected: false } : { connected: true, accountEmail: "owner@example.com", connectedAt: "2026-11-03T15:00:00Z", extrasChosen: ["businessProfile", "drive"], steps }),
  };
  const calls: any[] = ((window as any).__adminFixture.googleCalls = []);
  const status = readGoogleStatus(answer);
  googleConnectApi.status = async () => status;
  googleConnectApi.connectLink = async (extras: any) => { calls.push(["connectLink", extras]); return "#settings/google"; };
  googleConnectApi.tryAgain = async (part: string) => { calls.push(["tryAgain", part]); return status; };
  googleConnectApi.disconnect = async () => { calls.push(["disconnect"]); return status; };
  googleConnectApi.turnOff = async (extras: any) => { calls.push(["turnOff", extras]); return status; };
  googleConnectApi.shoppingProblems = async () => ({ available: true, problems: gstate === "trouble" ? [{ offerId: "b3", title: "Night Songs", issues: [{ severity: "DISAPPROVED", description: "The photo has a border.", resolution: "Upload a photo without one." }] }] : [] });
  googleConnectApi.sendStockSheet = async () => ({ available: true, url: "https://docs.google.com/spreadsheets/d/example/edit", rows: 24 });
  // A pasted Google Sheet link (plan 23.42): two tabs of books; under ?gstate=trouble reading isn't allowed yet.
  googleConnectApi.readSheet = async (args: any) => {
    calls.push(["readSheet", args]);
    if (gstate === "trouble") return { available: false };
    return {
      available: true, title: "Spring list", sheet: args.sheet ?? "Books", sheets: ["Books", "Zines"],
      rows: args.sheet === "Zines"
        ? [["Title", "Price", "Stock"], ["Moth Zine", "6.00", "40"]]
        : [["Title", "Writer", "Cost to buyer", "Stock"], ["Spring Light", "R. Field", "22.00", "12"], ["Low Tide", "M. Shore", "18.50", "5"]],
    };
  };
}

// ── Stockroom › Sheets (?page=stockroom/sheets&gstate=connected): a sheet sent eight hours ago, so opening the page sends it
// again (in memory); the switch is kept in memory too. Without gstate the page shows its "Connect Google" state. ──
if (/page=stockroom(\/|%2F)sheets/.test(window.location.search)) {
  let copy = true;
  sheetsStore.load = async () => copy;
  sheetsStore.save = async (on) => { copy = on; };
  const sentAt = new Date(Date.now() - 8 * 36e5).toISOString();
  const status = googleConnectApi.status;
  googleConnectApi.status = async () => {
    const s = await status();
    return s === "not_available" || !s.connected ? s : { ...s, sheet: { url: "https://docs.google.com/spreadsheets/d/example/edit", writtenAt: sentAt, rows: 2, sales: 14, expenses: 3 } };
  };
  googleConnectApi.sendStockSheet = async (tabs = {}) => ({ available: true, url: "https://docs.google.com/spreadsheets/d/example/edit", writtenAt: new Date().toISOString(), rows: 2, sales: tabs.sales?.length ?? 0, expenses: tabs.expenses?.length ?? 0 });
}


// ── Stockroom › Backups (?page=stockroom/backups): last night's backup worked, five daily copies (Download gives an
// empty page), and Back up now finishes in a second. ──
if (/page=stockroom(\/|%2F)backups/.test(window.location.search)) {
  const night = (d: number) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(3, 17, 0, 0); return t; };
  let last = night(0).toISOString();
  nightlyBackupApi.status = async () => ({ ok: true, lastAttemptAt: last, lastSuccessAt: last, export: { ok: true }, copy: { ok: true, documents: 1840 } });
  nightlyBackupApi.list = async () => ({ backups: [0, 1, 2, 3, 4].map((d) => ({ day: night(d).toISOString().slice(0, 10), createdAt: night(d).toISOString(), documents: 1840 - d * 12, complete: true, downloadable: true, hasExport: true })) });
  nightlyBackupApi.backupNow = async () => { await new Promise((r) => setTimeout(r, 1000)); last = new Date().toISOString(); return { ok: true }; };
  nightlyBackupApi.downloadLink = async () => ({ url: "about:blank" });
  // The stockroom's own copies, in memory: three daily ones from two sample items.
  const whole = { catalog: { salt: { title: "Salt Almanac" }, moth: { title: "Moth Songs" } } as Record<string, unknown>, states: { salt: { stock: 4 }, moth: { stock: 2 } } as Record<string, any>, settings: {} };
  const copies: Record<string, string> = {};
  let list: any[] = [0, 1, 2].map((d) => { const t = night(d).getTime() + 6 * 36e5; copies[`sb-${t}`] = JSON.stringify(snapshotOf(whole, t)); return { id: `sb-${t}`, type: "auto", createdAt: t, bookCount: 2 }; });
  copiesIO.list = async () => readManifest(list);
  copiesIO.whole = async () => whole;
  copiesIO.writeCopy = async (id, text) => { copies[id] = text; };
  copiesIO.readCopy = async (id) => (copies[id] ? JSON.parse(copies[id]) : null);
  copiesIO.deleteCopy = async (id) => { delete copies[id]; };
  copiesIO.saveList = async (change) => { list = change(readManifest(list)); };
  copiesIO.saveSetting = async (key, change) => { if (key === "catalog") whole.catalog = change(whole.catalog) as Record<string, unknown>; return { status: "saved", value: null, merged: false, conflicts: [] }; };
  copiesIO.saveBook = async (id, state) => { whole.states[id] = state; return { status: "saved", state: state as any, merged: false, conflicts: [], written: ["stock"] }; };
}

// Settings › Apps: a pretend app store, two installed apps and their activity (?apps=none for the empty page).
{
  const perms = (list: Array<[string, string, boolean?]>) => list.map(([scope, words, personal]) => ({ scope, words, personal: !!personal }));
  const store = [
    { appId: "app_0000000000a1", name: "Parcel Pal", tagline: "Cheaper Canada Post labels, printed from your orders.", description: "Buy labels at business rates, print them in one go, and tracking goes on each order by itself.", category: "orders-shipping", categoryName: "Orders and shipping", supportEmail: "help@parcelpal.example", website: "https://parcelpal.example", installAddress: "https://parcelpal.example/start",
      permissions: perms([["read_shop", "See your shop's name, address and currency"], ["write_orders", "Add tracking and mark orders as sent", true]]) },
    { appId: "app_0000000000b2", name: "Mailchimp", tagline: "Your customers and orders in Mailchimp, for newsletters.", description: "", category: "marketing", brand: "mailchimp", categoryName: "Marketing and email", supportEmail: "apps@yourpress.example", website: "https://mailchimp.com", installAddress: "https://yourpress.example/account/mailchimp.html",
      permissions: perms([["read_products", "See your products, prices and photos"], ["read_customers", "See your customers' names, emails and addresses", true]]) },
    { appId: "app_0000000000c3", name: "Zap Shelf", tagline: "Connect your shop to 6,000 other apps.", description: "", category: "other", categoryName: "Something else", supportEmail: "help@zapshelf.example", website: "https://zapshelf.example", installAddress: "",
      permissions: perms([["read_orders", "See your orders, what was in them and where they ship to", true], ["write_inventory", "Change how many of each product you have"]]) },
    { appId: "app_0000000000d4", name: "Ledger Line", tagline: "Your sales in your accounting app each night.", description: "", category: "accounting", categoryName: "Accounting and taxes", supportEmail: "help@ledgerline.example", website: "https://ledgerline.example", installAddress: "https://ledgerline.example/go",
      permissions: perms([["read_orders", "See your orders, what was in them and where they ship to", true]]) },
  ];
  const none = new URLSearchParams(location.search).get("apps") === "none";
  let installed = none ? [] : [{ ...store[0], installedAt: "2026-11-02T10:00:00Z", installedBy: "owner@example.com" }, { ...store[1], installedAt: "2026-11-03T10:00:00Z", installedBy: "owner@example.com", testing: true }];
  const categories = [["orders-shipping", "Orders and shipping"], ["marketing", "Marketing and email"], ["accounting", "Accounting and taxes"], ["other", "Something else"]].map(([id, name]) => ({ id, name }));
  appsApi.installed = async () => installed as any;
  appsApi.store = async () => ({ apps: store, categories });
  appsApi.remove = async (appId: string) => { installed = installed.filter((a) => a.appId !== appId); };
  appsApi.activity = async () => none ? [] : [
    { id: "r3", app: "Parcel Pal", what: "Marked order 1042 sent (Canada Post 7023 1100 4410)", when: "2026-11-04T16:10:00Z", state: "done", reason: "" },
    { id: "r2", app: "Parcel Pal", what: "Marked order 1039 sent (Canada Post 7023 1100 4388)", when: "2026-11-04T15:02:00Z", state: "refused", reason: "Order on hold: waiting on the author's signature." },
    { id: "r1", app: "Mailchimp", what: "Took away 2 of moth-songs", when: "2026-11-04T11:40:00Z", state: "done", reason: "" },
  ];
}

// ── Product variants (variants worker, 11 November 2026): ?variants=1 is a clothing shop with a tee sold in sizes and
// colours, each combination with its own price, SKU and stock (one sold out, one low). Open the editor with
// &page=catalog/book/tee, or Inventory with &page=inventory.
if (new URLSearchParams(location.search).get("variants")) {
  const sizes = ["S", "M", "L"];
  const colours = ["Black", "Natural"];
  const stockOf: Record<string, number> = { "S/Black": 6, "S/Natural": 0, "M/Black": 12, "M/Natural": 3, "L/Black": 8, "L/Natural": 5 };
  const tee: any = {
    id: "tee", slug: "studio-tee", title: "Studio Tee", kind: "clothing", authorName: "Ada Example", retailPrice: 32, status: "published",
    trackInventory: true, sku: "TEE", categories: ["Clothing"], photos: (A11Y_BOOKS[0] as any).photos, description: "<p>Heavy cotton.</p>",
    options: [{ name: "Size", values: sizes }, { name: "Colour", values: colours }],
    variants: sizes.flatMap((size) => colours.map((colour) => {
      const stock = stockOf[`${size}/${colour}`];
      return { id: `tee-${size}-${colour}`.toLowerCase(), name: `${size} / ${colour}`, options: { Size: size, Colour: colour },
        price: size === "L" ? 34 : 32, sku: `TEE-${size}-${colour.slice(0, 3).toUpperCase()}`, stock, stockLevel: stock, weight: "220 g" };
    })),
  };
  tee.stockLevel = tee.variants.reduce((n: number, v: any) => n + v.stockLevel, 0);
  const products = [tee, ...A11Y_BOOKS.map((b: any) => ({ ...b, kind: "other" }))];
  const api = adminApi as any;
  api.getFirstWeek = async () => ({ publishes: "clothing", welcome: { at: "2026-11-01T10:00:00.000Z", theme: "riso" } });
  api.getBooks = async () => products;
  api.getAllBooks = async () => products;
  api.getBook = async (id: string) => products.find((b) => b.id === id) ?? null;
}

// ── Stock › Reorder list sample (reorder worker): one title selling fast with copies left (`?page=reorder`).
{
  const base = stockroomApi.load;
  stockroomApi.load = async () => {
    const r = await base();
    if (!r.books.length) return r;
    const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    r.books = [...r.books, { id: "ink-maps", title: "Ink Maps", author: "Dee Example", maxPrint: 120, threshold: 8, listPrice: 24, currency: "CAD" }];
    r.states["ink-maps"] = { hist: [{ num: "R-1", chan: "Website", qty: 60, price: 24, date: ago(40) }, ...[2, 6, 11, 15, 22].map((n, i) => ({ num: `R-${i + 2}`, chan: "Book Fair", qty: 6, price: 24, date: ago(n) }))] };
    return r;
  };
}
// ── end Reorder list sample

// Design (redesign): a live look, a draft with two changes waiting, and two pages (`?page=design`).
if (new URLSearchParams(location.search).get("page") === "design") {
  const live = { themeBase: { id: "atlas", name: "Atlas" }, primaryColor: "#1f1e1b" };
  const api = adminApi as any;
  api.getSettings = async () => ({ design: live, designPublishedAt: "2026-11-06T15:00:00.000Z" });
  api.getPages = async () => [
    { id: "p1", title: "About", slug: "about", status: "published", order: 1 },
    { id: "p2", title: "Events", slug: "events", status: "draft", order: 2 },
  ];
  const { setThemeBackend } = await import("../app/admin/themeStore");
  const draft = { ...live, primaryColor: "#2a4d8f", copy: { cartTitle: "Your bag" } };
  setThemeBackend({
    open: async () => ({ draft, rev: 1, savedThemes: [] }),
    write: async (rev: number) => rev + 1, saveThemes: async () => {}, fieldUpdate: async () => {}, readField: async () => undefined,
    watch: () => () => {},
  } as any);
}

let helperShown = false;
// Fair helpers: the owner's admin keeps the menu and the inbox in memory (nothing reaches Firestore). `?helper=1` shows
// the Fair till a helper sees instead of the admin, with three items and one sale rung up earlier today.
{
  const { fairStore } = await import("../app/admin/stockroom/fairStore");
  let menu: any = { at: new Date().toISOString(), books: [
    { id: "salt-hours", title: "Salt Hours", price: 20, cur: "CAD", onHand: 14 },
    { id: "night-songs", title: "Night Songs", price: 18, cur: "CAD", onHand: 3 },
    { id: "ink-maps", title: "Ink Maps", price: 24, cur: "CAD", onHand: null },
  ] };
  const today = new Date().toLocaleDateString("en-CA");
  let mine: any[] = [{ id: "fs-early-0000000001", by: "sam@example.com", day: today, fair: "Harbour Fair", method: "Cash", imported: { at: "x" },
    lines: [{ bookId: "salt-hours", title: "Salt Hours", qty: 2, price: 20, cur: "CAD" }] }];
  const watchers = new Set<(s: any[]) => void>();
  const tell = () => { for (const w of watchers) w(mine); };
  fairStore.watchSales = (cb) => { cb([]); return () => {}; };
  fairStore.writeMenu = async (m) => { menu = m; };
  fairStore.watchMenu = (cb) => { cb(menu); return () => {}; };
  fairStore.watchMine = (_email, cb) => { watchers.add(cb); cb(mine); return () => { watchers.delete(cb); }; };
  fairStore.addSale = async (id, sale) => { mine = [...mine, { ...sale, id }]; tell(); };
  fairStore.cancelSale = async (id) => { mine = mine.map((x) => (x.id === id ? { ...x, cancelled: true } : x)); tell(); };
  if (new URLSearchParams(location.search).get("helper") === "1") {
    localStorage.setItem("colophon-helper-fair", JSON.stringify({ name: "Harbour Fair", day: today }));
    const { createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { FairHelperDesk } = await import("../app/admin/FairHelperDesk");
    await import("../styles/index.css");
    createRoot(document.getElementById("root")!).render(createElement(FairHelperDesk, { email: "sam@example.com", appearance: "light" }));
    helperShown = true;
  }
}

if (!helperShown) {
  const page = new URLSearchParams(location.search).get("page") || "";
  history.replaceState(null, "", `/admin?debug=true${page ? `#${page}` : ""}`);
  await import("../main");
}
