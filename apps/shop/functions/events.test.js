// Events and tickets (beta, events.js): off until both switches are on, the last ticket sold once even when two ask at
// once, places held while the customer pays and freed when they don't, a paid page confirmed once with its codes, free
// tickets at once, and the owner's own changes.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { eventActions } = realRequire("./events");

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
      const at = (data, f) => f.split(".").reduce((o, k) => o?.[k], data);
      const docs = list(c).filter((d) => filters.every(([f, v, op]) => (op === "array-contains" ? (d.data()[f] || []).includes(v) : at(d.data(), f) === v))).slice(0, n);
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

const EVENT = {
  title: "Autumn launch", start: "2026-12-05T19:00:00-05:00", end: "2026-12-05T22:00:00-05:00", venue: "The Print Room", address: "12 Ink Lane",
  onlineUrl: "https://meet.example/launch", status: "live",
  tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 2 }, { id: "free", name: "Friend of the press", priceMinor: 0, places: 5 }],
};
const BUYER = { name: "Ada Reader", email: "ada@example.com" };

function setup({ platform = true, owner = true, checkout = "card", now = "2026-11-17T13:00:00Z", admin = true, shopTax = null, budget = true, openFails = null, refundFails = false, codeBox = true, members = null } = {}) {
  const db = fakeDb();
  const clock = { now: new Date(now) };
  const emails = [];
  const opened = [];
  const closed = [];
  const refunds = [];
  const sessions = new Map();
  const card = checkout === null ? null : {
    async open(params, idem) {
      if (openFails) throw Object.assign(new Error("no"), { code: openFails });
      const id = `cs_test_${String(opened.length).padStart(8, "0")}`;
      opened.push({ params, idem });
      sessions.set(id, { id, payment_status: "unpaid", status: "open", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata, payment_intent: null });
      return { id, url: `https://pay.example/${id}` };
    },
    async read(id) { return sessions.get(id) || null; },
    async close(id) { closed.push(id); const s = sessions.get(id); if (s && s.payment_status !== "paid") s.status = "expired"; },
  };
  let n = 0;
  let codes = 0;
  const desk = eventActions({
    db, shopTax,
    // Members book first: `members` is { on, who } (who: the member's email the request proves, or "").
    membersFirst: members ? { on: async () => members.on, isMember: async (req) => !!req.member && members.who === req.member } : null,
    // The shop's own checks, as index.js does them: the code exists and is on; anything else is the customer's words.
    findDiscount: codeBox ? async (code) => {
      const snap = await db.collection("discounts").where("code", "==", code).limit(1).get();
      if (snap.empty || snap.docs[0].data().isActive === false) throw new Error("That code isn't valid.");
      return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } : null,
    requireAdmin: async (_req, r) => (admin ? { email: "owner@example.com" } : (r.status(401).json({ error: "no" }), null)),
    payments: {
      provider: "stripe", standaloneCheckout: async () => card,
      async refund(args) {
        if (refundFails) throw new Error("declined");
        const same = refunds.find((r) => r.idempotencyKey === args.idempotencyKey);
        if (!same) refunds.push(args);
        return { refundId: `re_${refunds.indexOf(same || args)}`, amountMinor: args.amountMinor };
      },
    },
    shopTestMode: async () => true,
    hitLimit: async () => true,
    LIMITS: {},
    claimEmailSend: async () => budget,
    siteLink: (p) => `https://press.example${p}`,
    shopName: () => "Moth Press",
    zone: () => "America/Toronto",
    currency: () => "CAD",
    sendEmail: async (m) => { emails.push(m); },
    ownerEmail: () => "owner@example.com",
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    risoLayout: (inner) => `<html>${inner}</html>`,
    risoButton: (href, label) => `<a href="${href}">${label}</a>`,
    now: () => clock.now,
    randomId: () => `order${String(++n).padStart(4, "0")}`,
    randomKey: () => String(n).padStart(48, "a"),
    randomCode: () => `TCKT-222${"ABCDEFGH"[codes++]}`,
  });
  const seed = async (event = EVENT) => {
    await db.collection("platform").doc("features").set({ ways: { events: platform } });
    await db.collection("firstWeek").doc("start").set({ ways: { events: owner } });
    if (event) await db.collection("events").doc("launch01").set(event);
  };
  const pub = async (body, member = "") => { const r = res(); await desk.handlePublic({ body, member }, r); return r; };
  const adm = async (body) => { const r = res(); await desk.handleAdmin({ body }, r); return r; };
  const pay = (i = 0) => { const s = sessions.get(`cs_test_${String(i).padStart(8, "0")}`); s.payment_status = "paid"; s.status = "complete"; s.payment_intent = `pi_${i}`; };
  const doc = async (c, id) => (await db.collection(c).doc(id).get()).data();
  return { db, desk, clock, emails, opened, closed, refunds, sessions, seed, pub, adm, pay, doc };
}

describe("on only while both switches are", () => {
  test.each([[false, true], [true, false]])("platform %s, owner %s: customers see nothing and the admin is refused", async (platform, owner) => {
    const t = setup({ platform, owner });
    await t.seed();
    expect((await t.pub({ action: "eventsInfo" })).body).toEqual({ on: false });
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER })).body).toEqual({ on: false });
    expect((await t.adm({ op: "list" })).statusCode).toBe(403);
    expect(t.db.store.has("eventOrders/order0001")).toBe(false);
  });
  test("someone who isn't the shop's admin gets nothing", async () => {
    const t = setup({ admin: false });
    await t.seed();
    expect((await t.adm({ op: "list" })).statusCode).toBe(401);
  });
});

