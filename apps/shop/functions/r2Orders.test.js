// Round 2, PR 8: orders, fulfilment and Shippo. One harness runs the real functions/index.js against an
// in-memory Firestore and a scripted Shippo, so each test pins a behaviour the owner would notice.
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const { addressKey, packingKey, advancesTracking, shippoDefiniteRefusal } = require("./fulfillmentGuard.js");
const { customsItems, needsCustoms, validHsCode } = require("./customs.js");
const { labelRatesFor, isPurchasableRate } = require("./labelRates.js");
const { addressMissing } = require("./shared/addressRules.js");

const ADMIN = { email: "lyricalmyricalbooks@gmail.com", email_verified: true };
const DELETE = { __delete: true };

const ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const refuse = (status, text = "refused") => ({ ok: false, status, json: async () => ({ detail: text }), text: async () => text });

const baseOrder = (extra = {}) => ({
  orderId: "AB-1", paymentStatus: "paid", status: "processing", fulfillmentStatus: "processing", subtotal: 20, discount: 0, shipping: 12, shippingMethod: "Canada Post Expedited Parcel",
  customer: { name: "Reader", email: "reader@example.com", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "CA" } },
  items: [{ id: "b", title: "Book", quantity: 1, price: 20, format: "Paperback" }], ...extra,
});

function harness({ order = baseOrder(), ops = {}, books, secret = "shippo_live_token", fetchImpl, failTransaction = 0, extraDocs = {}, patch = "", identity = ADMIN } = {}) {
  const docs = { orders: { A: order }, "order-operations": { A: { addressReviewed: addressKey(order), packed: packingKey(order), ...ops } }, settings: { website: {}, notifications: {} },
    books: books || { b: { title: "Book", weight: "450 g" } }, ...extraDocs };
  const merge = (target, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete target[k];
      else if (v && v.__arrayUnion) target[k] = [...(target[k] || []), ...v.__arrayUnion];
      else target[k] = v;
    }
  };
  const ref = (name, id) => ({
    id, path: `${name}/${id}`,
    async get() { const value = docs[name]?.[id]; return { id, exists: !!value, data: () => value, ref: ref(name, id) }; },
    async set(data, opts) { docs[name] = docs[name] || {}; if (opts?.merge && docs[name][id]) merge(docs[name][id], data); else { docs[name][id] = {}; merge(docs[name][id], data); } },
    async update(data) { merge(docs[name][id], data); },
  });
  let transactions = 0;
  const db = {
    collection: name => ({
      doc: id => ref(name, id), add: async () => {},
      where: (field, op, value) => ({ limit: () => ({ get: async () => {
        const hit = Object.entries(docs[name] || {}).filter(([, d]) => d[field] === value).map(([id, d]) => ({ id, ref: ref(name, id), data: () => d }));
        return { empty: !hit.length, docs: hit };
      } }) }),
    }),
    async runTransaction(fn) {
      transactions += 1;
      if (failTransaction && transactions === failTransaction) throw new Error("Firestore unavailable");
      return fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d) });
    },
  };
  const FieldValue = { arrayUnion: (...items) => ({ __arrayUnion: items }), increment: n => n, serverTimestamp: () => "now", delete: () => DELETE };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue }), auth: () => ({ verifyIdToken: async () => identity }), appCheck: () => ({ verifyToken: async () => ({}) }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = name => name === "firebase-admin" ? admin
    : name === "stripe" ? class {}
    : name.startsWith("firebase-functions/v2/") ? new Proxy({}, { get: () => wrap })
    : name === "firebase-functions/params" ? { defineSecret: () => ({ value: () => secret }) }
    : require(name);
  const calls = [];
  const fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return fetchImpl(call);
  };
  const log = [];
  const module = { exports: {} };
  vm.runInNewContext(`${source}\n${patch}`, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "off" } }, Buffer, console, URL, setTimeout, clearTimeout, AbortController, fetch, __log: log }, { filename: "index.js" });
  const res = () => ({ code: 200, body: null, set() {}, status(code) { this.code = code; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } });
  const call = async (name, body, headers = { authorization: "Bearer t" }) => {
    const r = res();
    await module.exports[name]({ method: "POST", headers, body }, r);
    return r;
  };
  const label = body => call("createShippingLabel", { orderId: "A", ...body });
  return { call, label, docs, calls, log, exports: module.exports, ops: () => docs["order-operations"].A, order: () => docs.orders.A };
}

