// Bookings (beta, bookings.js): off until the platform turns it on, one customer per time even when two ask at once,
// paid times held while the customer pays and freed when they don't, cancel and move only up to the shop's window,
// refunds on the shop's own card account, and the owner's own changes.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { bookingActions, busyFrom } = realRequire("./bookings");
const { zonedTime, DEFAULT_BOOKING_SETTINGS, cleanBookingSettings, cleanRates } = realRequire("./shared/bookingTimes");

const ZONE = "America/Toronto";
const at = (day, hhmm) => new Date(zonedTime(day, hhmm, ZONE)).toISOString();

function fakeDb() {
  const store = new Map();
  const key = (c, id) => `${c}/${id}`;
  const snapOf = (c, id) => ({ id, exists: store.has(key(c, id)), data: () => structuredClone(store.get(key(c, id))), ref: ref(c, id) });
  const ref = (c, id) => ({
    id, path: key(c, id),
    async get() { return snapOf(c, id); },
    async set(data, opts) { store.set(key(c, id), opts?.merge ? { ...(store.get(key(c, id)) || {}), ...structuredClone(data) } : structuredClone(data)); },
    async delete() { store.delete(key(c, id)); },
  });
  const list = (c) => [...store.keys()].filter((k) => k.startsWith(`${c}/`)).map((k) => snapOf(c, k.slice(c.length + 1)));
  const query = (c, filters = [], n = 1000, by = "") => ({
    where: (f, op, v) => query(c, [...filters, [f, v, op]], n, by),
    limit: (m) => query(c, filters, m, by),
    orderBy: (f) => query(c, filters, n, f),
    async get() {
      const hits = list(c).filter((d) => filters.every(([f, v, op]) => { const x = f.split(".").reduce((o, k) => o?.[k], d.data()); return op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : op === ">=" ? x >= v : x === v; }));
      if (by) hits.sort((a, b) => String(a.data()[by]).localeCompare(String(b.data()[by])));
      const docs = hits.slice(0, n);
      return { docs, empty: docs.length === 0 };
    },
  });
  // Transactions run one after another, which is what Firestore's retries amount to for these tests.
  let queue = Promise.resolve();
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(c, id), ...query(c) }),
    runTransaction(fn) {
      const run = queue.then(() => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), delete: (r) => r.delete() }));
      queue = run.catch(() => {});
      return run;
    },
  };
}

function res() {
  const out = { statusCode: 200, body: null, headers: {} };
  out.status = (c) => { out.statusCode = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  out.set = (k, v) => { out.headers[k] = v; return out; };
  return out;
}

function setup({ on = true, live = true, checkout = "card", now = "2026-11-16T13:00:00Z", admin = true, provider = "stripe", decline = null, calendar = null, findDiscount = null, shopTax = null, texts = null } = {}) {
  const db = fakeDb();
  const clock = { now: new Date(now) };
  const emails = [];
  const opened = [];
  const closed = [];
  const refunds = [];
  const sessions = new Map();
  const charges = [];
  // Card readers (Stripe smart readers): one place, readers by code, payments the test taps or declines.
  const terminal = { places: [], readers: new Map(), intents: new Map(), offline: false, cancelled: [], tipSettings: [], pairings: [] };
  const fakeReader = {
    testMode: true,
    async makePlace({ name, address }) { terminal.places.push({ name, address }); return `tml_${terminal.places.length}`; },
    async list(place) { return [...terminal.readers.values()].filter((r) => r.place === place).map(({ place: _p, ...r }) => r); },
    async add({ code, label, place }) {
      if (code !== "simulated-wpe") throw Object.assign(new Error("Invalid registration code"), { statusCode: 400 });
      const id = `tmr_${terminal.readers.size + 1}`;
      terminal.readers.set(id, { id, label, online: true, device: "simulated_wisepos_e", action: null, place });
      return { id, label, online: true };
    },
    async remove(id) { terminal.readers.delete(id); },
    async read(id) { return terminal.readers.get(id) || null; },
    async setTips(args) { terminal.tipSettings.push(args); return args.config || "tmc_1"; },
    async charge({ readerId, amountMinor, metadata, tipPercents }, key) {
      if (terminal.offline) throw new Error("Reader is offline");
      const intent = `pi_reader_${terminal.intents.size + 1}`;
      terminal.intents.set(intent, { status: "requires_payment_method", amountMinor, metadata, key, readerId, tipPercents, tipMinor: 0 });
      terminal.readers.get(readerId).action = { status: "in_progress", error: "", intent };
      return { intent };
    },
    async payment(id) { const i = terminal.intents.get(id); return { status: i.status, amountMinor: i.status === "succeeded" ? i.amountMinor + i.tipMinor : 0, tipMinor: i.status === "succeeded" ? i.tipMinor : 0, error: i.error || "" }; },
    async cancel(readerId, intentId) { terminal.cancelled.push(intentId); const i = terminal.intents.get(intentId); if (i && i.status !== "succeeded") i.status = "canceled"; },
    async testCard(readerId) { const r = terminal.readers.get(readerId); terminal.intents.get(r.action.intent).status = "succeeded"; r.action.status = "succeeded"; },
  };
  // Square Terminals: the shop gets a pairing code; a checkout completes with its own payment id (sqpay_…).
  const squareReader = {
    testMode: true, pairsWithCode: true, fixedPlace: "square",
    async list() { return [...terminal.readers.values()].map(({ place: _p, ...r }) => r); },
    async pair({ label }) { terminal.pairings.push(label); terminal.readers.set(`sqdev_DEV${terminal.readers.size + 1}`, { id: `sqdev_DEV${terminal.readers.size + 1}`, label, online: null, action: null }); return { code: "EBCARJ", pairBy: "2026-11-16T13:05:00Z" }; },
    async remove(id) { terminal.readers.delete(id); },
    async read(id) { return terminal.readers.get(id) || null; },
    async charge({ readerId, amountMinor, metadata, tipPercents }, key) {
      const intent = `sqterm_TC${terminal.intents.size + 1}`;
      terminal.intents.set(intent, { status: "processing", amountMinor, metadata, key, readerId, tipPercents, tipMinor: 0 });
      return { intent };
    },
    async payment(id) {
      const i = terminal.intents.get(id);
      if (i.status === "succeeded") return { status: "succeeded", amountMinor: i.amountMinor + i.tipMinor, tipMinor: i.tipMinor, paymentIntent: `sqpay_PAY${id.slice(-1)}`, error: "" };
      return { status: i.status, amountMinor: 0, tipMinor: 0, error: i.error || "" };
    },
    async cancel(_r, intentId) { terminal.cancelled.push(intentId); const i = terminal.intents.get(intentId); if (i && i.status !== "succeeded") i.status = "canceled"; },
    async testCard() {},
  };
  const card = checkout === null ? null : {
    async open(params, idem) {
      const id = `cs_test_${String(opened.length).padStart(8, "0")}`;
      opened.push({ params, idem });
      const setupOnly = params.mode === "setup";
      sessions.set(id, { id, mode: params.mode, payment_status: setupOnly ? "no_payment_required" : "unpaid", status: "open", amount_total: setupOnly ? null : params.line_items[0].price_data.unit_amount, metadata: params.metadata, payment_intent: null });
      return { id, url: `https://pay.example/${id}` };
    },
    async read(id) { return sessions.get(id) || null; },
    async close(id) { closed.push(id); const s = sessions.get(id); if (s && s.payment_status !== "paid") s.status = "expired"; },
    ...(provider === "stripe" ? {
      async savedCard(id) { return sessions.get(id)?.status === "complete" ? { customer: "cus_ada", paymentMethod: "pm_ada", brand: "visa", last4: "4242" } : null; },
      reader: fakeReader,
      async chargeSaved(args, idem) {
        if (decline) throw Object.assign(new Error("Your card was declined."), { statusCode: 402, type: "card_error", code: decline });
        charges.push({ args, idem });
        return { id: `pi_fee_${charges.length}`, status: "succeeded" };
      },
    } : { reader: squareReader }),
  };
  let n = 0;
  const optOuts = new Set();
  const desk = bookingActions({
    db, calendar, findDiscount, shopTax, texts,
    optedOut: async (e) => optOuts.has(e),
    unsubscribeUrl: (e) => `https://press.example/track?unsubscribe=1&e=${e}`,
    requireAdmin: async (_req, r) => (admin ? { email: "owner@example.com" } : (r.status(401).json({ error: "no" }), null)),
    payments: { provider, standaloneCheckout: async () => card, refund: async (args) => { if (refunds.failNext > 0) { refunds.failNext -= 1; throw new Error("card declined"); } refunds.push(args); return { refundId: `re_${refunds.length}`, amountMinor: args.amountMinor }; } },
    shopTestMode: async () => true,
    hitLimit: async () => true,
    LIMITS: {},
    siteLink: (p) => `https://press.example${p}`,
    shopName: () => "Moth Press",
    zone: () => ZONE,
    currency: () => "CAD",
    sendEmail: async (m) => { emails.push(m); },
    ownerEmail: () => "owner@example.com",
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    risoLayout: (inner) => `<html>${inner}</html>`,
    risoButton: (href, label) => `<a href="${href}">${label}</a>`,
    now: () => clock.now,
    randomId: () => `booking${String(++n).padStart(3, "0")}`,
    randomKey: () => String(n).padStart(48, "a"),
  });
  const seed = async () => {
    if (on) await db.collection("platform").doc("features").set({ bookings: true });
    await db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live, minNoticeHours: 0 });
    await db.collection("bookingServices").doc("visit").set({ name: "Studio visit", minutes: 60, gapAfter: 15, payment: "free", priceMinor: 0, location: "12 Ink Lane" });
    await db.collection("bookingServices").doc("review").set({ name: "Portfolio review", minutes: 30, gapAfter: 0, payment: "full", priceMinor: 4000 });
  };
  const pub = async (body) => { const r = res(); await desk.handlePublic({ body }, r); return r; };
  const adm = async (body) => { const r = res(); await desk.handleAdmin({ body }, r); return r; };
  return { db, desk, clock, emails, opened, closed, refunds, sessions, charges, terminal, optOuts, seed, pub, adm };
}

const CUSTOMER = { name: "Ada Reader", email: "ada@example.com" };

describe("off until the platform turns it on", () => {
  test("a shop without the switch answers off and the admin is refused", async () => {
    const t = setup({ on: false });
    await t.seed();
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
    expect((await t.adm({ op: "saveSettings", settings: {} })).statusCode).toBe(403);
  });
  test("Classes (a way to sell) turns the engine on too, but only with both of its switches", async () => {
    const t = setup({ on: false });
    await t.seed();
    // The platform allows Classes; the owner hasn't switched it on yet.
    await t.db.collection("platform").doc("features").set({ ways: { classes: true } });
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
    expect((await t.adm({ op: "saveSettings", settings: {} })).statusCode).toBe(403);
    // The owner switches it on: the engine answers.
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    expect((await t.pub({ action: "bookingInfo" })).body.on).toBe(true);
    // Another way on (Events) is not Classes; the owner's switch alone is nothing without the platform's.
    await t.db.collection("platform").doc("features").set({ ways: { events: true } });
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
  });
  test("with the switch on but the page not live, customers see nothing", async () => {
    const t = setup({ live: false });
    await t.seed();
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), ...CUSTOMER })).statusCode).toBe(409);
  });
});

describe("customers book", () => {
  test("the info lists live services without anything private", async () => {
    const t = setup();
    await t.seed();
    const { body } = await t.pub({ action: "bookingInfo" });
    expect(body.on).toBe(true);
    expect(body.services.map((s) => s.id).sort()).toEqual(["review", "visit"]);
    expect(Object.keys(body.services[0]).sort()).toEqual(["depositMinor", "depositPercent", "description", "id", "location", "minutes", "name", "payment", "places", "priceMinor", "questions"]);
    // The opening hours, Sunday first, for the website's hours section.
    expect(body.hours).toHaveLength(7);
    expect(body.hours.flat().every((w) => /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end))).toBe(true);
  });

  test("a free booking is confirmed at once, emailed, and its time is gone for the next customer", async () => {
    const t = setup();
    await t.seed();
    const first = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), ...CUSTOMER });
    expect(first.body).toMatchObject({ status: "confirmed", id: "booking001" });
    const saved = t.db.store.get("bookings/booking001");
    expect(saved).toMatchObject({ status: "confirmed", payment: "free", serviceName: "Studio visit" });
    expect(saved.manageKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(saved)).not.toContain(first.body.key);
    expect(t.emails.map((e) => e.to)).toEqual(["ada@example.com", "owner@example.com"]);
    expect(t.emails[0].html).toContain(`key=${first.body.key}`);
    expect(t.emails[0].html).toContain("calendar.google.com");

    const again = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), name: "Bo", email: "bo@example.com" });
    expect(again.statusCode).toBe(409);
    expect(again.body.code).toBe("taken");
    const times = (await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-17", days: 1 })).body.days["2026-11-17"];
    // 10:00 is taken, and so are times running into it or into its 15 minutes of rest.
    expect(times).not.toContain(at("2026-11-17", "10:00"));
    expect(times).not.toContain(at("2026-11-17", "09:30"));
    expect(times).not.toContain(at("2026-11-17", "11:00"));
    expect(times).toContain(at("2026-11-17", "11:30"));
  });

  test("two customers asking for one time at once: one gets it", async () => {
    const t = setup();
    await t.seed();
    const [a, b] = await Promise.all([
      t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "14:00"), ...CUSTOMER }),
      t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "14:00"), name: "Bo", email: "bo@example.com" }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  });

  test("a time outside the hours, or a made-up one, is refused", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "07:00"), ...CUSTOMER })).statusCode).toBe(409);
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-22", "10:00"), ...CUSTOMER })).statusCode).toBe(409);
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: "soon", ...CUSTOMER })).statusCode).toBe(400);
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), name: "Ada", email: "nope" })).statusCode).toBe(400);
  });
});

describe("paid bookings", () => {
  test("hold the time, open the shop's card page for the saved price, and confirm once paid", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER, priceMinor: 1 });
    expect(r.body).toMatchObject({ status: "held", url: "https://pay.example/cs_test_00000000" });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(4000);
    expect(t.opened[0].params.metadata).toEqual({ booking: "booking001" });
    expect(t.opened[0].params).not.toHaveProperty("client_reference_id");
    expect(t.emails).toHaveLength(0);
    // Held: nobody else can take it.
    expect((await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), name: "Bo", email: "bo@example.com" })).statusCode).toBe(409);

    t.sessions.get("cs_test_00000000").payment_status = "paid";
    t.sessions.get("cs_test_00000000").payment_intent = "pi_123";
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ status: "confirmed", paid: true, canChange: true });
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ paymentIntent: "pi_123", pendingKey: null });
    expect(t.emails[0].to).toBe("ada@example.com");
    expect(t.emails[0].html).toContain(r.body.key);
    // Asking again sends nothing twice.
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(t.emails.filter((e) => e.to === "ada@example.com")).toHaveLength(1);
  });

  test("a hold not paid in time is closed and its time freed by the sweep", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER });
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 0, freed: 0 });
    t.clock.now = new Date(Date.parse("2026-11-16T13:11:00Z"));
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 0, freed: 1 });
    expect(t.closed).toEqual(["cs_test_00000000"]);
    expect(t.db.store.get("bookings/booking001").status).toBe("cancelled");
    expect((await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), name: "Bo", email: "bo@example.com" })).statusCode).toBe(200);
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking.status).toBe("cancelled");
  });

  test("a payment that landed just before the close still confirms", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER });
    t.clock.now = new Date(Date.parse("2026-11-16T13:11:00Z"));
    t.sessions.get("cs_test_00000000").payment_status = "paid";
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 1, freed: 0 });
    expect(t.db.store.get("bookings/booking001").status).toBe("confirmed");
  });

  test("a shop that can't take cards says so and takes nothing", async () => {
    const t = setup({ checkout: null });
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER });
    expect(r.statusCode).toBe(409);
    expect(t.db.store.has("bookings/booking001")).toBe(false);
  });
});

describe("the customer's own link", () => {
  test("a wrong key sees nothing", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: "b".repeat(48) })).statusCode).toBe(404);
    expect((await t.pub({ action: "bookingCancel", id: r.body.id, key: "nope" })).statusCode).toBe(404);
  });

  test("cancel frees the time and refunds a paid booking in full", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_9" });
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    const c = await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(c.body.booking).toMatchObject({ status: "cancelled", refunded: true });
    expect(t.refunds).toEqual([expect.objectContaining({ paymentIntentId: "pi_9", amountMinor: 4000, idempotencyKey: "booking-refund-booking001" })]);
    expect((await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), name: "Bo", email: "bo@example.com" })).statusCode).toBe(200);
  });

  test("inside the cancel window the customer is told to contact the shop", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-16", "15:00"), ...CUSTOMER });
    const c = await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(c.statusCode).toBe(409);
    expect(c.body.code).toBe("too_late");
    expect((await t.pub({ action: "bookingMove", id: r.body.id, key: r.body.key, start: at("2026-11-19", "10:00") })).statusCode).toBe(409);
  });

  test("move takes the new time and frees the old one", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    const m = await t.pub({ action: "bookingMove", id: r.body.id, key: r.body.key, start: at("2026-11-19", "11:00") });
    expect(m.body.booking.start).toBe(at("2026-11-19", "11:00"));
    expect(t.db.store.get("bookingDays/2026-11-18").items).toEqual({});
    expect(Object.keys(t.db.store.get("bookingDays/2026-11-19").items)).toEqual(["booking001"]);
    expect(t.emails.at(-2).subject).toMatch(/^Moved:/);
  });
});

describe("the owner", () => {
  test("saves services and hours through the server, with plain refusals", async () => {
    const t = setup();
    await t.seed();
    expect((await t.adm({ op: "saveService", service: { name: "", minutes: 30 } })).body.error).toMatch(/name/);
    const s = await t.adm({ op: "saveService", service: { name: "Print class", minutes: 90, payment: "full", priceMinor: 6000 } });
    expect(s.body.service).toMatchObject({ name: "Print class", minutes: 90 });
    const h = await t.adm({ op: "saveSettings", settings: { live: true, step: 15, cancelHours: 48 } });
    expect(h.body.settings).toMatchObject({ step: 15, cancelHours: 48 });
    expect((await t.adm({ op: "saveSettings", settings: {} })).statusCode).toBe(200);
  });

  test("a service's own questions: a required one must be answered, and the answers reach the booking and the owner", async () => {
    const t = setup();
    await t.seed();
    const saved = await t.adm({ op: "saveService", service: { name: "Studio talk", minutes: 30, questions: [
      { id: "work", label: "What would you like to work on?", long: true, required: true }, { label: "  " }, { id: "heard", label: "How did you hear about us?" },
    ] } });
    expect(saved.body.service.questions).toEqual([
      { id: "work", label: "What would you like to work on?", long: true, required: true }, { id: "heard", label: "How did you hear about us?", long: false, required: false },
    ]);
    expect((await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === saved.body.service.id).questions).toHaveLength(2);
    const missing = await t.pub({ action: "bookingStart", serviceId: saved.body.service.id, start: at("2026-11-17", "10:00"), ...CUSTOMER, answers: { heard: "A friend" } });
    expect(missing.statusCode).toBe(400);
    expect(missing.body).toMatchObject({ code: "answers", error: "Please answer: What would you like to work on?" });
    const ok = await t.pub({ action: "bookingStart", serviceId: saved.body.service.id, start: at("2026-11-17", "10:00"), ...CUSTOMER, answers: { work: "  A zine cover  ", made: "up" } });
    expect(ok.statusCode).toBe(200);
    const b = (await t.db.collection("bookings").doc(ok.body.id).get()).data();
    expect(b.answers).toEqual([{ label: "What would you like to work on?", answer: "A zine cover" }]);
  });

  test("the owner's on/off switch keeps the hours and tells the website to show or hide its Book a time links", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("settings").doc("website").set({ design: { accent: "#f00" } });
    await t.adm({ op: "saveSettings", settings: { live: true, step: 15, cancelHours: 48 } });
    expect((await t.db.collection("settings").doc("website").get()).data()).toEqual({ design: { accent: "#f00" }, bookingsLive: true });
    const off = await t.adm({ op: "setLive", live: false });
    expect(off.body.settings).toMatchObject({ live: false, step: 15, cancelHours: 48 });
    expect((await t.db.collection("settings").doc("website").get()).data().bookingsLive).toBe(false);
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
    const on = await t.adm({ op: "setLive", live: true });
    expect(on.body.settings).toMatchObject({ live: true, step: 15 });
    expect((await t.db.collection("settings").doc("website").get()).data().bookingsLive).toBe(true);
    expect((await t.pub({ action: "bookingInfo" })).body.on).toBe(true);
  });

  test("a shop with no website settings yet gets none made by the switch", async () => {
    const t = setup();
    await t.seed();
    await t.adm({ op: "setLive", live: true });
    expect((await t.db.collection("settings").doc("website").get()).exists).toBe(false);
  });

  test("books a customer in outside the hours, cancels with a refund choice, and marks a no-show", async () => {
    const t = setup();
    await t.seed();
    const c = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:00"), ...CUSTOMER });
    expect(c.body.ok).toBe(true);
    expect(t.db.store.get(`bookings/${c.body.id}`)).toMatchObject({ source: "admin", status: "confirmed" });
    expect((await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:30"), ...CUSTOMER })).statusCode).toBe(409);
    expect((await t.adm({ op: "noShow", id: c.body.id })).body.ok).toBe(true);
    expect(t.db.store.get(`bookings/${c.body.id}`).noShow).toBe(true);
    expect((await t.adm({ op: "cancel", id: c.body.id, refund: true })).body).toEqual({ ok: true, refunded: false, refundMinor: 0 });
    expect(t.db.store.get(`bookings/${c.body.id}`).status).toBe("cancelled");
  });

  test("only an admin may change bookings", async () => {
    const t = setup({ admin: false });
    await t.seed();
    expect((await t.adm({ op: "saveSettings", settings: {} })).statusCode).toBe(401);
  });
});

describe("busy times", () => {
  test("a hold the sweep never reached stops blocking after two hours", () => {
    const snap = (items) => ({ exists: true, data: () => ({ items }) });
    const now = Date.parse("2026-11-16T15:00:00Z");
    const busy = busyFrom([snap({ a: { start: 1, end: 2, held: true, at: now - 3 * 3600_000 }, b: { start: 3, end: 4, held: false, at: 0 }, c: { start: 5, end: 6, held: true, at: now } })], now);
    expect(busy).toEqual([{ start: 3, end: 4 }, { start: 5, end: 6 }]);
  });
});

describe("the day-before reminder", () => {
  test("emails a confirmed customer once, about a day ahead", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    const sent = () => t.emails.filter((m) => String(m.subject).startsWith("Coming up:")).length;
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
    t.clock.now = new Date(Date.parse(at("2026-11-17", "11:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 1 });
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
    expect(sent()).toBe(1);
    expect(t.db.store.get(`bookings/${r.body.id}`).reminderSentAt).toBeTruthy();
  });

  test("skips a booking made only hours before", async () => {
    const t = setup({ now: "2026-11-17T12:00:00Z" });
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
  });
});

describe("text-message reminders", () => {
  const textDoor = ({ available = true, answer = null } = {}) => {
    const sent = [];
    return { sent, status: async () => ({ available, price: available ? "1.6¢" : "" }), send: async (m) => { sent.push(m); return answer ? answer(m) : { ok: true, id: `SM${sent.length}`, parts: 2 }; } };
  };
  const turnOn = (t, on = true) => t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, textReminders: on, secondReminderHours: 2 });

  test("the form offers the tick only while the owner's switch is on and the platform sends texts", async () => {
    const off = setup({ texts: textDoor() });
    await off.seed();
    expect((await off.pub({ action: "bookingInfo" })).body.texts).toBe(false);
    await turnOn(off);
    expect((await off.pub({ action: "bookingInfo" })).body.texts).toBe(true);
    const closed = setup({ texts: textDoor({ available: false }) });
    await closed.seed();
    await turnOn(closed);
    expect((await closed.pub({ action: "bookingInfo" })).body.texts).toBe(false);
    expect((await closed.adm({ op: "textStatus" })).body).toEqual({ available: false, price: "" });
    expect((await off.adm({ op: "textStatus" })).body).toEqual({ available: true, price: "1.6¢" });
    expect((await setup().adm({ op: "textStatus" })).statusCode).toBe(403);
  });

  test("both reminders go by text too, once each, only to a client who ticked the box with a number", async () => {
    const door = textDoor();
    const t = setup({ texts: door });
    await t.seed();
    await turnOn(t);
    const ticked = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER, phone: "416 555 0199", textOk: true });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "13:00"), name: "Bo", email: "bo@example.com", phone: "416 555 0100" });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "15:00"), name: "Cy", email: "cy@example.com", textOk: true });
    expect(t.db.store.get(`bookings/${ticked.body.id}`).customer.textOk).toBe(true);
    t.clock.now = new Date(Date.parse(at("2026-11-17", "11:00")));
    await t.desk.sweepReminders();
    expect(door.sent).toHaveLength(1);
    const [first] = door.sent;
    expect(first.to).toBe("416 555 0199");
    expect(first.kind).toBe("booking-reminder");
    expect(first.body).toMatch(/^Reminder: Studio visit at Moth Press, .+ Change or cancel: https:\/\/press\.example\/book\?booking=.+ Reply STOP to stop texts\.$/);
    expect(first.body.length).toBeLessThanOrEqual(459);
    await t.desk.sweepReminders();
    expect(door.sent).toHaveLength(1);
    expect(t.db.store.get(`bookings/${ticked.body.id}`).reminderTextAt).toBeTruthy();
    t.clock.now = new Date(Date.parse(at("2026-11-18", "08:30")));
    await t.desk.sweepSecondReminders();
    expect(door.sent.map((m) => m.kind)).toEqual(["booking-reminder", "booking-soon"]);
    expect(door.sent[1].body).toMatch(/^Soon: /);
    expect(new Set(door.sent.map((m) => m.idempotencyKey)).size).toBe(2);
  });

  test("the owner's switch off sends no texts, and a client who replied STOP loses the tick", async () => {
    const door = textDoor({ answer: () => ({ ok: false, retryable: false, optedOut: true, message: "unsubscribed" }) });
    const t = setup({ texts: door });
    await t.seed();
    await turnOn(t, false);
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER, phone: "416 555 0199", textOk: true });
    t.clock.now = new Date(Date.parse(at("2026-11-17", "11:00")));
    await t.desk.sweepReminders();
    expect(door.sent).toHaveLength(0);
    await turnOn(t);
    t.clock.now = new Date(Date.parse(at("2026-11-18", "08:30")));
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 1 });
    expect(door.sent).toHaveLength(1);
    expect(t.db.store.get(`bookings/${r.body.id}`).customer.textOk).toBe(false);
    expect(t.emails.some((m) => String(m.subject).startsWith("Soon:"))).toBe(true);
  });
});

