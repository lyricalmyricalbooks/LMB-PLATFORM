// The test shops' sample records (docs/test-shop.md › Sample records): enough history that every admin page has
// something to show, on top of the starter catalogue (setup/test-catalogue.js). Setup step 12 adds what is missing; the
// control room's Reset sample data puts all of it back (dates move with the day, so it always looks recent).
//
// In the shop's own database:
// - eight past orders over the last two months, brought over as history only (`source: "import"`: the order hooks,
//   the stockroom link and the review sweep leave them alone, so they move no stock and send no email);
// - a discount code, and two approved reviews.
// In the stockroom (only the second and third stocked items: the release check buys the first, so its count stays 5):
// - the second item: two sold at a fair, two sent to a stockist, one of those sold and on an invoice due in 20 days;
// - the third item: one sold at a fair and one given away as a review copy;
// - the press's invoice details;
// - in a book shop only, a 50% author royalty on both items (royalties are a book-shop feature: docs/test-shop.md).
//
// The stockist has no email address, so no reminder can ever be sent from the sample invoice. Every name says "Test"
// and every address is made up (example.com).
import { stockedIds } from "./test-catalogue.js";

const DAY = 86_400_000;

/** The sample stockist, the fair and the invoice number every sample record uses. */
export const SAMPLE_STOCKIST = "Test Corner Shop";
export const SAMPLE_FAIR = "Test Spring Fair";
export const SAMPLE_INVOICE = "INV-TEST-001";
/** The discount code both test shops get. */
export const SAMPLE_CODE = "TESTSHOP10";

// The stocked items' prices, as the starter catalogue sets them (test-catalogue.js PRINTED and GOODS).
const PRICES = Object.freeze({
  "test-book-one": 20, "test-book-two": 25, "test-book-three": 30,
  "test-tote-bag": 24, "test-art-print": 30, "test-mug": 18,
});
const TITLES = Object.freeze({
  "test-book-one": "Test Book One", "test-book-two": "Test Book Two", "test-book-three": "Test Book Three",
  "test-tote-bag": "Test Tote Bag", "test-art-print": "Test Art Print", "test-mug": "Test Mug",
});
// What each kind of shop sells besides the stocked items (still in its starter catalogue).
const EXTRAS = Object.freeze({
  books: [{ id: "test-e-book", title: "Test E-book", price: 10, format: "E-book" }, { id: "test-t-shirt", title: "Test T-shirt", price: 28, format: "M / Black" }],
  general: [{ id: "test-pattern-download", title: "Test Pattern Download", price: 8, format: "Download" }, { id: "test-goods-t-shirt", title: "Test Logo T-shirt", price: 26, format: "M / Black" }],
});

const round = (n) => Math.round(n * 100) / 100;
const dayOf = (now, ago) => new Date(now.getTime() - ago * DAY).toISOString().slice(0, 10);
const isoOf = (now, ago) => new Date(now.getTime() - ago * DAY).toISOString();

/** The eight made-up buyers: who, when (days ago) and which lines (index into the shop's line list, copies). */
const BUYERS = Object.freeze([
  { name: "Test Buyer Ada", ago: 58, lines: [[0, 1]] },
  { name: "Test Buyer Ben", ago: 51, lines: [[1, 1], [3, 1]] },
  { name: "Test Buyer Cleo", ago: 44, lines: [[2, 2]] },
  { name: "Test Buyer Dev", ago: 33, lines: [[0, 1], [4, 1]] },
  { name: "Test Buyer Eli", ago: 25, lines: [[1, 1]] },
  { name: "Test Buyer Fay", ago: 16, lines: [[3, 1], [2, 1]] },
  { name: "Test Buyer Gus", ago: 9, lines: [[4, 2]] },
  // Bought again: a returning customer.
  { name: "Test Buyer Ada", ago: 3, lines: [[1, 1], [0, 1]] },
]);

