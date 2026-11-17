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

function setup({ on = true, live = true, checkout = "card", now = "2026-11-16T13:00:00Z", admin = true, provider = "stripe", decline = null, calendar = null, findDiscount = null } = {}) {
  const db = fakeDb();
  const clock = { now: new Date(now) };
  const emails = [];
  const opened = [];
  const closed = [];
  const refunds = [];
  const sessions = new Map();
  const charges = [];
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
      async chargeSaved(args, idem) {
        if (decline) throw Object.assign(new Error("Your card was declined."), { statusCode: 402, type: "card_error", code: decline });
        charges.push({ args, idem });
        return { id: `pi_fee_${charges.length}`, status: "succeeded" };
      },
    } : {}),
  };
  let n = 0;
  const desk = bookingActions({
    db, calendar, findDiscount,
    requireAdmin: async (_req, r) => (admin ? { email: "owner@example.com" } : (r.status(401).json({ error: "no" }), null)),
    payments: { provider, standaloneCheckout: async () => card, refund: async (args) => { refunds.push(args); return { refundId: `re_${refunds.length}`, amountMinor: args.amountMinor }; } },
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
  return { db, desk, clock, emails, opened, closed, refunds, sessions, charges, seed, pub, adm };
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
    expect(Object.keys(body.services[0]).sort()).toEqual(["depositMinor", "depositPercent", "description", "id", "location", "minutes", "name", "payment", "places", "priceMinor", "questions"]);
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