describe("slower ways to pay", () => {
  test("a payment still clearing keeps the time past the hold", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { status: "complete", payment_status: "unpaid" });
    t.clock.now = new Date(Date.parse("2026-11-16T13:11:00Z"));
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 0, freed: 0 });
    expect(t.db.store.get("bookings/booking001").status).toBe("held");
    t.sessions.get("cs_test_00000000").payment_status = "paid";
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 1, freed: 0 });
  });
});

describe("reminder choices and its own link", () => {
  test("the reminder's link opens the booking, and the first link still works", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    t.clock.now = new Date(Date.parse(at("2026-11-17", "11:00")));
    await t.desk.sweepReminders();
    const mail = t.emails.find((m) => String(m.subject).startsWith("Coming up:"));
    const key = /key=([a-f0-9]+)/.exec(mail.html)[1];
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).statusCode).toBe(200);
    // The test's keys repeat, so prove the reminder's own hash opens it with the first one gone.
    t.db.store.get(`bookings/${r.body.id}`).manageKeyHash = "0".repeat(64);
    expect((await t.pub({ action: "bookingView", id: r.body.id, key })).statusCode).toBe(200);
  });

  test("an owner who turns reminders off sends none, and 48 hours sends earlier", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "10:00"), ...CUSTOMER });
    t.clock.now = new Date(Date.parse(at("2026-11-17", "12:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
    await t.db.collection("bookingSettings").doc("main").set({ reminderHours: 48 }, { merge: true });
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 1 });
    await t.db.collection("bookingSettings").doc("main").set({ reminderHours: 0 }, { merge: true });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "14:00"), name: "Bo", email: "bo@example.com" });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "20:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
  });
});

describe("the second reminder", () => {
  test("off by default; once switched on it goes once, a few hours before, and its link opens the booking", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "14:00"), ...CUSTOMER });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "12:30")));
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 0 });
    await t.db.collection("bookingSettings").doc("main").set({ secondReminderHours: 2 }, { merge: true });
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 1 });
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 0 });
    const mail = t.emails.find((m) => String(m.subject).startsWith("Soon:"));
    expect(mail.to).toBe("ada@example.com");
    expect(mail.html).toContain("Starting soon");
    const key = /key=([a-f0-9]+)/.exec(mail.html)[1];
    t.db.store.get(`bookings/${r.body.id}`).manageKeyHash = "0".repeat(64);
    expect((await t.pub({ action: "bookingView", id: r.body.id, key })).statusCode).toBe(200);
  });

  test("never for a booking made inside those hours, a cancelled one, or one less than 15 minutes away", async () => {
    const t = setup({ now: "2026-11-18T15:00:00Z" });
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ secondReminderHours: 3 }, { merge: true });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "12:00"), ...CUSTOMER });
    const c = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "10:00"), name: "Bo", email: "bo@example.com" });
    await t.pub({ action: "bookingCancel", id: c.body.id, key: c.body.key });
    t.clock.now = new Date(Date.parse(at("2026-11-19", "08:00")));
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 0 });
    const d = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "15:00"), name: "Cy", email: "cy@example.com" });
    expect(d.statusCode).toBe(200);
    t.clock.now = new Date(Date.parse(at("2026-11-19", "14:50")));
    expect(await t.desk.sweepSecondReminders()).toEqual({ reminded: 0 });
  });

  test("a second reminder at or after the first one is refused when saved", async () => {
    const t = setup();
    await t.seed();
    const r = await t.adm({ op: "saveSettings", settings: { ...DEFAULT_BOOKING_SETTINGS, reminderHours: 2, secondReminderHours: 3 } });
    expect(r.statusCode).toBe(200);
    expect(t.db.store.get("bookingSettings/main").secondReminderHours).toBe(0);
  });
});

describe("the owner's morning list", () => {
  test("off by default; switched on it goes once a day from 7, in time order, and only on days with bookings", async () => {
    const t = setup({ now: "2026-11-17T12:00:00Z" });
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "14:00"), ...CUSTOMER });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), name: "Bo Lin", email: "bo@example.com", phone: "416 555 0100" });
    const gone = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "16:00"), name: "Cy", email: "cy@example.com" });
    await t.pub({ action: "bookingCancel", id: gone.body.id, key: gone.body.key });
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "10:00"), name: "Di", email: "di@example.com" });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "07:30")));
    expect(await t.desk.sweepSummary()).toEqual({ sent: false });
    await t.db.collection("bookingSettings").doc("main").set({ dailySummary: true }, { merge: true });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "06:55")));
    expect((await t.desk.sweepSummary()).sent).toBe(false);
    t.clock.now = new Date(Date.parse(at("2026-11-18", "07:05")));
    const before = t.emails.length;
    expect(await t.desk.sweepSummary()).toEqual({ sent: true, day: "2026-11-18", count: 2 });
    expect(await t.desk.sweepSummary()).toEqual({ sent: false });
    const mail = t.emails[before];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.subject).toMatch(/^\[BOOKINGS\] Today: 2 bookings, first at 10:00/);
    expect(mail.html.indexOf("Bo Lin")).toBeLessThan(mail.html.indexOf("Ada Reader"));
    expect(mail.html).not.toContain("Cy");
    expect(mail.html).not.toContain("Di");
    expect(t.emails.length).toBe(before + 1);
  });

  test("a day with nothing booked sends nothing, and is not tried again", async () => {
    const t = setup({ now: "2026-11-20T13:00:00Z" });
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ dailySummary: true }, { merge: true });
    const before = t.emails.length;
    expect(await t.desk.sweepSummary()).toEqual({ sent: false, day: "2026-11-20" });
    expect(await t.desk.sweepSummary()).toEqual({ sent: false });
    expect(t.emails.length).toBe(before);
  });
});

function fakeCalendar({ linked = true, down = false } = {}) {
  const events = new Map();
  const calls = [];
  return {
    events, calls,
    async put(id, event) {
      calls.push(["put", id]);
      if (down) return null;
      if (!linked) return { available: false };
      const had = events.get(id);
      events.set(id, { ...event, meetUrl: event.meet ? had?.meetUrl || `https://meet.google.com/abc-defg-${id.slice(-3)}` : "" });
      return { available: true, meetUrl: events.get(id).meetUrl };
    },
    async remove(id) { calls.push(["remove", id]); if (down) return null; if (!linked) return { available: false }; events.delete(id); return { available: true }; },
  };
}

describe("bookings straight into Google Calendar", () => {
  test("off by default: nothing is sent to Google", async () => {
    const calendar = fakeCalendar();
    const t = setup({ calendar });
    await t.seed();
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER })).statusCode).toBe(200);
    expect(calendar.calls).toEqual([]);
  });

  test("switched on, the coming bookings go in; booking, moving and cancelling keep the event in step", async () => {
    const calendar = fakeCalendar();
    const t = setup({ calendar });
    await t.seed();
    const before = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    const saved = await t.adm({ op: "saveSettings", settings: { ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, googleCalendar: true } });
    expect(saved.body.googleCalendar).toEqual({ available: true, filled: 1 });
    expect(calendar.events.get(before.body.id)).toMatchObject({ title: "Ada Reader: Studio visit", location: "12 Ink Lane", start: at("2026-11-18", "10:00"), meet: false });
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "10:00"), name: "Bo", email: "bo@example.com", phone: "416 555 0100" });
    expect(calendar.events.get(r.body.id).details).toContain("416 555 0100");
    await t.pub({ action: "bookingMove", id: r.body.id, key: r.body.key, start: at("2026-11-19", "14:00") });
    expect(calendar.events.get(r.body.id).start).toBe(at("2026-11-19", "14:00"));
    await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(calendar.events.has(r.body.id)).toBe(false);
    expect(t.db.store.get(`bookings/${r.body.id}`).calendarAt).toBeNull();
    // The owner's own changes too.
    const own = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-20", "10:00"), name: "Cy", email: "cy@example.com" });
    expect(calendar.events.has(own.body.id)).toBe(true);
    await t.adm({ op: "cancel", id: own.body.id });
    expect(calendar.events.has(own.body.id)).toBe(false);
  });

  test("a video-call service gets a Meet link, in the email and on the customer's page, and a move keeps it", async () => {
    const calendar = fakeCalendar();
    const t = setup({ calendar });
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ googleCalendar: true }, { merge: true });
    await t.db.collection("bookingServices").doc("visit").set({ meet: true }, { merge: true });
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    const link = calendar.events.get(r.body.id).meetUrl;
    expect(link).toMatch(/^https:\/\/meet\.google\.com\//);
    const mail = t.emails.find((m) => String(m.subject).startsWith("Booked:"));
    expect(mail.html).toContain(link);
    expect(mail.html).toContain("Join with Google Meet");
    await t.pub({ action: "bookingMove", id: r.body.id, key: r.body.key, start: at("2026-11-18", "14:00") });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking.meetUrl).toBe(link);
    await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking.meetUrl).toBe("");
  });

  test("a paid booking goes in once it is paid, not while it is held", async () => {
    const calendar = fakeCalendar();
    const t = setup({ calendar });
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ googleCalendar: true }, { merge: true });
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    expect(calendar.events.has(r.body.id)).toBe(false);
    const sid = t.opened[0] && [...t.sessions.keys()][0];
    Object.assign(t.sessions.get(sid), { payment_status: "paid", status: "complete", payment_intent: "pi_1" });
    await t.desk.sweepHolds();
    expect(calendar.events.has(r.body.id)).toBe(true);
  });

  test("Google not linked or not answering never stops a booking, and the owner is told when switching on", async () => {
    const t = setup({ calendar: fakeCalendar({ linked: false }) });
    await t.seed();
    const saved = await t.adm({ op: "saveSettings", settings: { ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, googleCalendar: true } });
    expect(saved.body.googleCalendar).toEqual({ available: false, filled: 0 });
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER })).statusCode).toBe(200);
    const d = setup({ calendar: fakeCalendar({ down: true }) });
    await d.seed();
    await d.db.collection("bookingSettings").doc("main").set({ googleCalendar: true }, { merge: true });
    const r = await d.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    expect(r.statusCode).toBe(200);
    expect(d.emails.some((m) => String(m.subject).startsWith("Booked:"))).toBe(true);
  });
});

describe("the owner's partial refund", () => {
  test("refunds only the part the owner chose, and never more than was paid", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_9" });
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect((await t.adm({ op: "cancel", id: r.body.id, refundMinor: 5000 })).statusCode).toBe(400);
    const c = await t.adm({ op: "cancel", id: r.body.id, refundMinor: 1500 });
    expect(c.body).toEqual({ ok: true, refunded: true, refundMinor: 1500 });
    expect(t.refunds).toEqual([expect.objectContaining({ amountMinor: 1500, idempotencyKey: "booking-refund-booking001-1500" })]);
    expect(t.emails.at(-1).html).toMatch(/\$15\.00 of your payment is being refunded/);
  });
});

describe("a bank payment that never clears", () => {
  test("shows as clearing, then frees the time at the start and tells the customer and the owner", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { status: "complete", payment_status: "unpaid" });
    t.clock.now = new Date(Date.parse("2026-11-16T13:11:00Z"));
    await t.desk.sweepHolds();
    expect(t.db.store.get("bookings/booking001").clearing).toBe(true);
    const before = t.emails.length;
    t.clock.now = new Date(Date.parse(at("2026-11-17", "13:01")));
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 0, freed: 1 });
    const sent = t.emails.slice(before).map((m) => m.subject);
    expect(sent.some((s) => s.startsWith("Not booked:"))).toBe(true);
    expect(sent.some((s) => s.startsWith("[BOOKING] Payment didn't clear"))).toBe(true);
  });
});

describe("group classes", () => {
  const person = (n) => ({ name: `Person ${n}`, email: `p${n}@example.com` });
  async function withClass(extra = {}) {
    const t = setup();
    await t.seed();
    // Saturday 21 November 2026 at 14:00: outside the weekday hours, so the class's own times are what open it.
    const saved = await t.adm({ op: "saveService", service: { name: "Riso workshop", minutes: 120, gapAfter: 0, places: 3, classTimes: [{ weekday: 6, time: "14:00" }, { weekday: 6, time: "14:00" }, { weekday: 9, time: "10:00" }], ...extra } });
    return { t, id: saved.body.service.id, service: saved.body.service };
  }

  test("a class runs only at its own weekly times and says how many places are left", async () => {
    const { t, id, service } = await withClass();
    expect(service).toMatchObject({ places: 3, classTimes: [{ weekday: 6, time: "14:00" }] });
    expect((await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === id).places).toBe(3);
    const times = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-17", days: 7 })).body;
    expect(Object.values(times.days).flat()).toEqual([at("2026-11-21", "14:00")]);
    expect(times).toMatchObject({ places: 3, left: { [at("2026-11-21", "14:00")]: 3 } });
    // An ordinary service's answer carries no places.
    expect((await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-17", days: 1 })).body.left).toBeUndefined();
  });

  test("people share one start up to the places, then the class is full", async () => {
    const { t, id } = await withClass();
    const start = at("2026-11-21", "14:00");
    for (const n of [1, 2]) expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(n) })).statusCode).toBe(200);
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.left[start]).toBe(1);
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(3) })).statusCode).toBe(200);
    const full = await t.pub({ action: "bookingStart", serviceId: id, start, ...person(4) });
    expect(full.statusCode).toBe(409);
    expect(full.body).toMatchObject({ code: "taken", error: expect.stringContaining("filled up") });
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.days["2026-11-21"]).toEqual([]);
  });

  test("the website's Timetable lists a week of classes with places left, only while the shop sells Classes", async () => {
    const { t, id } = await withClass();
    const sell = async () => {
      await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
      await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    };
    // Bookings alone is not Classes: the page answers off.
    expect((await t.pub({ action: "classTimetable" })).body).toEqual({ on: false });
    await sell();
    const week = (await t.pub({ action: "classTimetable", from: "2026-11-16" })).body;
    expect(week).toMatchObject({ on: true, today: "2026-11-16", from: "2026-11-16", zone: expect.any(String), currency: expect.any(String) });
    // Only the class is listed (not the ordinary services), once, on its Saturday.
    expect(week.classes).toEqual([expect.objectContaining({ id, name: "Riso workshop", minutes: 120, places: 3 })]);
    const start = at("2026-11-21", "14:00");
    expect(week.sessions).toEqual([{ classId: id, day: "2026-11-21", start, left: 3 }]);
    // Places go down as people sign up, and a full class stays listed with none left (for the waiting list).
    for (const n of [1, 2]) await t.pub({ action: "bookingStart", serviceId: id, start, ...person(n) });
    expect((await t.pub({ action: "classTimetable", from: "2026-11-16" })).body.sessions).toEqual([{ classId: id, day: "2026-11-21", start, left: 1 }]);
    await t.pub({ action: "bookingStart", serviceId: id, start, ...person(3) });
    expect((await t.pub({ action: "classTimetable", from: "2026-11-16" })).body.sessions).toEqual([{ classId: id, day: "2026-11-21", start, left: 0 }]);
    // Next week's class is open again; a week long past reads as this week.
    expect((await t.pub({ action: "classTimetable", from: "2026-11-23" })).body.sessions).toEqual([{ classId: id, day: "2026-11-28", start: at("2026-11-28", "14:00"), left: 3 }]);
    expect((await t.pub({ action: "classTimetable", from: "2020-01-01" })).body.from).toBe("2026-11-16");
    // Nothing is listed past the last day Book a time offers: with 6 days ahead that is Saturday the 21st, with 5 it is Friday.
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 6 } });
    expect((await t.pub({ action: "classTimetable", from: "2026-11-16" })).body).toMatchObject({ lastDay: "2026-11-21", sessions: [{ day: "2026-11-21" }] });
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 5 } });
    expect((await t.pub({ action: "classTimetable", from: "2026-11-16" })).body).toMatchObject({ lastDay: "2026-11-20", sessions: [] });
    // Bookings paused: nothing to show.
    await t.adm({ op: "setLive", live: false });
    expect((await t.pub({ action: "classTimetable" })).body).toEqual({ on: false });
  });

  test("the website learns when to show its Classes links: Classes on, bookings on, and a class with weekly times", async () => {
    const t = setup();
    await t.seed();
    const site = async () => (await t.db.collection("settings").doc("website").get()).data();
    await t.db.collection("settings").doc("website").set({ design: {} });
    await t.adm({ op: "setLive", live: true });
    expect((await site()).classesLive).toBeUndefined();
    // The owner switches Classes on in Ways to sell (the page then sends `hint`): still no class to show.
    await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    await t.adm({ op: "hint" });
    expect((await site()).classesLive).toBeUndefined();
    const saved = await t.adm({ op: "saveService", service: { name: "Riso workshop", minutes: 120, places: 3, classTimes: [{ weekday: 6, time: "14:00" }] } });
    expect((await site()).classesLive).toBe(true);
    // Pausing bookings, deleting the class or switching Classes off each take the link down.
    await t.adm({ op: "setLive", live: false });
    expect(await site()).toMatchObject({ classesLive: false, bookingsLive: false });
    await t.adm({ op: "setLive", live: true });
    expect((await site()).classesLive).toBe(true);
    await t.db.collection("firstWeek").doc("start").set({ ways: {} });
    await t.adm({ op: "hint" });
    expect(await site()).toMatchObject({ classesLive: false, bookingsLive: true });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    await t.adm({ op: "hint" });
    expect((await site()).classesLive).toBe(true);
    await t.adm({ op: "deleteService", id: saved.body.service.id });
    expect((await site()).classesLive).toBe(false);
    // With the engine off altogether the hint still answers, and both links come down.
    await t.db.collection("platform").doc("features").set({});
    expect((await t.adm({ op: "hint" })).statusCode).toBe(200);
    expect(await site()).toMatchObject({ classesLive: false, bookingsLive: false });
  });

  test("the last place goes to one of two people asking at once", async () => {
    const { t, id } = await withClass({ places: 2 });
    const start = at("2026-11-21", "14:00");
    await t.pub({ action: "bookingStart", serviceId: id, start, ...person(1) });
    const both = await Promise.all([2, 3].map((n) => t.pub({ action: "bookingStart", serviceId: id, start, ...person(n) })));
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  test("a class still blocks other services at its time, and another booking blocks the class", async () => {
    const { t, id } = await withClass({ classTimes: [{ weekday: 2, time: "10:00" }] });
    const start = at("2026-11-17", "10:00");
    await t.pub({ action: "bookingStart", serviceId: id, start, ...person(1) });
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "11:00"), ...CUSTOMER })).statusCode).toBe(409);
    await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-24", "10:30"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: at("2026-11-24", "10:00"), ...person(2) })).statusCode).toBe(409);
  });

  test("cancelling gives the place back, and the owner can book and move people within the places", async () => {
    const { t, id } = await withClass({ places: 2 });
    const start = at("2026-11-21", "14:00");
    const first = await t.pub({ action: "bookingStart", serviceId: id, start, ...person(1) });
    await t.pub({ action: "bookingStart", serviceId: id, start, ...person(2) });
    expect((await t.adm({ op: "create", serviceId: id, start, ...person(3) })).statusCode).toBe(409);
    await t.adm({ op: "cancel", id: first.body.id });
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.left[start]).toBe(1);
    expect((await t.adm({ op: "create", serviceId: id, start, ...person(3) })).statusCode).toBe(200);
    // A fourth person booked for the next week can't be moved into the full class, and can once someone leaves.
    const next = await t.adm({ op: "create", serviceId: id, start: at("2026-11-28", "14:00"), ...person(4) });
    expect((await t.adm({ op: "move", id: next.body.id, start })).statusCode).toBe(409);
    const leaving = [...t.db.store.entries()].find(([k, v]) => k.startsWith("bookings/") && v.customer?.email === "p2@example.com")[0].split("/")[1];
    await t.adm({ op: "cancel", id: leaving });
    expect((await t.adm({ op: "move", id: next.body.id, start })).statusCode).toBe(200);
  });
});