describe("the shop's page", () => {
  test("lists live coming events with what is left, never the size of the room or the online link", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("events").doc("draft001").set({ ...EVENT, title: "Not yet", status: "draft" });
    await t.db.collection("events").doc("past0001").set({ ...EVENT, title: "Last year", start: "2025-12-05T19:00:00-05:00", end: "2025-12-05T22:00:00-05:00" });
    const { body } = await t.pub({ action: "eventsInfo" });
    expect(body).toMatchObject({ on: true, currency: "CAD", zone: "America/Toronto" });
    expect(body.events.map((e) => e.id)).toEqual(["launch01"]);
    expect(body.events[0]).toMatchObject({ title: "Autumn launch", online: true, open: true });
    expect(JSON.stringify(body)).not.toContain("meet.example");
    expect(body.events[0].tickets).toEqual([
      { id: "gen", name: "General", priceMinor: 1500, maxPerOrder: 10, left: 2, soldOut: false },
      { id: "free", name: "Friend of the press", priceMinor: 0, maxPerOrder: 10, left: 5, soldOut: false },
    ]);
  });
});

describe("members book first (Memberships M2c)", () => {
  const EARLY = { ...EVENT, publicFrom: "2026-11-20T12:00:00Z" };
  test("before the time everyone can book, only a member buys; the page is told until when", async () => {
    const t = setup({ members: { on: true, who: "ada@example.com" } });
    await t.seed(EARLY);
    expect((await t.pub({ action: "eventsInfo" })).body.events[0]).toMatchObject({ open: true, membersUntil: "2026-11-20T12:00:00.000Z" });
    const stranger = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER });
    expect(stranger.statusCode).toBe(403);
    expect(stranger.body.code).toBe("members");
    expect(t.opened).toHaveLength(0);
    const member = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER }, "ada@example.com");
    expect(member.statusCode).toBe(200);
    expect(member.body.url).toBeTruthy();
  });
  test("from that time, or with Memberships off, everyone books", async () => {
    const later = setup({ members: { on: true, who: "" }, now: "2026-11-21T12:00:00Z" });
    await later.seed(EARLY);
    expect((await later.pub({ action: "eventsInfo" })).body.events[0].membersUntil).toBeUndefined();
    expect((await later.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER })).statusCode).toBe(200);
    const off = setup({ members: { on: false, who: "" } });
    await off.seed(EARLY);
    expect((await off.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER })).statusCode).toBe(200);
  });
});

describe("buying tickets", () => {
  test("a paid order holds its places, opens the shop's card page for the exact amount, and is confirmed once", async () => {
    const t = setup();
    await t.seed();
    const start = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    expect(start.statusCode).toBe(200);
    expect(start.body.url).toBe("https://pay.example/cs_test_00000000");
    expect(t.opened[0].params.line_items[0].price_data).toMatchObject({ currency: "cad", unit_amount: 3000 });
    expect(t.opened[0].params.metadata).toEqual({ eventOrder: "order0001" });
    expect(t.opened[0].idem).toBe("event-order-order0001");
    expect(t.opened[0].params.success_url).toBe(`https://press.example/events?order=order0001&key=${"1".padStart(48, "a")}`);
    expect((await t.doc("eventOrders", "order0001")).status).toBe("held");
    // While it is held nobody else can have those places, and no email has gone.
    expect((await t.pub({ action: "eventsInfo" })).body.events[0].tickets[0]).toMatchObject({ left: 0, soldOut: true });
    expect(t.emails).toHaveLength(0);
    const key = "1".padStart(48, "a");
    expect((await t.pub({ action: "eventView", orderId: "order0001", key })).body.order).toMatchObject({ status: "held", tickets: [], onlineUrl: "" });

    t.pay();
    const view = await t.pub({ action: "eventView", orderId: "order0001", key });
    expect(view.body.order).toMatchObject({ status: "paid", chargedMinor: 3000, onlineUrl: "https://meet.example/launch" });
    expect(view.body.order.tickets.map((x) => x.code)).toEqual(["TCKT-222A", "TCKT-222B"]);
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 2 }, held: {}, paidMinor: 3000, orders: 1 });
    // One email to the buyer with both codes, one to the owner; looking again sends nothing more.
    expect(t.emails.map((m) => m.to)).toEqual(["ada@example.com", "owner@example.com"]);
    expect(t.emails[0].subject).toBe("Your tickets: Autumn launch");
    expect(t.emails[0].html).toContain("TCKT-222A");
    expect(t.emails[0].html).toContain("TCKT-222B");
    expect(t.emails[0].html).toContain("meet.example/launch");
    await t.pub({ action: "eventView", orderId: "order0001", key });
    await t.desk.sweep();
    expect(t.emails).toHaveLength(2);
    expect((await t.doc("eventOrders", "order0001")).pendingKey).toBeNull();
    // A wrong key shows nothing.
    expect((await t.pub({ action: "eventView", orderId: "order0001", key: "b".repeat(48) })).statusCode).toBe(404);
  });

  test("the last ticket is sold once even when two people ask at the same moment", async () => {
    const t = setup();
    await t.seed({ ...EVENT, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 1 }] });
    const [a, b] = await Promise.all([
      t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER }),
      t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, name: "Bo", email: "bo@example.com" }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    expect([a.body.error, b.body.error].filter(Boolean)).toEqual(['"General" tickets are sold out.']);
    expect(t.opened).toHaveLength(1);
  });

  test("an unpaid order frees its places when its ten minutes are up, after one last look at the page", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, freed: 0 });
    t.clock.now = new Date("2026-11-17T13:11:00Z");
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, freed: 1 });
    expect(t.closed).toEqual(["cs_test_00000000"]);
    expect((await t.doc("eventOrders", "order0001")).status).toBe("cancelled");
    expect((await t.doc("eventPlaces", "launch01")).held).toEqual({});
    expect((await t.pub({ action: "eventsInfo" })).body.events[0].tickets[0].left).toBe(2);
    expect(t.emails).toHaveLength(0);
  });

  test("a payment that lands while nobody has the page open is confirmed by the sweep, even just past the hold", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER });
    t.pay();
    t.clock.now = new Date("2026-11-17T13:12:00Z");
    expect(await t.desk.sweep()).toEqual({ confirmed: 1, freed: 0 });
    expect((await t.doc("eventOrders", "order0001")).status).toBe("paid");
    expect(t.emails[0].html).toContain("TCKT-222A");
  });

  test("a page paid for another amount is never believed", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    t.pay();
    t.sessions.get("cs_test_00000000").amount_total = 100;
    await t.desk.sweep();
    expect((await t.doc("eventOrders", "order0001")).status).toBe("held");
  });

  test("free tickets are confirmed at once with no card page, inside the shop's email budget", async () => {
    const t = setup({ checkout: null });
    await t.seed();
    const start = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 2 }, ...BUYER, locale: "fr-CA" });
    expect(start.body).toMatchObject({ orderId: "order0001", paid: true });
    expect(t.opened).toHaveLength(0);
    expect((await t.doc("eventPlaces", "launch01")).sold).toEqual({ free: 2 });
    // The buyer's browser was in French, so the email is.
    expect(t.emails[0].subject).toBe("Vos billets : Autumn launch");
    expect(t.emails[0].html).toContain("Gratuit");
    // A paid ticket needs the card page this shop doesn't have.
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER })).body.code).toBe("not_available");

    const spent = setup({ budget: false });
    await spent.seed();
    expect((await spent.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 1 }, ...BUYER })).statusCode).toBe(429);
    expect(spent.db.store.has("eventOrders/order0001")).toBe(false);
  });

  test("tax goes on top when the event charges it and the shop collects it", async () => {
    const t = setup({ shopTax: async () => (minor) => ({ taxMinor: Math.round(minor * 0.13), taxLines: [{ name: "HST ON", cents: Math.round(minor * 0.13) }] }) });
    await t.seed({ ...EVENT, chargeTax: true });
    expect((await t.pub({ action: "eventsInfo" })).body.events[0].tickets[0].taxMinor).toBe(195);
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(3390);
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ totalMinor: 3000, taxMinor: 390, chargedMinor: 3390 });
  });

  test("what can't be bought is refused in plain words, and a card page that won't open frees the places", async () => {
    const t = setup({ openFails: "not_connected" });
    await t.seed();
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, name: "", email: "x" })).statusCode).toBe(400);
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: {}, ...BUYER })).body.error).toBe("Pick at least one ticket.");
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 3 }, ...BUYER })).body.error).toBe('Only 2 "General" tickets are left.');
    expect((await t.pub({ action: "eventStart", eventId: "nothere1", tickets: { gen: 1 }, ...BUYER })).statusCode).toBe(409);
    const start = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER });
    expect(start.body.code).toBe("not_available");
    expect((await t.doc("eventPlaces", "launch01")).held).toEqual({});
    // An event that has started, is a draft or was called off sells nothing.
    for (const change of [{ status: "draft" }, { status: "cancelled" }, { start: "2026-11-17T08:00:00Z", end: "" }]) {
      const closedShop = setup();
      await closedShop.seed({ ...EVENT, ...change });
      expect((await closedShop.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER })).body.code).toBe("closed");
    }
  });
});

