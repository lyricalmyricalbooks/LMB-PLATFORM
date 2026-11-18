// Donations & tips (beta, giving.js): off until both switches are on; the card-testing guard ($5 lowest, a few card pages
// per visitor and per email, a form a person filled in) refuses and counts; a gift opens the shop's card page for the
// gift plus any covered fee and no tax, is confirmed once with a thank-you, and the owner can refund it once.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { givingActions, FORM_MIN_SECONDS } = realRequire("./giving");

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

const GIVER = { name: "Ada Reader", email: "ada@example.com" };

function setup({ platform = true, owner = true, checkout = "card", admin = true, refundFails = false, testMode = true } = {}) {
  const db = fakeDb();
  const clock = { now: new Date("2026-11-18T13:00:00Z") };
  const emails = [];
  const opened = [];
  const closed = [];
  const refunds = [];
  const sessions = new Map();
  const subs = new Map();
  const ended = [];
  // Per bucket and key, like the real limiter: a counter per window that never resets inside a test.
  const counts = new Map();
  const card = checkout === null ? null : {
    async open(params, idem) {
      const id = `cs_test_${String(opened.length).padStart(8, "0")}`;
      opened.push({ params, idem });
      sessions.set(id, { id, payment_status: "unpaid", status: "open", amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata, payment_intent: null });
      return { id, url: `https://pay.example/${id}` };
    },
    async read(id) { return sessions.get(id) || null; },
    async close(id) { closed.push(id); const s = sessions.get(id); if (s && s.payment_status !== "paid") s.status = "expired"; },
    ...(checkout === "card" ? { subscriptions: {
      async read(id) { return subs.get(id) ? { id, status: subs.get(id).status, periodEnd: "2026-12-18T13:00:00.000Z", endedAt: "" } : null; },
      async invoices(id) { return (subs.get(id)?.invoices || []).slice().reverse(); },
      async endNow(id) { subs.get(id).status = "canceled"; ended.push(id); return { id, status: "canceled" }; },
    } } : {}),
  };
  let n = 0;
  const desk = givingActions({
    db,
    requireAdmin: async (_req, r) => (admin ? { email: "owner@example.com" } : (r.status(401).json({ error: "no" }), null)),
    payments: {
      standaloneCheckout: async () => card,
      async refund(args) {
        if (refundFails) throw new Error("declined");
        if (!refunds.some((r) => r.idempotencyKey === args.idempotencyKey)) refunds.push(args);
        return { refundId: "re_1" };
      },
    },
    shopTestMode: async () => testMode,
    hitLimit: async (_db, bucket, req, opts, { key = "" } = {}) => {
      if (!opts?.max) return true;
      const id = `${bucket}:${key || req.ip || "visitor"}`;
      counts.set(id, (counts.get(id) || 0) + 1);
      return counts.get(id) <= opts.max;
    },
    LIMITS: {},
    siteLink: (p) => `https://press.example${p}`,
    shopName: () => "Moth Press",
    currency: () => "CAD",
    sendEmail: async (m) => { emails.push(m); },
    ownerEmail: () => "owner@example.com",
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    risoLayout: (inner) => `<html>${inner}</html>`,
    risoButton: (href, label) => `<a href="${href}">${label}</a>`,
    now: () => clock.now,
    randomId: () => `gift${String(++n).padStart(4, "0")}`,
    randomKey: () => String(n).padStart(48, "a"),
  });
  const seed = async (settings = null) => {
    await db.collection("platform").doc("features").set({ ways: { giving: platform } });
    await db.collection("firstWeek").doc("start").set({ ways: { giving: owner } });
    if (settings) await db.collection("givingSettings").doc("main").set(settings);
  };
  const pub = async (body, ip = "1.2.3.4") => { const r = res(); await desk.handlePublic({ body, ip }, r); return r; };
  const adm = async (body) => { const r = res(); await desk.handleAdmin({ body }, r); return r; };
  const later = (seconds) => { clock.now = new Date(clock.now.getTime() + seconds * 1000); };
  // The page's form, read a few seconds before giving, as a person would.
  const form = async () => { const { body } = await pub({ action: "givingInfo" }); later(FORM_MIN_SECONDS + 1); return body.form; };
  const give = async (extra = {}, ip) => pub({ action: "giftStart", amountMinor: 2500, giver: GIVER, form: await form(), ...extra }, ip);
  const pay = (i = 0) => { const s = sessions.get(`cs_test_${String(i).padStart(8, "0")}`); s.payment_status = "paid"; s.status = "complete"; s.payment_intent = `pi_${i}`; };
  const doc = async (c, id) => (await db.collection(c).doc(id).get()).data();
  const blockedToday = async () => doc("givingBlocked", clock.now.toISOString().slice(0, 10));
  return { db, desk, clock, emails, opened, closed, refunds, sessions, subs, ended, seed, pub, adm, later, form, give, pay, doc, blockedToday };
}