describe("the waiting list", () => {
  const person = (n) => ({ name: `Person ${n}`, email: `p${n}@example.com` });
  const start = at("2026-11-21", "14:00");
  async function fullClass() {
    const t = setup();
    await t.seed();
    const saved = await t.adm({ op: "saveService", service: { name: "Riso workshop", minutes: 120, gapAfter: 0, places: 2, classTimes: [{ weekday: 6, time: "14:00" }] } });
    const id = saved.body.service.id;
    const booked = [];
    for (const n of [1, 2]) booked.push((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(n) })).body);
    t.emails.length = 0;
    return { t, id, booked };
  }
  const waitingEmails = (t) => t.emails.filter((m) => /A place is held for you/.test(m.subject));
  const offerIn = (m) => { const [, offer, offerKey] = m.html.match(/offer=([a-f0-9]{32})&#38;offerKey=([a-f0-9]{48})/) || []; return { offer, offerKey }; };

  test("a full class time is listed as full, and only a full time can be waited for", async () => {
    const { t, id } = await fullClass();
    const times = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 8 })).body;
    expect(times.full).toEqual({ "2026-11-21": [start] });
    expect((await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) })).body).toEqual({ ok: true });
    // The next week's class has room: book it instead.
    const open = await t.pub({ action: "bookingWait", serviceId: id, start: at("2026-11-28", "14:00"), ...person(3) });
    expect(open.statusCode).toBe(409);
    expect(open.body.code).toBe("open");
    // A time the class never runs at, a missing email and an unknown service are refused.
    expect((await t.pub({ action: "bookingWait", serviceId: id, start: at("2026-11-21", "09:00"), ...person(3) })).statusCode).toBe(400);
    expect((await t.pub({ action: "bookingWait", serviceId: id, start, name: "No Email" })).statusCode).toBe(400);
    expect((await t.pub({ action: "bookingWait", serviceId: "nope", start, ...person(3) })).statusCode).toBe(404);
  });

  test("asking twice keeps one entry, and the list stops at its cap", async () => {
    const { t, id } = await fullClass();
    for (let i = 0; i < 2; i += 1) await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    expect((await t.adm({ op: "waitlist", from: "2026-11-16", to: "2026-11-22" })).body.waiting).toHaveLength(1);
    for (let n = 4; n < 33; n += 1) expect((await t.pub({ action: "bookingWait", serviceId: id, start, ...person(n) })).statusCode).toBe(200);
    const over = await t.pub({ action: "bookingWait", serviceId: id, start, ...person(40) });
    expect(over.statusCode).toBe(409);
    expect(over.body.code).toBe("wait_full");
    // Someone already on the list can ask again at the cap.
    expect((await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) })).statusCode).toBe(200);
  });

  test("the first in line gets the freed place held for them, with a link that books it", async () => {
    const { t, id, booked } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    t.clock.now = new Date("2026-11-16T13:01:00Z");
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(4) });
    expect((await t.pub({ action: "bookingCancel", id: booked[0].id, key: booked[0].key })).statusCode).toBe(200);
    const told = waitingEmails(t);
    expect(told.map((m) => m.to)).toEqual(["p3@example.com"]);
    expect(told[0].html).toContain(`https://press.example/book?service=${id}&#38;day=2026-11-21&#38;offer=`);
    expect(told[0].html).toMatch(/held for you until 9:01/);
    const { offer, offerKey } = offerIn(told[0]);
    // Everyone else still sees the class as full and can't take the place.
    const others = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body;
    expect(others.full).toEqual({ "2026-11-21": [start] });
    expect(others.held).toBeUndefined();
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(5) })).statusCode).toBe(409);
    // A wrong key is no help; the right one shows the place as open and books it.
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(5), offer, offerKey: "b".repeat(48) })).statusCode).toBe(409);
    const theirs = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1, offer, offerKey })).body;
    expect(theirs.days["2026-11-21"]).toEqual([start]);
    expect(theirs.held).toEqual({ start, until: "2026-11-16T14:01:00.000Z" });
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(3), offer, offerKey })).statusCode).toBe(200);
    const list = (await t.adm({ op: "waitlist", from: "2026-11-21", to: "2026-11-21" })).body.waiting;
    expect(list.map((w) => w.email)).toEqual(["p4@example.com"]);
    expect(Object.keys(t.db.store.get("bookingDays/2026-11-21").items).filter((k) => k.startsWith("offer_"))).toEqual([]);
    // The hold is used up: the link can't book a second place.
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(6), offer, offerKey })).statusCode).toBe(409);
  });

  test("a hold that runs out goes to the next person in line", async () => {
    const { t, id, booked } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    t.clock.now = new Date("2026-11-16T13:01:00Z");
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(4) });
    await t.adm({ op: "cancel", id: booked[0].id });
    const first = offerIn(waitingEmails(t)[0]);
    t.clock.now = new Date("2026-11-16T13:30:00Z");
    expect(await t.desk.sweepWaitlist()).toEqual({ forgotten: 0, passedOn: 0 });
    expect((await t.adm({ op: "waitlist", from: "2026-11-21", to: "2026-11-21" })).body.waiting.find((w) => w.email === "p3@example.com").heldUntil).toBe("2026-11-16T14:01:00.000Z");
    t.clock.now = new Date("2026-11-16T14:05:00Z");
    expect(await t.desk.sweepWaitlist()).toEqual({ forgotten: 0, passedOn: 1 });
    expect(waitingEmails(t).map((m) => m.to)).toEqual(["p3@example.com", "p4@example.com"]);
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(3), ...first })).statusCode).toBe(409);
    expect((await t.pub({ action: "bookingStart", serviceId: id, start, ...person(4), ...offerIn(waitingEmails(t)[1]) })).statusCode).toBe(200);
  });

  test("the owner picks how long a place is held, and the person whose hold ran out is told", async () => {
    const { t, id, booked } = await fullClass();
    await t.adm({ op: "saveSettings", settings: { ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, waitHoldMinutes: 30 } });
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    await t.adm({ op: "cancel", id: booked[0].id });
    const { offer, offerKey } = offerIn(waitingEmails(t)[0]);
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1, offer, offerKey })).body.held.until).toBe("2026-11-16T13:30:00.000Z");
    t.clock.now = new Date("2026-11-16T13:31:00Z");
    expect(await t.desk.sweepWaitlist()).toEqual({ forgotten: 0, passedOn: 1 });
    const ended = t.emails.filter((m) => /Your held place has gone/.test(m.subject));
    expect(ended.map((m) => m.to)).toEqual(["p3@example.com"]);
    expect(ended[0].html).toContain(`/book?service=${id}`);
    // Nobody else waiting: the place is open to everyone again.
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.days["2026-11-21"]).toEqual([start]);
  });

  test("a held place stops blocking after its own end even if the sweep never runs", async () => {
    const { t, id, booked } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    await t.adm({ op: "cancel", id: booked[0].id });
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.days["2026-11-21"]).toEqual([]);
    t.clock.now = new Date("2026-11-16T14:16:00Z");
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-21", days: 1 })).body.days["2026-11-21"]).toEqual([start]);
  });

  test("removing the person holding a place passes it on, and asking again doesn't lose the hold", async () => {
    const { t, id, booked } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    t.clock.now = new Date("2026-11-16T13:01:00Z");
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(4) });
    await t.adm({ op: "cancel", id: booked[0].id });
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    const holder = (await t.adm({ op: "waitlist", from: "2026-11-21", to: "2026-11-21" })).body.waiting.find((w) => w.email === "p3@example.com");
    expect(holder.heldUntil).toBeTruthy();
    expect(holder.heldStart).toBe(start);
    await t.adm({ op: "removeWaiting", id: holder.id });
    expect(waitingEmails(t).map((m) => m.to)).toEqual(["p3@example.com", "p4@example.com"]);
  });

  test("the owner cancelling or moving someone out also tells the list", async () => {
    const { t, id, booked } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    expect((await t.adm({ op: "move", id: booked[0].id, start: at("2026-11-28", "14:00") })).statusCode).toBe(200);
    expect(waitingEmails(t).map((m) => m.to)).toEqual(["p3@example.com"]);
  });

  test("a full day of an ordinary service can be waited for, and opens when a time frees", async () => {
    const t = setup();
    await t.seed();
    await t.adm({ op: "saveSettings", settings: { ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, hours: DEFAULT_BOOKING_SETTINGS.hours.map((w, i) => (i === 2 ? [{ start: "10:00", end: "11:00" }] : w)) } });
    const open = await t.pub({ action: "bookingWait", serviceId: "visit", day: "2026-11-17", ...person(1) });
    expect(open.body.code).toBe("open");
    const only = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingWait", serviceId: "visit", day: "2026-11-17", ...person(1) })).body).toEqual({ ok: true });
    expect((await t.pub({ action: "bookingWait", serviceId: "visit", day: "2020-01-01", ...person(1) })).statusCode).toBe(400);
    // A closed day (Sunday) is never offered and can't be waited for; the booked-up day is offered.
    expect((await t.pub({ action: "bookingWait", serviceId: "visit", day: "2026-11-22", ...person(1) })).statusCode).toBe(400);
    expect((await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-17", days: 7 })).body.fullDays).toEqual(["2026-11-17"]);
    t.emails.length = 0;
    await t.pub({ action: "bookingCancel", id: only.body.id, key: only.body.key });
    expect(waitingEmails(t).map((m) => m.to)).toEqual(["p1@example.com"]);
  });

  test("the owner sees who is waiting and can remove one; past days are forgotten", async () => {
    const { t, id } = await fullClass();
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(3) });
    const list = (await t.adm({ op: "waitlist", from: "2026-11-16", to: "2026-11-22" })).body.waiting;
    expect(list).toMatchObject([{ serviceId: id, serviceName: "Riso workshop", day: "2026-11-21", start, name: "Person 3", email: "p3@example.com" }]);
    expect((await t.adm({ op: "removeWaiting", id: "not-an-id" })).statusCode).toBe(400);
    await t.adm({ op: "removeWaiting", id: list[0].id });
    expect((await t.adm({ op: "waitlist", from: "2026-11-16", to: "2026-11-22" })).body.waiting).toEqual([]);
    await t.pub({ action: "bookingWait", serviceId: id, start, ...person(4) });
    expect(await t.desk.sweepWaitlist()).toEqual({ forgotten: 0, passedOn: 0 });
    t.clock.now = new Date("2026-11-22T13:00:00Z");
    expect(await t.desk.sweepWaitlist()).toEqual({ forgotten: 1, passedOn: 0 });
  });
});

describe("deposits and paying at the visit", () => {
  const seedMore = async (t) => {
    await t.seed();
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25 });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
  };
  const bookColour = async (t) => {
    const r = await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_dep" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    return { r, view };
  };

  test("a service keeps a deposit only when it is less than its price", async () => {
    const t = setup();
    await t.seed();
    const base = { name: "Colour", minutes: 60, priceMinor: 14000, payment: "deposit" };
    expect((await t.adm({ op: "saveService", service: base })).statusCode).toBe(400);
    expect((await t.adm({ op: "saveService", service: { ...base, depositMinor: 14000 } })).statusCode).toBe(400);
    expect((await t.adm({ op: "saveService", service: { ...base, depositMinor: 20 } })).statusCode).toBe(400);
    expect((await t.adm({ op: "saveService", service: { ...base, depositPercent: 100 } })).statusCode).toBe(400);
    const saved = await t.adm({ op: "saveService", service: { ...base, depositMinor: 3000, depositPercent: 50 } });
    expect(saved.body.service).toMatchObject({ payment: "deposit", depositMinor: 3000, depositPercent: 0 });
  });

  test("the card page takes only the deposit, and the rest stays due at the visit", async () => {
    const t = setup();
    await seedMore(t);
    const { r, view } = await bookColour(t);
    expect(r.body.status).toBe("held");
    expect(t.opened[0].params.line_items[0].price_data).toMatchObject({ unit_amount: 3500, product_data: { name: "Moth Press: Colour (deposit)" } });
    expect(view.body.booking).toMatchObject({ status: "confirmed", payment: "deposit", paid: false, depositPaid: true, depositMinor: 3500, priceMinor: 14000, dueMinor: 10500 });
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ paid: false, depositPaid: true, paymentIntent: "pi_dep" });
    const email = t.emails.find((e) => e.to === "ada@example.com").html;
    expect(email).toMatch(/Deposit paid:<\/strong> \$35\.00/);
    expect(email).toMatch(/To pay at your visit:<\/strong> \$105\.00/);
  });

  test("a card page paid for another amount never confirms a deposit booking", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_x", amount_total: 100 });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking).toMatchObject({ status: "held", depositPaid: false });
  });

  test("the owner marks the rest paid at the shop, and only once a deposit is in", async () => {
    const t = setup();
    await seedMore(t);
    const { r } = await bookColour(t);
    expect((await t.adm({ op: "paidAtShop", id: r.body.id })).statusCode).toBe(200);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ paid: true, depositPaid: true });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking).toMatchObject({ paid: true, dueMinor: 0 });
    // A booking paid in full by card has nothing due at the shop.
    const full = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-19", "13:00"), ...CUSTOMER });
    expect((await t.adm({ op: "paidAtShop", id: full.body.id })).statusCode).toBe(409);
  });

  test("the customer's own cancel refunds the deposit, never the whole price", async () => {
    const t = setup();
    await seedMore(t);
    const { r } = await bookColour(t);
    const c = await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(c.body.booking).toMatchObject({ status: "cancelled", refunded: true, dueMinor: 0 });
    expect(t.refunds).toEqual([expect.objectContaining({ amountMinor: 3500, paymentIntentId: "pi_dep", idempotencyKey: "booking-refund-booking001" })]);
    expect(t.emails.at(-2).html + t.emails.at(-1).html).toMatch(/Your deposit is being refunded/);
  });

  test("the owner can keep the deposit, give part back, and never more than the deposit", async () => {
    const t = setup();
    await seedMore(t);
    const { r } = await bookColour(t);
    expect((await t.adm({ op: "cancel", id: r.body.id, refundMinor: 14000 })).statusCode).toBe(400);
    const c = await t.adm({ op: "cancel", id: r.body.id, refundMinor: 1000 });
    expect(c.body).toEqual({ ok: true, refunded: true, refundMinor: 1000 });
    expect(t.emails.at(-1).html).toMatch(/\$10\.00 of your deposit is being refunded/);
  });

  test("a service paid at the visit is booked at once with its price due, and the owner marks it paid", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    expect(r.body.status).toBe("confirmed");
    expect(t.opened).toHaveLength(0);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ payment: "atShop", priceMinor: 6000, paid: false });
    expect(t.emails[0].html).toMatch(/To pay at your visit:<\/strong> \$60\.00/);
    expect((await t.adm({ op: "paidAtShop", id: r.body.id })).statusCode).toBe(200);
    expect(t.db.store.get("bookings/booking001").paid).toBe(true);
  });

  test("the owner booking someone into a deposit service takes nothing by card: all of it is due at the visit", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.adm({ op: "create", serviceId: "colour", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    expect(t.db.store.get(`bookings/${r.body.id}`)).toMatchObject({ payment: "atShop", priceMinor: 14000, paid: false });
  });
});

describe("card on file and the missed-booking fee", () => {
  const seedCards = async (t) => {
    await t.seed();
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000, holdCard: true, lateFeeMinor: 3000 });
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25, holdCard: true, lateFeeMinor: 5000 });
  };
  /** Books the cut at 15:00 on the 18th and finishes its card page. */
  const bookCut = async (t) => {
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { status: "complete" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    return { r, view };
  };

  test("a service paid at the visit saves a card on a page that takes nothing, and the booking says so", async () => {
    const t = setup();
    await seedCards(t);
    const info = await t.pub({ action: "bookingInfo" });
    expect(info.body.services.find((s) => s.id === "cut")).toMatchObject({ holdCard: true, lateFeeMinor: 3000 });
    const { r, view } = await bookCut(t);
    expect(r.body.status).toBe("held");
    expect(t.opened[0].params).toMatchObject({ mode: "setup", currency: "cad", customer_creation: "always", customer_email: "ada@example.com", metadata: { booking: "booking001" } });
    expect(t.opened[0].params.line_items).toBeUndefined();
    expect(view.body.booking).toMatchObject({ status: "confirmed", payment: "atShop", paid: false, dueMinor: 6000, cardHold: true, lateFeeMinor: 3000, cardLast4: "4242" });
    expect(JSON.stringify(view.body.booking)).not.toMatch(/pm_ada|cus_ada/);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ card: { customer: "cus_ada", paymentMethod: "pm_ada", last4: "4242", mode: "test" } });
    expect(t.db.store.get("bookings/booking001").paymentIntent).toBeUndefined();
    const email = t.emails.find((e) => e.to === "ada@example.com").html;
    expect(email).toMatch(/Card on file:<\/strong> Visa ending 4242\. Missing this booking, or cancelling less than 24 hours before, may cost \$30\.00/);
  });

  test("a card page left unfinished never confirms, and a deposit page also saves the card", async () => {
    const t = setup();
    await seedCards(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking.status).toBe("held");
    await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-19", "13:00"), ...CUSTOMER });
    expect(t.opened[1].params).toMatchObject({ mode: "payment", customer_creation: "always", payment_intent_data: { setup_future_usage: "off_session" } });
  });

  test("the owner charges the fee once after a no-show, never before it starts or above what was agreed", async () => {
    const t = setup();
    await seedCards(t);
    const { r } = await bookCut(t);
    expect((await t.adm({ op: "chargeFee", id: r.body.id })).body.code).toBe("too_soon");
    t.clock.now = new Date("2026-11-18T21:00:00Z");
    expect((await t.adm({ op: "chargeFee", id: r.body.id, amountMinor: 3100 })).statusCode).toBe(400);
    const charged = await t.adm({ op: "chargeFee", id: r.body.id, amountMinor: 2000 });
    expect(charged.statusCode).toBe(200);
    expect(t.charges).toEqual([{ args: expect.objectContaining({ customer: "cus_ada", paymentMethod: "pm_ada", amountMinor: 2000, currency: "cad", metadata: { booking: "booking001", fee: "missed booking" } }), idem: "booking-fee-booking001-2000" }]);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ fee: { intent: "pi_fee_1", amountMinor: 2000, reason: "missed booking" }, feeCharging: null });
    const receipt = t.emails.at(-1);
    expect(receipt).toMatchObject({ to: "ada@example.com", subject: expect.stringMatching(/^Fee charged: Cut/) });
    expect(receipt.html).toMatch(/charged \$20\.00 to your card ending 4242 for missing this booking/);
    expect((await t.adm({ op: "chargeFee", id: r.body.id })).body.code).toBe("charged");
    expect(t.charges).toHaveLength(1);
  });

  test("a late cancel by the shop can carry the fee; the customer's own cancel in time never does", async () => {
    const t = setup();
    await seedCards(t);
    const { r } = await bookCut(t);
    await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect((await t.adm({ op: "chargeFee", id: r.body.id })).statusCode).toBe(409);
    const t2 = setup();
    await seedCards(t2);
    const second = await bookCut(t2);
    await t2.adm({ op: "cancel", id: second.r.body.id });
    expect((await t2.adm({ op: "chargeFee", id: second.r.body.id })).body.fee).toMatchObject({ amountMinor: 3000, reason: "late cancellation" });
  });

  test("a declined card takes nothing, says so plainly, and can be tried again", async () => {
    const t = setup({ decline: "card_declined" });
    await seedCards(t);
    const { r } = await bookCut(t);
    t.clock.now = new Date("2026-11-18T21:00:00Z");
    const tried = await t.adm({ op: "chargeFee", id: r.body.id });
    expect(tried.statusCode).toBe(402);
    expect(tried.body.error).toMatch(/declined, so nothing was taken/);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ feeCharging: null });
    expect(t.db.store.get("bookings/booking001").fee).toBeUndefined();
    expect(t.db.store.get("bookings/booking001").history.at(-1).what).toBe("fee declined by the card");
  });

  test("a Square shop books the same service without keeping a card", async () => {
    const t = setup({ provider: "square" });
    await seedCards(t);
    const info = await t.pub({ action: "bookingInfo" });
    expect(info.body.services.find((s) => s.id === "cut").holdCard).toBeUndefined();
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    expect(r.body.status).toBe("confirmed");
    expect(t.opened).toHaveLength(0);
  });
});