describe("the website's Events link", () => {
  test("follows the events: on after a live one is saved, off once it is deleted, and never made for a shop with no website settings", async () => {
    const t = setup();
    await t.seed(null);
    const made = await t.adm({ op: "saveEvent", event: EVENT });
    expect(t.db.store.has("settings/website")).toBe(false);
    await t.db.collection("settings").doc("website").set({ design: { a: 1 } });
    expect((await t.adm({ op: "hint" })).body).toEqual({ ok: true, eventsLive: true });
    expect(await t.doc("settings", "website")).toEqual({ design: { a: 1 }, eventsLive: true, eventsLiveUntil: "2026-12-06T03:00:00.000Z" });
    await t.adm({ op: "deleteEvent", id: made.body.event.id });
    expect(await t.doc("settings", "website")).toEqual({ design: { a: 1 }, eventsLive: false, eventsLiveUntil: null });
  });
  test("goes off when the owner switches Events off, and a past or draft event never turns it on", async () => {
    const t = setup({ owner: false });
    await t.seed();
    await t.db.collection("settings").doc("website").set({ eventsLive: true });
    expect((await t.adm({ op: "hint" })).body).toEqual({ ok: true, eventsLive: false });
    expect((await t.doc("settings", "website")).eventsLive).toBe(false);
    const late = setup({ now: "2026-12-07T13:00:00Z" });
    await late.seed();
    await late.db.collection("settings").doc("website").set({ eventsLive: true });
    expect((await late.adm({ op: "hint" })).body.eventsLive).toBe(false);
  });
});

describe("the owner", () => {
  test("makes, lists and edits events, with tickets sold and money taken", async () => {
    const t = setup();
    await t.seed(null);
    const bad = await t.adm({ op: "saveEvent", event: { ...EVENT, title: "" } });
    expect(bad.body).toEqual({ error: "Give the event a name." });
    const made = await t.adm({ op: "saveEvent", event: EVENT });
    const eid = made.body.event.id;
    expect(made.body.event).toMatchObject({ title: "Autumn launch", soldTotal: 0, placesTotal: 7 });
    await t.pub({ action: "eventStart", eventId: eid, tickets: { gen: 1 }, ...BUYER });
    t.pay();
    await t.desk.sweep();
    const { body } = await t.adm({ op: "list" });
    expect(body.events[0]).toMatchObject({ sold: { gen: 1, free: 0 }, soldTotal: 1, left: { gen: 1, free: 5 }, paidMinor: 1500, orders: 1 });
    const who = await t.adm({ op: "orders", eventId: eid });
    expect(who.body.orders).toHaveLength(1);
    expect(who.body.orders[0]).toMatchObject({ name: "Ada Reader", email: "ada@example.com", ticketCount: 1, chargedMinor: 1500, test: true });
    expect(who.body.orders[0]).not.toHaveProperty("keyHashes");
  });

  test("can't take away tickets people bought, or delete their event", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    t.pay();
    await t.desk.sweep();
    const fewer = await t.adm({ op: "saveEvent", event: { ...EVENT, id: "launch01", tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 1 }] } });
    expect(fewer.body).toMatchObject({ code: "sold", error: '2 "General" tickets are already sold, so it needs at least 2 places.' });
    const gone = await t.adm({ op: "saveEvent", event: { ...EVENT, id: "launch01", tickets: [{ id: "vip", name: "VIP", priceMinor: 5000, places: 5 }] } });
    expect(gone.body.code).toBe("sold");
    expect((await t.adm({ op: "deleteEvent", id: "launch01" })).body.code).toBe("sold");
    // Calling it off is the way: sales stop and the buyer's page says so, without the online link.
    expect((await t.adm({ op: "saveEvent", event: { ...EVENT, id: "launch01", status: "cancelled" } })).statusCode).toBe(200);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order).toMatchObject({ eventCancelled: true, onlineUrl: "" });
    // An event nobody bought goes for good, with its places record.
    await t.db.collection("events").doc("empty001").set(EVENT);
    expect((await t.adm({ op: "deleteEvent", id: "empty001" })).body).toEqual({ ok: true });
    expect(t.db.store.has("events/empty001")).toBe(false);
  });

  test("sends the tickets again with a fresh link, and the old link keeps working", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 1 }, ...BUYER });
    expect(t.emails).toHaveLength(2);
    expect((await t.adm({ op: "resendTickets", orderId: "order0001" })).body).toEqual({ ok: true });
    expect(t.emails.map((m) => m.to)).toEqual(["ada@example.com", "owner@example.com", "ada@example.com"]);
    expect((await t.doc("eventOrders", "order0001")).keyHashes).toHaveLength(2);
    expect((await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") })).statusCode).toBe(200);
    expect((await t.adm({ op: "resendTickets", orderId: "nothere12" })).statusCode).toBe(404);
  });
});