const quotedFor = order => ({ quotedShipmentId: "sh_1", quotedAddress: JSON.stringify(order.customer.address) });
const shipmentRates = [{ object_id: "r1", provider: "Canada Post", amount: "12.00", servicelevel: { name: "Expedited Parcel", token: "canada_post_expedited_parcel" } }];

// Fault 48 -----------------------------------------------------------------------------------------------
test("fault 48: a Shippo HTTP 4xx refusal releases the purchase lock (nothing was bought)", async () => {
  const order = baseOrder();
  const app = harness({ order, ops: quotedFor(order), fetchImpl: c => c.url.includes("shipments/sh_1") ? ok({ rates: shipmentRates }) : refuse(400, "rate expired") });
  const res = await app.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(500);
  expect(res.body.error).toMatch(/Nothing was bought/);
  expect(res.body.error).toContain("rate expired");
  expect(app.ops().labelPurchasePending).toBe(false);
  expect(app.ops().activity.at(-1).message).toMatch(/Shippo refused the label purchase \(HTTP 400\)/);
});

test("fault 48: a Shippo 5xx or a lost connection still keeps the lock", async () => {
  const order = baseOrder();
  const down = harness({ order, ops: quotedFor(order), fetchImpl: c => c.url.includes("shipments/sh_1") ? ok({ rates: shipmentRates }) : refuse(503, "unavailable") });
  await down.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(down.ops().labelPurchasePending).toBe(true);
  expect(shippoDefiniteRefusal({ shippoStatus: 408 })).toBe(false);
  expect(shippoDefiniteRefusal({ shippoStatus: 429 })).toBe(true);
  expect(shippoDefiniteRefusal(new Error("socket hang up"))).toBe(false);
});

// Fault 133 ----------------------------------------------------------------------------------------------
const success = { object_id: "tx_99", status: "SUCCESS", tracking_number: "CP123", tracking_provider: "Canada Post", label_url: "https://label/1.pdf" };
const buyOk = c => c.url.includes("shipments/sh_1") ? ok({ rates: shipmentRates }) : ok(success);

test("fault 133: the Shippo transaction id is saved against the order and the purchase is tagged with the order", async () => {
  const order = baseOrder();
  const app = harness({ order, ops: quotedFor(order), fetchImpl: buyOk });
  const res = await app.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(200);
  expect(app.ops().shippoTransactionId).toBe("tx_99");
  expect(app.ops().labelPurchasePending).toBe(false);
  expect(app.order().labelUrl).toBe("https://label/1.pdf");
  expect(app.calls.find(c => c.url.includes("transactions/")).body.metadata).toBe("Order AB-1");
});

test("fault 133: if the order write fails after Shippo charged, the transaction id is already on file and the lock stays", async () => {
  const order = baseOrder();
  // Transaction 1 is the purchase claim, transaction 2 would record the label on the order.
  const app = harness({ order, ops: quotedFor(order), fetchImpl: buyOk, failTransaction: 2 });
  const res = await app.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(500);
  expect(app.ops().shippoTransactionId).toBe("tx_99");
  expect(app.ops().labelPurchasePending).toBe(true);
  expect(app.order().labelUrl).toBeUndefined();
});

test("fault 133: a successful purchase with no tracking number or label link does not crash the write", async () => {
  const order = baseOrder();
  const app = harness({ order, ops: quotedFor(order), fetchImpl: c => c.url.includes("shipments/sh_1") ? ok({ rates: shipmentRates }) : ok({ object_id: "tx_5", status: "SUCCESS" }) });
  const res = await app.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.body.error).toContain("tx_5");
  expect(app.ops().shippoTransactionId).toBe("tx_5");
  expect(app.ops().labelPurchasePending).toBe(true);
});

// Fault 135 ----------------------------------------------------------------------------------------------
test("fault 135: a Shippo key is checked with Shippo before it replaces the working one", async () => {
  const bad = harness({ fetchImpl: () => refuse(401, "Invalid token") });
  const res = await bad.call("saveShippoConfig", { apiToken: "shippo_live_" + "x".repeat(30) });
  expect(res.code).toBe(400);
  expect(res.body.error).toMatch(/did not accept this key/);
  expect(bad.docs["private-integrations"]).toBeUndefined();
});

test("fault 135: a key that is not shippo_live_ or shippo_test_ is refused without calling Shippo", async () => {
  const app = harness({ fetchImpl: () => ok({}) });
  const res = await app.call("saveShippoConfig", { apiToken: "x".repeat(40) });
  expect(res.code).toBe(400);
  expect(app.calls).toEqual([]);
});