describe("paying the rest by link", () => {
  const seedMore = async (t) => {
    await t.seed();
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25 });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
  };
  const bookColour = async (t) => {
    const r = await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_dep" });
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    return r;
  };
  const payRestPage = (t, id, intent = "pi_rest") => Object.assign(t.sessions.get(id), { payment_status: "paid", status: "complete", payment_intent: intent });

  test("the customer pays what is left after a deposit and the booking is paid in full", async () => {
    const t = setup();
    await seedMore(t);
    const r = await bookColour(t);
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ canPayRest: true, restPaidMinor: 0, dueMinor: 10500 });
    const pay = await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key });
    expect(pay.body.url).toBe("https://pay.example/cs_test_00000001");
    expect(t.opened[1].params).toMatchObject({ mode: "payment", metadata: { booking: "booking001", rest: "1" }, success_url: `https://press.example/book?booking=booking001&key=${r.body.key}` });
    expect(t.opened[1].params.line_items[0].price_data).toMatchObject({ unit_amount: 10500, product_data: { name: "Moth Press: Colour (the rest)" } });
    // Tapping again while the page is open opens no second one.
    expect((await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key })).body.url).toBe(pay.body.url);
    expect(t.opened).toHaveLength(2);
    payRestPage(t, "cs_test_00000001");
    const after = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(after.body.booking).toMatchObject({ dueMinor: 0, canPayRest: false, restPaidMinor: 10500 });
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ restOpen: false, rest: { amountMinor: 10500, paymentIntent: "pi_rest", session: "cs_test_00000001" } });
    const receipt = t.emails.find((e) => e.subject.startsWith("Paid in full"));
    expect(receipt.to).toBe("ada@example.com");
    expect(receipt.html).toMatch(/You paid \$105\.00 by card/);
    expect(t.emails.some((e) => e.to === "owner@example.com" && /Paid in full/.test(e.subject))).toBe(true);
    // Paid in full: nothing more to pay, and no second receipt.
    expect((await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key })).statusCode).toBe(409);
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(t.emails.filter((e) => e.subject.startsWith("Paid in full"))).toHaveLength(1);
  });

  test("the owner's pay link works every time, emails the client and opens only this booking", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    const link = await t.adm({ op: "payLink", id: r.body.id });
    expect(link.body).toMatchObject({ ok: true, dueMinor: 6000, sent: false });
    const key = new URL(link.body.url).searchParams.get("key");
    expect((await t.adm({ op: "payLink", id: r.body.id, send: true })).body.url).toBe(link.body.url);
    const mail = t.emails.at(-1);
    expect(mail).toMatchObject({ to: "ada@example.com", subject: expect.stringMatching(/^Left to pay: Cut/) });
    expect(mail.html).toMatch(/Pay \$60\.00/);
    expect(mail.html).toContain(link.body.url.replace(/&/g, "&#38;"));
    // The link opens the booking page and pays.
    expect((await t.pub({ action: "bookingView", id: r.body.id, key })).body.booking).toMatchObject({ canPayRest: true, dueMinor: 6000 });
    expect((await t.pub({ action: "bookingView", id: "booking999", key })).statusCode).toBe(404);
    await t.pub({ action: "bookingPayRest", id: r.body.id, key });
    payRestPage(t, "cs_test_00000000");
    // The five-minute sweep keeps it even if the client never comes back to the page.
    await t.desk.sweepHolds();
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ restOpen: false, rest: { amountMinor: 6000 } });
    expect((await t.adm({ op: "payLink", id: r.body.id })).statusCode).toBe(409);
    expect((await t.adm({ op: "paidAtShop", id: r.body.id })).body).toMatchObject({ code: "paid_by_card" });
  });

  test("a payment at the desk for someone with no booking pays by the same link, and takes no time", async () => {
    const t = setup();
    await seedMore(t);
    expect((await t.adm({ op: "walkIn", serviceId: "nope", name: "Gil Example" })).statusCode).toBe(404);
    expect((await t.adm({ op: "walkIn", serviceId: "cut", name: "" })).statusCode).toBe(400);
    expect((await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", email: "not-an-email" })).statusCode).toBe(400);
    expect((await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", priceMinor: 20 })).body.code).toBe("amount");
    const w = await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", priceMinor: 4500 });
    expect(w.body).toMatchObject({ ok: true, dueMinor: 4500 });
    const saved = t.db.store.get(`bookings/${w.body.id}`);
    expect(saved).toMatchObject({ status: "confirmed", payment: "atShop", priceMinor: 4500, listPriceMinor: 6000, source: "desk", walkIn: true, customer: { name: "Gil Example", email: "" } });
    expect(saved.start).toBe(t.clock.now.toISOString());
    // No calendar time was taken and no email went out.
    expect([...t.db.store.keys()].some((k) => k.startsWith("bookingDays/"))).toBe(false);
    expect(t.emails).toHaveLength(0);
    // The QR code's link is the owner's pay link, the same every time, and the client pays from it.
    expect((await t.adm({ op: "payLink", id: w.body.id })).body.url).toBe(w.body.url);
    const key = new URL(w.body.url).searchParams.get("key");
    expect((await t.pub({ action: "bookingView", id: w.body.id, key })).body.booking).toMatchObject({ canPayRest: true, dueMinor: 4500 });
    // At the shop's price when none is typed.
    expect((await t.adm({ op: "walkIn", serviceId: "cut", name: "Hal Example", email: "hal@example.com" })).body.dueMinor).toBe(6000);
  });

  test("card readers: added with the reader's code at the shop's address, listed and removed", async () => {
    const t = setup();
    await seedMore(t);
    expect((await t.adm({ op: "readers" })).body).toEqual({ available: true, testMode: true, pairsWithCode: false, readers: [] });
    // The reader's place needs the shop's street address.
    expect((await t.adm({ op: "readerAdd", code: "simulated-wpe" })).body.code).toBe("address");
    await t.db.collection("settings").doc("website").set({ location: { street: "456 Montrose Ave", city: "Toronto", state: "Ontario", zip: "M6G 3H1", country: "Canada" } });
    expect((await t.adm({ op: "readerAdd", code: "no good" })).statusCode).toBe(400);
    expect((await t.adm({ op: "readerAdd", code: "wrong-code" })).body.error).toMatch(/didn't work/);
    const added = await t.adm({ op: "readerAdd", code: "simulated-wpe", label: "Front desk" });
    expect(added.body).toMatchObject({ ok: true, reader: { id: "tmr_1", label: "Front desk" } });
    expect(t.terminal.places).toEqual([{ name: "Moth Press", address: { line1: "456 Montrose Ave", city: "Toronto", country: "CA", postal_code: "M6G 3H1", state: "ON" } }]);
    await t.adm({ op: "readerAdd", code: "simulated-wpe", label: "Back room" });
    expect(t.terminal.places).toHaveLength(1);
    expect((await t.adm({ op: "readers" })).body.readers.map((r) => r.label)).toEqual(["Front desk", "Back room"]);
    expect((await t.adm({ op: "readerRemove", readerId: "tmr_2" })).statusCode).toBe(200);
    expect((await t.adm({ op: "readers" })).body.readers).toHaveLength(1);
    // A shop with no card payments has none.
    const none = setup({ checkout: null });
    await seedMore(none);
    expect((await none.adm({ op: "readers" })).body).toEqual({ available: false, readers: [] });
  });

  test("Square Terminals: the shop gives a code to type on the Terminal, with no street address needed", async () => {
    const t = setup({ provider: "square" });
    await seedMore(t);
    expect((await t.adm({ op: "readers" })).body).toEqual({ available: true, testMode: true, pairsWithCode: true, readers: [] });
    const added = await t.adm({ op: "readerAdd", label: "Front desk" });
    expect(added.body).toEqual({ ok: true, pairing: { code: "EBCARJ", pairBy: "2026-11-16T13:05:00Z" } });
    expect(t.terminal.pairings).toEqual(["Front desk"]);
    expect((await t.adm({ op: "readers" })).body.readers.map((r) => [r.id, r.label])).toEqual([["sqdev_DEV1", "Front desk"]]);
  });

  test("tips on the reader: asked when the shop asks for tips, kept apart from the rest, refunded with the payment", async () => {
    for (const provider of ["stripe", "square"]) {
      const t = setup({ provider });
      await seedMore(t);
      await t.db.collection("settings").doc("website").set({ location: { street: "456 Montrose Ave", city: "Toronto", state: "ON", zip: "M6G3H1", country: "CA" } });
      const s = (await t.db.collection("bookingSettings").doc("main").get()).data();
      await t.db.collection("bookingSettings").doc("main").set({ ...s, tips: true, tipPercents: [15, 18, 20] });
      const readerId = provider === "stripe" ? "tmr_1" : "sqdev_DEV1";
      await t.adm({ op: "readerAdd", code: "simulated-wpe", label: "Front desk" });
      const w = await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", email: "gil@example.com", priceMinor: 4500 });
      expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId })).body.state).toBe("waiting");
      const [intentId, intent] = [...t.terminal.intents.entries()][0];
      expect(intent.tipPercents).toEqual([15, 18, 20]);
      // Stripe sets the choices on the reader's place once; Square takes them with each payment.
      expect(t.terminal.tipSettings).toEqual(provider === "stripe" ? [{ place: "tml_1", currency: "CAD", percents: [15, 18, 20], config: null }] : []);
      // The customer adds $8.10 on the reader.
      Object.assign(intent, { status: "succeeded", tipMinor: 810 });
      expect((await t.adm({ op: "readerCheck", id: w.body.id })).body).toMatchObject({ state: "paid", dueMinor: 0 });
      const paidWith = provider === "stripe" ? intentId : "sqpay_PAY1";
      const b = t.db.store.get(`bookings/${w.body.id}`);
      expect(b).toMatchObject({ rest: { amountMinor: 4500, paymentIntent: paidWith, reader: true }, tip: { amountMinor: 810, paymentIntent: paidWith, reader: true } });
      expect(b.history.at(-1).what).toMatch(/paid on the card reader, \$8\.10 tip added/);
      // A second charge on the same day reuses the tip choices without setting them again.
      const w2 = await t.adm({ op: "walkIn", serviceId: "cut", name: "Hal Example", priceMinor: 3000 });
      await t.adm({ op: "readerCharge", id: w2.body.id, readerId });
      expect(t.terminal.tipSettings).toHaveLength(provider === "stripe" ? 1 : 0);
      // With tips off, no tip screen.
      await t.db.collection("bookingSettings").doc("main").set({ ...s, tips: false });
      await t.adm({ op: "readerCancel", id: w2.body.id });
      await t.adm({ op: "readerCharge", id: w2.body.id, readerId });
      expect([...t.terminal.intents.values()].at(-1).tipPercents).toEqual([]);
    }
  });

  test("a payment on the card reader is kept as the rest, closes the pay page, and can't be paid twice", async () => {
    const t = setup();
    await seedMore(t);
    await t.db.collection("settings").doc("website").set({ location: { street: "456 Montrose Ave", city: "Toronto", state: "ON", zip: "M6G3H1", country: "CA" } });
    await t.adm({ op: "readerAdd", code: "simulated-wpe", label: "Front desk" });
    const w = await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", email: "gil@example.com", priceMinor: 4500 });
    const key = new URL(w.body.url).searchParams.get("key");
    // A pay page they opened is closed before the reader is used.
    await t.pub({ action: "bookingPayRest", id: w.body.id, key });
    expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId: "bad" })).statusCode).toBe(400);
    const sent = await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" });
    expect(sent.body).toMatchObject({ ok: true, state: "waiting" });
    expect(t.closed).toContain("cs_test_00000000");
    expect(t.terminal.intents.get("pi_reader_1")).toMatchObject({ amountMinor: 4500, metadata: { booking: w.body.id, reader: "1" }, key: `booking-reader-${w.body.id}-4500-1` });
    // While it is on the reader: no second charge, no pay page, no "paid another way".
    expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" })).body.code).toBe("reader_busy");
    expect((await t.pub({ action: "bookingPayRest", id: w.body.id, key })).body.code).toBe("reader_busy");
    expect((await t.adm({ op: "paidAtShop", id: w.body.id })).body.code).toBe("reader_busy");
    expect((await t.adm({ op: "readerCheck", id: w.body.id })).body.state).toBe("waiting");
    // The test card taps: paid, as the rest, with the receipt.
    expect((await t.adm({ op: "readerTest", id: w.body.id })).body).toMatchObject({ state: "paid", dueMinor: 0 });
    expect(t.db.store.get(`bookings/${w.body.id}`)).toMatchObject({ readerOpen: false, rest: { amountMinor: 4500, paymentIntent: "pi_reader_1", reader: true } });
    expect(t.emails.some((m) => m.to === "gil@example.com" && /Paid in full/.test(m.subject))).toBe(true);
    expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" })).body.code).toBe("nothing_due");
    // A cancel then refunds the reader's payment like any other.
    await t.adm({ op: "cancel", id: w.body.id, refund: true });
    expect(t.refunds[0]).toMatchObject({ paymentIntentId: "pi_reader_1", amountMinor: 4500 });
  });

  test("a declined card, a cancel, an offline reader and a payment left on the reader", async () => {
    const t = setup();
    await seedMore(t);
    await t.db.collection("settings").doc("website").set({ location: { street: "456 Montrose Ave", city: "Toronto", zip: "M6G3H1", country: "Canada" } });
    await t.adm({ op: "readerAdd", code: "simulated-wpe" });
    const w = await t.adm({ op: "walkIn", serviceId: "cut", name: "Gil Example", priceMinor: 4500 });
    await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" });
    // Declined on the reader: closed with the reader's words, and a new try uses a new payment.
    t.terminal.intents.get("pi_reader_1").error = "Your card was declined.";
    t.terminal.readers.get("tmr_1").action = { status: "failed", error: "Your card was declined.", intent: "pi_reader_1" };
    expect((await t.adm({ op: "readerCheck", id: w.body.id })).body).toMatchObject({ state: "idle", error: "Your card was declined." });
    expect(t.terminal.cancelled).toContain("pi_reader_1");
    expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" })).body.state).toBe("waiting");
    expect(t.terminal.intents.get("pi_reader_2").key).toBe(`booking-reader-${w.body.id}-4500-2`);
    // Cancelled by the owner.
    expect((await t.adm({ op: "readerCancel", id: w.body.id })).body).toMatchObject({ state: "idle" });
    expect(t.db.store.get(`bookings/${w.body.id}`).readerOpen).toBe(false);
    // An offline reader: a plain message and nothing left open; the next try doesn't reuse the stopped payment.
    t.terminal.offline = true;
    expect((await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" })).body.error).toMatch(/offline/);
    expect(t.db.store.get(`bookings/${w.body.id}`).readerOpen).toBe(false);
    t.terminal.offline = false;
    await t.adm({ op: "readerCharge", id: w.body.id, readerId: "tmr_1" });
    expect(t.terminal.intents.get("pi_reader_3").key).toBe(`booking-reader-${w.body.id}-4500-4`);
    // Left on the reader: the sweep keeps a payment that went through, and stops one left too long.
    t.clock.now = new Date(t.clock.now.getTime() + 20 * 60_000);
    await t.desk.sweepHolds();
    expect(t.db.store.get(`bookings/${w.body.id}`)).toMatchObject({ readerOpen: false, readerError: "The card reader payment ran out of time." });
    expect(t.terminal.cancelled).toContain("pi_reader_3");
  });

  test("marking it paid at the shop closes the open pay page", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key });
    expect((await t.adm({ op: "paidAtShop", id: r.body.id })).statusCode).toBe(200);
    expect(t.closed).toContain("cs_test_00000000");
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ paid: true, restOpen: false });
  });

  test("a cancel refunds the rest's payment first, then the deposit", async () => {
    const t = setup();
    await seedMore(t);
    const r = await bookColour(t);
    await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key });
    payRestPage(t, "cs_test_00000001");
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    const c = await t.adm({ op: "cancel", id: r.body.id, refundMinor: 12000 });
    expect(c.body).toEqual({ ok: true, refunded: true, refundMinor: 12000 });
    expect(t.refunds).toEqual([
      expect.objectContaining({ paymentIntentId: "pi_rest", amountMinor: 10500, idempotencyKey: "booking-refund-booking001-rest-12000" }),
      expect.objectContaining({ paymentIntentId: "pi_dep", amountMinor: 1500, idempotencyKey: "booking-refund-booking001-12000" }),
    ]);
    expect(t.db.store.get("bookings/booking001").refund).toMatchObject({ amountMinor: 12000, refundIds: ["re_1", "re_2"] });
    expect(t.emails.at(-1).html).toMatch(/\$120\.00 of your payment is being refunded/);
  });

  test("an unpaid page that runs out stops being checked", async () => {
    const t = setup();
    await seedMore(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key });
    t.clock.now = new Date(t.clock.now.getTime() + 61 * 60_000);
    await t.desk.sweepHolds();
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ restOpen: false, paid: false });
    expect(t.closed).toContain("cs_test_00000000");
    // A booking with nothing left to pay has no button.
    const free = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-19", "10:00"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingPayRest", id: free.body.id, key: free.body.key })).body.code).toBe("nothing_due");
  });
});

describe("discount codes on bookings", () => {
  // Like the shop's own lookup (index.js fetchValidDiscount): a plain Error in the customer's words when the code is wrong.
  const lookup = (db) => async (code) => {
    const hit = (await db.collection("discounts").where("code", "==", code).limit(1).get()).docs[0];
    if (!hit) throw new Error("That code isn't valid.");
    return { id: hit.id, ...hit.data() };
  };

  const ready = async (discount = {}) => {
    let db;
    const t = setup({ findDiscount: async (code, email) => lookup(db)(code, email) });
    db = t.db;
    await t.seed();
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25 });
    await t.db.collection("discounts").doc("d1").set({ code: "SPRING", type: "percentage", value: 20, isActive: true, forBookings: true, usageCount: 0, ...discount });
    return t;
  };
  const book = (t, extra = {}) => t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "10:00"), ...CUSTOMER, ...extra });

  test("the booking form offers a code box only when a code works on bookings", async () => {
    const t = await ready({ forBookings: false });
    expect((await t.pub({ action: "bookingInfo" })).body.codes).toBe(false);
    await t.db.collection("discounts").doc("d1").set({ forBookings: true }, { merge: true });
    expect((await t.pub({ action: "bookingInfo" })).body.codes).toBe(true);
  });

  test("a code takes its share off the price, and the card page asks for the lower amount", async () => {
    const t = await ready();
    const tried = await t.pub({ action: "bookingCode", serviceId: "review", code: " spring ", email: CUSTOMER.email });
    expect(tried.body).toEqual({ code: "SPRING", discountMinor: 800, priceMinor: 3200, payNowMinor: 3200 });
    const r = await book(t, { code: "spring" });
    expect(r.statusCode).toBe(200);
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(3200);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ priceMinor: 3200, listPriceMinor: 4000, discount: { id: "d1", code: "SPRING", amountMinor: 800 } });
    expect(t.db.store.get("discounts/d1").usageCount).toBe(1);
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_1" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ status: "confirmed", paid: true, priceMinor: 3200, discountCode: "SPRING", discountMinor: 800 });
    expect(t.emails.find((e) => e.to === "ada@example.com").html).toMatch(/Discount \(SPRING\):<\/strong> \$8\.00 off/);
  });

  test("a deposit is worked out on the price after the code", async () => {
    const t = await ready();
    const tried = await t.pub({ action: "bookingCode", serviceId: "colour", code: "SPRING", email: CUSTOMER.email });
    expect(tried.body).toMatchObject({ priceMinor: 11200, payNowMinor: 2800 });
    await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER, code: "SPRING" });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(2800);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ payment: "deposit", priceMinor: 11200, depositMinor: 2800 });
  });

  test("codes not marked for bookings, or not a plain amount off, are refused in the customer's words", async () => {
    for (const discount of [{ forBookings: false }, { type: "freeship" }, { appliesTo: "products" }, { method: "automatic" }]) {
      const t = await ready(discount);
      const r = await t.pub({ action: "bookingCode", serviceId: "review", code: "SPRING", email: CUSTOMER.email });
      expect(r.statusCode).toBe(400);
      expect(r.body).toEqual({ error: "This code can't be used on bookings.", code: "code" });
    }
    const t = await ready();
    expect((await t.pub({ action: "bookingCode", serviceId: "review", code: "NOPE" })).body).toEqual({ error: "That code isn't valid.", code: "code" });
    expect((await t.pub({ action: "bookingCode", serviceId: "visit", code: "SPRING" })).statusCode).toBe(400);
    expect((await book(t, { code: "NOPE" })).statusCode).toBe(400);
    expect(t.db.store.has("bookings/booking001")).toBe(false);
  });

  test("a code that leaves too little to pay by card is refused rather than changed", async () => {
    const t = await ready({ type: "fixed", value: 39.8 });
    expect((await t.pub({ action: "bookingCode", serviceId: "review", code: "SPRING" })).statusCode).toBe(400);
    const free = await ready({ type: "fixed", value: 50 });
    const r = await book(free, { code: "SPRING" });
    expect(r.body.status).toBe("confirmed");
    expect(free.db.store.get("bookings/booking001")).toMatchObject({ priceMinor: 0, payment: "free", discount: { amountMinor: 4000 } });
  });

  test("the usage limit counts bookings, and a cancelled booking gives its use back", async () => {
    const t = await ready({ usageLimit: 1 });
    const first = await book(t, { code: "SPRING" });
    expect(t.db.store.get("discounts/d1").usageCount).toBe(1);
    const second = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "14:00"), name: "Bo", email: "bo@example.com", code: "SPRING" });
    expect(second.statusCode).toBe(409);
    expect(second.body.code).toBe("code");
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_1" });
    await t.pub({ action: "bookingView", id: first.body.id, key: first.body.key });
    expect((await t.pub({ action: "bookingCancel", id: first.body.id, key: first.body.key })).statusCode).toBe(200);
    expect(t.db.store.get("discounts/d1").usageCount).toBe(0);
    expect(t.db.store.get("bookings/booking001").discount.returned).toBe(true);
  });

  test("one use per customer counts their bookings too", async () => {
    const t = await ready({ onePerCustomer: true });
    await book(t, { code: "SPRING" });
    const again = await t.pub({ action: "bookingCode", serviceId: "review", code: "SPRING", email: "ADA@example.com" });
    expect(again.body).toEqual({ error: "You have already used this code.", code: "code" });
    expect((await t.pub({ action: "bookingCode", serviceId: "review", code: "SPRING", email: "bo@example.com" })).statusCode).toBe(200);
  });
});

describe("tips", () => {
  const seedTips = async (t, tips = true) => {
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, tips, tipPercents: [15, 20] });
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25 });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
  };
  const paid = (t, id, intent = "pi_tip") => Object.assign(t.sessions.get(id), { payment_status: "paid", status: "complete", payment_intent: intent });

  test("a tip rides on paying what's left, and never on a refund", async () => {
    const t = setup();
    await seedTips(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_dep" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ tipPercents: [15, 20], canPayRest: true, canTip: false, tipMinor: 0, tipLimitMinor: 14000 });
    // Too big, too small or not a whole number of cents: refused.
    for (const tipMinor of [14001, 10, 12.5]) expect((await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key, tipMinor })).body.code).toBe("bad_tip");
    const pay = await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key, tipMinor: 2100 });
    expect(t.opened.at(-1).params.line_items[0].price_data).toMatchObject({ unit_amount: 12600, product_data: { name: "Moth Press: Colour (the rest and a tip)" } });
    expect(t.opened.at(-1).params.metadata).toMatchObject({ booking: "booking001", tip: "2100" });
    paid(t, pay.body.url.split("/").pop(), "pi_rest");
    const after = (await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking;
    expect(after).toMatchObject({ dueMinor: 0, restPaidMinor: 10500, tipMinor: 2100, canTip: false, tipPercents: [15, 20] });
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ rest: { amountMinor: 10500, paymentIntent: "pi_rest" }, tip: { amountMinor: 2100, paymentIntent: "pi_rest" } });
    expect(t.emails.find((e) => e.subject.startsWith("Paid in full")).html).toMatch(/with a \$21\.00 tip/);
    // A full refund gives back the price, and the tip stays with the team.
    const c = await t.adm({ op: "cancel", id: r.body.id, refund: true });
    expect(c.body).toMatchObject({ refunded: true, refundMinor: 14000 });
    expect(t.refunds.map((x) => [x.paymentIntentId, x.amountMinor])).toEqual([["pi_rest", 10500], ["pi_dep", 3500]]);
  });

  test("a shop that doesn't ask for tips takes none", async () => {
    const t = setup();
    await seedTips(t, false);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking).toMatchObject({ tipPercents: [], canTip: false });
    expect((await t.pub({ action: "bookingPayRest", id: r.body.id, key: r.body.key, tipMinor: 900 })).body.code).toBe("bad_tip");
    t.clock.now = new Date("2026-11-18T23:00:00Z");
    expect(await t.desk.sweepTips()).toEqual({ asked: 0 });
  });

  test("after a paid visit, one Add a tip email whose link adds a tip", async () => {
    const t = setup();
    await seedTips(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    await t.adm({ op: "paidAtShop", id: r.body.id });
    // Not before the visit, nor straight after it.
    expect((await t.pub({ action: "bookingTip", id: r.body.id, key: r.body.key, tipMinor: 900 })).body.code).toBe("no_tip");
    t.clock.now = new Date(Date.parse(at("2026-11-18", "15:30")) + 30 * 60_000);
    expect(await t.desk.sweepTips()).toEqual({ asked: 0 });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "15:30")) + 2.5 * 3_600_000);
    expect(await t.desk.sweepTips()).toEqual({ asked: 1 });
    expect(await t.desk.sweepTips()).toEqual({ asked: 0 });
    const mail = t.emails.at(-1);
    expect(mail).toMatchObject({ to: "ada@example.com", subject: "Thank you for coming: Cut" });
    expect(mail.html).toMatch(/Add a tip/);
    expect(mail.html).not.toMatch(/Add to Google Calendar/);
    const key = mail.html.match(/key=([a-f0-9]{48})/)[1];
    const view = (await t.pub({ action: "bookingView", id: r.body.id, key })).body.booking;
    expect(view).toMatchObject({ canTip: true, canPayRest: false, tipPercents: [15, 20] });
    const tip = await t.pub({ action: "bookingTip", id: r.body.id, key, tipMinor: 900 });
    expect(t.opened.at(-1).params.line_items[0].price_data).toMatchObject({ unit_amount: 900, product_data: { name: "Moth Press: Cut (a tip)" } });
    paid(t, tip.body.url.split("/").pop());
    await t.desk.sweepHolds();
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ tip: { amountMinor: 900 }, restOpen: false });
    expect(t.db.store.get("bookings/booking001").rest).toBeUndefined();
    expect(t.emails.find((e) => e.subject.startsWith("Tip received")).html).toMatch(/Your \$9\.00 tip/);
    expect(t.emails.some((e) => e.to === "owner@example.com" && e.subject.includes("$9.00 tip"))).toBe(true);
    expect((await t.pub({ action: "bookingTip", id: r.body.id, key, tipMinor: 900 })).body.code).toBe("tipped");
  });

  test("no tip email after a no-show or a cancelled visit", async () => {
    const t = setup();
    await seedTips(t);
    const a = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    const b = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "16:00"), ...CUSTOMER });
    await t.adm({ op: "noShow", id: a.body.id });
    await t.adm({ op: "cancel", id: b.body.id });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "16:30")) + 2.5 * 3_600_000);
    expect(await t.desk.sweepTips()).toEqual({ asked: 0 });
  });
});