describe("at the door", () => {
  const two = async (t) => {
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 2 }, ...BUYER });
  };
  test("a code gets one person in: the second scan says it was used, and undo frees it", async () => {
    const t = setup();
    await two(t);
    const first = await t.adm({ op: "checkIn", eventId: "launch01", code: "tckt 222a" });
    expect(first.body).toMatchObject({ ok: true, already: false, arrived: 1, ticket: { code: "TCKT-222A", kind: "Friend of the press", name: "Ada Reader", number: 1, of: 2, arrivedOfOrder: 1, eventTitle: "Autumn launch" } });
    expect(first.body.ticket.usedAt).toBe("2026-11-17T13:00:00.000Z");
    const again = await t.adm({ op: "checkIn", eventId: "launch01", code: "TCKT-222A" });
    expect(again.body).toMatchObject({ ok: true, already: true, arrived: 1 });
    expect((await t.adm({ op: "checkIn", code: "TCKT-222B" })).body.arrived).toBe(2);
    const list = (await t.adm({ op: "list" })).body.events[0];
    expect(list.arrived).toBe(2);
    expect((await t.adm({ op: "orders", eventId: "launch01" })).body.orders[0].tickets.map((x) => !!x.usedAt)).toEqual([true, true]);
    const undone = await t.adm({ op: "checkIn", code: "TCKT-222A", value: false });
    expect(undone.body).toMatchObject({ ok: true, already: false, arrived: 1, ticket: { usedAt: "" } });
    expect((await t.adm({ op: "checkIn", code: "TCKT-222A", value: false })).body.arrived).toBe(1);
    expect((await t.doc("eventOrders", "order0001")).tickets[0]).toEqual({ code: "TCKT-222A", ticketId: "free", name: "Friend of the press" });
  });
  test("two scans of one code at the same moment let one person in", async () => {
    const t = setup();
    await two(t);
    const both = await Promise.all([t.adm({ op: "checkIn", code: "TCKT-222A" }), t.adm({ op: "checkIn", code: "TCKT-222A" })]);
    expect(both.map((r) => r.body.already).sort()).toEqual([false, true]);
    expect((await t.doc("eventPlaces", "launch01")).arrived).toBe(1);
  });
  test("the count survives a later sale, and the buyer's page shows a used ticket without saying who scanned it", async () => {
    const t = setup();
    await two(t);
    await t.adm({ op: "checkIn", code: "TCKT-222A" });
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 1 }, name: "Bo", email: "bo@example.com" });
    expect((await t.doc("eventPlaces", "launch01")).arrived).toBe(1);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order.tickets).toEqual([
      { code: "TCKT-222A", ticketId: "free", name: "Friend of the press", used: true },
      { code: "TCKT-222B", ticketId: "free", name: "Friend of the press", used: false },
    ]);
    expect(JSON.stringify(view.body)).not.toContain("owner@example.com");
  });
  test("refuses what isn't a ticket for this door, in plain words", async () => {
    const t = setup();
    await two(t);
    expect((await t.adm({ op: "checkIn", code: "nope" })).body.code).toBe("bad_code");
    expect((await t.adm({ op: "checkIn", code: "ZZZZ-ZZZZ" })).statusCode).toBe(404);
    const other = await t.adm({ op: "checkIn", eventId: "another01", code: "TCKT-222A" });
    expect(other.statusCode).toBe(409);
    expect(other.body).toMatchObject({ code: "wrong_event", error: 'That ticket is for "Autumn launch", not this event.' });
    await t.db.collection("events").doc("launch01").set({ ...EVENT, status: "cancelled" });
    expect((await t.adm({ op: "checkIn", code: "TCKT-222A" })).body.code).toBe("cancelled");
    expect((await t.doc("eventPlaces", "launch01")).arrived || 0).toBe(0);
    const out = setup({ admin: false });
    await out.seed();
    expect((await out.adm({ op: "checkIn", code: "TCKT-222A" })).statusCode).toBe(401);
  });
});