test("fault 135: the saved key is shown as live or test", async () => {
  const app = harness({ fetchImpl: () => ok({ results: [] }) });
  const saved = await app.call("saveShippoConfig", { apiToken: "shippo_test_" + "y".repeat(30) });
  expect(saved.code).toBe(200);
  expect(saved.body.mode).toBe("test");
  expect(app.docs["private-integrations"].shippo.mode).toBe("test");
  const read = await app.call("getShippoConfig", {});
  expect(read.body.mode).toBe("test");
  expect(read.body.configured).toBe(true);
});

test("fault 135: a test key may rehearse a purchase; the label is stored as a TEST label", async () => {
  const order = baseOrder();
  const app = harness({ order, ops: quotedFor(order), secret: "shippo_test_abcdefghijklmnopqrstuvwxyz", fetchImpl: buyOk });
  const res = await app.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(200);
  expect(app.ops().labelTest).toBe(true);
  const live = baseOrder();
  const real = harness({ order: live, ops: quotedFor(live), fetchImpl: buyOk });
  await real.label({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(real.ops().labelTest).toBe(false);
});

// Fault 36 -----------------------------------------------------------------------------------------------
const labelled = (extra = {}) => baseOrder({ labelUrl: "https://label/old.pdf", trackingNumber: "OLD1", trackingCarrier: "Canada Post", ...extra });

test("fault 36: a wrong label is voided with Shippo and the order can buy a new one", async () => {
  const order = labelled();
  const app = harness({ order, ops: { shippoTransactionId: "tx_old" }, fetchImpl: c => c.url.includes("refunds/") ? ok({ object_id: "rf_1", status: "QUEUED" }) : ok({}) });
  const res = await app.label({ mode: "voidLabel" });
  expect(res.code).toBe(200);
  // The label is read first (never refunded twice), then the refund is asked for.
  expect(app.calls.find(c => c.url.includes("refunds/")).body).toMatchObject({ transaction: "tx_old" });
  expect(app.order().labelUrl).toBeUndefined();
  expect(app.order().trackingNumber).toBeUndefined();
  expect(app.ops().labelHistory[0]).toMatchObject({ trackingNumber: "OLD1", shippoTransactionId: "tx_old", refundStatus: "QUEUED" });
  const { labelProblem } = require("./fulfillmentGuard.js");
  expect(labelProblem(app.order(), app.ops())).toBe("");
});

test("fault 36: Shippo refusing the void leaves the label alone and offers the 'already voided' route", async () => {
  const app = harness({ order: labelled(), ops: { shippoTransactionId: "tx_old" }, fetchImpl: () => ok({ status: "ERROR" }) });
  const res = await app.label({ mode: "voidLabel" });
  expect(res.code).toBe(409);
  expect(res.body.needsConfirmation).toBe(true);
  expect(app.order().labelUrl).toBe("https://label/old.pdf");
});

test("fault 36: a label bought before ids were saved can be dropped once the owner says they voided it in Shippo", async () => {
  const app = harness({ order: labelled(), fetchImpl: () => ok({}) });
  // Shippo is searched by tracking number; nothing found, so nothing is refunded and the label stays.
  expect((await app.label({ mode: "voidLabel" })).code).toBe(409);
  expect(app.calls.every(c => c.url.includes("transactions/?"))).toBe(true);
  const before = app.calls.length;
  const confirmed = await app.label({ mode: "voidLabel", confirmedElsewhere: true });
  expect(confirmed.code).toBe(200);
  expect(app.calls.length).toBe(before);
  expect(app.order().labelUrl).toBeUndefined();
});

test("fault 36: once the parcel is handed over the label can't be replaced this way", async () => {
  const app = harness({ order: labelled({ fulfillmentStatus: "shipped", status: "completed" }), ops: { shippoTransactionId: "tx_old" }, fetchImpl: () => ok({}) });
  expect((await app.label({ mode: "voidLabel" })).code).toBe(409);
  expect(app.calls).toEqual([]);
});

// Fault 134 ----------------------------------------------------------------------------------------------
const upsRate = { object_id: "u1", provider: "UPS", amount: "18.50", servicelevel: { name: "Ground", token: "ups_ground" } };
const fedexRate = { object_id: "f1", provider: "FedEx", amount: "9.00", servicelevel: { name: "Home Delivery", token: "fedex_home" } };

test("fault 134: the service checkout sold is offered even when it is not Canada Post", () => {
  const order = baseOrder({ shippingMethod: "UPS Ground" });
  const offered = labelRatesFor([...shipmentRates, upsRate, fedexRate], order);
  expect(offered.map(r => r.object_id)).toEqual(["u1", "r1"]);
  expect(isPurchasableRate(upsRate, order)).toBe(true);
  expect(isPurchasableRate(fedexRate, order)).toBe(false);
  // Nothing sold from another carrier: Canada Post only, as before.
  expect(labelRatesFor([...shipmentRates, upsRate], baseOrder()).map(r => r.object_id)).toEqual(["r1"]);
});

test("fault 134: the label tool lists and buys the sold UPS service", async () => {
  const order = baseOrder({ shippingMethod: "UPS Ground", customer: { ...baseOrder().customer, address: { street: "1 Main", city: "Buffalo", state: "NY", zip: "14201", country: "US" } } });
  const fetchImpl = c => c.url.includes("customs/items") ? ok({ object_id: "ci_1" }) : c.url.includes("customs/declarations") ? ok({ object_id: "cd_1", object_status: "VALID" })
    : c.url.endsWith("shipments/") ? ok({ object_id: "sh_9", rates: [...shipmentRates, upsRate, fedexRate] })
    : c.url.includes("shipments/sh_9") ? ok({ rates: [...shipmentRates, upsRate, fedexRate] }) : ok({ ...success, tracking_provider: "UPS" });
  const app = harness({ order, fetchImpl });
  const rates = await app.label({ mode: "rates" });
  expect(rates.body.rates[0]).toMatchObject({ id: "u1", soldService: true, name: "UPS Ground" });
  expect(rates.body.rates.some(r => r.id === "f1")).toBe(false);
  const refused = await app.label({ mode: "purchase", shipmentId: "sh_9", rateId: "f1" });
  expect(refused.code).toBe(400);
  const bought = await app.label({ mode: "purchase", shipmentId: "sh_9", rateId: "u1" });
  expect(bought.code).toBe(200);
});

// Fault 35 -----------------------------------------------------------------------------------------------
const usOrder = (extra = {}) => baseOrder({ customer: { ...baseOrder().customer, address: { street: "1 Main", city: "Buffalo", state: "NY", zip: "14201", country: "US" } }, ...extra });
const customsFetch = c => c.url.includes("customs/items") ? ok({ object_id: "ci_1" }) : c.url.includes("customs/declarations") ? ok({ object_id: "cd_1", object_status: "VALID" })
  : ok({ object_id: "sh_2", rates: shipmentRates });

test("fault 35: an international label quote carries a customs declaration built from the order lines", async () => {
  const order = usOrder();
  const app = harness({ order, books: { b: { title: "Book", weight: "450 g", customsDescription: "Poetry chapbook", hsTariffNumber: "4901.91", customsOriginCountry: "ca" } }, fetchImpl: customsFetch });
  const res = await app.label({ mode: "rates" });
  expect(res.code).toBe(200);
  expect(res.body.customs).toBe(true);
  const item = app.calls.find(c => c.url.includes("customs/items")).body;
  expect(item).toMatchObject({ description: "Poetry chapbook", tariff_number: "4901.91", origin_country: "CA", quantity: 1, value_amount: "20.00", value_currency: "CAD", mass_unit: "g", net_weight: "450.0" });
  const declaration = app.calls.find(c => c.url.includes("customs/declarations")).body;
  expect(declaration).toMatchObject({ contents_type: "MERCHANDISE", certify: true, items: ["ci_1"], non_delivery_option: "RETURN" });
  expect(app.calls.find(c => c.url.endsWith("shipments/")).body.customs_declaration).toBe("cd_1");
  // Parcel weights go to Shippo in grams.
  expect(app.calls.find(c => c.url.endsWith("shipments/")).body.parcels[0]).toMatchObject({ mass_unit: "g" });
});

test("label parcels sent in grams from the dialog stay grams; an older tab's lb parcel is still read as lb", async () => {
  const grams = harness({ order: baseOrder(), fetchImpl: customsFetch });
  await grams.label({ mode: "rates", parcel: { length: "10", width: "8", height: "2", distance_unit: "in", weight: "830", mass_unit: "g" } });
  expect(grams.calls.find(c => c.url.endsWith("shipments/")).body.parcels[0]).toMatchObject({ weight: "830", mass_unit: "g" });
  const pounds = harness({ order: baseOrder(), fetchImpl: customsFetch });
  await pounds.label({ mode: "rates", parcel: { weight: "1.8", mass_unit: "lb" } });
  expect(pounds.calls.find(c => c.url.endsWith("shipments/")).body.parcels[0]).toMatchObject({ weight: "1.8", mass_unit: "lb" });
});

test("fault 35: books with no customs answers use printed-book defaults, and a domestic parcel needs no paperwork", async () => {
  const intl = harness({ order: usOrder(), fetchImpl: customsFetch });
  await intl.label({ mode: "rates" });
  expect(intl.calls.find(c => c.url.includes("customs/items")).body).toMatchObject({ description: "Printed books", tariff_number: "4901.99", origin_country: "CA" });
  const order = baseOrder();
  const home = harness({ order, fetchImpl: customsFetch });
  const res = await home.label({ mode: "rates" });
  expect(res.body.customs).toBe(false);
  expect(home.calls.some(c => c.url.includes("customs"))).toBe(false);
});

test("fault 35: customs items skip e-books, share a discount and ignore bad tariff codes", () => {
  const order = { subtotal: 40, discount: 10, items: [{ id: "a", price: 20, quantity: 2, format: "Paperback" }, { id: "e", price: 5, quantity: 1, format: "E-book (PDF)", isDigital: true }] };
  const items = customsItems(order, { a: { hsTariffNumber: "nonsense", weight: "1 lb" } }, "CA");
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ tariff_number: "4901.99", value_amount: "30.00", quantity: 2, net_weight: "907.2", mass_unit: "g" });
  expect(needsCustoms("CA", "US")).toBe(true);
  expect(needsCustoms("CA", "Canada")).toBe(false);
  expect(validHsCode("4901.99")).toBe(true);
  expect(validHsCode("49")).toBe(false);
});