describe("on only while both switches are", () => {
  test.each([[false, true], [true, false]])("platform %s, owner %s: givers see nothing and the admin is refused", async (platform, owner) => {
    const t = setup({ platform, owner });
    await t.seed();
    expect((await t.pub({ action: "givingInfo" })).body).toEqual({ on: false });
    expect((await t.pub({ action: "giftStart", amountMinor: 2500, giver: GIVER })).body).toEqual({ on: false });
    expect((await t.adm({ op: "list" })).statusCode).toBe(403);
    expect(t.opened).toHaveLength(0);
  });
  test("someone who isn't the shop's admin gets nothing", async () => {
    const t = setup({ admin: false });
    await t.seed();
    expect((await t.adm({ op: "list" })).statusCode).toBe(401);
  });
});

describe("the Support page", () => {
  test("shows the owner's amounts and choices, the lowest gift and a form token", async () => {
    const t = setup();
    await t.seed({ amounts: [500, 2000], coverFee: false });
    const { body } = await t.pub({ action: "givingInfo" });
    expect(body).toMatchObject({ on: true, currency: "CAD", minMinor: 500, amounts: [500, 2000], otherAmount: true, coverFee: false, honour: true, cardsReady: true });
    expect(body.form).toMatch(/^\d+\.[a-f0-9]{32}$/);
  });
});

describe("giving", () => {
  test("opens the shop's card page for the gift plus the covered fee, no tax, and confirms it once with a thank-you", async () => {
    const t = setup();
    await t.seed({ thanks: "Every gift keeps the press running." });
    const start = await t.give({ coverFee: true, giver: { ...GIVER, anonymous: true, honour: { kind: "memory", name: "Grace" }, note: "Keep printing" } });
    expect(start.statusCode).toBe(200);
    expect(start.body).toEqual({ url: "https://pay.example/cs_test_00000000", giftId: "gift0001" });
    expect(t.opened[0].params.line_items).toEqual([{ quantity: 1, price_data: { currency: "cad", unit_amount: 2606, product_data: { name: "Moth Press: Gift (card fee covered)" } } }]);
    expect(t.opened[0].params.metadata).toEqual({ gift: "gift0001" });
    expect(t.opened[0].idem).toBe("gift-gift0001");
    expect(await t.doc("gifts", "gift0001")).toMatchObject({ status: "held", amountMinor: 2500, feeMinor: 106, chargedMinor: 2606, anonymous: true, honour: { kind: "memory", name: "Grace" }, note: "Keep printing", customer: GIVER });
    expect(t.emails).toHaveLength(0);
    t.pay(0);
    const key = new URL(t.opened[0].params.success_url).searchParams.get("key");
    const view = await t.pub({ action: "giftView", giftId: "gift0001", key });
    expect(view.body.gift).toMatchObject({ status: "paid", amountMinor: 2500, chargedMinor: 2606, anonymous: true });
    expect(JSON.stringify(view.body)).not.toMatch(/pi_0|keyHashes|ada@example/);
    // The sweep finds it already paid: one thank-you and one owner note, never two.
    await t.desk.sweep();
    await t.pub({ action: "giftView", giftId: "gift0001", key });
    expect(t.emails.map((e) => e.to)).toEqual(["ada@example.com", "owner@example.com"]);
    expect(t.emails[0].html).toContain("Every gift keeps the press running.");
    expect(t.emails[0].html).toContain("In memory of");
    expect(t.emails[1].subject).toBe("[GIFT] Ada Reader (asked to stay anonymous) gave $25.00");
  });
  test("a wrong key finds nothing", async () => {
    const t = setup();
    await t.seed();
    await t.give();
    expect((await t.pub({ action: "giftView", giftId: "gift0001", key: "b".repeat(48) })).statusCode).toBe(404);
  });
  test("an unpaid page is closed by the sweep after it runs out", async () => {
    const t = setup();
    await t.seed();
    await t.give();
    await t.desk.sweep();
    expect((await t.doc("gifts", "gift0001")).status).toBe("held");
    t.later(32 * 60);
    expect(await t.desk.sweep()).toEqual({ confirmed: 0, closed: 1 });
    expect(t.closed).toEqual(["cs_test_00000000"]);
    expect((await t.doc("gifts", "gift0001")).status).toBe("cancelled");
  });
  test("with no card payments set up, nothing is kept", async () => {
    const t = setup({ checkout: null });
    await t.seed();
    expect((await t.give()).body.code).toBe("not_available");
    expect(t.db.store.has("gifts/gift0001")).toBe(false);
  });
  test("an honour gift needs the person's name; a giver needs a name and email", async () => {
    const t = setup();
    await t.seed();
    expect((await t.give({ giver: { ...GIVER, honour: { kind: "honour", name: "" } } })).body.code).toBe("honour");
    expect((await t.give({ giver: { email: "ada@example.com" } })).body.code).toBe("name");
  });
});