describe("refunds", () => {
  const bought = async (t) => {
    await t.seed({ ...EVENT, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 3 }] });
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 3 }, ...BUYER });
    t.pay(0);
    await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    t.emails.length = 0;
  };
  test("one ticket goes back: its money, its place and its code, and the buyer is told", async () => {
    const t = setup();
    await bought(t);
    const r = await t.adm({ op: "refund", orderId: "order0001", codes: ["tckt-222b"] });
    expect(r.body).toMatchObject({ ok: true, amountMinor: 1500, order: { status: "paid", refundedMinor: 1500, refundedTickets: 1 } });
    expect(r.body.order.tickets.map((x) => x.code)).toEqual(["TCKT-222A", "TCKT-222C"]);
    expect(t.refunds).toHaveLength(1);
    expect(t.refunds[0]).toMatchObject({ mode: "test", paymentIntentId: "pi_0", amountMinor: 1500, metadata: { eventOrder: "order0001" } });
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 2 }, paidMinor: 3000, orders: 1 });
    expect((await t.adm({ op: "checkIn", code: "TCKT-222B" })).statusCode).toBe(404);
    expect(t.emails.map((m) => m.to)).toEqual(["ada@example.com"]);
    expect(t.emails[0].subject).toBe("Your refund: Autumn launch");
    expect(t.emails[0].html).toContain("TCKT-222B");
    expect(t.emails[0].html).toContain("You still have 2 tickets");
    const info = await t.pub({ action: "eventsInfo" });
    expect(info.body.events[0].tickets[0].left).toBe(1);
  });
  test("the whole order goes back and stays on the list as refunded; a second tap changes nothing", async () => {
    const t = setup();
    await bought(t);
    const both = await Promise.all([t.adm({ op: "refund", orderId: "order0001" }), t.adm({ op: "refund", orderId: "order0001" })]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(t.refunds).toHaveLength(1);
    expect(t.refunds[0].amountMinor).toBe(4500);
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 0 }, paidMinor: 0, orders: 0 });
    const order = await t.doc("eventOrders", "order0001");
    expect(order).toMatchObject({ status: "refunded", refundedMinor: 4500, tickets: [], ticketCodes: [] });
    expect(order.refunds).toHaveLength(1);
    expect(t.emails).toHaveLength(1);
    expect((await t.adm({ op: "orders", eventId: "launch01" })).body.orders.map((o) => o.status)).toEqual(["refunded"]);
    expect((await t.adm({ op: "refund", orderId: "order0001" })).statusCode).toBe(404);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order).toMatchObject({ status: "refunded", refundedMinor: 4500, tickets: [], onlineUrl: "" });
  });
  test("tickets can be cancelled with the money kept, a used ticket is refused, and a refused refund changes nothing", async () => {
    const t = setup();
    await bought(t);
    await t.adm({ op: "checkIn", code: "TCKT-222A" });
    expect((await t.adm({ op: "refund", orderId: "order0001" })).body.code).toBe("used");
    expect((await t.adm({ op: "refund", orderId: "order0001", codes: ["ZZZZ-ZZZZ"] })).body.code).toBe("none");
    const kept = await t.adm({ op: "refund", orderId: "order0001", codes: ["TCKT-222C"], money: false });
    expect(kept.body).toMatchObject({ ok: true, amountMinor: 0 });
    expect(t.refunds).toHaveLength(0);
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 2 }, paidMinor: 4500, arrived: 1 });
    expect(t.emails[0].html).toContain("Your ticket was cancelled");
    const bad = setup({ refundFails: true });
    await bought(bad);
    expect((await bad.adm({ op: "refund", orderId: "order0001" })).statusCode).toBe(502);
    expect((await bad.doc("eventOrders", "order0001")).tickets).toHaveLength(3);
    expect(bad.emails).toHaveLength(0);
  });
  test("free tickets are cancelled with no payment call", async () => {
    const t = setup();
    await t.seed();
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 2 }, ...BUYER });
    const r = await t.adm({ op: "refund", orderId: "order0001" });
    expect(r.body).toMatchObject({ ok: true, amountMinor: 0, order: { status: "refunded" } });
    expect(t.refunds).toHaveLength(0);
    expect((await t.doc("eventPlaces", "launch01")).sold.free).toBe(0);
  });
  test("an event is called off: everyone is refunded and told why, even a checked-in ticket, and a second press changes nothing", async () => {
    const t = setup();
    await bought(t);
    await t.adm({ op: "checkIn", code: "TCKT-222A" });
    t.emails.length = 0;
    const r = await t.adm({ op: "cancelEvent", id: "launch01" });
    expect(r.body).toMatchObject({ ok: true, done: 1, amountMinor: 4500, failed: [], left: 0 });
    expect((await t.doc("events", "launch01")).status).toBe("cancelled");
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 0 }, paidMinor: 0, orders: 0, arrived: 0 });
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ status: "refunded", refundedMinor: 4500, tickets: [] });
    expect(t.emails).toHaveLength(1);
    expect(t.emails[0].subject).toBe("Cancelled: Autumn launch");
    expect(t.emails[0].html).toContain("This event has been cancelled");
    const again = await t.adm({ op: "cancelEvent", id: "launch01" });
    expect(again.body).toMatchObject({ ok: true, done: 0, left: 0 });
    expect(t.refunds).toHaveLength(1);
    expect(t.emails).toHaveLength(1);
    const info = await t.pub({ action: "eventsInfo" });
    expect((info.body.events || []).filter((e) => e.open)).toEqual([]);
  });
  test("a refund that fails while calling an event off leaves that order as it was and is named", async () => {
    const t = setup({ refundFails: true });
    await bought(t);
    const r = await t.adm({ op: "cancelEvent", id: "launch01" });
    expect(r.body).toMatchObject({ ok: true, done: 0, left: 0, failed: [{ id: "order0001", code: "refund_failed" }] });
    expect((await t.doc("events", "launch01")).status).toBe("cancelled");
    expect((await t.doc("eventOrders", "order0001")).status).toBe("paid");
    expect((await t.adm({ op: "cancelEvent", id: "launch01", skip: ["order0001"] })).body).toMatchObject({ done: 0, failed: [], left: 0 });
    expect((await t.adm({ op: "cancelEvent", id: "nothere1" })).statusCode).toBe(404);
  });
});