// Fault 96 -----------------------------------------------------------------------------------------------
const webhookOrder = fulfillmentStatus => baseOrder({ fulfillmentStatus, trackingNumber: "T1", trackingCarrier: "Canada Post", status: fulfillmentStatus === "delivered" ? "completed" : "processing" });
const webhookPatch = "sendEmail = async (m) => { __log.push('email:' + m.subject); return { ok: true }; };";
const trackFetch = status => c => c.url.includes("tracks/") ? ok({ tracking_status: { status } }) : ok({});

test("fault 96: a late 'out for delivery' update never moves a delivered order backwards or emails the customer", async () => {
  const app = harness({ order: webhookOrder("delivered"), fetchImpl: trackFetch("OUT_FOR_DELIVERY"), patch: webhookPatch });
  const res = await app.call("shippoWebhook", { data: { tracking_number: "T1", carrier: "canada_post" } });
  expect(res.code).toBe(200);
  expect(app.order().fulfillmentStatus).toBe("delivered");
  expect(app.log).toEqual([]);
});

test("fault 96: forward progress still updates the order (without emailing the customer)", async () => {
  const app = harness({ order: webhookOrder("shipped"), fetchImpl: trackFetch("DELIVERED"), patch: webhookPatch });
  await app.call("shippoWebhook", { data: { tracking_number: "T1", carrier: "canada_post" } });
  expect(app.order().fulfillmentStatus).toBe("delivered");
  expect(app.order().status).toBe("completed");
  expect(app.log).toEqual([]);
  // Repeating the same update changes nothing and sends nothing.
  await app.call("shippoWebhook", { data: { tracking_number: "T1", carrier: "canada_post" } });
  expect(app.log).toEqual([]);
  expect(advancesTracking("delivered", "out_for_delivery")).toBe(false);
  expect(advancesTracking("shipped", "out_for_delivery")).toBe(true);
  expect(advancesTracking("processing", "delivered")).toBe(true);
});