describe("gift cards on bookings", () => {
  const { giftCardId } = realRequire("./giftCards");
  const CODE = "ABCD-EFGH-JKLM-NP23";
  const cardPath = () => `giftCards/${giftCardId(CODE)}`;
  const ready = async (card = {}, opts = {}) => {
    const t = setup(opts);
    await t.seed();
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 14000, depositPercent: 25 });
    await t.db.collection("giftCards").doc(giftCardId(CODE)).set({ code: CODE, last4: "NP23", balanceMinor: 2500, initialMinor: 2500, enabled: true, history: [], ...card });
    return t;
  };
  const book = (t, extra = {}) => t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "10:00"), ...CUSTOMER, ...extra });

  test("a gift card is quoted on the first-visit price for someone new, as the booking will charge", async () => {
    const t = await ready();
    await t.db.collection("bookingServices").doc("first").set({ name: "Trial", minutes: 60, gapAfter: 0, payment: "full", priceMinor: 4000, introPriceMinor: 1000 });
    const quote = (email) => t.pub({ action: "bookingGiftCard", serviceId: "first", giftCard: CODE, email }).then((r) => r.body);
    expect(await quote("new@example.com")).toEqual({ last4: "NP23", giftMinor: 1000, payNowMinor: 0 });
    t.db.store.set("bookings/before", { customer: { email: "back@example.com" }, status: "confirmed" });
    expect(await quote("back@example.com")).toEqual({ last4: "NP23", giftMinor: 2500, payNowMinor: 1500 });
  });

  test("the booking form offers a gift card box once the shop has gift cards", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "bookingInfo" })).body.giftCards).toBe(false);
    await t.db.collection("giftCards").doc("g1").set({ balanceMinor: 100 });
    expect((await t.pub({ action: "bookingInfo" })).body.giftCards).toBe(true);
  });

  test("a gift card pays part, the card page takes the rest, and the card is debited once", async () => {
    const t = await ready();
    const tried = await t.pub({ action: "bookingGiftCard", serviceId: "review", giftCard: "abcd efgh jklm np23" });
    expect(tried.body).toEqual({ last4: "NP23", giftMinor: 2500, payNowMinor: 1500 });
    const r = await book(t, { giftCard: CODE });
    expect(r.body.status).toBe("held");
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(1500);
    expect(t.db.store.get(cardPath())).toMatchObject({ balanceMinor: 0, history: [{ type: "redeemed", minor: 2500, bookingId: "booking001" }] });
    // The same balance can't pay for a second booking.
    const again = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "14:00"), ...CUSTOMER, giftCard: CODE });
    expect(again.body).toEqual({ error: "This gift card has no balance left.", code: "gift" });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_1" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ status: "confirmed", paid: true, giftCardLast4: "NP23", giftMinor: 2500, dueMinor: 0 });
    expect(t.emails.find((e) => e.to === "ada@example.com").html).toMatch(/Gift card ••••NP23:<\/strong> \$25\.00/);
  });

  test("a gift card that covers it all books straight away with no card page", async () => {
    const t = await ready({ balanceMinor: 10000 });
    const r = await book(t, { giftCard: CODE });
    expect(r.body.status).toBe("confirmed");
    expect(t.opened).toHaveLength(0);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ status: "confirmed", paid: true, giftCard: { last4: "NP23", amountMinor: 4000 } });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(6000);
    // Cancelling puts it back on the card, once.
    const c = await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(c.body.booking).toMatchObject({ status: "cancelled", giftReturned: true });
    expect(t.refunds).toHaveLength(0);
    expect(t.db.store.get(cardPath())).toMatchObject({ balanceMinor: 10000, history: [{ type: "redeemed" }, { type: "refunded", minor: 4000, bookingId: "booking001" }] });
    expect(t.emails.find((e) => e.subject.startsWith("Cancelled")).html).toMatch(/The \$40\.00 from your gift card is back on it\./);
    await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(10000);
  });

  test("on a deposit it pays only the deposit, and the rest stays due at the visit", async () => {
    const t = await ready({ balanceMinor: 10000 });
    const r = await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER, giftCard: CODE });
    expect(r.body.status).toBe("confirmed");
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ payment: "deposit", depositMinor: 3500, depositPaid: true, giftCard: { amountMinor: 3500 } });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ dueMinor: 10500, giftMinor: 3500 });
  });

  test("never leaves a card payment smaller than the card page allows", async () => {
    const t = await ready({ balanceMinor: 3980 });
    expect((await t.pub({ action: "bookingGiftCard", serviceId: "review", giftCard: CODE })).body).toEqual({ last4: "NP23", giftMinor: 3950, payNowMinor: 50 });
  });

  test("a hold that runs out puts the gift card's part back", async () => {
    const t = await ready();
    await book(t, { giftCard: CODE });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(0);
    t.clock.now = new Date(Date.parse("2026-11-16T13:11:00Z"));
    expect(await t.desk.sweepHolds()).toEqual({ confirmed: 0, freed: 1 });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(2500);
  });

  test("the owner's cancel puts it back unless they keep it", async () => {
    const t = await ready({ balanceMinor: 10000 });
    const r = await book(t, { giftCard: CODE });
    expect((await t.adm({ op: "cancel", id: r.body.id, giftBack: false })).body).toEqual({ ok: true, refunded: false, refundMinor: 0 });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(6000);
    const r2 = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "14:00"), ...CUSTOMER, giftCard: CODE });
    expect((await t.adm({ op: "cancel", id: r2.body.id })).body).toEqual({ ok: true, refunded: false, refundMinor: 0, giftBackMinor: 4000 });
    expect(t.db.store.get(cardPath()).balanceMinor).toBe(6000);
  });

  test("wrong, used up, switched off, test-only or free-service gift cards are refused in plain words", async () => {
    const t = await ready();
    const tryIt = (giftCard, serviceId = "review") => t.pub({ action: "bookingGiftCard", serviceId, giftCard }).then((r) => r.body);
    expect(await tryIt("nope")).toEqual({ error: "We couldn't find that gift card. Check the code and try again.", code: "gift" });
    expect(await tryIt(CODE, "visit")).toEqual({ error: "A gift card can only pay for a booking that's paid when you book.", code: "gift" });
    await t.db.collection("giftCards").doc(giftCardId(CODE)).set({ enabled: false }, { merge: true });
    expect((await tryIt(CODE)).error).toBe("This gift card can't be used. Please contact us.");
    await t.db.collection("giftCards").doc(giftCardId(CODE)).set({ enabled: true, balanceMinor: 0 }, { merge: true });
    expect((await tryIt(CODE)).error).toBe("This gift card has no balance left.");
    expect((await book(t, { giftCard: CODE })).statusCode).toBe(400);
  });
});

describe("packs of visits", () => {
  const ready = async (pack = {}) => {
    const t = setup();
    await t.seed();
    await t.db.collection("bookingServices").doc("lesson").set({ name: "Lesson", minutes: 60, gapAfter: 0, payment: "full", priceMinor: 5000, packVisits: 3, packPriceMinor: 13500, packDays: 30, ...pack });
    return t;
  };
  const packPath = (t) => [...t.db.store.keys()].find((k) => k.startsWith("bookingPacks/"));
  /** Buys a pack and pays its page: answers the code. */
  const buy = async (t) => {
    const r = await t.pub({ action: "bookingPackBuy", serviceId: "lesson", ...CUSTOMER });
    expect(r.body.url).toMatch(/^https:\/\/pay\.example\//);
    const code = decodeURIComponent(t.opened.at(-1).params.success_url.split("pack=")[1]);
    Object.assign(t.sessions.get(`cs_test_${String(t.opened.length - 1).padStart(8, "0")}`), { payment_status: "paid", payment_intent: "pi_pack" });
    return code;
  };
  const book = (t, code, day = "2026-11-18", hhmm = "10:00") => t.pub({ action: "bookingStart", serviceId: "lesson", start: at(day, hhmm), ...CUSTOMER, pack: code });

  test("the booking form learns which services sell a pack", async () => {
    const t = await ready();
    const info = (await t.pub({ action: "bookingInfo" })).body;
    expect(info.services.find((s) => s.id === "lesson")).toMatchObject({ packVisits: 3, packPriceMinor: 13500, packDays: 30 });
    expect(info.services.find((s) => s.id === "review").packVisits).toBeUndefined();
    expect((await t.pub({ action: "bookingPackBuy", serviceId: "review", ...CUSTOMER })).statusCode).toBe(404);
  });

  test("buying a pack opens a card page for its price; paying starts it and emails the code once", async () => {
    const t = await ready();
    const code = await buy(t);
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(13500);
    // Only the hash of the code names the record, and the code itself is kept only until it is emailed.
    expect(packPath(t)).not.toContain(code);
    expect(t.db.store.get(packPath(t))).toMatchObject({ status: "held", pendingCode: code });
    const view = await t.pub({ action: "bookingPackView", pack: code.toLowerCase().replace(/-/g, " ") });
    expect(view.body.pack).toMatchObject({ status: "active", visits: 3, left: 3, serviceId: "lesson", expiresOn: "2026-12-16", last4: code.slice(-4) });
    expect(t.db.store.get(packPath(t))).toMatchObject({ status: "active", paymentIntent: "pi_pack", pendingCode: null });
    expect(t.emails.filter((e) => e.to === "ada@example.com")).toHaveLength(1);
    expect(t.emails[0].html).toContain(code);
    await t.pub({ action: "bookingPackView", pack: code });
    expect(t.emails.filter((e) => e.to === "ada@example.com")).toHaveLength(1);
  });

  test("each visit booked with the pack is free, counted, and given back once on cancel", async () => {
    const t = await ready();
    const code = await buy(t);
    await t.pub({ action: "bookingPackView", pack: code });
    expect((await t.pub({ action: "bookingPack", serviceId: "lesson", pack: code })).body).toMatchObject({ left: 3, visits: 3 });
    const r = await book(t, code);
    expect(r.body.status).toBe("confirmed");
    expect(t.opened).toHaveLength(1);
    expect(t.db.store.get(`bookings/${r.body.id}`)).toMatchObject({ payment: "pack", priceMinor: 0, listPriceMinor: 5000, pack: { last4: code.slice(-4), visit: 1, visits: 3 } });
    const booked = t.emails.find((e) => e.subject.startsWith("Booked"));
    expect(booked.html).toMatch(/Paid with your pack ••••.{4}:<\/strong> visit 1 of 3/);
    expect((await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.booking).toMatchObject({ dueMinor: 0, packVisit: 1, packVisits: 3 });
    await book(t, code, "2026-11-19");
    await book(t, code, "2026-11-20");
    const fourth = await book(t, code, "2026-11-23");
    expect(fourth.body).toEqual({ error: "Every visit in this pack has been booked.", code: "pack" });
    const c = await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect(c.body.booking).toMatchObject({ status: "cancelled", packReturned: true });
    expect(t.refunds).toHaveLength(0);
    expect((await t.pub({ action: "bookingPack", serviceId: "lesson", pack: code })).body.left).toBe(1);
    await t.pub({ action: "bookingCancel", id: r.body.id, key: r.body.key });
    expect((await t.pub({ action: "bookingPack", serviceId: "lesson", pack: code })).body.left).toBe(1);
    expect(t.emails.find((e) => e.subject.startsWith("Cancelled")).html).toMatch(/The visit is back on your pack/);
  });

  test("a pack books only its own service, only once paid, and only up to its last day", async () => {
    const t = await ready({ packDays: 2 });
    const r = await t.pub({ action: "bookingPackBuy", serviceId: "lesson", ...CUSTOMER });
    expect(r.statusCode).toBe(200);
    const code = decodeURIComponent(t.opened[0].params.success_url.split("pack=")[1]);
    expect((await book(t, code)).body).toEqual({ error: "This pack isn't paid for yet.", code: "pack" });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_pack" });
    await t.pub({ action: "bookingPackView", pack: code });
    expect((await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "10:00"), ...CUSTOMER, pack: code })).body.code).toBe("pack");
    expect((await book(t, code, "2026-11-19")).body).toEqual({ error: "This pack has run out of time.", code: "pack" });
    expect((await book(t, "ZZZZ-ZZZZ-ZZZZ")).body).toEqual({ error: "We couldn't find that pack. Check the code in your email.", code: "pack" });
    expect((await book(t, code, "2026-11-18")).body.status).toBe("confirmed");
  });

  test("an unpaid pack is forgotten once its page closes", async () => {
    const t = await ready();
    await t.pub({ action: "bookingPackBuy", serviceId: "lesson", ...CUSTOMER });
    expect(packPath(t)).toBeTruthy();
    t.clock.now = new Date(Date.parse("2026-11-16T13:00:00Z") + 61 * 60_000);
    await t.desk.sweepHolds();
    expect(t.closed).toEqual(["cs_test_00000000"]);
    expect(packPath(t)).toBeUndefined();
  });

  test("the owner sees the packs, keeps a visit on a late cancel, and can close a pack with a refund", async () => {
    const t = await ready();
    const code = await buy(t);
    await t.pub({ action: "bookingPackView", pack: code });
    const r = await book(t, code);
    const list = (await t.adm({ op: "packs" })).body.packs;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Ada Reader", visits: 3, left: 2, status: "active", priceMinor: 13500, uses: [{ bookingId: r.body.id, returned: false }] });
    const c = await t.adm({ op: "cancel", id: r.body.id, packBack: false });
    expect(c.body.packBack).toBeUndefined();
    expect((await t.adm({ op: "packs" })).body.packs[0].left).toBe(2);
    expect((await t.adm({ op: "packClose", id: list[0].id, refundMinor: 99999 })).statusCode).toBe(400);
    const closed = await t.adm({ op: "packClose", id: list[0].id, refundMinor: 9000 });
    expect(closed.body).toEqual({ ok: true, refundMinor: 9000 });
    expect(t.refunds[0]).toMatchObject({ paymentIntentId: "pi_pack", amountMinor: 9000, idempotencyKey: `pack-refund-${list[0].id}-9000` });
    expect((await book(t, code, "2026-11-19")).body).toEqual({ error: "This pack has been closed. Please contact the shop.", code: "pack" });
    expect((await t.adm({ op: "packClose", id: list[0].id })).statusCode).toBe(409);
  });
});

describe("pickup times at checkout", () => {
  const pickupOn = async (t, extra = {}) => {
    const s = (await t.db.collection("bookingSettings").doc("main").get()).data();
    await t.db.collection("bookingSettings").doc("main").set({ ...s, pickupTimes: true, pickupSlotMinutes: 60, pickupPerSlot: 2, pickupReadyHours: 2, ...extra });
  };
  const order = (id, day, hhmm, fields = {}) => ({ id, data: { paymentStatus: "paid", status: "processing", createdAt: "2026-11-16T12:00:00Z", fulfillment: { method: "pickup", pickupAt: at(day, hhmm) }, ...fields } });

  test("answers off until the owner turns pickup times on, even with Bookings on", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "pickupTimes" })).body).toEqual({ on: false });
    expect(await t.desk.pickupCheck({ method: "pickup", optionId: "pickup:shop" })).toEqual({});
    const off = setup({ on: false });
    await off.seed();
    await pickupOn(off);
    expect(await off.desk.pickupCheck({ method: "pickup", optionId: "pickup:shop" })).toEqual({});
  });

  test("lists the free times by day, leaving out full ones and counting only live orders", async () => {
    const t = setup({ live: false });
    await t.seed();
    await pickupOn(t);
    for (const o of [
      order("o1", "2026-11-16", "11:00"),
      order("o2", "2026-11-16", "11:00", { paymentStatus: "unpaid", createdAt: "2026-11-16T12:30:00Z" }), // a checkout under way
      order("o3", "2026-11-16", "12:00", { status: "cancelled" }),
      order("o4", "2026-11-16", "12:00", { paymentStatus: "refunded" }),
      order("o5", "2026-11-16", "12:00", { paymentStatus: "unpaid", createdAt: "2026-11-16T09:00:00Z" }), // abandoned
      order("o6", "2026-11-16", "12:00"),
    ]) await t.db.collection("orders").doc(o.id).set(o.data);
    const r = await t.pub({ action: "pickupTimes" });
    expect(r.body).toMatchObject({ on: true, zone: ZONE, slotMinutes: 60 });
    // 08:00 now, ready from 10:00; 11:00 holds two orders (full), 12:00 only one counts.
    expect(r.body.days["2026-11-16"]).toEqual(["10:00", "12:00", "13:00", "14:00", "15:00", "16:00"].map((h) => at("2026-11-16", h)));
    expect(r.body.days["2026-11-21"]).toBeUndefined();
  });

  test("checkout keeps a free time and refuses a closed, full or missing one in plain words", async () => {
    const t = setup();
    await t.seed();
    await pickupOn(t);
    await t.db.collection("orders").doc("o1").set(order("o1", "2026-11-16", "14:00").data);
    await t.db.collection("orders").doc("o2").set(order("o2", "2026-11-16", "14:00").data);
    const sel = (pickupAt) => ({ method: "pickup", optionId: "pickup:shop", pickupAt });
    expect(await t.desk.pickupCheck(sel(at("2026-11-17", "15:00")))).toEqual({ pickupAt: at("2026-11-17", "15:00") });
    await expect(t.desk.pickupCheck(sel(""))).rejects.toMatchObject({ code: "pickup_time", pickupTime: true });
    await expect(t.desk.pickupCheck(sel(at("2026-11-16", "14:00")))).rejects.toMatchObject({ code: "pickup_full" });
    await expect(t.desk.pickupCheck(sel(at("2026-11-16", "09:00")))).rejects.toMatchObject({ code: "pickup_closed" });
    await expect(t.desk.pickupCheck(sel(at("2026-11-16", "09:00")))).rejects.toMatchObject({ code: "pickup_closed" });
    await expect(t.desk.pickupCheck(sel(at("2026-11-16", "10:00")))).resolves.toEqual({ pickupAt: at("2026-11-16", "10:00") });
    await expect(t.desk.pickupCheck(sel(at("2026-11-16", "09:30")))).rejects.toMatchObject({ code: "pickup_closed" });
    // The order being re-priced never counts against its own time.
    expect(await t.desk.pickupCheck(sel(at("2026-11-16", "14:00")), "o1")).toEqual({ pickupAt: at("2026-11-16", "14:00") });
  });
});