describe("moving an order to another event", () => {
  const SECOND = { ...EVENT, title: "Winter launch", start: "2026-12-12T19:00:00-05:00", end: "2026-12-12T22:00:00-05:00", venue: "The Bindery", address: "4 Glue Street", tickets: [{ id: "std", name: "general", priceMinor: 2000, places: 4 }] };
  const bought = async (t, second = SECOND) => {
    await t.seed({ ...EVENT, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 3 }] });
    await t.db.collection("events").doc("second01").set(second);
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, ...BUYER });
    t.pay(0);
    await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    t.emails.length = 0;
  };
  test("the tickets go to the new date with the same codes, the places follow, no money moves and the guest is told", async () => {
    const t = setup();
    await bought(t);
    await t.adm({ op: "checkIn", code: "TCKT-222A" });
    const r = await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ ok: true, told: true });
    expect(r.body.order.tickets.map((x) => x.code)).toEqual(["TCKT-222A", "TCKT-222B"]);
    expect(t.refunds).toHaveLength(0);
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 0 }, paidMinor: 0, orders: 0, arrived: 0 });
    expect(await t.doc("eventPlaces", "second01")).toMatchObject({ sold: { std: 2 }, paidMinor: 3000, orders: 1 });
    const order = await t.doc("eventOrders", "order0001");
    expect(order).toMatchObject({ status: "paid", eventId: "second01", eventTitle: "Winter launch", venue: "The Bindery", chargedMinor: 3000 });
    expect(order.tickets).toEqual([{ code: "TCKT-222A", ticketId: "std", name: "general" }, { code: "TCKT-222B", ticketId: "std", name: "general" }]);
    expect(order.lines).toEqual([{ ticketId: "std", name: "general", qty: 2, priceMinor: 1500 }]);
    expect(order.moves).toHaveLength(1);
    expect(order.moves[0]).toMatchObject({ from: "launch01", fromTitle: "Autumn launch", by: "owner@example.com" });
    expect(t.emails.map((m) => m.to)).toEqual(["ada@example.com"]);
    expect(t.emails[0].subject).toBe("Your tickets have moved: Winter launch");
    expect(t.emails[0].html).toContain("Autumn launch");
    expect(t.emails[0].html).toContain("TCKT-222A");
    expect((await t.adm({ op: "orders", eventId: "launch01" })).body.orders).toEqual([]);
    expect((await t.adm({ op: "orders", eventId: "second01" })).body.orders.map((o) => o.id)).toEqual(["order0001"]);
    // The old link still opens the order, the code works at the new door and a later refund frees the new event's places.
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order).toMatchObject({ status: "paid", title: "Winter launch" });
    expect((await t.adm({ op: "checkIn", code: "TCKT-222A" })).statusCode).toBe(200);
    await t.adm({ op: "checkIn", code: "TCKT-222A", value: false });
    await t.adm({ op: "refund", orderId: "order0001" });
    expect(t.refunds[0].amountMinor).toBe(3000);
    expect(await t.doc("eventPlaces", "second01")).toMatchObject({ sold: { std: 0 }, paidMinor: 0, orders: 0 });
  });
  test("a full, finished, cancelled or same event is refused and nothing changes", async () => {
    const t = setup();
    await bought(t, { ...SECOND, tickets: [{ id: "std", name: "General", priceMinor: 2000, places: 1 }] });
    const full = await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01" });
    expect(full.statusCode).toBe(409);
    expect(full.body).toMatchObject({ code: "full", error: "Only 1 General place is left at that event." });
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "launch01" })).body.code).toBe("event");
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "nothere1" })).body.code).toBe("event");
    expect((await t.adm({ op: "moveOrder", orderId: "nothere12", toEventId: "second01" })).statusCode).toBe(404);
    await t.db.collection("events").doc("second01").set({ ...SECOND, status: "cancelled" });
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01" })).body.code).toBe("closed");
    await t.db.collection("events").doc("second01").set({ ...SECOND, start: "2026-11-01T19:00:00-05:00", end: "2026-11-01T22:00:00-05:00" });
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01" })).body.code).toBe("closed");
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ eventId: "launch01" });
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 2 }, orders: 1 });
    expect(t.emails).toHaveLength(0);
  });
  test("ticket kinds with other names need the owner's pick, and two presses at once move it once", async () => {
    const t = setup();
    await bought(t, { ...SECOND, tickets: [{ id: "floor", name: "Floor", priceMinor: 2000, places: 4 }, { id: "balc", name: "Balcony", priceMinor: 1000, places: 4 }] });
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01" })).body.code).toBe("kind");
    expect((await t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01", kinds: { gen: "nope" } })).body.code).toBe("kind");
    const both = await Promise.all([1, 2].map(() => t.adm({ op: "moveOrder", orderId: "order0001", toEventId: "second01", kinds: { gen: "balc" } })));
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await t.doc("eventPlaces", "second01")).toMatchObject({ sold: { balc: 2 }, orders: 1 });
    expect((await t.doc("eventOrders", "order0001")).tickets.map((x) => x.name)).toEqual(["Balcony", "Balcony"]);
    expect(t.emails).toHaveLength(1);
  });
});

