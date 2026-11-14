// Bookings (beta, bookings.js): off until the platform turns it on, one customer per time even when two ask at once,
// paid times held while the customer pays and freed when they don't, cancel and move only up to the shop's window,
// refunds on the shop's own card account, and the owner's own changes.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { bookingActions, busyFrom } = realRequire("./bookings");
const { zonedTime, DEFAULT_BOOKING_SETTINGS } = realRequire("./shared/bookingTimes");

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
  const query = (c, filters = [], n = 1000) => ({
    where: (f, _op, v) => query(c, [...filters, [f, v]], n),
    limit: (m) => query(c, filters, m),
    async get() {
      const docs = list(c).filter((d) => filters.every(([f, v]) => d.data()[f] === v)).slice(0, n);
      return { docs, empty: docs.length === 0 };
    },
  });
  // Transactions run one after another, which is what Firestore's retries amount to for these tests.
  let queue = Promise.resolve();
  return {
    store,
    collection: (c) => ({ doc: (id) => ref(c, id), ...query(c) }),
    runTransaction(fn) {
      const run = queue.then(() => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o) }));
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

function setup({ on = true, live = true, checkout = "card", now = "2026-11-16T13:00:00Z", admin = true } = {}) {
  const db = fakeDb();
  const clock = { now: new Date(now) };
  const emails = [];
  const opened = [];
  const closed = [];
  const refunds = [];
  const sessions = new Map();
  const card = checkout === null ? null : {
    async open(params, idem) {
      const id = `cs_test_${String(opened.length).padStart(8, "0")}`;
      opened.push({ params, idem });
      sessions.set(id, { id, payment_status: "unpaid", status: "open", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata, payment_intent: null });
      return { id, url: `https://pay.example/${id}` };
    },
    async read(id) { return sessions.get(id) || null; },
    async close(id) { closed.push(id); const s = sessions.get(id); if (s && s.payment_status !== "paid") s.status = "expired"; },
  };
  let n = 0;
  const desk = bookingActions({
    db,
    requireAdmin: async (_req, r) => (admin ? { email: "owner@example.com" } : (r.status(401).json({ error: "no" }), null)),
    payments: { standaloneCheckout: async () => card, refund: async (args) => { refunds.push(args); return { refundId: `re_${refunds.length}`, amountMinor: args.amountMinor }; } },
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
  return { db, desk, clock, emails, opened, closed, refunds, sessions, seed, pub, adm };
}

const CUSTOMER = { name: "Ada Reader", email: "ada@example.com" };

describe("off until the platform turns it on", () => {
  test("a shop without the switch answers off and the admin is refused", async () => {
    const t = setup({ on: false });
    await t.seed();
    expect((await t.pub({ action: "bookingInfo" })).body).toEqual({ on: false });
    expect((await t.adm({ op: "saveSettings", settings: {} })).statusCode).toBe(403);
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
    expect(Object.keys(body.services[0]).sort()).toEqual(["description", "id", "location", "minutes", "name", "payment", "priceMinor"]);
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

  test("books a customer in outside the hours, cancels with a refund choice, and marks a no-show", async () => {
    const t = setup();
    await t.seed();
    const c = await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:00"), ...CUSTOMER });
    expect(c.body.ok).toBe(true);
    expect(t.db.store.get(`bookings/${c.body.id}`)).toMatchObject({ source: "admin", status: "confirmed" });
    expect((await t.adm({ op: "create", serviceId: "visit", start: at("2026-11-21", "09:30"), ...CUSTOMER })).statusCode).toBe(409);
    expect((await t.adm({ op: "noShow", id: c.body.id })).body.ok).toBe(true);
    expect(t.db.store.get(`bookings/${c.body.id}`).noShow).toBe(true);
    expect((await t.adm({ op: "cancel", id: c.body.id, refund: true })).body).toEqual({ ok: true, refunded: false });
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