describe("the card-testing guard", () => {
  test("a gift under $5 is refused and counted", async () => {
    const t = setup();
    await t.seed();
    const r = await t.give({ amountMinor: 100 });
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe("The lowest gift is $5.00.");
    expect(t.opened).toHaveLength(0);
    expect(await t.blockedToday()).toMatchObject({ tooSmall: 1, total: 1 });
  });
  test("a form sent too fast, made up or with the hidden field filled is a bot", async () => {
    const t = setup();
    await t.seed();
    const { body } = await t.pub({ action: "givingInfo" });
    expect((await t.pub({ action: "giftStart", amountMinor: 2500, giver: GIVER, form: body.form })).body.code).toBe("form");
    expect((await t.pub({ action: "giftStart", amountMinor: 2500, giver: GIVER, form: `${t.clock.now.getTime() - 60_000}.${"0".repeat(32)}` })).body.code).toBe("form");
    expect((await t.give({ website: "http://spam.example" })).body.code).toBe("form");
    expect((await t.pub({ action: "giftStart", amountMinor: 2500, giver: GIVER })).body.code).toBe("form");
    expect(t.opened).toHaveLength(0);
    expect(await t.blockedToday()).toMatchObject({ bot: 4, total: 4 });
  });
  test("a form too old is refused", async () => {
    const t = setup();
    await t.seed();
    const form = await t.form();
    t.later(7 * 60 * 60);
    expect((await t.pub({ action: "giftStart", amountMinor: 2500, giver: GIVER, form })).body.code).toBe("form");
  });
  test("five card pages an hour per visitor, three per email", async () => {
    const t = setup();
    await t.seed();
    for (let i = 0; i < 3; i++) expect((await t.give()).statusCode).toBe(200);
    // The same email from another visitor: the email's limit.
    expect((await t.give({}, "5.6.7.8")).body.code).toBe("too_many");
    // Other emails from the first visitor: two more, then the visitor's limit.
    expect((await t.give({ giver: { name: "Bo", email: "bo@example.com" } })).statusCode).toBe(200);
    expect((await t.give({ giver: { name: "Cy", email: "cy@example.com" } })).statusCode).toBe(200);
    expect((await t.give({ giver: { name: "Di", email: "di@example.com" } })).body.code).toBe("too_many");
    expect(t.opened).toHaveLength(5);
    expect(await t.blockedToday()).toMatchObject({ tooMany: 2 });
  });
});

describe("the owner", () => {
  test("saves the settings, which come back cleaned, and the website link follows the switch", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("settings").doc("website").set({ title: "Moth Press" });
    const saved = await t.adm({ op: "saveSettings", settings: { amounts: [100, 1500, "3000"], otherAmount: false, coverFee: false, honour: false, thanks: " Thanks! " } });
    expect(saved.body.settings).toEqual({ amounts: [1500, 3000], otherAmount: false, coverFee: false, honour: false, thanks: "Thanks!", checkoutTip: false, tipPercents: [5, 10, 15], charity: null, yearlySummary: true });
    expect((await t.doc("settings", "website")).givingTips).toEqual([]);
    const tipping = await t.adm({ op: "saveSettings", settings: { amounts: [1500], otherAmount: true, checkoutTip: true, tipPercents: [20, 10, 10, 99] } });
    expect(tipping.body.settings).toMatchObject({ checkoutTip: true, tipPercents: [10, 20] });
    expect((await t.doc("settings", "website")).givingTips).toEqual([10, 20]);
    expect((await t.doc("settings", "website")).givingLive).toBe(true);
    await t.db.collection("firstWeek").doc("start").set({ ways: { giving: false } });
    expect((await t.adm({ op: "hint" })).body.givingLive).toBe(false);
    expect((await t.doc("settings", "website")).givingLive).toBe(false);
  });
  test("lists paid gifts with totals that leave out test ones, and the tries blocked", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("gifts").doc("live0001").set({ status: "paid", mode: "live", amountMinor: 5000, chargedMinor: 5000, currency: "CAD", customer: GIVER, paidAt: "2026-11-10T10:00:00Z" });
    await t.db.collection("gifts").doc("live0002").set({ status: "paid", mode: "live", amountMinor: 1000, chargedMinor: 1000, currency: "CAD", customer: GIVER, paidAt: "2026-10-10T10:00:00Z" });
    await t.db.collection("gifts").doc("test0001").set({ status: "paid", mode: "test", amountMinor: 9999, chargedMinor: 9999, currency: "CAD", customer: GIVER, paidAt: "2026-11-11T10:00:00Z" });
    await t.db.collection("gifts").doc("held0001").set({ status: "held", amountMinor: 700, customer: GIVER, createdAt: "2026-11-18T12:00:00Z" });
    await t.give({ amountMinor: 50 });
    const { body } = await t.adm({ op: "list" });
    expect(body.gifts.map((g) => g.id)).toEqual(["test0001", "live0001", "live0002"]);
    expect(body.totals).toEqual({ givenMinor: 6000, monthMinor: 5000, gifts: 2, givers: 1 });
    expect(body.blocked).toMatchObject({ tooSmall: 1, total: 1 });
  });
  test("refunds a paid gift once and tells the giver", async () => {
    const t = setup();
    await t.seed();
    await t.give();
    t.pay(0);
    await t.desk.sweep();
    const first = await t.adm({ op: "refund", giftId: "gift0001" });
    expect(first.body).toMatchObject({ ok: true, already: false, gift: { status: "refunded" } });
    expect(t.refunds).toEqual([{ mode: "test", paymentIntentId: "pi_0", amountMinor: 2500, metadata: { gift: "gift0001" }, idempotencyKey: "gift-refund-gift0001" }]);
    expect((await t.adm({ op: "refund", giftId: "gift0001" })).body.already).toBe(true);
    expect(t.refunds).toHaveLength(1);
    expect(t.emails.at(-1).subject).toBe("Your gift to Moth Press was refunded");
  });
  test("a refused refund changes nothing", async () => {
    const t = setup({ refundFails: true });
    await t.seed();
    await t.give();
    t.pay(0);
    await t.desk.sweep();
    expect((await t.adm({ op: "refund", giftId: "gift0001" })).body.code).toBe("refund_failed");
    expect((await t.doc("gifts", "gift0001")).status).toBe("paid");
  });
});

