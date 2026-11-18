// Rentals (beta, rentals.js): off until both switches are on, one unit never rented twice for the same time, a hold
// freed when unpaid, a paid page confirmed once, and the owner's own steps (picked up, returned, cancel with refund).
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { rentalActions } = realRequire("./rentals");

function fakeDb() {
  const store = new Map();
  const key = (c, id) => `${c}/${id}`;
  const snapOf = (c, id) => ({ id, exists: store.has(key(c, id)), data: () => structuredClone(store.get(key(c, id))) });
  const ref = (c, id) => ({
    async get() { return snapOf(c, id); },
    async set(data, opts) { store.set(key(c, id), opts?.merge ? { ...(store.get(key(c, id)) || {}), ...structuredClone(data) } : structuredClone(data)); },
    async delete() { store.delete(key(c, id)); },
  });
  const list = (c) => [...store.keys()].filter((k) => k.startsWith(`${c}/`)).map((k) => snapOf(c, k.slice(c.length + 1)));
  const query = (c, filters = [], n = 1000) => ({
    where: (f, _op, v) => query(c, [...filters, [f, v]], n),
    limit: (m) => query(c, filters, m),
    async get() { const docs = list(c).filter((d) => filters.every(([f, v]) => d.data()[f] === v)).slice(0, n); return { docs, empty: !docs.length }; },
  });
  let queue = Promise.resolve();
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(c, id), ...query(c) }),
    runTransaction(fn) { const run = queue.then(() => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o) })); queue = run.catch(() => {}); return run; },
  };
}
function res() {
  const out = { statusCode: 200, body: null };
  out.status = (c) => { out.statusCode = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  out.set = () => out;
  return out;
}

const KIT = { name: "Camera kit", units: 1, basis: "hour", hourMinor: 2000, dayMinor: 9000, minLength: 2, maxLength: 8, cleanMinutes: 30, opens: "09:00", closes: "17:00" };
const ASK = { action: "rentalStart", itemId: "kit00001", day: "2026-11-20", start: "10:00", hours: 2, name: "Ada Reader", email: "ada@example.com" };

function setup({ platform = true, owner = true, keepsCards = false } = {}) {
  const db = fakeDb();
  const clock = { now: new Date("2026-11-18T12:00:00Z") };
  const emails = [];
  const refunds = [];
  const sessions = new Map();
  const charges = [];
  const card = {
    async open(params) { const id = `cs_test_${String(sessions.size).padStart(8, "0")}`; sessions.set(id, { id, payment_status: "unpaid", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata }); return { id, url: `https://pay.example/${id}` }; },
    async read(id) { return sessions.get(id) || null; },
    async close() {},
    ...(keepsCards ? {
      async savedCard() { return { customer: "cus_1", paymentMethod: "pm_1", brand: "Visa", last4: "4242" }; },
      async chargeSaved(a, key) { charges.push({ ...a, key }); if (a.amountMinor === 666) throw Object.assign(new Error("declined"), { statusCode: 402 }); return { id: `pi_fee_${charges.length}` }; },
    } : {}),
  };
  let n = 0;
  const desk = rentalActions({
    db, requireAdmin: async () => ({ email: "owner@example.com" }),
    payments: { standaloneCheckout: async () => card, async refund(a) { refunds.push(a); return { refundId: "re_1" }; } },
    shopTestMode: async () => true, hitLimit: async () => true, LIMITS: {}, siteLink: (p) => `https://press.example${p}`, shopName: () => "Moth Press",
    zone: () => "America/Toronto", currency: () => "CAD", sendEmail: async (m) => { emails.push(m); }, ownerEmail: () => "owner@example.com",
    escapeHtml: (s) => String(s), risoLayout: (s) => s, risoButton: (h, l) => `<a href="${h}">${l}</a>`, now: () => clock.now,
    randomId: () => `rent${String(++n).padStart(4, "0")}`, randomKey: () => String(n).padStart(48, "a"),
  });
  const seed = async () => {
    await db.collection("platform").doc("features").set({ ways: { rentals: platform } });
    await db.collection("firstWeek").doc("start").set({ ways: { rentals: owner } });
    await db.collection("rentalItems").doc("kit00001").set(KIT);
  };
  const pub = async (body) => { const r = res(); await desk.handlePublic({ body }, r); return r; };
  const adm = async (body) => { const r = res(); await desk.handleAdmin({ body }, r); return r; };
  const pay = (i) => Object.assign(sessions.get(`cs_test_${String(i).padStart(8, "0")}`), { payment_status: "paid", payment_intent: `pi_${i}` });
  const doc = async (c, id) => (await db.collection(c).doc(id).get()).data();
  return { db, desk, clock, emails, refunds, seed, pub, adm, pay, doc, charges, sessions };
}

describe("rentals", () => {
  test.each([[false, true], [true, false]])("platform %s, owner %s: nothing is shown or booked", async (platform, owner) => {
    const t = setup({ platform, owner });
    await t.seed();
    expect((await t.pub({ action: "rentalsInfo" })).body).toEqual({ on: false });
    expect((await t.pub(ASK)).body).toEqual({ on: false });
    expect((await t.adm({ op: "list" })).statusCode).toBe(403);
  });

  test("the page lists items without their unit count, and offers free times", async () => {
    const t = setup();
    await t.seed();
    const info = (await t.pub({ action: "rentalsInfo" })).body;
    expect(info.items[0]).toMatchObject({ id: "kit00001", name: "Camera kit", hourMinor: 2000 });
    expect(info.items[0].units).toBeUndefined();
    const times = (await t.pub({ action: "rentalTimes", itemId: "kit00001", day: "2026-11-20", hours: 2 })).body.times;
    expect(times.find((x) => x.start === "10:00")).toEqual({ start: "10:00", free: true });
  });

  test("the last unit is held once; a second customer is told it's taken; unpaid holds free it", async () => {
    const t = setup();
    await t.seed();
    const first = await t.pub(ASK);
    expect(first.body).toMatchObject({ url: "https://pay.example/cs_test_00000000", rentalId: "rent0001" });
    expect(await t.doc("rentals", "rent0001")).toMatchObject({ status: "held", unit: 1, chargedMinor: 4000 });
    // Cleaning time keeps the unit busy right after.
    const second = await t.pub({ ...ASK, start: "12:00" });
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("taken");
    t.clock.now = new Date("2026-11-18T12:11:00Z");
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, freed: 1 });
    expect((await t.doc("rentals", "rent0001")).status).toBe("cancelled");
    expect((await t.pub({ ...ASK, start: "12:00" })).statusCode).toBe(200);
  });

  test("a paid page is confirmed once, emailed, and the owner moves it along", async () => {
    const t = setup();
    await t.seed();
    await t.pub(ASK);
    t.pay(0);
    expect(await t.desk.sweep()).toEqual({ confirmed: 1, freed: 0 });
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, freed: 0 });
    expect(t.emails.map((e) => e.to)).toEqual(["ada@example.com", "owner@example.com"]);
    const view = await t.pub({ action: "rentalView", rentalId: "rent0001", key: "1".padStart(48, "a") });
    expect(view.body.rental).toMatchObject({ status: "paid", itemName: "Camera kit" });
    expect((await t.pub({ action: "rentalView", rentalId: "rent0001", key: "b".repeat(48) })).statusCode).toBe(404);
    expect((await t.adm({ op: "returned", id: "rent0001" })).body.rental.status).toBe("returned");
    expect((await t.adm({ op: "pickedUp", id: "rent0001" })).statusCode).toBe(409);
  });

  test("the owner cancels a paid rental with a refund, once, and its time is free again", async () => {
    const t = setup();
    await t.seed();
    await t.pub(ASK);
    t.pay(0);
    await t.desk.sweep();
    const r = await t.adm({ op: "cancel", id: "rent0001" });
    expect(r.body.rental).toMatchObject({ status: "cancelled", refundedMinor: 4000 });
    expect(t.refunds).toEqual([expect.objectContaining({ paymentIntentId: "pi_0", amountMinor: 4000, idempotencyKey: "rental-refund-rent0001" })]);
    expect((await t.adm({ op: "cancel", id: "rent0001" })).statusCode).toBe(409);
    expect((await t.pub(ASK)).statusCode).toBe(200);
  });

  test("the owner can't remove units or items that have rentals coming", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("rentalItems").doc("kit00001").set({ ...KIT, units: 2 });
    await t.pub(ASK);
    await t.pub(ASK);
    t.pay(0); t.pay(1);
    await t.desk.sweep();
    expect((await t.doc("rentals", "rent0002")).unit).toBe(2);
    expect((await t.adm({ op: "saveItem", item: { ...KIT, id: "kit00001", units: 1 } })).body.code).toBe("booked");
    expect((await t.adm({ op: "deleteItem", id: "kit00001" })).body.code).toBe("booked");
    expect((await t.adm({ op: "list" })).body.rentals).toHaveLength(2);
  });

  test("R2: a deposit keeps the card; fees only on the owner's tap, never past the deposit, and a pay link for more", async () => {
    const t = setup({ keepsCards: true });
    await t.seed();
    await t.db.collection("rentalItems").doc("kit00001").set({ ...KIT, depositMinor: 10000, lateFeeMinor: 1500 });
    const info = (await t.pub({ action: "rentalsInfo" })).body;
    expect(info.items[0]).toMatchObject({ depositMinor: 10000, lateFeeMinor: 1500 });
    const started = (await t.pub(ASK)).body;
    t.pay(0);
    await t.desk.sweep();
    const r = await t.doc("rentals", started.rentalId);
    expect(r).toMatchObject({ status: "paid", cardHold: true, depositMinor: 10000, card: { customer: "cus_1", last4: "4242", mode: "test" } });
    expect(t.emails[0].html).toContain("kept on file");
    expect(t.charges).toEqual([]);
    // Brought back two hours late: the fee is suggested, never charged by itself.
    await t.adm({ op: "pickedUp", id: started.rentalId });
    t.clock.now = new Date(r.endMs + 2 * 3_600_000);
    await t.adm({ op: "returned", id: started.rentalId });
    const listed = (await t.adm({ op: "list" })).body.rentals[0];
    expect(listed).toMatchObject({ lateBy: 2, suggestedLateMinor: 3000, feeRoomMinor: 10000, card: "Visa ending 4242" });
    expect(t.charges).toEqual([]);
    const charged = await t.adm({ op: "chargeFee", id: started.rentalId, amountMinor: 3000, reason: "late" });
    expect(charged.body.rental).toMatchObject({ feeRoomMinor: 7000, fees: [{ amountMinor: 3000, reason: "late" }] });
    expect(t.charges[0]).toMatchObject({ customer: "cus_1", paymentMethod: "pm_1", amountMinor: 3000, key: `rental-fee-${started.rentalId}-1` });
    expect((await t.adm({ op: "chargeFee", id: started.rentalId, amountMinor: 8000, reason: "damage" })).body.code).toBe("amount");
    expect((await t.adm({ op: "chargeFee", id: started.rentalId, amountMinor: 666, reason: "damage" })).statusCode).toBe(402);
    expect((await t.doc("rentals", started.rentalId)).fees).toHaveLength(1);
    // More than the deposit covers: a pay link the customer pays from the email.
    const link = (await t.adm({ op: "payLink", id: started.rentalId, amountMinor: 12000, note: "New lens cap" })).body;
    expect(link.url).toMatch(/^https:\/\/pay\.example\//);
    expect(t.emails.at(-1).html).toContain("New lens cap");
    t.pay(1);
    await t.desk.sweep();
    const after = await t.doc("rentals", started.rentalId);
    expect(after).toMatchObject({ extraOpen: false, extraPages: [], extrasPaid: [{ amountMinor: 12000, note: "New lens cap" }] });
    await t.desk.sweep();
    expect((await t.doc("rentals", started.rentalId)).extrasPaid).toHaveLength(1);
  });

  test("R2: a shop that can't keep cards takes no deposit card and fees go by pay link", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("rentalItems").doc("kit00001").set({ ...KIT, depositMinor: 10000 });
    const started = (await t.pub(ASK)).body;
    t.pay(0);
    await t.desk.sweep();
    expect((await t.doc("rentals", started.rentalId)).cardHold).toBeUndefined();
    expect((await t.adm({ op: "chargeFee", id: started.rentalId, amountMinor: 1000 })).body.code).toBe("no_card");
    expect((await t.adm({ op: "payLink", id: started.rentalId, amountMinor: 1000 })).statusCode).toBe(200);
  });
});