describe("check-in at the till", () => {
  test("a confirmed booking gets a code in its email and on its page, and the till checks it in once, today only", async () => {
    const t = setup();
    await t.seed();
    const today = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-16", "10:00"), ...CUSTOMER });
    const later = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-18", "10:00"), ...CUSTOMER });
    const saved = t.db.store.get(`bookings/${today.body.id}`);
    expect(saved.checkInCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const booked = t.emails.find((m) => m.to === CUSTOMER.email && /^Booked/.test(m.subject));
    expect(booked.html).toContain("Check-in code:");
    expect(booked.html).toContain(saved.checkInCode);
    // Typed loosely: lower case, a space instead of the dash.
    const typed = saved.checkInCode.toLowerCase().replace("-", " ");
    const first = await t.adm({ op: "checkIn", code: typed });
    expect(first.statusCode).toBe(200);
    expect(first.body.booking).toMatchObject({ id: today.body.id, name: CUSTOMER.name, checkedInAt: "2026-11-16T13:00:00.000Z" });
    expect(first.body.already).toBeUndefined();
    expect((await t.adm({ op: "checkIn", code: saved.checkInCode })).body.already).toBe(true);
    expect(t.db.store.get(`bookings/${today.body.id}`).history.filter((h) => h.what === "checked in")).toHaveLength(1);
    // Another day's booking is named but not checked in.
    const other = await t.adm({ op: "checkIn", code: t.db.store.get(`bookings/${later.body.id}`).checkInCode });
    expect(other.statusCode).toBe(409);
    expect(other.body).toMatchObject({ code: "not_today", booking: { id: later.body.id, checkedInAt: null } });
    expect(other.body.error).toMatch(/not today/);
    // Unknown and badly typed codes.
    expect((await t.adm({ op: "checkIn", code: "ZZZZ-ZZZZ" })).body.code).toBe("unknown_code");
    expect((await t.adm({ op: "checkIn", code: "HELLO" })).body.code).toBe("bad_code");
    // Taken off from the admin by id.
    const off = await t.adm({ op: "checkIn", id: today.body.id, value: false });
    expect(off.body.booking.checkedInAt).toBeNull();
    // Cancelled bookings are refused, with who it was.
    await t.adm({ op: "cancel", id: today.body.id });
    const gone = await t.adm({ op: "checkIn", code: saved.checkInCode });
    expect(gone.body).toMatchObject({ code: "cancelled", booking: { name: CUSTOMER.name } });
  });

  test("the customer's page shows the code until the visit ends; a walk-in is checked in already", async () => {
    const t = setup();
    await t.seed();
    const r = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-17", "10:00"), ...CUSTOMER });
    const key = t.emails.find((m) => /^Booked/.test(m.subject)).html.match(/key=([a-f0-9]+)/)[1];
    const view = await t.pub({ action: "bookingView", id: r.body.id, key });
    expect(view.body.booking.checkInCode).toBe(t.db.store.get(`bookings/${r.body.id}`).checkInCode);
    expect(view.body.booking.checkedIn).toBe(false);
    t.clock.now = new Date("2026-11-18T13:00:00Z");
    expect((await t.pub({ action: "bookingView", id: r.body.id, key })).body.booking.checkInCode).toBe("");
    const w = await t.adm({ op: "walkIn", serviceId: "visit", name: "Gil Example", priceMinor: 4500 });
    expect(t.db.store.get(`bookings/${w.body.id}`).checkedInAt).toBeTruthy();
  });
});

describe("staff and rooms", () => {
  const team = async (t, { rooms = [], staff } = {}) => {
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({
      ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, rooms,
      staff: staff || [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben", serviceIds: ["visit"] }],
    });
  };
  const book = (t, start, extra = {}) => t.pub({ action: "bookingStart", serviceId: "visit", start, ...CUSTOMER, ...extra });

  test("the info lists the people a client can pick, and a shop without people lists none", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "bookingInfo" })).body.staff).toEqual([]);
    await team(t);
    expect((await t.pub({ action: "bookingInfo" })).body.staff).toEqual([{ id: "ana", name: "Ana", serviceIds: [] }, { id: "ben", name: "Ben", serviceIds: ["visit"] }]);
  });

  test("booking with anyone free assigns someone, and two bookings at once go to two people", async () => {
    const t = setup();
    await team(t);
    const start = at("2026-11-18", "14:00");
    const [a, b] = await Promise.all([book(t, start), book(t, start, { name: "Bo", email: "bo@example.com" })]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const people = [a, b].map((r) => t.db.store.get(`bookings/${r.body.id}`).staffId).sort();
    expect(people).toEqual(["ana", "ben"]);
    expect(t.db.store.get(`bookings/${a.body.id}`).staffName).toMatch(/Ana|Ben/);
    expect(t.db.store.get("bookingDays/2026-11-18").items[a.body.id].p).toMatch(/ana|ben/);
    // Both are busy now, so a third client is refused.
    expect((await book(t, start, { name: "Cy", email: "cy@example.com" })).body.code).toBe("taken");
    // The emails name the person.
    expect(t.emails.find((e) => e.to === "ada@example.com").html).toMatch(/With:<\/strong> (Ana|Ben)/);
  });

  test("asking for a busy person is refused, and someone who doesn't do the service is turned away", async () => {
    const t = setup();
    await team(t);
    const start = at("2026-11-18", "10:00");
    expect((await book(t, start, { staffId: "ana" })).statusCode).toBe(200);
    const again = await book(t, start, { staffId: "ana", name: "Bo", email: "bo@example.com" });
    expect(again.statusCode).toBe(409);
    expect(again.body.error).toMatch(/That person was just booked/);
    // Ana's times no longer show 10:00; anyone's still do (Ben is free).
    const ana = (await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-18", days: 1, staffId: "ana" })).body.days["2026-11-18"];
    const anyone = (await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-18", days: 1 })).body.days["2026-11-18"];
    expect(ana).not.toContain(start);
    expect(anyone).toContain(start);
    const wrong = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), ...CUSTOMER, staffId: "ben" });
    expect(wrong.body.code).toBe("staff");
  });

  test("a room stops a second booking at the same time, whoever does it", async () => {
    const t = setup();
    await team(t, { rooms: [{ id: "studio", name: "The studio" }] });
    await t.db.collection("bookingServices").doc("visit").set({ name: "Studio visit", minutes: 60, gapAfter: 15, payment: "free", priceMinor: 0, roomId: "studio" });
    const start = at("2026-11-18", "11:00");
    const first = await book(t, start, { staffId: "ana" });
    expect(t.db.store.get(`bookings/${first.body.id}`)).toMatchObject({ roomId: "studio", roomName: "The studio" });
    const second = await book(t, start, { staffId: "ben", name: "Bo", email: "bo@example.com" });
    expect(second.body.code).toBe("taken");
    // Ana herself is busy then, whatever the service.
    expect((await t.pub({ action: "bookingStart", serviceId: "review", start, ...CUSTOMER, staffId: "ana" })).statusCode).toBe(409);
  });

  test("a move keeps the person, and the owner can move a booking to someone else", async () => {
    const t = setup();
    await team(t);
    const r = await book(t, at("2026-11-18", "10:00"), { staffId: "ben" });
    const moved = await t.pub({ action: "bookingMove", id: r.body.id, key: r.body.key, start: at("2026-11-19", "11:00") });
    expect(moved.statusCode).toBe(200);
    expect(t.db.store.get(`bookings/${r.body.id}`)).toMatchObject({ staffId: "ben", staffName: "Ben" });
    expect(t.db.store.get("bookingDays/2026-11-19").items[r.body.id].p).toBe("ben");
    // The owner gives it to Ana at the same time.
    expect((await t.adm({ op: "move", id: r.body.id, start: at("2026-11-19", "11:00"), staffId: "ana" })).body.ok).toBe(true);
    const b = t.db.store.get(`bookings/${r.body.id}`);
    expect(b).toMatchObject({ staffId: "ana", staffName: "Ana" });
    expect(b.history.at(-1).what).toMatch(/to Ana$/);
    // Ben is free again at 11:00 on the 19th.
    const ben = (await t.pub({ action: "bookingTimes", serviceId: "visit", from: "2026-11-19", days: 1, staffId: "ben" })).body.days["2026-11-19"];
    expect(ben).toContain(at("2026-11-19", "11:00"));
  });

  test("the owner books a client in with a chosen person, and that person can't be double-booked", async () => {
    const t = setup();
    await team(t);
    const c = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:00"), ...CUSTOMER, staffId: "ben" });
    expect(t.db.store.get(`bookings/${c.body.id}`)).toMatchObject({ staffId: "ben" });
    expect((await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:00"), ...CUSTOMER, staffId: "ben" })).statusCode).toBe(409);
    expect((await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:00"), ...CUSTOMER, staffId: "ana" })).statusCode).toBe(200);
  });

  test("a shop with no people stores no person on its bookings, as before", async () => {
    const t = setup();
    await t.seed();
    const r = await book(t, at("2026-11-18", "10:00"));
    const b = t.db.store.get(`bookings/${r.body.id}`);
    expect(b.staffId).toBeUndefined();
    expect(t.db.store.get("bookingDays/2026-11-18").items[r.body.id]).not.toHaveProperty("p");
  });

  test("the day items carry the person and room back into busy times", () => {
    const snap = (items) => ({ exists: true, data: () => ({ items }) });
    expect(busyFrom([snap({ a: { start: 1, end: 2, held: false, s: "x", p: "ana", r: "studio" } })], 0)).toEqual([{ start: 1, end: 2, serviceId: "x", staffId: "ana", roomId: "studio" }]);
  });

  test("each person gets their own private calendar link, and a new one stops the old", async () => {
    const t = setup();
    await team(t);
    expect((await t.adm({ op: "calendarFeed", staffId: "nobody" })).statusCode).toBe(400);
    const first = await t.adm({ op: "calendarFeed", staffId: "ana" });
    expect(first.body.path).toMatch(/^\/calendar\/[a-f0-9]{48}\.ics$/);
    expect(t.db.store.get("bookingFeed/p-ana")).toMatchObject({ staffId: "ana", staffName: "Ana" });
    expect((await t.adm({ op: "calendarFeed", staffId: "ana" })).body.path).toBe(first.body.path);
    await t.adm({ op: "calendarFeed" });
    expect(t.db.store.get("bookingFeed/main").staffId).toBeUndefined();
    const ownerToken = t.db.store.get("bookingFeed/main").token;
    await t.db.collection("bookingFeed").doc("p-ana").set({ token: "c".repeat(48), staffId: "ana" });
    expect((await t.adm({ op: "calendarFeed", staffId: "ana", renew: true })).body.path).not.toContain("c".repeat(48));
    expect(t.db.store.get("bookingFeed/main").token).toBe(ownerToken);
  });

  test("each person with an email gets their own day each morning, once, only on days they have bookings", async () => {
    const t = setup({ now: "2026-11-17T12:00:00Z" });
    await team(t, { staff: [{ id: "ana", name: "Ana", email: "ana@example.com" }, { id: "ben", name: "Ben", email: "ben@example.com" }, { id: "cy", name: "Cy" }] });
    await book(t, at("2026-11-18", "14:00"), { staffId: "ana" });
    await book(t, at("2026-11-18", "10:00"), { staffId: "ana", name: "Bo Lin", email: "bo@example.com" });
    await book(t, at("2026-11-18", "11:00"), { staffId: "cy", name: "Di", email: "di@example.com" });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "06:55")));
    expect(await t.desk.sweepStaffDays()).toEqual({ sent: 0 });
    t.clock.now = new Date(Date.parse(at("2026-11-18", "07:05")));
    const before = t.emails.length;
    expect(await t.desk.sweepStaffDays()).toEqual({ sent: 1 });
    expect(await t.desk.sweepStaffDays()).toEqual({ sent: 0 });
    expect(t.emails.length).toBe(before + 1);
    const mail = t.emails[before];
    expect(mail.to).toBe("ana@example.com");
    expect(mail.subject).toMatch(/: 2 bookings, first at 10:00/);
    expect(mail.html.indexOf("Bo Lin")).toBeLessThan(mail.html.indexOf("Ada Reader"));
    expect(mail.html).not.toContain("Di");
    expect(mail.html).not.toContain("/admin");
    expect(t.db.store.get("bookingSettings/staffSummary").days).toEqual({ ana: "2026-11-18", ben: "2026-11-18" });
  });

  test("no one with an email: nothing is claimed or sent", async () => {
    const t = setup({ now: "2026-11-18T13:00:00Z" });
    await team(t);
    expect(await t.desk.sweepStaffDays()).toEqual({ sent: 0 });
    expect(t.db.store.get("bookingSettings/staffSummary")).toBeUndefined();
  });
});

describe("sales tax on a service", () => {
  // The shop's rate where it is: 13% HST, as index.js works it out from Settings › Taxes and the shop's location.
  const hst = async () => (amountMinor) => {
    const cents = Math.round(amountMinor * 0.13);
    return { taxMinor: cents, taxLines: cents ? [{ name: "HST ON", cents }] : [] };
  };
  const seedTaxed = async (t) => {
    await t.seed();
    await t.db.collection("bookingServices").doc("review").set({ name: "Portfolio review", minutes: 30, gapAfter: 0, payment: "full", priceMinor: 4000, chargeTax: true });
    await t.db.collection("bookingServices").doc("colour").set({ name: "Colour", minutes: 60, gapAfter: 0, payment: "deposit", priceMinor: 10000, depositPercent: 20, chargeTax: true });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000, chargeTax: true });
  };

  test("only a priced service keeps the switch", async () => {
    const t = setup({ shopTax: hst });
    await t.seed();
    const free = await t.adm({ op: "saveService", service: { name: "Chat", minutes: 30, payment: "free", chargeTax: true } });
    expect(free.body.service.chargeTax).toBe(false);
    const paid = await t.adm({ op: "saveService", service: { name: "Lesson", minutes: 30, payment: "full", priceMinor: 5000, chargeTax: true } });
    expect(paid.body.service.chargeTax).toBe(true);
  });

  test("the card page takes the price plus tax, and the booking keeps the tax by its name", async () => {
    const t = setup({ shopTax: hst });
    await seedTaxed(t);
    const info = await t.pub({ action: "bookingInfo" });
    expect(info.body.services.find((s) => s.id === "review")).toMatchObject({ priceMinor: 4000, taxMinor: 520, taxPpm: 130000 });
    expect(info.body.services.find((s) => s.id === "visit").taxMinor).toBeUndefined();
    const r = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(4520);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ priceMinor: 4520, taxMinor: 520, taxLines: [{ name: "HST ON", cents: 520 }] });
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_tax" });
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking).toMatchObject({ status: "confirmed", paid: true, priceMinor: 4520, taxMinor: 520 });
    const email = t.emails.find((e) => e.to === "ada@example.com").html;
    expect(email).toMatch(/Includes tax \(HST ON\):<\/strong> \$5\.20/);
    expect(email).toMatch(/Paid:<\/strong> \$45\.20/);
  });

  test("a deposit is worked out on the price with tax, and paying at the visit carries the tax too", async () => {
    const t = setup({ shopTax: hst });
    await seedTaxed(t);
    await t.pub({ action: "bookingStart", serviceId: "colour", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(2260);
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ payment: "deposit", priceMinor: 11300, depositMinor: 2260, taxMinor: 1300 });
    const cut = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-19", "13:00"), ...CUSTOMER });
    expect(t.db.store.get(`bookings/${cut.body.id}`)).toMatchObject({ payment: "atShop", priceMinor: 6780, taxMinor: 780 });
  });

  test("a discount code comes off before the tax", async () => {
    let db;
    const findDiscount = async (code) => {
      const hit = (await db.collection("discounts").where("code", "==", code).limit(1).get()).docs[0];
      if (!hit) throw new Error("That code isn't valid.");
      return { id: hit.id, ...hit.data() };
    };
    const t = setup({ shopTax: hst, findDiscount });
    db = t.db;
    await seedTaxed(t);
    await t.db.collection("discounts").doc("d1").set({ code: "TEN", type: "fixed", value: 10, isActive: true, forBookings: true, usageCount: 0 });
    const tried = await t.pub({ action: "bookingCode", serviceId: "review", code: "TEN", email: CUSTOMER.email });
    expect(tried.body).toMatchObject({ discountMinor: 1000, priceMinor: 3390, taxMinor: 390, payNowMinor: 3390 });
    await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), code: "TEN", ...CUSTOMER });
    expect(t.db.store.get("bookings/booking001")).toMatchObject({ priceMinor: 3390, taxMinor: 390, listPriceMinor: 4000 });
  });

  test("the owner's bookings and walk-ins add the tax, and a shop with no rate charges none", async () => {
    const t = setup({ shopTax: hst });
    await seedTaxed(t);
    const made = await t.adm({ op: "create", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    expect(t.db.store.get(`bookings/${made.body.id || made.body.booking?.id || "booking001"}`)).toMatchObject({ priceMinor: 6780, taxMinor: 780 });
    const walk = await t.adm({ op: "walkIn", serviceId: "cut", name: "Bo", priceMinor: 5000 });
    expect(walk.body).toMatchObject({ dueMinor: 5650, taxMinor: 650 });
    const none = setup({ shopTax: async () => null });
    await seedTaxed(none);
    await none.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-18", "13:00"), ...CUSTOMER });
    expect(none.db.store.get("bookings/booking001").taxMinor).toBeUndefined();
    expect(none.opened[0].params.line_items[0].price_data.unit_amount).toBe(4000);
  });

  test("a pack of a taxed service takes its price plus tax, and the owner's list and email show the tax", async () => {
    const t = setup({ shopTax: hst });
    await seedTaxed(t);
    await t.db.collection("bookingServices").doc("lesson").set({ name: "Lesson", minutes: 60, gapAfter: 0, payment: "full", priceMinor: 5000, packVisits: 3, packPriceMinor: 13500, packDays: 30, chargeTax: true });
    await t.pub({ action: "bookingPackBuy", serviceId: "lesson", ...CUSTOMER });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(15255);
    const code = decodeURIComponent(t.opened[0].params.success_url.split("pack=")[1]);
    Object.assign(t.sessions.get("cs_test_00000000"), { payment_status: "paid", payment_intent: "pi_pack" });
    expect((await t.pub({ action: "bookingPackView", pack: code })).body.pack.status).toBe("active");
    const [row] = (await t.adm({ op: "packs" })).body.packs;
    expect(row).toMatchObject({ priceMinor: 15255, taxMinor: 1755, taxLines: [{ name: "HST ON", cents: 1755 }] });
    expect(t.emails.find((e) => e.to === "ada@example.com").html).toMatch(/Includes tax \(HST ON\):<\/strong> \$17\.55/);
    // The owner can give back up to everything paid, tax included.
    expect((await t.adm({ op: "packClose", id: row.id, refundMinor: 15255 })).body).toEqual({ ok: true, refundMinor: 15255 });
  });
});

describe("the thank-you email after the visit", () => {
  const REVIEW = "https://g.page/r/test-shop/review";
  const seedThanks = async (t, extra = {}) => {
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, thankYou: true, reviewUrl: REVIEW, ...extra });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
  };
  const book = (t, time, extra = {}) => t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", time), ...CUSTOMER, ...extra });
  const after = (t, time, hours) => { t.clock.now = new Date(Date.parse(at("2026-11-18", time)) + 30 * 60_000 + hours * 3_600_000); };
  const thanks = (t) => t.emails.filter((e) => /^Thank you for coming/.test(e.subject));

  test("one thank-you a couple of hours after the visit, with Book again and the review link", async () => {
    const t = setup();
    await seedThanks(t);
    const r = await book(t, "15:00");
    after(t, "15:00", 0.5);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 0 });
    after(t, "15:00", 2.5);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 1 });
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 0 });
    const [email] = thanks(t);
    expect(email.to).toBe(CUSTOMER.email);
    expect(email.html).toContain("Book again");
    expect(email.html).toContain("/book?service=cut");
    expect(email.html).toContain(`href="${REVIEW}"`);
    expect(t.db.store.get(`bookings/${r.body.id}`).thanksSentAt).toBeTruthy();
  });

  test("no review link means no Leave a review, and the switch off sends nothing", async () => {
    const t = setup();
    await seedThanks(t, { reviewUrl: "" });
    await book(t, "15:00");
    after(t, "15:00", 2.5);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 1 });
    expect(thanks(t)[0].html).not.toContain("Leave a review");
    const off = setup();
    await seedThanks(off, { thankYou: false });
    await book(off, "15:00");
    after(off, "15:00", 2.5);
    expect(await off.desk.sweepThanks()).toEqual({ thanked: 0 });
  });

  test("a no-show or a cancelled booking is not thanked", async () => {
    const t = setup();
    await seedThanks(t);
    const a = await book(t, "13:00");
    const b = await book(t, "15:00", { name: "Bo", email: "bo@example.com" });
    await t.adm({ op: "cancel", id: b.body.id });
    after(t, "13:00", 0.1);
    await t.adm({ op: "noShow", id: a.body.id });
    after(t, "15:00", 2.5);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 0 });
  });

  test("with tips on, a paid visit is thanked in the tip email, review link included, never twice", async () => {
    const t = setup();
    await seedThanks(t, { tips: true });
    const r = await book(t, "15:00");
    await t.adm({ op: "paidAtShop", id: r.body.id });
    after(t, "15:00", 2.5);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 0 });
    expect(await t.desk.sweepTips()).toEqual({ asked: 1 });
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 0 });
    const emails = thanks(t);
    expect(emails).toHaveLength(1);
    expect(emails[0].html).toContain("Add a tip");
    expect(emails[0].html).toContain(`href="${REVIEW}"`);
  });

  test("the review link must be a full https address", () => {
    expect(cleanBookingSettings({ reviewUrl: " https://g.page/r/x/review " }).reviewUrl).toBe("https://g.page/r/x/review");
    expect(cleanBookingSettings({ reviewUrl: "http://example.com" }).reviewUrl).toBe("");
    expect(cleanBookingSettings({ reviewUrl: "javascript:alert(1)" }).reviewUrl).toBe("");
    expect(cleanBookingSettings({}).thankYou).toBe(false);
  });
});

describe("rebook reminders", () => {
  const seedRebook = async (t, weeks = 6) => {
    await t.seed();
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000, rebookWeeks: weeks });
  };
  const book = (t, day, extra = {}) => t.pub({ action: "bookingStart", serviceId: "cut", start: at(day, "15:00"), ...CUSTOMER, ...extra });
  const weeksAfter = (t, day, weeks, days = 0) => { t.clock.now = new Date(Date.parse(at(day, "15:00")) + (weeks * 7 + days) * 86_400_000); };
  const rebooks = (t) => t.emails.filter((e) => /^Time for your next/.test(e.subject));

  test("one reminder the set number of weeks after a visit, with Book again and an unsubscribe link", async () => {
    const t = setup();
    await seedRebook(t);
    const r = await book(t, "2026-11-18");
    weeksAfter(t, "2026-11-18", 5);
    expect(await t.desk.sweepRebook()).toEqual({ reminded: 0 });
    weeksAfter(t, "2026-11-18", 6, 1);
    expect(await t.desk.sweepRebook()).toEqual({ reminded: 1 });
    expect(await t.desk.sweepRebook()).toEqual({ reminded: 0 });
    const [email] = rebooks(t);
    expect(email.to).toBe(CUSTOMER.email);
    expect(email.subject).toBe("Time for your next Cut?");
    expect(email.html).toContain("/book?service=cut");
    expect(email.html).toContain("Hi Ada");
    expect(email.html).toContain("unsubscribe=1");
    expect(t.db.store.get(`bookings/${r.body.id}`).rebookSentAt).toBeTruthy();
  });

  test("a client who booked again, unsubscribed or missed the visit gets nothing; off and old visits too", async () => {
    const again = setup();
    await seedRebook(again);
    await book(again, "2026-11-18");
    await book(again, "2026-12-02");
    weeksAfter(again, "2026-11-18", 6, 1);
    expect(await again.desk.sweepRebook()).toEqual({ reminded: 0 });
    expect(again.db.store.get("bookings/booking001").rebookSkipped).toBe("booked");

    const out = setup();
    await seedRebook(out);
    out.optOuts.add(CUSTOMER.email);
    await book(out, "2026-11-18");
    weeksAfter(out, "2026-11-18", 6, 1);
    expect(await out.desk.sweepRebook()).toEqual({ reminded: 0 });
    expect(out.db.store.get("bookings/booking001").rebookSkipped).toBe("unsubscribed");

    const missed = setup();
    await seedRebook(missed);
    await book(missed, "2026-11-18");
    await missed.db.collection("bookings").doc("booking001").set({ noShow: true }, { merge: true });
    weeksAfter(missed, "2026-11-18", 6, 1);
    expect(await missed.desk.sweepRebook()).toEqual({ reminded: 0 });

    const off = setup();
    await seedRebook(off, 0);
    await book(off, "2026-11-18");
    weeksAfter(off, "2026-11-18", 6, 1);
    expect(await off.desk.sweepRebook()).toEqual({ reminded: 0 });

    const old = setup();
    await seedRebook(old);
    await book(old, "2026-11-18");
    weeksAfter(old, "2026-11-18", 6, 20);
    expect(await old.desk.sweepRebook()).toEqual({ reminded: 0 });
    expect(rebooks(again).length + rebooks(out).length + rebooks(missed).length + rebooks(off).length + rebooks(old).length).toBe(0);
  });
});

describe("reviews of visits on the shop's website", () => {
  const seedReviews = async (t, extra = {}) => {
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, thankYou: true, siteReviews: true, ...extra });
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
  };
  const keyFrom = (html) => /key=([a-z0-9]+)#review/.exec(html)?.[1];

  test("the thank-you email links to the booking page, where one review is taken and waits for the owner", async () => {
    const t = setup();
    await seedReviews(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), name: "Ada Reader", email: "ada@example.com" });
    const id = r.body.id;
    t.clock.now = new Date(Date.parse(at("2026-11-18", "15:00")) + 3 * 3_600_000);
    expect(await t.desk.sweepThanks()).toEqual({ thanked: 1 });
    const email = t.emails.find((e) => /^Thank you for coming/.test(e.subject));
    const key = keyFrom(email.html);
    expect(key).toBeTruthy();
    const view = await t.pub({ action: "bookingView", id, key });
    expect(view.body.booking.canReview).toBe(true);
    expect((await t.pub({ action: "bookingReview", id, key, rating: 9, body: "Lovely" })).statusCode).toBe(400);
    const done = await t.pub({ action: "bookingReview", id, key, rating: 5, body: "Lovely cut, thank you." });
    expect(done.statusCode).toBe(200);
    expect(done.body.booking).toMatchObject({ canReview: false, reviewed: true });
    const reviewId = t.db.store.get(`bookings/${id}`).reviewId;
    expect(t.db.store.get(`reviews/${reviewId}`)).toMatchObject({ status: "pending", rating: 5, authorName: "Ada R.", serviceId: "cut", source: "booking", verified: true });
    expect(t.db.store.get(`reviews/${reviewId}`).email).toBeUndefined();
    expect(t.db.store.get(`reviewContacts/${reviewId}`).email).toBe("ada@example.com");
    expect((await t.pub({ action: "bookingReview", id, key, rating: 4, body: "Again" })).body.code).toBe("reviewed");
    expect(t.emails.some((e) => /^\[REVIEW\]/.test(e.subject))).toBe(true);
    // Only approved reviews reach the website.
    expect((await t.pub({ action: "bookingInfo" })).body.reviews).toEqual([]);
    await t.db.collection("reviews").doc(reviewId).set({ status: "approved" }, { merge: true });
    expect((await t.pub({ action: "bookingInfo" })).body.reviews).toEqual([expect.objectContaining({ authorName: "Ada R.", rating: 5, serviceName: "Cut" })]);
  });

  test("a visit still to come, a no-show, or a shop that doesn't take reviews can't be reviewed", async () => {
    const t = setup();
    await seedReviews(t);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    const { id, key } = r.body;
    expect((await t.pub({ action: "bookingView", id, key })).body.booking.canReview).toBe(false);
    expect((await t.pub({ action: "bookingReview", id, key, rating: 5, body: "Too early" })).body.code).toBe("no_review");
    t.clock.now = new Date(Date.parse(at("2026-11-18", "15:00")) + 3 * 3_600_000);
    await t.db.collection("bookings").doc(id).set({ noShow: true }, { merge: true });
    expect((await t.pub({ action: "bookingReview", id, key, rating: 5, body: "Never came" })).body.code).toBe("no_review");

    const off = setup();
    await seedReviews(off, { siteReviews: false });
    await off.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "15:00"), ...CUSTOMER });
    off.clock.now = new Date(Date.parse(at("2026-11-18", "15:00")) + 3 * 3_600_000);
    await off.desk.sweepThanks();
    expect(off.emails.find((e) => /^Thank you for coming/.test(e.subject)).html).not.toContain("#review");
    expect((await off.pub({ action: "bookingInfo" })).body.reviews).toEqual([]);
  });
});