/** A past order as orderImport.js saves one (history only), with the shop's own product ids on its lines. */
function pastOrder(kind, buyer, n, now) {
  const catalogue = [...stockedIds(kind).map((id) => ({ id, title: TITLES[id], price: PRICES[id], format: kind === "books" ? "Paperback" : null })), ...EXTRAS[kind]];
  const items = buyer.lines.map(([index, quantity]) => {
    const { id, title, price, format } = catalogue[index];
    return { id, title, quantity, price, ...(format ? { format } : {}) };
  });
  const subtotal = round(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const physical = items.some((item) => !["E-book", "Download"].includes(item.format));
  const shipping = physical ? 5 : 0;
  const tax = round((subtotal + shipping) * 0.13);
  const when = isoOf(now, buyer.ago);
  const orderId = `PAST-test-${String(n).padStart(2, "0")}`;
  const first = buyer.name.split(" ").at(-1).toLowerCase();
  return {
    path: `orders/${orderId}`,
    data: {
      orderId, source: "import", importedFrom: `test-sample-${n}`, importBatch: "test-sample", importedFile: "Sample orders",
      createdAt: when, paidAt: when, updatedAt: now.toISOString(),
      status: "delivered", paymentStatus: "paid", fulfillmentStatus: "delivered",
      paymentMethod: "Old shop", isTest: false,
      customer: { name: buyer.name, email: `${first}@example.com` },
      items, subtotal, discount: 0, shipping, tax, total: round(subtotal + shipping + tax),
      reviewRequestedAt: now.toISOString(),
      activity: [{ type: "imported", at: now.toISOString(), by: "setup", note: "Sample order on the platform's test shop" }],
    },
  };
}

/** The shop documents of a test shop's sample records: [{ path, data }]. */
export function testSampleDocs(kind = "books", now = new Date()) {
  const [first, second] = stockedIds(kind);
  return [
    ...BUYERS.map((buyer, i) => pastOrder(kind, buyer, i + 1, now)),
    {
      path: `discounts/${SAMPLE_CODE}`,
      data: {
        code: SAMPLE_CODE, type: "percentage", value: 10, isActive: true, method: "code", appliesTo: "all", usageCount: 0, usageLimit: null,
        onePerCustomer: false, startDate: null, expiryDate: null, minOrderAmount: null, minQuantity: null, maxDiscountAmount: null,
        description: "Sample code on the platform's test shop", createdAt: now.toISOString(), updatedAt: now.toISOString(),
      },
    },
    { path: "reviews/test-review-1", data: { bookId: first, authorName: "Test Buyer Ada", rating: 5, title: "Just as pictured", body: "A made-up review on the platform's test shop.", status: "approved", createdAt: isoOf(now, 50) } },
    { path: "reviews/test-review-2", data: { bookId: second, authorName: "Test Buyer Ben", rating: 4, title: "Well packed", body: "Another made-up review on the platform's test shop.", status: "approved", createdAt: isoOf(now, 40) } },
  ];
}

/**
 * The stockroom side of a test shop's sample records: each item's records by id (as the stockroom keeps a book's state,
 * apps/stockroom/src/lib/merge-state.js), the catalogue fields to add to those items, and the invoice details.
 */
export function testSampleStockroom(kind = "books", now = new Date(), pressName = kind === "books" ? "Test Press" : "Test Goods", currency = "CAD") {
  const [, second, third] = stockedIds(kind);
  const p2 = PRICES[second];
  const p3 = PRICES[third];
  const owed = round(p2 * 0.6); // the stockist keeps 40%
  const states = {
    [second]: {
      hist: [
        { id: 1, date: dayOf(now, 40), qty: 2, price: p2, chan: "Fair", notes: SAMPLE_FAIR },
        { id: 2, date: dayOf(now, 12), qty: 1, price: owed, chan: "Consignment", consignmentLink: true, notes: SAMPLE_STOCKIST, sheetsId: "test-sale-1" },
      ],
      ledger: [
        { id: 1, type: "Shipment", storeId: 1, storeName: SAMPLE_STOCKIST, date: dayOf(now, 30), qty: 2, amountDue: 0, status: "OK", sheetsId: "test-ship-1" },
        { id: 2, type: "Sale", storeId: 1, storeName: SAMPLE_STOCKIST, date: dayOf(now, 12), qty: 1, rate: 40, amountDue: owed, status: "pending", sheetsId: "test-sale-1", invoiceId: "test-inv-1", invoiceNum: SAMPLE_INVOICE },
      ],
      stores: [{ id: 1, name: SAMPLE_STOCKIST, city: "Toronto", sent: 2, sold: 1, returned: 0, outstanding: 1, amountOwed: owed, rate: 40 }],
      invoices: [{
        id: "test-inv-1", num: SAMPLE_INVOICE, status: "sent", date: dayOf(now, 10), dueDate: dayOf(now, -20), total: owed, currency: currency === "USD" ? "US$" : "CA$",
        storeName: SAMPLE_STOCKIST, storeId: 1, items: [{ _ledgerId: 2, qty: 1, unitPrice: owed }],
      }],
      invoiceSeq: 1,
    },
    [third]: {
      hist: [
        { id: 1, date: dayOf(now, 20), qty: 1, price: p3, chan: "Fair", notes: SAMPLE_FAIR },
        { id: 2, date: dayOf(now, 5), qty: 1, price: 0, chan: "Gift", gratuity: true, notes: "Review copy" },
      ],
    },
  };
  const royalty = kind === "books" ? { profitTiers: [{ revenueUpTo: null, artistPct: 50 }] } : {};
  return {
    states,
    catalog: { [second]: royalty, [third]: royalty },
    invoiceSettings: { name: pressName, addr: "1 Example St\nToronto ON", terms: "Payment due within 30 days." },
  };
}

// The stockroom's list parts (apps/stockroom/src/lib/merge-state.js LIST_PARTS); everything else is `metadata`.
const LIST_PARTS = ["hist", "ledger", "expenses", "stores", "artistTransfers", "artistPayouts", "artistReceivables", "doneIds"];

/** A book's state as the stockroom stores it: one document per part, `{ data: <JSON>, ts }`. */
export function stockroomParts(state, ts) {
  const rest = { ...state };
  const parts = {};
  for (const key of LIST_PARTS) {
    parts[key] = Array.isArray(rest[key]) ? rest[key] : [];
    delete rest[key];
  }
  parts.metadata = rest;
  return Object.fromEntries(Object.entries(parts).map(([name, value]) => [name, { data: JSON.stringify(value), ts }]));
}

const parse = (text) => {
  try {
    const value = typeof text === "string" ? JSON.parse(text) : null;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

/**
 * Writes a test shop's sample records. `shop` and `stockroom` are `{ get(shopId, path), set(shopId, path, data) }` for
 * the shop's database and the stockroom's (stockroom may be null: the shop's part is still written). With `replace`
 * every record is written again (the control room's reset); without it only what is missing (setup step 12), so a
 * record changed while trying the shop stays. The stockroom's items must already be in its catalogue (step 12 adds
 * them first). Returns the paths written.
 */
export async function writeTestSamples({ shop, stockroom = null }, shopId, kind, { replace = false, now = new Date(), pressName, currency = "CAD" } = {}) {
  const written = [];
  for (const { path, data } of testSampleDocs(kind, now)) {
    if (!replace && (await shop.get(shopId, path))) continue;
    await shop.set(shopId, path, data);
    written.push(path);
  }
  if (!stockroom) return written;

  const sample = testSampleStockroom(kind, now, pressName, currency);
  const ts = now.getTime();
  const catalogDoc = await stockroom.get(shopId, "settings/catalog");
  const catalog = parse(catalogDoc?.data);
  let catalogChanged = false;
  for (const [id, state] of Object.entries(sample.states)) {
    // An item the catalogue doesn't have yet is left alone: the stockroom wouldn't show its records.
    if (!catalog[id]) continue;
    for (const [field, value] of Object.entries(sample.catalog[id] ?? {})) {
      if (replace || catalog[id][field] === undefined) {
        catalog[id] = { ...catalog[id], [field]: value };
        catalogChanged = true;
      }
    }
    if (!replace && (await stockroom.get(shopId, `books/${id}/data/hist`))) continue;
    for (const [part, doc] of Object.entries(stockroomParts(state, ts))) {
      const path = `books/${id}/data/${part}`;
      await stockroom.set(shopId, path, doc);
      written.push(path);
    }
  }
  if (catalogChanged) {
    await stockroom.set(shopId, "settings/catalog", { data: JSON.stringify(catalog), ts });
    written.push("settings/catalog");
  }
  if (replace || !(await stockroom.get(shopId, "settings/invoiceSettings"))) {
    await stockroom.set(shopId, "settings/invoiceSettings", { data: JSON.stringify(sample.invoiceSettings), ts });
    written.push("settings/invoiceSettings");
  }
  return written;
}