describe("fundraisers (G2)", () => {
  const FUND = { title: "Print our next book", story: "Help us print 500 copies.", goalMinor: 300000, endsOn: "2026-12-31", wall: true };
  const startFund = async (t, extra = {}) => (await t.adm({ op: "saveFundraiser", fundraiser: { ...FUND, ...extra }, start: true })).body.fundraiser;

  test("a draft stays off the Support page; started, it shows with the server's own count", async () => {
    const t = setup();
    await t.seed();
    const draft = (await t.adm({ op: "saveFundraiser", fundraiser: FUND })).body.fundraiser;
    expect(draft).toMatchObject({ state: "draft", raisedMinor: 0, supporters: 0 });
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser).toBe(null);
    const live = (await t.adm({ op: "saveFundraiser", id: draft.id, fundraiser: FUND, start: true })).body.fundraiser;
    expect(live).toMatchObject({ id: draft.id, state: "live", goalMinor: 300000, endsOn: "2026-12-31" });
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser).toMatchObject({ id: draft.id, title: "Print our next book", raisedMinor: 0, state: "live" });
  });

  test("the form is checked: a name, a goal of 100 or more, a last day not in the past", async () => {
    const t = setup();
    await t.seed();
    expect((await t.adm({ op: "saveFundraiser", fundraiser: { ...FUND, title: "" } })).body.code).toBe("title");
    expect((await t.adm({ op: "saveFundraiser", fundraiser: { ...FUND, goalMinor: 5000 } })).body.code).toBe("goal");
    expect((await t.adm({ op: "saveFundraiser", fundraiser: { ...FUND, endsOn: "2026-11-17" } })).body.code).toBe("endsOn");
  });

  test("a paid gift counts toward it once (fee not counted), names go on the wall only when asked, a refund takes it back", async () => {
    const t = setup();
    await t.seed();
    const fund = await startFund(t);
    await t.give({ fundraiserId: fund.id, wall: true, coverFee: true });
    await t.give({ fundraiserId: fund.id, wall: true, giver: { name: "Bo Quiet", email: "bo@example.com", anonymous: true } }, "5.6.7.8");
    // Nothing counts until paid.
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser.raisedMinor).toBe(0);
    t.pay(0); t.pay(1);
    await t.desk.sweep();
    await t.desk.sweep();
    const shown = (await t.pub({ action: "givingInfo" })).body.fundraiser;
    expect(shown).toMatchObject({ raisedMinor: 5000, supporters: 2 });
    expect(shown.wall.map((w) => w.name)).toEqual(["Ada Reader"]);
    expect(JSON.stringify(shown)).not.toMatch(/ada@example|gift0002|gift0003/);
    expect(t.opened[0].params.line_items[0].price_data.product_data.name).toBe("Moth Press: Gift to Print our next book (card fee covered)");
    const giftId = (await t.adm({ op: "list" })).body.gifts.find((g) => g.name === "Ada Reader").id;
    expect((await t.adm({ op: "refund", giftId })).statusCode).toBe(200);
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser).toMatchObject({ raisedMinor: 2500, supporters: 1, wall: [] });
  });

  test("one runs at a time; it ends on its last day or when the owner ends it, and a gift to an ended one is refused", async () => {
    const t = setup();
    await t.seed();
    const fund = await startFund(t, { endsOn: "2026-11-18" });
    expect(fund?.state).toBe("live");
    expect((await t.adm({ op: "saveFundraiser", fundraiser: { ...FUND, title: "Another one" }, start: true })).body.code).toBe("one_at_a_time");
    // The last day ends at midnight in the shop's time zone (Toronto): 04:59 UTC the next day is still the 18th there.
    t.clock.now = new Date("2026-11-19T04:59:00Z");
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser?.id).toBe(fund.id);
    t.clock.now = new Date("2026-11-19T05:01:00Z");
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser).toBe(null);
    expect((await t.give({ fundraiserId: fund.id })).body.code).toBe("fundraiser_ended");
    expect((await t.adm({ op: "saveFundraiser", id: fund.id, fundraiser: { ...FUND, endsOn: "2026-12-31" } })).body.code).toBe("ended");
    const next = await startFund(t, { title: "Another one" });
    expect(next.state).toBe("live");
    const ended = (await t.adm({ op: "endFundraiser", id: next.id })).body.fundraiser;
    expect(ended).toMatchObject({ state: "ended", status: "ended" });
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser).toBe(null);
  });

  test("ending a draft removes it; the owner's list shows every fundraiser, running first", async () => {
    const t = setup();
    await t.seed();
    const draft = (await t.adm({ op: "saveFundraiser", fundraiser: FUND })).body.fundraiser;
    expect((await t.adm({ op: "endFundraiser", id: draft.id })).body).toEqual({ ok: true, removed: true });
    const live = await startFund(t);
    const list = (await t.adm({ op: "list" })).body;
    expect(list.fundraisers.map((f) => f.id)).toEqual([live.id]);
    expect(list.today).toBe("2026-11-18");
  });
});