// One email per shipped parcel: "out for delivery" never emails the customer (owner's request).
test("a carrier 'out for delivery' update moves the order on without a second email", async () => {
  const app = harness({ order: webhookOrder("shipped"), fetchImpl: trackFetch("OUT_FOR_DELIVERY"), patch: webhookPatch });
  const res = await app.call("shippoWebhook", { data: { tracking_number: "T1", carrier: "canada_post" } });
  expect(res.code).toBe(200);
  expect(app.order().fulfillmentStatus).toBe("out_for_delivery");
  expect(app.log).toEqual([]);
});

test("marking a shipped parcel out for delivery or delivered sends no email", async () => {
  const app = harness({ patch: webhookPatch });
  const shipped = webhookOrder("shipped");
  const change = (before, after) => app.exports.onOrderUpdated({ data: { before: { data: () => before }, after: { data: () => after } }, params: { orderId: "A" } });
  await change(shipped, { ...shipped, fulfillmentStatus: "out_for_delivery" });
  await change({ ...shipped, fulfillmentStatus: "out_for_delivery" }, { ...shipped, fulfillmentStatus: "delivered", status: "completed" });
  await change(shipped, { ...shipped, fulfillmentStatus: "delivered", status: "completed" });
  expect(app.log).toEqual([]);
});