describe("discount codes on tickets", () => {
  const CODE = { code: "EARLY", type: "percentage", value: 20, forTickets: true, usageCount: 0 };
  const TAX = async () => (minor) => ({ taxMinor: Math.round(minor * 0.13), taxLines: [{ name: "HST", cents: Math.round(minor * 0.13) }] });
  const withCode = async (t, code = CODE, event = { ...EVENT, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 5 }] }) => {
    await t.seed(event);
    await t.db.collection("discounts").doc("disc0001").set(code);
  };
  test("the page offers a code box only when a code works on tickets, and trying one holds nothing", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "eventsInfo" })).body.codes).toBe(false);
    await t.db.collection("discounts").doc("disc0001").set(CODE);
    expect((await t.pub({ action: "eventsInfo" })).body.codes).toBe(true);
    const tried = await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 2 }, code: " early " });
    expect(tried.body).toEqual({ code: "EARLY", amountMinor: 600, feeMinor: 0, totalMinor: 2400, taxMinor: 0, chargedMinor: 2400 });
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(0);
    expect(t.db.store.has("eventPlaces/launch01")).toBe(false);
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 2 }, code: "NOPE" })).body).toMatchObject({ code: "code", error: "That code isn't valid." });
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { free: 1 }, code: "EARLY" })).body.code).toBe("code");
    const off = setup({ codeBox: false });
    await off.seed();
    await off.db.collection("discounts").doc("disc0001").set(CODE);
    expect((await off.pub({ action: "eventsInfo" })).body.codes).toBe(false);
  });
  test("a code comes off before tax, the card page asks for the lower amount, and the code is counted once", async () => {
    const t = setup({ shopTax: TAX });
    await withCode(t, CODE, { ...EVENT, chargeTax: true, tickets: [{ id: "gen", name: "General", priceMinor: 1500, places: 5 }] });
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, code: "early", ...BUYER });
    expect(r.statusCode).toBe(200);
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(2712);
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ totalMinor: 2400, listMinor: 3000, taxMinor: 312, chargedMinor: 2712, discount: { id: "disc0001", code: "EARLY", amountMinor: 600 } });
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(1);
    t.pay(0);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order).toMatchObject({ status: "paid", chargedMinor: 2712, discount: { code: "EARLY", amountMinor: 600 } });
    expect(view.body.order.discount.id).toBeUndefined();
    expect(t.emails[0].html).toContain("Discount (EARLY)");
    expect((await t.adm({ op: "orders", eventId: "launch01" })).body.orders[0].discount).toEqual({ code: "EARLY", amountMinor: 600 });
    // One ticket back is its share of what was really paid; the last one returns the rest and frees the code's use.
    const one = await t.adm({ op: "refund", orderId: "order0001", codes: ["TCKT-222A"] });
    expect(one.body.amountMinor).toBe(1356);
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(1);
    const rest = await t.adm({ op: "refund", orderId: "order0001" });
    expect(rest.body.amountMinor).toBe(1356);
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(0);
    expect(await t.doc("eventPlaces", "launch01")).toMatchObject({ sold: { gen: 0 }, paidMinor: 0 });
  });
  test("an unpaid order gives the code's use back, and it is counted again if the payment turns up after all", async () => {
    const t = setup();
    await withCode(t, { ...CODE, usageLimit: 1 });
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER });
    const second = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", name: "Bo", email: "bo@example.com" });
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ code: "code", error: "This code has been used up." });
    expect(t.db.store.has("eventOrders/order0002")).toBe(false);
    t.clock.now = new Date("2026-11-17T13:30:00Z");
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, freed: 1 });
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(0);
    expect((await t.doc("eventOrders", "order0001")).discount.returned).toBe(true);
    t.pay(0);
    await t.db.collection("eventOrders").doc("order0001").set({ status: "held" }, { merge: true });
    await t.desk.sweep();
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ status: "paid", discount: { returned: false } });
    expect((await t.doc("discounts", "disc0001")).usageCount).toBe(1);
  });
  test("a code that covers everything makes the tickets free at once, and one that leaves a few cents is refused", async () => {
    const t = setup();
    await withCode(t, { ...CODE, value: 100 });
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER });
    expect(r.body).toMatchObject({ paid: true });
    expect(t.opened).toHaveLength(0);
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ status: "paid", chargedMinor: 0, totalMinor: 0, listMinor: 1500 });
    const cents = setup();
    await withCode(cents, { ...CODE, type: "fixed", value: 14.8 });
    expect((await cents.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY" })).body.code).toBe("code");
    const start = await cents.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER });
    expect(start.statusCode).toBe(400);
    expect(cents.db.store.has("eventOrders/order0001")).toBe(false);
  });
  test("codes for the shop only, for some products, or already used by this customer don't work on tickets", async () => {
    const t = setup();
    await withCode(t, { ...CODE, forTickets: false });
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY" })).body.error).toBe("This code can't be used on tickets.");
    await t.db.collection("discounts").doc("disc0001").set({ ...CODE, appliesTo: "products" });
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER })).body.code).toBe("code");
    await t.db.collection("discounts").doc("disc0001").set({ ...CODE, minOrderAmount: 20 });
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY" })).body.error).toBe("This code needs tickets worth at least 20.00.");
    await t.db.collection("discounts").doc("disc0001").set({ ...CODE, onePerCustomer: true });
    await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER });
    const again = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "EARLY", ...BUYER, email: "ADA@example.com" });
    expect(again.body).toMatchObject({ code: "code", error: "You have already used this code." });
  });
});