describe("courses: one sign-up, one price, a place on every date", () => {
  const person = (n) => ({ name: `Person ${n}`, email: `p${n}@example.com` });
  const DATES = ["2026-12-05T18:00", "2026-11-28T18:00", "2026-12-12T18:00", "2026-11-28T18:00"];
  const first = at("2026-11-28", "18:00");
  const all = [first, at("2026-12-05", "18:00"), at("2026-12-12", "18:00")];
  async function withCourse(extra = {}) {
    const t = setup();
    await t.seed();
    const saved = await t.adm({ op: "saveService", service: { name: "Six-week wheel course", minutes: 120, gapAfter: 0, places: 2, payment: "full", priceMinor: 18000, courseDates: DATES, classTimes: [{ weekday: 1, time: "10:00" }], ...extra } });
    return { t, id: saved.body.service?.id, saved };
  }
  const items = async (t, day) => Object.keys((await t.db.collection("bookingDays").doc(day).get()).data()?.items || {}).sort();

  test("a course keeps its dates in order, drops weekly times and packs, and needs two dates and two places", async () => {
    const { saved } = await withCourse({ packVisits: 5, packPriceMinor: 5000 });
    expect(saved.body.service).toMatchObject({ courseDates: ["2026-11-28T18:00", "2026-12-05T18:00", "2026-12-12T18:00"], classTimes: [], packVisits: 0 });
    const t = setup();
    await t.seed();
    expect((await t.adm({ op: "saveService", service: { name: "One date", minutes: 60, places: 4, courseDates: ["2026-11-28T18:00"] } })).body.error).toMatch(/at least 2 dates/);
    expect((await t.adm({ op: "saveService", service: { name: "One person", minutes: 60, places: 1, courseDates: DATES } })).body.error).toMatch(/at least 2 people/);
  });

  test("it is offered only on its first date, however far ahead, and the page gets every date", async () => {
    const { t, id } = await withCourse();
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 3 } });
    const info = (await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === id);
    expect(info.courseStarts).toEqual(all);
    const times = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-27", days: 10 })).body.days;
    expect(Object.entries(times).filter(([, list]) => list.length)).toEqual([["2026-11-28", [first]]]);
    // A later date can't be signed up for on its own.
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: all[1], ...person(1) })).statusCode).toBe(409);
  });

  test("one paid sign-up holds every date, confirms them together, and cancelling frees them all", async () => {
    const { t, id } = await withCourse();
    const started = await t.pub({ action: "bookingStart", serviceId: id, start: first, ...person(1) });
    expect(started.body).toMatchObject({ status: "held" });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(18000);
    const bid = started.body.id;
    expect(await items(t, "2026-11-28")).toEqual([bid]);
    expect(await items(t, "2026-12-05")).toEqual([`${bid}~1`]);
    expect(await items(t, "2026-12-12")).toEqual([`${bid}~2`]);
    // Paid: every date stops being a hold, and the email lists all three dates.
    const sid = [...t.sessions.keys()][0];
    Object.assign(t.sessions.get(sid), { payment_status: "paid", status: "complete", payment_intent: "pi_course" });
    const view = (await t.pub({ action: "bookingView", id: bid, key: started.body.key })).body.booking;
    expect(view).toMatchObject({ status: "confirmed", paid: true, courseStarts: all, canMove: false, canChange: true });
    expect((await t.db.collection("bookingDays").doc("2026-12-12").get()).data().items[`${bid}~2`].held).toBe(false);
    const mail = t.emails.find((m) => m.to === "p1@example.com" && /Booked/.test(m.subject));
    expect(mail.html).toContain("All 3 dates");
    expect(mail.html).toContain("December 12, 2026");
    // It can't be moved, by the customer or the owner.
    expect((await t.pub({ action: "bookingMove", id: bid, key: started.body.key, start: all[1] })).body.code).toBe("course");
    expect((await t.adm({ op: "move", id: bid, start: all[1] })).body.code).toBe("course");
    // Cancelling refunds the one price and frees every date.
    expect((await t.pub({ action: "bookingCancel", id: bid, key: started.body.key })).statusCode).toBe(200);
    expect(t.refunds).toHaveLength(1);
    for (const day of ["2026-11-28", "2026-12-05", "2026-12-12"]) expect(await items(t, day)).toEqual([]);
  });

  test("a course is full when any date is, and something else in a later date's way stops the sign-up", async () => {
    const { t, id } = await withCourse({ payment: "free", priceMinor: 0 });
    for (const n of [1, 2]) expect((await t.pub({ action: "bookingStart", serviceId: id, start: first, ...person(n) })).body.status).toBe("confirmed");
    const full = await t.pub({ action: "bookingStart", serviceId: id, start: first, ...person(3) });
    expect(full.statusCode).toBe(409);
    // Another shop: an ordinary booking sits on the second date, so nobody can take the course.
    const other = await withCourse({ payment: "free", priceMinor: 0 });
    expect((await other.t.adm({ op: "create", serviceId: "visit", start: at("2026-12-05", "18:30"), ...person(9) })).statusCode).toBe(200);
    const blocked = await other.t.pub({ action: "bookingStart", serviceId: other.id, start: first, ...person(1) });
    expect(blocked.body).toMatchObject({ code: "taken", error: expect.stringContaining("one of its dates") });
    expect(await items(other.t, "2026-11-28")).toEqual([]);
  });

  test("the owner signs someone up for the whole course, and the Timetable lists it with the fewest places left", async () => {
    const { t, id } = await withCourse({ payment: "free", priceMinor: 0 });
    await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    expect((await t.adm({ op: "create", serviceId: id, ...person(1) })).statusCode).toBe(200);
    const page = (await t.pub({ action: "classTimetable" })).body;
    expect(page.sessions).toEqual([]);
    expect(page.courses).toEqual([expect.objectContaining({ id, name: "Six-week wheel course", starts: all, left: 1, places: 2 })]);
    // Once the first date has started it leaves the page and can't be signed up for.
    t.clock.now = new Date(at("2026-11-28", "18:05"));
    expect((await t.pub({ action: "classTimetable" })).body.courses).toEqual([]);
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: first, ...person(2) })).body.code).toBe("started");
    expect((await t.adm({ op: "create", serviceId: id, ...person(2) })).body.code).toBe("started");
  });

  test("a later date's stand-in is kept on the booking when the first date's person is busy then", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, staff: [{ id: "ana", name: "Ana" }, { id: "ben", name: "Ben" }] });
    const one = (await t.adm({ op: "saveService", service: { name: "Glazing", minutes: 60, places: 1, payment: "free" } })).body.service.id;
    const id = (await t.adm({ op: "saveService", service: { name: "Wheel course", minutes: 60, places: 2, payment: "free", courseDates: ["2026-11-28T18:00", "2026-12-05T18:00"] } })).body.service.id;
    // Ana is taken on the second date.
    const busy = Date.parse(at("2026-12-05", "18:00"));
    await t.db.collection("bookingDays").doc("2026-12-05").set({ items: { other: { start: busy, end: busy + 3600_000, held: false, at: busy, s: one, p: "ana" } } });
    const made = (await t.pub({ action: "bookingStart", serviceId: id, start: first, staffId: "ana", ...person(2) })).body;
    const b = (await t.db.collection("bookings").doc(made.id).get()).data();
    expect(b.staffName).toBe("Ana");
    expect(b.course.staff).toEqual(["Ana", "Ben"]);
  });

  test("every later date gets its own reminders, once, and the calendars list every date", async () => {
    const { t, id } = await withCourse({ payment: "free", priceMinor: 0 });
    await t.adm({ op: "saveSettings", settings: { live: true, reminderHours: 24, secondReminderHours: 2 } });
    const made = (await t.adm({ op: "create", serviceId: id, ...person(1) })).body;
    const bid = made.id || made.booking?.id;
    const subjects = (word) => t.emails.filter((m) => String(m.subject).startsWith(word)).map((m) => m.subject);
    // The day before the second date.
    t.clock.now = new Date(Date.parse(at("2026-12-04", "19:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 1 });
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
    expect(subjects("Coming up:")).toHaveLength(1);
    expect(subjects("Coming up:")[0]).toContain("December 5");
    // An hour before it: the short reminder, about the same date.
    t.clock.now = new Date(Date.parse(at("2026-12-05", "17:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 1 });
    expect(subjects("Soon:")[0]).toContain("December 5");
    expect(t.db.store.get(`bookings/${bid}`).course).toMatchObject({ reminded: [all[1]], reminded2: [all[1]] });
    // The third date, a week on.
    t.clock.now = new Date(Date.parse(at("2026-12-11", "19:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 1 });
    expect(subjects("Coming up:")[1]).toContain("December 12");
    // A cancelled course is told nothing more.
    await t.adm({ op: "cancel", id: bid });
    t.clock.now = new Date(Date.parse(at("2026-12-12", "17:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
  });

  test("a later date booked inside its reminder window gets no reminder for it", async () => {
    const { t, id } = await withCourse({ payment: "free", priceMinor: 0 });
    await t.adm({ op: "saveSettings", settings: { live: true, reminderHours: 24, secondReminderHours: 0 } });
    const made = (await t.adm({ op: "create", serviceId: id, ...person(1) })).body;
    const bid = made.id || made.booking?.id;
    const row = t.db.store.get(`bookings/${bid}`);
    t.db.store.set(`bookings/${bid}`, { ...row, createdAt: new Date(Date.parse(at("2026-12-04", "20:00"))).toISOString(), reminderSentAt: row.createdAt });
    t.clock.now = new Date(Date.parse(at("2026-12-04", "21:00")));
    expect(await t.desk.sweepReminders()).toEqual({ reminded: 0 });
  });

  test("joining late with a first-visit price: never more than the late-join price", async () => {
    const { t, id } = await withCourse({ lateJoin: true, introPriceMinor: 15000 });
    await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 60 } });
    t.clock.now = new Date(at("2026-11-28", "20:30"));
    const late = await t.pub({ action: "bookingStart", serviceId: id, start: all[1], ...person(2) });
    expect(late.body).toMatchObject({ status: "held" });
    expect(t.db.store.get(`bookings/${late.body.id}`)).toMatchObject({ priceMinor: 12000 });
    expect(t.db.store.get(`bookings/${late.body.id}`).intro).toBeUndefined();
  });

  test("joining late: the dates left at their share of the price, alongside the people already on it", async () => {
    const { t, id } = await withCourse({ lateJoin: true });
    await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 60 } });
    // Someone signs up before it starts.
    const early = await t.adm({ op: "create", serviceId: id, ...person(1) });
    expect(early.statusCode).toBe(200);
    t.clock.now = new Date(at("2026-11-28", "20:30"));
    const info = (await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === id);
    expect(info).toMatchObject({ courseStarts: all.slice(1), priceMinor: 12000, joining: { missed: 1, of: 3, fullPriceMinor: 18000 } });
    const page = (await t.pub({ action: "classTimetable" })).body.courses;
    expect(page).toEqual([expect.objectContaining({ id, starts: all.slice(1), priceMinor: 12000, left: 1, joining: { missed: 1, of: 3, fullPriceMinor: 18000 } })]);
    const times = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-28", days: 14 })).body.days;
    expect(Object.entries(times).filter(([, list]) => list.length)).toEqual([["2026-12-05", [all[1]]]]);
    // The first date is gone; the next one is the start, for two thirds of the price.
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: first, ...person(2) })).statusCode).toBe(409);
    const late = await t.pub({ action: "bookingStart", serviceId: id, start: all[1], ...person(2) });
    expect(late.body).toMatchObject({ status: "held" });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(12000);
    const bid = late.body.id;
    // The late joiner shares the dates left with the person already on the course, and has nothing on the date missed.
    expect(await items(t, "2026-12-05")).toHaveLength(2);
    expect(await items(t, "2026-12-05")).toContain(bid);
    expect(await items(t, "2026-12-12")).toContain(`${bid}~1`);
    expect(await items(t, "2026-11-28")).not.toContain(bid);
    expect(t.db.store.get(`bookings/${bid}`)).toMatchObject({ priceMinor: 12000, course: { joined: { missed: 1, of: 3, fullPriceMinor: 18000 } } });
    // With one date left it closes, on the page and for sign-ups.
    t.clock.now = new Date(at("2026-12-05", "20:30"));
    expect((await t.pub({ action: "classTimetable" })).body.courses).toEqual([]);
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: all[2], ...person(3) })).body.code).toBe("started");
  });

  test("a course that doesn't let people join late stays closed once it starts", async () => {
    const { t, id, saved } = await withCourse();
    expect(saved.body.service.lateJoin).toBeUndefined();
    t.clock.now = new Date(at("2026-11-28", "20:30"));
    await t.adm({ op: "saveSettings", settings: { live: true, maxDaysAhead: 60 } });
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: all[1], ...person(2) })).body.code).toBe("started");
  });

  test("the Timetable gives no count for a course whose days it couldn't all read", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("platform").doc("features").set({ bookings: true, ways: { classes: true } });
    await t.db.collection("firstWeek").doc("start").set({ ways: { classes: true } });
    const month = (m) => Array.from({ length: 28 }, (_, i) => `2027-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}T18:00`);
    const ids = [];
    for (const m of [1, 3, 5, 7, 9, 11]) ids.push((await t.adm({ op: "saveService", service: { name: `Course ${m}`, minutes: 60, places: 4, payment: "free", courseDates: month(m) } })).body.service.id);
    const courses = (await t.pub({ action: "classTimetable" })).body.courses;
    expect(courses).toHaveLength(6);
    // 30 days each: six whole courses fit in 200, the seventh would not.
    expect(courses.every((c) => c.left === 4)).toBe(true);
    await t.adm({ op: "saveService", service: { name: "Course 12", minutes: 60, places: 4, payment: "free", courseDates: month(12) } });
    const more = (await t.pub({ action: "classTimetable" })).body.courses;
    expect(more.filter((c) => c.left === undefined).map((c) => c.name)).toEqual(["Course 12"]);
  });
});

describe("classes: a minimum number to run", () => {
  const person = (n) => ({ name: `Person ${n}`, email: `p${n}@example.com` });
  // Wednesdays at 14:00, four places, needs two, decided a day before.
  const wed = at("2026-11-18", "14:00");
  async function withClass(extra = {}) {
    const t = setup();
    await t.seed();
    const saved = await t.adm({ op: "saveService", service: { name: "Life drawing", minutes: 120, gapAfter: 0, places: 4, payment: "full", priceMinor: 3000, classTimes: [{ weekday: 3, time: "14:00" }], minPlaces: 2, ...extra } });
    return { t, id: saved.body.service?.id, saved };
  }
  async function signUp(t, id, n) {
    const r = await t.pub({ action: "bookingStart", serviceId: id, start: wed, ...person(n) });
    const sid = `cs_test_${String(t.opened.length - 1).padStart(8, "0")}`;
    Object.assign(t.sessions.get(sid), { payment_status: "paid", payment_intent: `pi_${n}` });
    await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    return r.body.id;
  }

  test("kept only for a group at set times, never above the places, decided a day before by default", async () => {
    const { saved } = await withClass();
    expect(saved.body.service).toMatchObject({ minPlaces: 2, decideHours: 24 });
    const t = setup();
    await t.seed();
    // A class at any free time has no session to decide; one person at a time has no group.
    expect((await t.adm({ op: "saveService", service: { name: "Open studio", minutes: 60, places: 4, payment: "free", minPlaces: 2 } })).body.service.minPlaces).toBeUndefined();
    expect((await t.adm({ op: "saveService", service: { name: "One to one", minutes: 60, places: 1, payment: "free", minPlaces: 2, classTimes: [{ weekday: 3, time: "18:00" }] } })).body.service.minPlaces).toBeUndefined();
    expect((await t.adm({ op: "saveService", service: { name: "Tiny", minutes: 60, places: 3, payment: "free", minPlaces: 5, classTimes: [{ weekday: 3, time: "18:00" }] } })).statusCode).toBe(400);
    expect((await withClass({ minPlaces: 1 })).saved.body.service.minPlaces).toBeUndefined();
    expect((await withClass({ decideHours: 999 })).saved.body.service.decideHours).toBe(168);
    // Customers see it on Book a time.
    const { t: u, id } = await withClass();
    expect((await u.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === id).minPlaces).toBe(2);
  });

  test("too few at the decide time: everyone is refunded and emailed, the owner is told, and the time closes", async () => {
    const { t, id } = await withClass();
    const bid = await signUp(t, id, 1);
    expect(t.db.store.get(`bookings/${bid}`).status).toBe("confirmed");
    // Before the decide time nothing happens.
    t.clock.now = new Date(Date.parse(wed) - 25 * 3600_000);
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 0 });
    t.clock.now = new Date(Date.parse(wed) - 23 * 3600_000);
    t.emails.length = 0;
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 1, ran: 0 });
    expect(t.db.store.get(`bookings/${bid}`)).toMatchObject({ status: "cancelled", cancelledFor: "minimum", cancelledBy: "minimum" });
    expect(t.refunds).toEqual([expect.objectContaining({ paymentIntentId: "pi_1", amountMinor: 3000 })]);
    expect(t.emails.map((e) => e.to).sort()).toEqual(["owner@example.com", "p1@example.com"]);
    expect(t.emails.find((e) => e.to === "p1@example.com").html).toContain("Not enough people signed up for this class to run");
    expect(t.emails.find((e) => e.to === "owner@example.com").subject).toContain("Not enough people: Life drawing");
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toMatchObject({ decision: "cancelled", count: 1, minPlaces: 2 });
    // Decided once; the time is neither offered nor full (no waiting list), and signing up is refused.
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 0 });
    const times = (await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-18", days: 1 })).body;
    expect(times.days["2026-11-18"]).toEqual([]);
    expect(times.full["2026-11-18"]).toBeUndefined();
    expect((await t.pub({ action: "bookingStart", serviceId: id, start: wed, ...person(3) })).statusCode).toBe(409);
    // Another service at the same time is not held up by the closed class.
    expect((await t.pub({ action: "bookingStart", serviceId: "visit", start: wed, ...person(4) })).statusCode).toBe(200);
    // Next week's class is still open.
    const next = at("2026-11-25", "14:00");
    expect((await t.pub({ action: "bookingTimes", serviceId: id, from: "2026-11-25", days: 1 })).body.days["2026-11-25"]).toEqual([next]);
  });

  test("enough people: it runs and stays open, and is not decided again", async () => {
    const { t, id } = await withClass();
    await signUp(t, id, 1);
    await signUp(t, id, 2);
    t.clock.now = new Date(Date.parse(wed) - 2 * 3600_000);
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 1 });
    expect(t.refunds).toEqual([]);
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 0 });
    // Someone cancelling after the decision doesn't cancel the class.
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toMatchObject({ decision: "runs", count: 2 });
  });

  test("someone still paying holds the decision until the next sweep", async () => {
    const { t, id } = await withClass();
    await signUp(t, id, 1);
    await t.pub({ action: "bookingStart", serviceId: id, start: wed, ...person(2) });
    t.clock.now = new Date(Date.parse(wed) - 2 * 3600_000);
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 0 });
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toBeUndefined();
  });

  test("a course is decided on its first date and every date closes", async () => {
    const t = setup();
    await t.seed();
    const dates = ["2026-11-28T18:00", "2026-12-05T18:00"];
    const id = (await t.adm({ op: "saveService", service: { name: "Wheel course", minutes: 120, places: 4, payment: "free", courseDates: dates, minPlaces: 3, decideHours: 48 } })).body.service.id;
    const made = (await t.adm({ op: "create", serviceId: id, ...person(1) })).body;
    const bid = made.id || made.booking?.id;
    t.clock.now = new Date(Date.parse(at("2026-11-26", "19:00")));
    t.emails.length = 0;
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 1, ran: 0 });
    expect(t.db.store.get(`bookings/${bid}`).status).toBe("cancelled");
    expect(t.emails.find((e) => e.to === "p1@example.com").html).toContain("for this course to run");
    const second = Object.values(t.db.store.get("bookingDays/2026-12-05").items);
    expect(second).toEqual([expect.objectContaining({ s: id, closed: true })]);
  });

  test("a refund that fails stays on the list, the owner is told, and the next sweeps finish it, after the start too", async () => {
    const { t, id } = await withClass();
    const bid = await signUp(t, id, 1);
    t.clock.now = new Date(Date.parse(wed) - 2 * 3600_000);
    t.emails.length = 0;
    t.refunds.failNext = 1;
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 1, ran: 0 });
    expect(t.db.store.get(`bookings/${bid}`).status).toBe("confirmed");
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toMatchObject({ decision: "cancelled", left: [bid], retry: true, retryAt: new Date(Date.parse(wed) - 2 * 3600_000).toISOString() });
    const owner = t.emails.find((e) => e.to === "owner@example.com").html;
    expect(owner).toContain("The refund didn't go through yet");
    expect(owner).not.toContain("refunded in full and emailed");
    // The class has started; the next sweep still finishes the refund and the cancel.
    t.clock.now = new Date(Date.parse(wed) + 3600_000);
    await t.desk.sweepMinimum();
    expect(t.db.store.get(`bookings/${bid}`)).toMatchObject({ status: "cancelled", cancelledFor: "minimum" });
    expect([...t.refunds]).toEqual([expect.objectContaining({ paymentIntentId: "pi_1", amountMinor: 3000 })]);
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toMatchObject({ left: [], retry: false, retryAt: null });
  });

  test("a sweep cut short before closing the time closes it on the next sweep", async () => {
    const { t, id } = await withClass();
    const bid = await signUp(t, id, 1);
    const decided = new Date(Date.parse(wed) - 2 * 3600_000).toISOString();
    // What the first sweep wrote before it stopped: the decision, nobody cancelled and the time still open.
    t.db.store.set(`bookingRuns/${id}~${Date.parse(wed)}`, { serviceId: id, start: new Date(wed).toISOString(), decision: "cancelled", count: 1, minPlaces: 2, decidedAt: decided, closed: false, left: [bid], retry: true, retryAt: decided });
    t.clock.now = new Date(Date.parse(wed) - 3600_000);
    await t.desk.sweepMinimum();
    expect(Object.values(t.db.store.get("bookingDays/2026-11-18").items)).toContainEqual(expect.objectContaining({ s: id, closed: true }));
    expect(t.db.store.get(`bookings/${bid}`).status).toBe("cancelled");
    expect(t.db.store.get(`bookingRuns/${id}~${Date.parse(wed)}`)).toMatchObject({ closed: true, retry: false, retryAt: null });
  });

  test("without a minimum nothing is decided", async () => {
    const { t, id } = await withClass({ minPlaces: 0 });
    await signUp(t, id, 1);
    t.clock.now = new Date(Date.parse(wed) - 2 * 3600_000);
    expect(await t.desk.sweepMinimum()).toEqual({ cancelled: 0, ran: 0 });
  });
});