test("local delivery still emails its steps (the customer had no shipping email)", async () => {
  const app = harness({ patch: webhookPatch });
  const local = baseOrder({ fulfillment: { method: "local_delivery" }, fulfillmentStatus: "ready_for_delivery" });
  await app.exports.onOrderUpdated({ data: { before: { data: () => local }, after: { data: () => ({ ...local, fulfillmentStatus: "out_for_delivery" }) } }, params: { orderId: "A" } });
  expect(app.log).toEqual(["email:Delivery Update: Your order is out for delivery"]);
});

// Fault 70 -----------------------------------------------------------------------------------------------
test("fault 70: the paid-order emails go out before the Shippo address check runs", async () => {
  const app = harness({ patch: "sendEmail = async (m) => { __log.push('email'); return { ok: true }; };\nautoApproveShippingAddress = async () => { __log.push('address'); };" });
  const paid = baseOrder({ items: [{ id: "b", title: "Book", quantity: 1, price: 20, format: "Paperback" }] });
  await app.exports.onOrderUpdated({ data: { before: { data: () => ({ ...paid, paymentStatus: "unpaid" }) }, after: { data: () => paid } }, params: { orderId: "A" } });
  expect(app.log).toContain("email");
  expect(app.log.at(-1)).toBe("address");
  expect(app.log.indexOf("address")).toBeGreaterThan(app.log.lastIndexOf("email"));
});

test("fault 70: a hung address check can't stop the emails (Shippo calls now time out)", async () => {
  const app = harness({ fetchImpl: () => new Promise(() => {}), patch: webhookPatch });
  const paid = baseOrder();
  const started = Date.now();
  // The emails are sent first; the check itself is bounded by the Shippo timeout (shortened here).
  await Promise.race([
    app.exports.onOrderUpdated({ data: { before: { data: () => ({ ...paid, paymentStatus: "unpaid" }) }, after: { data: () => paid } }, params: { orderId: "A" } }),
    new Promise(resolve => setTimeout(resolve, 300)),
  ]);
  expect(app.log.some(entry => entry.startsWith("email:"))).toBe(true);
  expect(Date.now() - started).toBeLessThan(2000);
});

// Address rules (carry-over from PR 5) -------------------------------------------------------------------
test("addresses in countries without a province list or postal code pass the server address check", async () => {
  const app = harness({ fetchImpl: () => ok({ validation_results: { is_valid: true, messages: [] } }) });
  const qatar = await app.call("validateAddress", { address: { street: "1 Corniche", city: "Doha", country: "Qatar" } });
  expect(qatar.code).toBe(200);
  expect(qatar.body.isValid).toBe(true);
  const france = await app.call("validateAddress", { address: { street: "1 Rue", city: "Paris", zip: "75001", country: "France" } });
  expect(france.code).toBe(200);
  // Canada still needs its province, and France its postal code.
  expect((await app.call("validateAddress", { address: { street: "1 Main", city: "Toronto", zip: "M1M1M1", country: "Canada" } })).code).toBe(400);
  expect((await app.call("validateAddress", { address: { street: "1 Rue", city: "Paris", country: "France" } })).code).toBe(400);
  expect(addressMissing({ street: "1", city: "c", country: "HK" })).toEqual([]);
});

test("a label can be quoted for an address with no province or postal code", async () => {
  const order = baseOrder({ customer: { ...baseOrder().customer, address: { street: "1 Corniche", city: "Doha", state: "", zip: "", country: "Qatar" } } });
  const app = harness({ order, fetchImpl: customsFetch });
  const res = await app.label({ mode: "rates" });
  expect(res.code).toBe(200);
  expect(app.calls.find(c => c.url.endsWith("shipments/")).body.address_to).toMatchObject({ country: "QA", state: "", zip: "" });
});