describe("extras with a ticket order", () => {
  const TAX = async () => (minor) => ({ taxMinor: Math.round(minor * 0.13), taxLines: [{ name: "HST", cents: Math.round(minor * 0.13) }] });
  const WITH = { ...EVENT, chargeTax: true, tickets: [{ id: "gen", name: "General", priceMinor: 1000, places: 5 }], extras: [{ id: "prog", name: "Programme", priceMinor: 500 }, { id: "drink", name: "Drink", priceMinor: 800, maxPerOrder: 2 }] };
  test("the page lists an event's extras with their tax, and an event without any lists none", async () => {
    const t = setup({ shopTax: TAX });
    await t.seed(WITH);
    const info = (await t.pub({ action: "eventsInfo" })).body.events[0];
    expect(info.extras).toEqual([{ id: "prog", name: "Programme", priceMinor: 500, maxPerOrder: 10, taxMinor: 65 }, { id: "drink", name: "Drink", priceMinor: 800, maxPerOrder: 2, taxMinor: 104 }]);
    const plain = setup();
    await plain.seed();
    expect((await plain.pub({ action: "eventsInfo" })).body.events[0].extras).toEqual([]);
  });
  test("extras are priced by the server, taxed with the tickets, kept on the order and named in the email", async () => {
    const t = setup({ shopTax: TAX });
    await t.seed(WITH);
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2 }, extras: { prog: 1, drink: 2 }, ...BUYER });
    expect(r.statusCode).toBe(200);
    // 20.00 of tickets + 5.00 + 16.00 of extras = 41.00, plus 13%.
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(4633);
    expect(t.opened[0].params.line_items[0].price_data.product_data.name).toContain("1 × Programme, 2 × Drink");
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({
      totalMinor: 4100, extrasMinor: 2100, taxMinor: 533, chargedMinor: 4633,
      extras: [{ extraId: "prog", name: "Programme", qty: 1, priceMinor: 500 }, { extraId: "drink", name: "Drink", qty: 2, priceMinor: 800 }],
    });
    t.pay(0);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order.extras).toHaveLength(2);
    expect(t.emails[0].html).toContain("Extras:</strong> 1 × Programme, 2 × Drink");
    expect((await t.adm({ op: "orders", eventId: "launch01" })).body.orders[0]).toMatchObject({ extrasMinor: 2100, extras: [{ name: "Programme" }, { name: "Drink" }] });
    // One ticket back is that ticket and its tax; the last one returns the rest, extras included.
    const one = await t.adm({ op: "refund", orderId: "order0001", codes: ["TCKT-222A"] });
    expect(one.body.amountMinor).toBe(1130);
    const rest = await t.adm({ op: "refund", orderId: "order0001" });
    expect(rest.body.amountMinor).toBe(4633 - 1130);
  });
  test("an extra that isn't offered, or too many of one, is refused before anything is held", async () => {
    const t = setup();
    await t.seed(WITH);
    const gone = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, extras: { tote: 1 }, ...BUYER });
    expect(gone.statusCode).toBe(409);
    expect(gone.body.code).toBe("extras");
    const many = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, extras: { drink: 3 }, ...BUYER });
    expect(many.body).toMatchObject({ code: "extras", error: 'You can add up to 2 of "Drink" to one order.' });
    expect(t.db.store.has("eventOrders/order0001")).toBe(false);
    expect(t.db.store.has("eventPlaces/launch01")).toBe(false);
    // Extras alone are never an order: a ticket is still needed.
    expect((await t.pub({ action: "eventStart", eventId: "launch01", tickets: {}, extras: { prog: 1 }, ...BUYER })).body.code).toBe("tickets");
  });
  test("a free ticket with a paid extra goes to the card page, and a code takes its share off the tickets only", async () => {
    const t = setup();
    await t.seed({ ...EVENT, extras: WITH.extras });
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 1 }, extras: { prog: 1 }, ...BUYER });
    expect(r.body.paid).toBeUndefined();
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(500);
    await t.db.collection("discounts").doc("disc0001").set({ code: "HALF", type: "percentage", value: 50, forTickets: true, usageCount: 0 });
    const tried = await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 2 }, extras: { prog: 2 }, code: "HALF" });
    expect(tried.body).toMatchObject({ amountMinor: 1500, totalMinor: 2500 });
  });
});

describe("the shop's booking fee", () => {
  const TAX = async () => (minor) => ({ taxMinor: Math.round(minor * 0.13), taxLines: [{ name: "HST", cents: Math.round(minor * 0.13) }] });
  const FEE = { ...EVENT, feeMinor: 150 };
  test("the fee is added once for each paid ticket, taxed with the rest, shown to the buyer and refunded with the ticket", async () => {
    const t = setup({ shopTax: TAX });
    await t.seed({ ...FEE, chargeTax: true });
    expect((await t.pub({ action: "eventsInfo" })).body.events[0].feeMinor).toBe(150);
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 2, free: 1 }, ...BUYER });
    expect(r.statusCode).toBe(200);
    // 30.00 of tickets + 2 × 1.50, plus 13%.
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ totalMinor: 3300, feeMinor: 300, taxMinor: 429, chargedMinor: 3729 });
    expect(t.opened[0].params.line_items[0].price_data.unit_amount).toBe(3729);
    t.pay(0);
    const view = await t.pub({ action: "eventView", orderId: "order0001", key: "1".padStart(48, "a") });
    expect(view.body.order.feeMinor).toBe(300);
    expect(t.emails[0].html).toContain("Booking fee:</strong>");
    const orders = (await t.adm({ op: "orders", eventId: "launch01" })).body.orders;
    expect(orders[0].feeMinor).toBe(300);
    const paidCode = orders[0].tickets.find((x) => x.ticketId === "gen").code;
    // One paid ticket back: 15.00 + its 1.50 fee + tax on both.
    expect((await t.adm({ op: "refund", orderId: "order0001", codes: [paidCode] })).body.amountMinor).toBe(1865);
    expect((await t.adm({ op: "refund", orderId: "order0001" })).body.amountMinor).toBe(3729 - 1865);
  });
  test("free tickets carry no fee, and an event with no fee is as before", async () => {
    const t = setup();
    await t.seed(FEE);
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { free: 2 }, ...BUYER });
    expect(r.body.paid).toBe(true);
    expect((await t.doc("eventOrders", "order0001")).feeMinor).toBeUndefined();
    const plain = setup();
    await plain.seed();
    expect((await plain.pub({ action: "eventsInfo" })).body.events[0].feeMinor).toBe(0);
    await plain.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, ...BUYER });
    expect(await plain.doc("eventOrders", "order0001")).toMatchObject({ totalMinor: 1500, chargedMinor: 1500 });
    expect((await plain.doc("eventOrders", "order0001")).feeMinor).toBeUndefined();
  });
  test("a code keeps the fee unless it makes every ticket free", async () => {
    const t = setup();
    await t.seed(FEE);
    await t.db.collection("discounts").doc("disc0001").set({ code: "HALF", type: "percentage", value: 50, forTickets: true, usageCount: 0 });
    await t.db.collection("discounts").doc("disc0002").set({ code: "GUEST", type: "percentage", value: 100, forTickets: true, usageCount: 0 });
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 2 }, code: "HALF" })).body).toMatchObject({ amountMinor: 1500, feeMinor: 300, totalMinor: 1800 });
    expect((await t.pub({ action: "eventCode", eventId: "launch01", tickets: { gen: 2 }, code: "GUEST" })).body).toMatchObject({ amountMinor: 3000, feeMinor: 0, totalMinor: 0, chargedMinor: 0 });
    const r = await t.pub({ action: "eventStart", eventId: "launch01", tickets: { gen: 1 }, code: "GUEST", ...BUYER });
    expect(r.body.paid).toBe(true);
    expect(await t.doc("eventOrders", "order0001")).toMatchObject({ totalMinor: 0, chargedMinor: 0, status: "paid" });
  });
});