describe("classes: a class pass and a first-visit price", () => {
  const wed = at("2026-11-18", "14:00");
  const thu = at("2026-11-19", "14:00");
  async function ready() {
    const t = setup();
    await t.seed();
    const save = async (service) => (await t.adm({ op: "saveService", service })).body.service;
    const drawing = await save({ name: "Life drawing", minutes: 60, places: 6, payment: "full", priceMinor: 2500, classTimes: [{ weekday: 3, time: "14:00" }], packVisits: 5, packPriceMinor: 10000, packAnyClass: true });
    const yoga = await save({ name: "Yoga", minutes: 60, places: 6, payment: "full", priceMinor: 2000, classTimes: [{ weekday: 4, time: "14:00" }], introPriceMinor: 500 });
    return { t, drawing, yoga };
  }
  async function buyPass(t, serviceId) {
    await t.pub({ action: "bookingPackBuy", serviceId, ...CUSTOMER });
    const code = decodeURIComponent(t.opened.at(-1).params.success_url.split("pack=")[1]);
    Object.assign(t.sessions.get(`cs_test_${String(t.opened.length - 1).padStart(8, "0")}`), { payment_status: "paid", payment_intent: "pi_pass" });
    await t.pub({ action: "bookingPackView", pack: code });
    return code;
  }

  test("a class pass books any weekly class, but not a one-to-one service", async () => {
    const { t, drawing, yoga } = await ready();
    expect(drawing).toMatchObject({ packAnyClass: true });
    const code = await buyPass(t, drawing.id);
    const pack = [...t.db.store.entries()].find(([k]) => k.startsWith("bookingPacks/"))[1];
    expect(pack).toMatchObject({ anyClass: true, serviceName: "Any class" });
    expect(t.opened[0].params.line_items[0].price_data.product_data.name).toContain("class pass of 5 classes");
    expect((await t.pub({ action: "bookingStart", serviceId: drawing.id, start: wed, ...CUSTOMER, pack: code })).body.status).toBe("confirmed");
    expect((await t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER, pack: code })).body.status).toBe("confirmed");
    const other = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-20", "10:00"), ...CUSTOMER, pack: code });
    expect(other.body.code).toBe("pack");
  });

  test("a pass only for a weekly class: a one-to-one service's pack keeps to that service", async () => {
    const t = setup();
    await t.seed();
    const one = (await t.adm({ op: "saveService", service: { name: "Lesson", minutes: 60, places: 1, payment: "full", priceMinor: 5000, packVisits: 3, packPriceMinor: 13500, packAnyClass: true } })).body.service;
    expect(one.packAnyClass).toBeUndefined();
  });

  test("someone new pays the first-visit price once; after that the usual price", async () => {
    const { t, yoga } = await ready();
    expect((await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === yoga.id).introPriceMinor).toBe(500);
    const first = await t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER });
    expect(t.opened.at(-1).params.line_items[0].price_data.unit_amount).toBe(500);
    expect(t.db.store.get(`bookings/${first.body.id}`)).toMatchObject({ priceMinor: 500, intro: true, listPriceMinor: 2000 });
    Object.assign(t.sessions.get(`cs_test_${String(t.opened.length - 1).padStart(8, "0")}`), { payment_status: "paid", payment_intent: "pi_y" });
    await t.pub({ action: "bookingView", id: first.body.id, key: first.body.key });
    await t.pub({ action: "bookingStart", serviceId: yoga.id, start: at("2026-11-26", "14:00"), ...CUSTOMER });
    expect(t.opened.at(-1).params.line_items[0].price_data.unit_amount).toBe(2000);
  });

  test("two bookings started at the same moment can't both have the first-visit price", async () => {
    const { t, yoga } = await ready();
    const [a, b] = await Promise.all([
      t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER }),
      t.pub({ action: "bookingStart", serviceId: yoga.id, start: at("2026-11-26", "14:00"), ...CUSTOMER }),
    ]);
    const prices = [a, b].map((r) => t.db.store.get(`bookings/${r.body.id}`).priceMinor).sort();
    expect(prices).toEqual([2000, 500].sort());
  });

  test("a priced extra is still charged on top of the first-visit price", async () => {
    const { t } = await ready();
    await t.db.collection("bookingServices").doc("trial").set({ name: "Trial", minutes: 60, gapAfter: 0, payment: "full", priceMinor: 4000, introPriceMinor: 1000, extras: [{ id: "x", name: "Hot towel", minutes: 15, priceMinor: 500 }] });
    const r = await t.pub({ action: "bookingStart", serviceId: "trial", start: at("2026-11-20", "10:00"), ...CUSTOMER, extras: ["x"] });
    expect(t.opened.at(-1).params.line_items[0].price_data.unit_amount).toBe(1500);
    expect(t.db.store.get(`bookings/${r.body.id}`)).toMatchObject({ priceMinor: 1500, intro: true });
  });

  test("many cancelled bookings never hide an earlier visit from the first-visit check", async () => {
    const { t, yoga } = await ready();
    for (let i = 0; i < 60; i++) t.db.store.set(`bookings/old${String(i).padStart(2, "0")}`, { customer: { email: CUSTOMER.email.toLowerCase() }, status: "cancelled" });
    t.db.store.set("bookings/zz-visit", { customer: { email: CUSTOMER.email.toLowerCase() }, status: "confirmed" });
    await t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER });
    expect(t.opened.at(-1).params.line_items[0].price_data.unit_amount).toBe(2000);
  });

  test("a booking that doesn't go through gives the first-visit price back for the next try", async () => {
    const { t, yoga } = await ready();
    const refused = await t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER, code: "NOSUCHCODE" });
    expect(refused.body.code).toBe("code");
    expect([...t.db.store.keys()].some((k) => k.startsWith("bookingIntros/"))).toBe(false);
    await t.pub({ action: "bookingStart", serviceId: yoga.id, start: thu, ...CUSTOMER });
    expect(t.opened.at(-1).params.line_items[0].price_data.unit_amount).toBe(500);
  });

  test("a first-visit price is below the price and at least 0.50", async () => {
    const t = setup();
    await t.seed();
    const save = (introPriceMinor) => t.adm({ op: "saveService", service: { name: "Yoga", minutes: 60, places: 1, payment: "full", priceMinor: 2000, introPriceMinor } });
    expect((await save(2000)).statusCode).toBe(400);
    expect((await save(20)).statusCode).toBe(400);
    expect((await save(0)).body.service.introPriceMinor).toBeUndefined();
  });
});

describe("standing appointments", () => {
  const RUN = { everyWeeks: 5, visits: 4 };
  const runSetup = async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("bookingServices").doc("cut").set({ name: "Haircut", minutes: 45, gapAfter: 0, payment: "atShop", priceMinor: 6000, repeats: true });
    return t;
  };

  test("only a service the shop marked, paid at the visit or free, offers a run", async () => {
    const t = await runSetup();
    const services = (await t.pub({ action: "bookingInfo" })).body.services;
    expect(services.find((s) => s.id === "cut").repeats).toBe(true);
    expect(services.find((s) => s.id === "visit").repeats).toBeUndefined();
    // A service paid by card when booked can't be booked as a run online.
    const paid = await t.pub({ action: "bookingStart", serviceId: "review", start: at("2026-11-17", "13:00"), ...CUSTOMER, run: RUN });
    expect(paid.statusCode).toBe(400);
    expect(paid.body.code).toBe("run");
  });

  test("a client books every 5 weeks, 4 times: four bookings, one email listing them, each with its own page", async () => {
    const t = await runSetup();
    const check = await t.pub({ action: "bookingRunCheck", serviceId: "cut", start: at("2026-11-17", "10:00"), run: RUN });
    expect(check.body.visits.map((v) => v.start)).toEqual([at("2026-11-17", "10:00"), at("2026-12-22", "10:00"), at("2027-01-26", "10:00"), at("2027-03-02", "10:00")]);
    expect(check.body.visits.every((v) => v.free)).toBe(true);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, run: RUN });
    expect(r.body).toMatchObject({ status: "confirmed", visits: 4 });
    const all = [...t.db.store.entries()].filter(([k]) => k.startsWith("bookings/")).map(([, b]) => b).sort((a, b) => a.start.localeCompare(b.start));
    expect(all).toHaveLength(4);
    expect(all.map((b) => b.series.visit)).toEqual([1, 2, 3, 4]);
    expect(new Set(all.map((b) => b.series.id)).size).toBe(1);
    // Every visit is paid at the visit, at the full price, and shares the run's link key.
    expect(all.every((b) => b.payment === "atShop" && b.priceMinor === 6000 && b.status === "confirmed")).toBe(true);
    expect(new Set(all.map((b) => b.manageKeyHash)).size).toBe(1);
    // One email to the client (and one to the owner) for the whole run.
    expect(t.emails.map((e) => e.to)).toEqual(["ada@example.com", "owner@example.com"]);
    expect(t.emails[0].html).toContain("All 4 visits, every 5 weeks");
    // The page lists every visit of the run; a later visit opens with the same key.
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking.run).toEqual({ visit: 1, visits: 4, everyWeeks: 5 });
    expect(view.body.runVisits.map((v) => v.start)).toEqual(check.body.visits.map((v) => v.start));
    const third = view.body.runVisits[2];
    expect((await t.pub({ action: "bookingView", id: third.id, key: r.body.key })).body.booking.run.visit).toBe(3);
  });

  test("a taken date stops the whole run, and nothing is left booked", async () => {
    const t = await runSetup();
    await t.adm({ op: "create", serviceId: "visit", start: at("2027-01-26", "10:00"), name: "Bo", email: "bo@example.com", sendEmail: false });
    const check = await t.pub({ action: "bookingRunCheck", serviceId: "cut", start: at("2026-11-17", "10:00"), run: RUN });
    expect(check.body.visits.filter((v) => !v.free).map((v) => v.start)).toEqual([at("2027-01-26", "10:00")]);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, run: RUN });
    expect(r.statusCode).toBe(409);
    expect(r.body).toMatchObject({ code: "run_taken", taken: [at("2027-01-26", "10:00")] });
    expect([...t.db.store.values()].filter((b) => b.serviceId === "cut")).toHaveLength(0);
  });

  test("a race on a later date takes every visit back out, the first too", async () => {
    const t = await runSetup();
    // Someone books the third date just after the first visit is taken (after the check passed).
    const set = t.db.store.set.bind(t.db.store);
    let sneaked = false;
    t.db.store.set = (k, v) => {
      const out = set(k, v);
      if (!sneaked && k.startsWith("bookings/") && v?.series?.visit === 1) {
        sneaked = true;
        set("bookingDays/2027-01-26", { items: { other: { start: zonedTime("2027-01-26", "10:00", ZONE), end: zonedTime("2027-01-26", "11:00", ZONE), held: false } } });
      }
      return out;
    };
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, run: RUN });
    expect(sneaked).toBe(true);
    expect(r.statusCode).toBe(409);
    expect(r.body.taken).toEqual([at("2027-01-26", "10:00")]);
    expect([...t.db.store.keys()].filter((k) => k.startsWith("bookings/"))).toHaveLength(0);
    // Only the other client's time is left taken.
    const items = [...t.db.store.entries()].filter(([k]) => k.startsWith("bookingDays/")).flatMap(([, d]) => Object.keys(d.items || {}));
    expect(items).toEqual(["other"]);
  });

  test("bad runs are refused in plain words", async () => {
    const t = await runSetup();
    const ask = (run) => t.pub({ action: "bookingRunCheck", serviceId: "cut", start: at("2026-11-17", "10:00"), run });
    expect((await ask({ everyWeeks: 5, visits: 13 })).body.error).toMatch(/2 to 12 visits/);
    expect((await ask({ everyWeeks: 13, visits: 3 })).body.error).toMatch(/every 1 to 12 weeks/);
    expect((await ask({ everyWeeks: 6, visits: 12 })).body.error).toMatch(/within a year/);
    // One visit is just a booking.
    expect((await ask({ everyWeeks: 5, visits: 1 })).body.visits).toHaveLength(1);
  });

  test("each visit moves alone; cancelling this and the later ones leaves the earlier ones", async () => {
    const t = await runSetup();
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, run: RUN });
    const visits = (await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.runVisits;
    const moved = await t.pub({ action: "bookingMove", id: visits[1].id, key: r.body.key, start: at("2026-12-23", "11:00") });
    expect(moved.statusCode).toBe(200);
    expect(t.db.store.get(`bookings/${visits[2].id}`).start).toBe(at("2027-01-26", "10:00"));
    const gone = await t.pub({ action: "bookingCancel", id: visits[1].id, key: r.body.key, andLater: true });
    expect(gone.body.booking.status).toBe("cancelled");
    expect(gone.body.runVisits.map((v) => v.status)).toEqual(["confirmed", "cancelled", "cancelled", "cancelled"]);
    expect(t.emails.at(-2).html).toContain("2 later visits are cancelled too");
  });

  test("a later visit already paid at the shop stays on when the run is cancelled", async () => {
    const t = await runSetup();
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, run: RUN });
    const visits = (await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key })).body.runVisits;
    expect((await t.adm({ op: "paidAtShop", id: visits[2].id })).statusCode).toBe(200);
    const x = await t.adm({ op: "cancel", id: visits[1].id, andLater: true });
    expect(x.body).toMatchObject({ ok: true, laterCancelled: 1, laterSkipped: 1 });
    expect(visits.map((v) => t.db.store.get(`bookings/${v.id}`).status)).toEqual(["confirmed", "cancelled", "confirmed", "cancelled"]);
  });

  test("the shop books a run for any one-to-one service, paid at each visit, at any hour", async () => {
    const t = await runSetup();
    // Portfolio review is paid by card online, so clients can't book a run; the shop can.
    const check = await t.adm({ op: "runCheck", serviceId: "review", start: at("2026-11-21", "09:00"), run: { everyWeeks: 2, visits: 3 } });
    expect(check.body.visits.every((v) => v.free)).toBe(true);
    const c = await t.adm({ op: "create", serviceId: "review", start: at("2026-11-21", "09:00"), ...CUSTOMER, run: { everyWeeks: 2, visits: 3 } });
    expect(c.body).toMatchObject({ ok: true, visits: 3 });
    const all = [...t.db.store.values()].filter((b) => b.serviceId === "review");
    expect(all.map((b) => b.payment)).toEqual(["atShop", "atShop", "atShop"]);
    // Cancelling the first with the later ones clears the run.
    const x = await t.adm({ op: "cancel", id: c.body.id, andLater: true });
    expect(x.body).toMatchObject({ ok: true, laterCancelled: 2, laterSkipped: 0 });
    expect(all.length).toBe(3);
    expect([...t.db.store.values()].filter((b) => b.serviceId === "review" && b.status === "confirmed")).toHaveLength(0);
    // A class can't be a run.
    expect((await t.adm({ op: "saveService", service: { name: "Life drawing", minutes: 60, places: 6, repeats: true } })).body.service.repeats).toBe(false);
  });

  test("a run that starts at the far edge of the booking window may reach almost a year past it", async () => {
    const t = await runSetup();
    // 57 days out (inside the 60-day window), every 6 weeks, 9 times: the last visit is 393 days from today.
    const LONG = { everyWeeks: 6, visits: 9 };
    const check = await t.pub({ action: "bookingRunCheck", serviceId: "cut", start: at("2027-01-12", "10:00"), run: LONG });
    expect(check.body.visits).toHaveLength(9);
    expect(check.body.visits.at(-1).start).toBe(at("2027-12-14", "10:00"));
    expect(check.body.visits.every((v) => v.free)).toBe(true);
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2027-01-12", "10:00"), ...CUSTOMER, run: LONG });
    expect(r.body).toMatchObject({ status: "confirmed", visits: 9 });
    // The first visit still keeps to the window.
    const far = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2027-02-16", "10:00"), ...CUSTOMER, email: "bo@example.com", run: LONG });
    expect(far.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe("add-ons and options", () => {
  const EXTRAS = [
    { id: "deep", name: "Deep conditioning", minutes: 15, priceMinor: 2000 },
    { id: "long", name: "Long hair", minutes: 30, priceMinor: 0 },
  ];
  const extrasSetup = async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("bookingServices").doc("cut").set({ name: "Haircut", minutes: 45, gapAfter: 0, payment: "atShop", priceMinor: 6000, extras: EXTRAS });
    return t;
  };

  test("the owner saves extras on a one-to-one service; a class keeps none and a free service adds time only", async () => {
    const t = await extrasSetup();
    const one = await t.adm({ op: "saveService", service: { name: "Colour", minutes: 90, payment: "atShop", priceMinor: 9000, extras: [...EXTRAS, { name: "" }, { name: "Toner", minutes: 999, priceMinor: -5 }] } });
    expect(one.body.service.extras).toEqual([...EXTRAS, { id: "x3", name: "Toner", minutes: 240, priceMinor: 0 }]);
    const cls = await t.adm({ op: "saveService", service: { name: "Yoga", minutes: 60, places: 8, extras: EXTRAS } });
    expect(cls.body.service.extras).toEqual([]);
    const free = await t.adm({ op: "saveService", service: { name: "Consult", minutes: 30, extras: EXTRAS } });
    expect(free.body.service.extras.map((e) => e.priceMinor)).toEqual([0, 0]);
  });

  test("ticking an extra makes the free times fit the longer booking", async () => {
    const t = await extrasSetup();
    expect((await t.pub({ action: "bookingInfo" })).body.services.find((s) => s.id === "cut").extras).toEqual(EXTRAS);
    const plain = await t.pub({ action: "bookingTimes", serviceId: "cut", from: "2026-11-17", days: 1 });
    const longer = await t.pub({ action: "bookingTimes", serviceId: "cut", from: "2026-11-17", days: 1, extras: ["long"] });
    expect(plain.body.days["2026-11-17"].at(-1)).toBe(at("2026-11-17", "16:00"));
    expect(longer.body.days["2026-11-17"].at(-1)).toBe(at("2026-11-17", "15:30"));
  });

  test("a booking with extras keeps them, takes their time and adds their price", async () => {
    const t = await extrasSetup();
    const r = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, extras: ["deep", "long", "nope", "deep"] });
    expect(r.body.status).toBe("confirmed");
    const b = t.db.store.get(`bookings/${r.body.id}`);
    expect(b).toMatchObject({ minutes: 90, priceMinor: 8000, payment: "atShop", extras: EXTRAS });
    // The time is held for the whole length: 11:00 is taken, 11:30 is free.
    const times = (await t.pub({ action: "bookingTimes", serviceId: "cut", from: "2026-11-17", days: 1 })).body.days["2026-11-17"];
    expect(times).not.toContain(at("2026-11-17", "11:00"));
    expect(times).toContain(at("2026-11-17", "11:30"));
    expect(t.emails[0].html).toContain("Deep conditioning, Long hair");
    const view = await t.pub({ action: "bookingView", id: r.body.id, key: r.body.key });
    expect(view.body.booking.extras.map((e) => e.id)).toEqual(["deep", "long"]);
  });

  test("too much time, a pack with paid extras, and the owner's own booking", async () => {
    const t = await extrasSetup();
    await t.db.collection("bookingServices").doc("long").set({ name: "Full day", minutes: 450, gapAfter: 0, payment: "atShop", priceMinor: 6000, extras: [{ id: "a", name: "Extra hour", minutes: 60, priceMinor: 0 }] });
    const tooLong = await t.pub({ action: "bookingTimes", serviceId: "long", from: "2026-11-17", days: 1, extras: ["a"] });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.body.code).toBe("extras");
    const pack = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-17", "10:00"), ...CUSTOMER, extras: ["deep"], pack: "ABCD-EFGH-JKLM" });
    expect(pack.statusCode).toBe(400);
    expect(pack.body.code).toBe("pack");
    const own = await t.adm({ op: "create", serviceId: "cut", start: at("2026-11-18", "09:00"), name: "Bo", email: "bo@example.com", extras: ["deep"] });
    expect(own.statusCode).toBe(200);
    expect(t.db.store.get(`bookings/${own.body.id}`)).toMatchObject({ minutes: 60, priceMinor: 8000, extras: [EXTRAS[0]] });
  });
});

describe("prices by person", () => {
  const STAFF = [
    { id: "ana", name: "Ana", rates: [{ serviceId: "cut", minutes: 60, priceMinor: 9000 }, { serviceId: "visit", minutes: null, priceMinor: 5000 }] },
    { id: "ben", name: "Ben" },
  ];
  const withTeam = async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("bookingServices").doc("cut").set({ name: "Cut", minutes: 30, gapAfter: 0, payment: "atShop", priceMinor: 6000 });
    await t.db.collection("bookingSettings").doc("main").set({ ...DEFAULT_BOOKING_SETTINGS, live: true, minNoticeHours: 0, staff: STAFF });
    return t;
  };

  test("saving keeps one rate per service, at least one of length or price, lengths 5 minutes to 8 hours", () => {
    expect(cleanRates([{ serviceId: "cut", minutes: "45", priceMinor: "" }, { serviceId: "cut", priceMinor: 1 }, { serviceId: "x y", minutes: 30 },
      { serviceId: "visit", minutes: null, priceMinor: null }, { serviceId: "long", minutes: 9999 }])).toEqual([
      { serviceId: "cut", minutes: 45, priceMinor: null }, { serviceId: "long", minutes: 480, priceMinor: null }]);
  });

  test("the info lists each person's own rates", async () => {
    const t = await withTeam();
    const staff = (await t.pub({ action: "bookingInfo" })).body.staff;
    expect(staff[0].rates).toEqual(STAFF[0].rates);
    expect(staff[1].rates).toBeUndefined();
  });

  test("booking Ana takes her length and price; anyone free keeps the service's own", async () => {
    const t = await withTeam();
    // Her hour-long cut can't start in the last half hour of the day.
    const anaTimes = (await t.pub({ action: "bookingTimes", serviceId: "cut", from: "2026-11-18", days: 1, staffId: "ana" })).body.days["2026-11-18"];
    const anyTimes = (await t.pub({ action: "bookingTimes", serviceId: "cut", from: "2026-11-18", days: 1 })).body.days["2026-11-18"];
    expect(anaTimes.at(-1)).toBe(at("2026-11-18", "16:00"));
    expect(anyTimes.at(-1)).toBe(at("2026-11-18", "16:30"));
    const withAna = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-18", "10:00"), staffId: "ana", ...CUSTOMER });
    expect(t.db.store.get(`bookings/${withAna.body.id}`)).toMatchObject({ staffId: "ana", minutes: 60, priceMinor: 9000 });
    const anyone = await t.pub({ action: "bookingStart", serviceId: "cut", start: at("2026-11-19", "10:00"), ...CUSTOMER, email: "bo@example.com" });
    expect(t.db.store.get(`bookings/${anyone.body.id}`)).toMatchObject({ minutes: 30, priceMinor: 6000 });
  });

  test("a free service never takes a person's price, and the owner's booking follows the person picked", async () => {
    const t = await withTeam();
    const free = await t.pub({ action: "bookingStart", serviceId: "visit", start: at("2026-11-18", "10:00"), staffId: "ana", ...CUSTOMER });
    expect(t.db.store.get(`bookings/${free.body.id}`)).toMatchObject({ priceMinor: 0, minutes: 60 });
    const own = await t.adm({ op: "create", serviceId: "cut", start: at("2026-11-20", "10:00"), staffId: "ana", name: "Cy", email: "cy@example.com", sendEmail: false });
    expect(t.db.store.get(`bookings/${own.body.id}`)).toMatchObject({ minutes: 60, priceMinor: 9000 });
  });
});