describe("fundraiser rewards (G2b)", () => {
  const ADDRESS = { name: "Ada Reader", street: "1 Main St", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "CA" };
  const REWARDS = [
    { title: "Thank-you card", minMinor: 1000, limit: 1, when: "January 2027" },
    { title: "Signed print", minMinor: 5000, ships: true },
  ];
  const FUND = { title: "Print our next book", story: "", goalMinor: 300000, endsOn: "2026-12-31", wall: true, rewards: REWARDS };
  const startFund = async (t) => (await t.adm({ op: "saveFundraiser", fundraiser: FUND, start: true })).body.fundraiser;
  const left = async (t, i) => (await t.pub({ action: "givingInfo" })).body.fundraiser.rewards[i].left;

  test("a gift claims a reward in turn; gone, too small and a missing address are refused; the email and the owner's list name it", async () => {
    const t = setup();
    await t.seed();
    const fund = await startFund(t);
    expect(fund.rewards.map((r) => r.id)).toEqual(["rw1", "rw2"]);
    expect(await left(t, 0)).toBe(1);
    expect((await t.give({ fundraiserId: fund.id, rewardId: "rw2", amountMinor: 2500 })).body.code).toBe("reward_min");
    expect((await t.give({ fundraiserId: fund.id, rewardId: "rw2", amountMinor: 5000 })).body.code).toBe("address");
    const ok = await t.give({ fundraiserId: fund.id, rewardId: "rw1", amountMinor: 1000 });
    expect(ok.statusCode).toBe(200);
    expect(await left(t, 0)).toBe(0);
    expect((await t.pub({ action: "givingInfo" })).body.fundraiser.rewards[0].gone).toBe(true);
    const BO = { name: "Bo Reader", email: "bo@example.com" };
    expect((await t.give({ fundraiserId: fund.id, rewardId: "rw1", amountMinor: 1000, giver: BO }, "5.6.7.8")).body.code).toBe("reward_gone");
    const posted = await t.give({ fundraiserId: fund.id, rewardId: "rw2", amountMinor: 5000, shipTo: ADDRESS, giver: BO }, "9.9.9.9");
    expect(posted.statusCode).toBe(200);
    t.pay(0); t.pay(1);
    await t.desk.sweep();
    const thanks = t.emails.find((m) => m.to === "bo@example.com" && /Signed print/.test(m.html));
    expect(thanks.html).toContain("1 Main St");
    const listed = (await t.adm({ op: "list" })).body;
    const gift = listed.gifts.find((g) => g.reward?.id === "rw2");
    expect(gift).toMatchObject({ reward: { title: "Signed print", ships: true, sentAt: "" }, shipTo: { city: "Toronto" } });
    expect(listed.fundraisers[0].rewards.map((r) => r.taken)).toEqual([1, 1]);
    const sent = await t.adm({ op: "rewardSent", giftId: gift.id });
    expect(sent.body.gift.reward.sentAt).toMatch(/^2026-11-18T/);
    expect((await t.doc("gifts", gift.id)).reward.sentAt).toBeTruthy();
    expect((await t.adm({ op: "rewardSent", giftId: gift.id, sent: false })).body.gift.reward.sentAt).toBe("");
  });

  test("an unpaid page gives its reward back, one paid as its page closes keeps it once, and a refund gives it back", async () => {
    const t = setup();
    await t.seed();
    const fund = await startFund(t);
    await t.give({ fundraiserId: fund.id, rewardId: "rw1", amountMinor: 1000 });
    expect(await left(t, 0)).toBe(0);
    t.later(40 * 60);
    await t.desk.sweep();
    expect(await left(t, 0)).toBe(1);
    expect((await t.doc("gifts", "gift0002")).status).toBe("cancelled");
    expect((await t.doc("gifts", "gift0002")).rewardHeld).toBe(false);
    // A second giver pays just as the sweep closes the page: confirmed on the last read, the reward counted once.
    await t.give({ fundraiserId: fund.id, rewardId: "rw1", amountMinor: 1000, giver: { name: "Bo Reader", email: "bo@example.com" } }, "5.6.7.8");
    t.later(40 * 60);
    const close = t.desk.sweep;
    t.pay(1);
    await close();
    expect((await t.doc("gifts", "gift0003")).status).toBe("paid");
    expect((await t.adm({ op: "list" })).body.fundraisers[0].rewards[0].taken).toBe(1);
    await t.adm({ op: "refund", giftId: "gift0003" });
    expect(await left(t, 0)).toBe(1);
    expect((await t.doc("gifts", "gift0003")).rewardHeld).toBe(false);
  });

  test("the owner can't remove a reward someone chose or set fewer than were chosen", async () => {
    const t = setup();
    await t.seed();
    const fund = await startFund(t);
    await t.give({ fundraiserId: fund.id, rewardId: "rw2", amountMinor: 5000, shipTo: ADDRESS });
    const save = (rewards) => t.adm({ op: "saveFundraiser", id: fund.id, fundraiser: { ...FUND, rewards } });
    expect((await save([fund.rewards[0]])).body.error).toMatch(/can't be removed/);
    expect((await save([fund.rewards[0], { ...fund.rewards[1], limit: 0, taken: 0, title: "Signed print, larger" }])).body.fundraiser.rewards[1]).toMatchObject({ taken: 1, title: "Signed print, larger" });
  });
});

describe("tax receipts (G3)", () => {
  const CA = { number: "123456789rr0001", name: "Moth Press Society", address: "1 Press St, Toronto ON M6G 3H1", signer: "Ada Treasurer" };
  const HOME = { street: "1 Main St", city: "Toronto", state: "ON", zip: "M6G 3H1", country: "CA" };
  const BO = { name: "Bo Reader", email: "bo@example.com" };

  test("the owner's charity is checked when saved, and the Support page learns which kind of receipt it gives", async () => {
    const t = setup();
    await t.seed();
    expect((await t.adm({ op: "saveSettings", settings: { charity: { ...CA, number: "12345" } } })).body.code).toBe("number");
    expect((await t.adm({ op: "saveSettings", settings: { charity: { ...CA, signer: "" } } })).body.code).toBe("signer");
    // A US tax ID needs no signer.
    const us = await t.adm({ op: "saveSettings", settings: { charity: { ...CA, number: "12-3456789", signer: "" } } });
    expect(us.body.settings.charity).toMatchObject({ kind: "us", number: "12-3456789" });
    const ca = await t.adm({ op: "saveSettings", settings: { charity: CA } });
    expect(ca.body.settings.charity).toMatchObject({ kind: "ca", number: "123456789 RR 0001" });
    expect((await t.pub({ action: "givingInfo" })).body.receipts).toEqual({ kind: "ca" });
    await t.adm({ op: "saveSettings", settings: { charity: { ...CA, on: false } } });
    expect((await t.pub({ action: "givingInfo" })).body.receipts).toBeNull();
  });

  test("a paid gift gets the next number of the year, once; test gifts count on their own; the email carries it", async () => {
    const t = setup({ testMode: false });
    await t.seed({ charity: CA });
    expect((await t.give({ receipt: true })).body.code).toBe("receiptAddress");
    await t.give({ receipt: true, receiptAddress: HOME, coverFee: true });
    await t.give({ receipt: true, receiptAddress: HOME, giver: BO }, "5.6.7.8");
    // A gift that didn't ask for a receipt gets none.
    await t.give({ giver: { name: "Cy", email: "cy@example.com" } }, "9.9.9.9");
    t.pay(1); await t.desk.sweep();
    t.pay(0); t.pay(2); await t.desk.sweep(); await t.desk.sweep();
    const first = await t.doc("gifts", "gift0002");
    const second = await t.doc("gifts", "gift0001");
    expect(first.receipt).toMatchObject({ number: "2026-00001", status: "issued", eligibleMinor: 2500, name: "Bo Reader", year: 2026 });
    expect(second.receipt).toMatchObject({ number: "2026-00002", eligibleMinor: 2606, address: { city: "Toronto" }, test: false });
    expect((await t.doc("gifts", "gift0003")).receipt).toBeUndefined();
    expect((await t.doc("givingReceipts", "2026")).next).toBe(3);
    const thanks = t.emails.find((m) => m.to === "bo@example.com");
    expect(thanks.html).toContain("2026-00001");
    expect(thanks.html).toContain("123456789 RR 0001");
    expect(thanks.html).toContain("Official donation receipt");
    // The giver's own page shows it with the charity's details.
    const key = new URL(t.opened[1].params.success_url).searchParams.get("key");
    const view = await t.pub({ action: "giftView", giftId: "gift0002", key });
    expect(view.body.gift.receipt.number).toBe("2026-00001");
    expect(view.body.charity).toMatchObject({ name: "Moth Press Society", kind: "ca" });

    const tt = setup();
    await tt.seed({ charity: CA });
    await tt.give({ receipt: true, receiptAddress: HOME });
    tt.pay(0); await tt.desk.sweep();
    expect((await tt.doc("gifts", "gift0001")).receipt).toMatchObject({ number: "TEST-2026-00001", test: true });
    expect(tt.emails[0].html).toContain("can't be used for taxes");
    expect(await tt.doc("givingReceipts", "test-2026")).toMatchObject({ next: 2 });
  });

  test("a gift with a thank-you reward gets no receipt; a US receipt needs no address", async () => {
    const t = setup({ testMode: false });
    await t.seed({ charity: { ...CA, number: "12-3456789", signer: "" } });
    const fund = (await t.adm({ op: "saveFundraiser", fundraiser: { title: "Print", story: "", goalMinor: 300000, endsOn: "2026-12-31", rewards: [{ title: "Card", minMinor: 1000 }] }, start: true })).body.fundraiser;
    const a = (await t.give({ fundraiserId: fund.id, rewardId: "rw1", amountMinor: 2500, receipt: true })).body.giftId;
    const b = (await t.give({ receipt: true, giver: BO }, "5.6.7.8")).body.giftId;
    t.pay(0); t.pay(1); await t.desk.sweep();
    const rewarded = await t.doc("gifts", a);
    expect(rewarded.receiptAsked).toBeUndefined();
    expect(rewarded.receipt).toBeUndefined();
    const plain = await t.doc("gifts", b);
    expect(plain.receipt).toMatchObject({ number: "2026-00001", address: null });
    expect(t.emails.find((m) => m.to === "bo@example.com").html).toContain("Receipt for your tax records");
  });

  test("a refund cancels the receipt for good; correcting a name cancels it and issues a new number naming the old", async () => {
    const t = setup({ testMode: false });
    await t.seed({ charity: CA });
    await t.give({ receipt: true, receiptAddress: HOME });
    await t.give({ receipt: true, receiptAddress: HOME, giver: BO }, "5.6.7.8");
    t.pay(0); t.pay(1); await t.desk.sweep();
    expect((await t.adm({ op: "reissueReceipt", giftId: "gift0001", name: "" })).statusCode).toBe(400);
    expect((await t.adm({ op: "reissueReceipt", giftId: "gift0001", name: "Ada Q. Reader", address: { country: "CA" } })).body.code).toBe("address");
    const fixed = await t.adm({ op: "reissueReceipt", giftId: "gift0001", name: "Ada Q. Reader", address: { ...HOME, street: "2 Main St" } });
    expect(fixed.body.gift.receipt).toMatchObject({ number: "2026-00003", replaces: "2026-00001", name: "Ada Q. Reader", address: { street: "2 Main St" }, receivedOn: "2026-11-18" });
    expect(fixed.body.gift.receiptHistory).toMatchObject([{ number: "2026-00001", status: "cancelled", cancelledOn: "2026-11-18" }]);
    const mail = t.emails.at(-1);
    expect(mail.to).toBe("ada@example.com");
    expect(mail.html).toContain("2026-00003");
    expect(mail.html).toContain("2026-00001");
    await t.adm({ op: "refund", giftId: "gift0002" });
    expect((await t.doc("gifts", "gift0002")).receipt).toMatchObject({ number: "2026-00002", status: "cancelled", cancelledOn: "2026-11-18" });
    expect(t.emails.at(-1).html).toContain("Your tax receipt 2026-00002 is cancelled.");
    // A cancelled receipt can't be corrected, and its number is never handed out again.
    expect((await t.adm({ op: "reissueReceipt", giftId: "gift0002", name: "Bo" , address: HOME })).statusCode).toBe(409);
    expect((await t.doc("givingReceipts", "2026")).next).toBe(4);
  });
});

describe("monthly gifts (M3d)", () => {
  const start = async (t, extra = {}) => t.give({ monthly: true, ...extra });
  const subscribe = (t, i = 0) => {
    const s = t.sessions.get(`cs_test_${String(i).padStart(8, "0")}`);
    s.status = "complete"; s.subscription = "sub_1";
    t.subs.set("sub_1", { status: "active", invoices: [] });
  };
  const paidMonth = (t, n) => t.subs.get("sub_1").invoices.push({ id: `in_${n}`, status: "paid", amountMinor: 2500, currency: "CAD", paidAt: `2026-1${n}-18T13:00:00Z`, paymentIntent: `pi_m${n}` });

  test("opens a monthly card page with no tax, and the Support page offers it", async () => {
    const t = setup();
    await t.seed();
    expect((await t.pub({ action: "givingInfo" })).body.monthly).toBe(true);
    const r = await start(t);
    expect(r.statusCode).toBe(200);
    expect(r.body.pledgeId).toBe("gift0001");
    const { params } = t.opened[0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0].price_data).toMatchObject({ unit_amount: 2500, recurring: { interval: "month" } });
    expect(params.subscription_data.metadata).toEqual({ pledge: "gift0001" });
    expect(params.success_url).toContain("/support?pledge=gift0001&key=");
    expect(params.client_reference_id).toBeUndefined();
  });

  test("each paid month becomes one gift with a thank-you that links to the monthly gift", async () => {
    const t = setup();
    await t.seed();
    await start(t);
    const key = "1".padStart(48, "a");
    subscribe(t);
    paidMonth(t, 1);
    const v = await t.pub({ action: "pledgeView", pledgeId: "gift0001", key });
    expect(v.body.pledge).toMatchObject({ status: "active", months: 1, amountMinor: 2500 });
    // Read again (the sweep, an event): nothing is counted twice.
    await t.desk.sweep();
    await t.desk.onEvent({ data: { object: { subscription_details: { metadata: { pledge: "gift0001" } } } } });
    const paid = [...t.db.store.entries()].filter(([k, g]) => k.startsWith("gifts/") && g.status === "paid");
    expect(paid).toHaveLength(1);
    expect(paid[0][1]).toMatchObject({ pledgeId: "gift0001", monthly: true, amountMinor: 2500, paymentIntent: "pi_m1" });
    const thanks = t.emails.filter((e) => e.to === GIVER.email);
    expect(thanks).toHaveLength(1);
    expect(thanks[0].html).toContain("/support?pledge=gift0001&#38;key=");
    paidMonth(t, 2);
    t.later(7 * 3600);
    await t.desk.sweep();
    expect((await t.doc("givingPledges", "gift0001")).months).toBe(2);
  });

  test("the giver ends it from their link; a wrong key finds nothing", async () => {
    const t = setup();
    await t.seed();
    await start(t);
    subscribe(t);
    expect((await t.pub({ action: "pledgeEnd", pledgeId: "gift0001", key: "b".repeat(48) })).statusCode).toBe(404);
    const r = await t.pub({ action: "pledgeEnd", pledgeId: "gift0001", key: "1".padStart(48, "a") });
    expect(r.body.pledge.status).toBe("ended");
    expect(t.ended).toEqual(["sub_1"]);
  });

  test("never to a fundraiser, and an unfinished page closes as cancelled", async () => {
    const t = setup();
    await t.seed();
    await t.db.collection("fundraisers").doc("fund01").set({ status: "live", title: "Roof", goalMinor: 100000, endsOn: "2026-12-31", rewards: [] });
    expect((await start(t, { fundraiserId: "fund01" })).body.code).toBe("monthly_fundraiser");
    await start(t);
    t.later(40 * 60);
    await t.desk.sweep();
    expect((await t.doc("givingPledges", "gift0002")).status).toBe("cancelled");
  });

  test("the owner sees running monthly gifts and can end one", async () => {
    const t = setup();
    await t.seed();
    await start(t);
    subscribe(t);
    await t.desk.sweep();
    const list = await t.adm({ op: "list" });
    expect(list.body.monthlyTotals).toEqual({ givers: 0, monthMinor: 0 });
    expect(list.body.pledges).toHaveLength(1);
    expect((await t.adm({ op: "endPledge", pledgeId: "gift0001" })).body.pledge.status).toBe("ended");
  });
});
