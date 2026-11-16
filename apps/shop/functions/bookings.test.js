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
    where: (f, op, v) => query(c, [...filters, [f, v, op]], n),
    limit: (m) => query(c, filters, m),
    async get() {
      const docs = list(c).filter((d) => filters.every(([f, v, op]) => { const x = d.data()[f]; return op === "<" ? x < v : op === "<=" ? x <= v : op === ">" ? x > v : op === ">=" ? x >= v : x === v; })).slice(0, n);
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
