// Memberships & subscriptions (beta, memberships.js): off until both switches are on; a signed-in customer joins one
// plan at a time on a subscription card page (no order reference, so the order webhook never sees it); the provider's
// subscription decides the state, each email goes once, the member can end it, take that back and give a new card, the
// sweep closes pages nobody finished, and the owner's plans keep their price once made.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const realRequire = createRequire(import.meta.url);
const { membershipActions, nextCheck, mergePayments, PAGE_MINUTES } = realRequire("./memberships");

function fakeDb() {
  const store = new Map();
  const key = (c, id) => `${c}/${id}`;
  const snapOf = (c, id) => ({ id, exists: store.has(key(c, id)), data: () => structuredClone(store.get(key(c, id))) });
  const ref = (c, id) => ({
    id,
    async get() { return snapOf(c, id); },
    async set(data, opts) { store.set(key(c, id), opts?.merge ? { ...(store.get(key(c, id)) || {}), ...structuredClone(data) } : structuredClone(data)); },
    async delete() { store.delete(key(c, id)); },
  });
  const field = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const test = (op, a, b) => (op === "<=" ? a != null && a <= b : op === "in" ? b.includes(a) : a === b);
  const list = (c) => [...store.keys()].filter((k) => k.startsWith(`${c}/`) && !k.slice(c.length + 1).includes("/")).map((k) => snapOf(c, k.slice(c.length + 1)));
  const query = (c, filters = [], n = 1000) => ({
    where: (f, op, v) => query(c, [...filters, [f, op, v]], n),
    limit: (m) => query(c, filters, m),
    async get() {
      const docs = list(c).filter((d) => filters.every(([f, op, v]) => test(op, field(d.data(), f), v))).slice(0, n);
      return { docs, empty: docs.length === 0, size: docs.length };
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

const ADA = { email: "ada@example.com", uid: "u1", name: "Ada Reader" };
const PLAN = { name: "Friends of the press", description: "Support us", perks: ["A book each season"], interval: "month", priceMinor: 1500, trialDays: 14 };

function setup({ platform = true, owner = true, subscriptions = true } = {}) {
  const db = fakeDb();
  const clock = { now: new Date("2026-11-18T13:00:00Z") };
  const emails = [];
  const opened = [];
  const closed = [];
  const cardSet = [];
  const sessions = new Map();
  const subs = new Map();
  const saved = new Map();
  const invoices = new Map();
  const invoiceReads = [];
  const shape = (s) => ({ ...s });
  const subApi = {
    async read(id) { return subs.has(id) ? shape(subs.get(id)) : null; },
    async cancelAtEnd(id) { subs.get(id).cancelAtPeriodEnd = true; return shape(subs.get(id)); },
    async resume(id) { subs.get(id).cancelAtPeriodEnd = false; return shape(subs.get(id)); },
    async setCard(id, pm) { cardSet.push({ id, pm }); const c = [...saved.values()].find((x) => x.paymentMethod === pm); if (c) subs.get(id).card = { brand: c.brand, last4: c.last4 }; return shape(subs.get(id)); },
    async invoices(id) { invoiceReads.push(id); return structuredClone(invoices.get(id) || []); },
    async pause(id, resumesAt = "") { Object.assign(subs.get(id), { paused: true, pausedUntil: resumesAt }); return shape(subs.get(id)); },
    async unpause(id) { Object.assign(subs.get(id), { paused: false, pausedUntil: "" }); return shape(subs.get(id)); },
    async endNow(id) { Object.assign(subs.get(id), { status: "canceled", endedAt: clock.now.toISOString() }); return shape(subs.get(id)); },
  };
  const checkout = {
    async open(params, idem) {
      const id = `cs_test_${String(opened.length).padStart(6, "0")}`;
      opened.push({ params, idem });
      sessions.set(id, { id, status: "open", metadata: params.metadata, subscription: null });
      return { id, url: `https://pay.example/${id}` };
    },
    async read(id) { return sessions.get(id) || null; },
    async close(id) { closed.push(id); const s = sessions.get(id); if (s && s.status === "open") s.status = "expired"; },
    async savedCard(id) { return saved.get(id) || null; },
    ...(subscriptions ? { subscriptions: subApi } : {}),
  };
  let n = 0;
  let signedIn = ADA;
  const boxCalls = [];
  const boxFail = { on: false };
  const desk = membershipActions({
    db,
    requireAdmin: async () => ({ email: "owner@example.com" }),
    identify: async () => signedIn,
    payments: { standaloneCheckout: async () => checkout },
    shopTestMode: async () => true,
    hitLimit: async () => true,
    LIMITS: {},
    siteLink: (p) => `https://shop.example${p}`,
    shopName: () => "Test Press",
    currency: () => "CAD",
    sendEmail: async (m) => { emails.push(m); },
    ownerEmail: () => "owner@example.com",
    escapeHtml: (s) => String(s),
    risoLayout: (html) => html,
    risoButton: (href, label) => `<a href="${href}">${label}</a>`,
    now: () => clock.now,
    randomId: () => `id${String(++n).padStart(6, "0")}`,
    zone: () => "America/Toronto",
    makeBoxOrder: async (args) => { boxCalls.push(args); if (boxFail.on) throw new Error("A product in the box was removed."); return `BOX-${args.membershipId}-${args.month}`; },
  });
  db.store.set("platform/features", { ways: { memberships: platform } });
  db.store.set("firstWeek/start", { ways: { memberships: owner } });
  const call = async (body) => { const r = res(); await desk.handlePublic({ body, headers: {} }, r); return r; };
  const admin = async (body) => { const r = res(); await desk.handleAdmin({ body, headers: {} }, r); return r; };
  /** The provider finishing a card page: a subscription in the given status. */
  const finish = (sessionId, status = "trialing", extra = {}) => {
    const subId = `sub_${sessionId.slice(-6)}`;
    const membership = sessions.get(sessionId).metadata.membership;
    subs.set(subId, { id: subId, status, customer: "cus_1", cancelAtPeriodEnd: false, periodEnd: "2026-12-02T13:00:00.000Z", trialEnd: status === "trialing" ? "2026-12-02T13:00:00.000Z" : "", card: { brand: "visa", last4: "4242" }, metadata: { membership }, ...extra });
    Object.assign(sessions.get(sessionId), { status: "complete", subscription: subId });
    return subId;
  };
  return { db, desk, clock, emails, boxCalls, boxFail, opened, closed, cardSet, sessions, subs, saved, invoices, invoiceReads, call, admin, finish, signIn: (who) => { signedIn = who; } };
}

async function withPlan(t, plan = PLAN) {
  const r = await t.admin({ op: "savePlan", plan });
  expect(r.statusCode).toBe(200);
  return r.body.id;
}

describe("memberships (M1)", () => {
  test("off until both switches are on; the info answer says so", async () => {
    const t = setup({ owner: false });
    expect((await t.call({ action: "membershipInfo" })).body).toEqual({ on: false });
    const join = await t.call({ action: "membershipJoin", planId: "id000001" });
    expect(join.statusCode).toBe(409);
    expect(join.body.code).toBe("off");
    expect((await t.admin({ op: "list" })).statusCode).toBe(403);
  });

  test("joining needs a sign-in, and opens a subscription page with the plan's price, period and trial", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const info = await t.call({ action: "membershipInfo" });
    expect(info.body).toMatchObject({ on: true, ready: true, plans: [{ id: planId, name: PLAN.name, priceMinor: 1500, interval: "month", trialDays: 14 }] });

    t.signIn(null);
    expect((await t.call({ action: "membershipJoin", planId })).statusCode).toBe(401);
    t.signIn(ADA);
    const join = await t.call({ action: "membershipJoin", planId });
    expect(join.statusCode).toBe(200);
    expect(join.body.url).toMatch(/^https:\/\/pay\.example\//);
    const { params } = t.opened[0];
    expect(params.mode).toBe("subscription");
    expect(params).not.toHaveProperty("client_reference_id");
    expect(params.line_items[0].price_data).toMatchObject({ currency: "cad", unit_amount: 1500, recurring: { interval: "month" } });
    expect(params.subscription_data).toMatchObject({ trial_period_days: 14, metadata: { membership: join.body.id } });
    expect(params.success_url).toContain(`/account/membership?joined=${join.body.id}`);
    expect(t.db.store.get(`memberships/${join.body.id}`)).toMatchObject({ state: "pending", mode: "test", customer: { email: ADA.email } });
  });

  test("a finished page becomes a trial: welcome once, the owner told once, and a second join is refused", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    t.finish("cs_test_000000");
    const mine = await t.call({ action: "membershipMine" });
    expect(mine.body.memberships).toHaveLength(1);
    expect(mine.body.memberships[0]).toMatchObject({ id: body.id, state: "trial", trialEnd: "2026-12-02T13:00:00.000Z", card: { last4: "4242" }, test: true });
    // Read again (a new visit five minutes on): no second welcome.
    t.clock.now = new Date("2026-11-18T13:10:00Z");
    await t.call({ action: "membershipMine" });
    expect(t.emails.filter((e) => e.queue === "membership-welcome")).toHaveLength(1);
    expect(t.emails.filter((e) => e.to === "owner@example.com")).toHaveLength(1);
    expect(t.emails[0].subject).toMatch(/^\[TEST\]/);

    const again = await t.call({ action: "membershipJoin", planId });
    expect(again.statusCode).toBe(409);
    expect(again.body.code).toBe("member");
  });

  test("ending, taking it back and a failed payment each change state and email once", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0 });
    const { body } = await t.call({ action: "membershipJoin", planId });
    const subId = t.finish("cs_test_000000", "active");
    await t.call({ action: "membershipMine" });

    const cancel = await t.call({ action: "membershipCancel", id: body.id });
    expect(cancel.body.membership.state).toBe("ending");
    expect((await t.call({ action: "membershipCancel", id: body.id })).statusCode).toBe(409);
    const resume = await t.call({ action: "membershipResume", id: body.id });
    expect(resume.body.membership.state).toBe("active");
    expect(t.emails.filter((e) => e.queue === "membership-ending")).toHaveLength(1);

    t.subs.get(subId).status = "past_due";
    const event = { type: "invoice.payment_failed", data: { object: { subscription: subId } } };
    expect(await t.desk.onEvent(event)).toBe(true);
    expect(await t.desk.onEvent(event)).toBe(true);
    expect(t.db.store.get(`memberships/${body.id}`).state).toBe("pastDue");
    const failed = t.emails.filter((e) => e.queue === "membership-failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].html).toContain("/account/membership?card=1");
    // Events for subscriptions the shop doesn't know, and other events, are ignored.
    expect(await t.desk.onEvent({ type: "invoice.paid", data: { object: { subscription: "sub_unknown" } } })).toBe(false);
    expect(await t.desk.onEvent({ type: "charge.succeeded", data: { object: {} } })).toBe(false);
  });

  test("a member can't touch someone else's membership", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    t.finish("cs_test_000000");
    t.signIn({ email: "eve@example.com", uid: "u2", name: "Eve" });
    const r = await t.call({ action: "membershipCancel", id: body.id });
    expect(r.statusCode).toBe(404);
    expect((await t.call({ action: "membershipMine" })).body.memberships).toEqual([]);
  });

  test("a new card goes onto the subscription once its page is finished", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    const subId = t.finish("cs_test_000000");
    await t.call({ action: "membershipMine" });
    const card = await t.call({ action: "membershipCard", id: body.id });
    expect(card.statusCode).toBe(200);
    const page = t.opened[1];
    expect(page.params).toMatchObject({ mode: "setup", customer: "cus_1", metadata: { membership: body.id } });
    t.saved.set("cs_test_000001", { customer: "cus_1", paymentMethod: "pm_new", brand: "mastercard", last4: "4444" });
    const mine = await t.call({ action: "membershipMine" });
    expect(t.cardSet).toEqual([{ id: subId, pm: "pm_new" }]);
    expect(mine.body.memberships[0]).toMatchObject({ cardPending: false });
    expect(t.db.store.get(`memberships/${body.id}`).card).toMatchObject({ last4: "4444" });
  });

  test("the sweep closes a page nobody finished, and that membership never shows", async () => {
    const t = setup();
    const planId = await withPlan(t);
    await t.call({ action: "membershipJoin", planId });
    expect(await t.desk.sweep()).toEqual({ read: 0, closed: 0, boxes: 0, gifts: 0 });
    t.clock.now = new Date(Date.parse("2026-11-18T13:00:00Z") + (PAGE_MINUTES + 1) * 60_000);
    expect(await t.desk.sweep()).toEqual({ read: 1, closed: 1, boxes: 0, gifts: 0 });
    expect(t.closed).toEqual(["cs_test_000000"]);
    expect((await t.call({ action: "membershipMine" })).body.memberships).toEqual([]);
    // Free to join again.
    expect((await t.call({ action: "membershipJoin", planId })).statusCode).toBe(200);
  });

  test("a shop whose card provider has no subscriptions says it can't take memberships yet", async () => {
    const t = setup({ subscriptions: false });
    const planId = await withPlan(t);
    expect((await t.call({ action: "membershipInfo" })).body.ready).toBe(false);
    const r = await t.call({ action: "membershipJoin", planId });
    expect(r.statusCode).toBe(409);
    expect(r.body.code).toBe("not_available");
  });

  test("the owner's plans: checked, price fixed once made, at most eight, totals count live paid members", async () => {
    const t = setup();
    expect((await t.admin({ op: "savePlan", plan: { ...PLAN, priceMinor: 50 } })).body.code).toBe("price");
    const planId = await withPlan(t);
    const change = await t.admin({ op: "savePlan", id: planId, plan: { ...PLAN, priceMinor: 2000 } });
    expect(change.statusCode).toBe(409);
    expect((await t.admin({ op: "savePlan", id: planId, plan: { ...PLAN, name: "Friends", hidden: true } })).statusCode).toBe(200);
    // A hidden plan takes nobody new.
    expect((await t.call({ action: "membershipJoin", planId })).statusCode).toBe(404);
    for (let i = 1; i < 8; i += 1) await withPlan(t, { ...PLAN, name: `Plan ${i}` });
    expect((await t.admin({ op: "savePlan", plan: PLAN })).body.code).toBe("too_many");

    const list = await t.admin({ op: "list" });
    expect(list.body.plans).toHaveLength(8);
    expect(list.body.totals).toEqual({ members: 0, monthlyMinor: 0, pastDue: 0 });
    expect(list.body.plans.find((p) => p.id === planId)).toMatchObject({ hidden: true, members: 0 });
  });

  test("the owner can end a membership at once", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    t.finish("cs_test_000000", "active");
    await t.call({ action: "membershipMine" });
    const r = await t.admin({ op: "endNow", id: body.id });
    expect(r.body.member.state).toBe("ended");
    expect(t.db.store.get(`memberships/${body.id}`)).toMatchObject({ state: "ended", endedBy: "owner@example.com", checkAfter: null });
    expect(t.emails.filter((e) => e.queue === "membership-ended")).toHaveLength(1);
    expect((await t.admin({ op: "endNow", id: body.id })).statusCode).toBe(409);
  });

  test("paid invoices are kept for the books: on an invoice event, else once a day, never twice, test marked", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0 });
    const { body } = await t.call({ action: "membershipJoin", planId });
    const subId = t.finish("cs_test_000000", "active");
    t.invoices.set(subId, [{ id: "in_1", status: "paid", amountMinor: 1500, currency: "cad", paidAt: "2026-11-18T13:01:00.000Z" }]);
    await t.call({ action: "membershipMine" });
    expect(t.db.store.get(`memberships/${body.id}`).payments).toEqual([{ id: "in_1", amountMinor: 1500, currency: "CAD", paidAt: "2026-11-18T13:01:00.000Z", periodEnd: "" }]);
    // Opening the account again the same day doesn't ask the provider for invoices again.
    const reads = t.invoiceReads.length;
    t.clock.now = new Date("2026-11-18T15:00:00Z");
    await t.call({ action: "membershipMine" });
    expect(t.invoiceReads.length).toBe(reads);
    // A month on, the invoice event brings the new payment; an open or empty invoice is never kept.
    t.invoices.set(subId, [
      { id: "in_2", status: "paid", amountMinor: 1500, currency: "cad", paidAt: "2026-12-18T13:00:00.000Z" },
      { id: "in_3", status: "open", amountMinor: 1500, currency: "cad", paidAt: "" },
      { id: "in_1", status: "paid", amountMinor: 1500, currency: "cad", paidAt: "2026-11-18T13:01:00.000Z" },
    ]);
    t.clock.now = new Date("2026-12-18T13:05:00Z");
    await t.desk.onEvent({ type: "invoice.paid", data: { object: { subscription: subId } } });
    expect(t.db.store.get(`memberships/${body.id}`).payments.map((p) => p.id)).toEqual(["in_1", "in_2"]);
    const r = await t.admin({ op: "payments" });
    expect(r.body.payments).toEqual([
      { id: "in_1", membershipId: body.id, plan: "Friends of the press", amountMinor: 1500, currency: "CAD", paidAt: "2026-11-18T13:01:00.000Z", test: true },
      { id: "in_2", membershipId: body.id, plan: "Friends of the press", amountMinor: 1500, currency: "CAD", paidAt: "2026-12-18T13:00:00.000Z", test: true },
    ]);
    expect(JSON.stringify(r.body)).not.toContain("ada@example.com");
  });

  test("mergePayments keeps the provider's copy, oldest first, and drops unpaid ones", () => {
    const merged = mergePayments([{ id: "a", amountMinor: 900, currency: "CAD", paidAt: "2026-02-01T00:00:00Z" }], [
      { id: "a", status: "paid", amountMinor: 1000, currency: "cad", paidAt: "2026-02-01T00:00:00Z" },
      { id: "b", status: "paid", amountMinor: 0, currency: "cad", paidAt: "2026-01-01T00:00:00Z" },
      { id: "c", status: "paid", amountMinor: 500, currency: "usd", paidAt: "2026-01-15T00:00:00Z" },
      { id: "d", status: "void", amountMinor: 500, currency: "cad", paidAt: "2026-01-20T00:00:00Z" },
    ]);
    expect(merged.map((p) => [p.id, p.amountMinor, p.currency])).toEqual([["c", 500, "USD"], ["a", 1000, "CAD"]]);
  });

  test("nextCheck: soon after the paid period ends, at least daily, never for an ended one", () => {
    const now = Date.parse("2026-11-18T13:00:00Z");
    expect(nextCheck("ended", "", now)).toBeNull();
    expect(nextCheck("active", "2026-11-18T14:00:00Z", now)).toBe("2026-11-18T15:00:00.000Z");
    expect(nextCheck("active", "2027-01-01T00:00:00Z", now)).toBe("2026-11-19T13:00:00.000Z");
    expect(nextCheck("active", "2026-11-01T00:00:00Z", now)).toBe("2026-11-18T13:15:00.000Z");
    expect(nextCheck("pastDue", "", now)).toBe("2026-11-18T19:00:00.000Z");
  });

  test("a box plan asks for the address on the card page, keeps it, and the member can change it (M3a)", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, box: { items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 10 } });
    const info = await t.call({ action: "membershipInfo" });
    expect(info.body.plans[0].box).toEqual({ items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 10 });
    const { body } = await t.call({ action: "membershipJoin", planId });
    expect(t.opened[0].params.shipping_address_collection).toEqual({ allowed_countries: ["CA", "US"] });
    t.finish("cs_test_000000");
    t.sessions.get("cs_test_000000").collected_information = { shipping_details: { name: "Ada Reader", address: { line1: "12 Ink Lane", city: "Toronto", state: "ON", postal_code: "M6G 3H1", country: "CA" } } };
    const mine = await t.call({ action: "membershipMine" });
    expect(mine.body.memberships[0]).toMatchObject({ box: true, address: { name: "Ada Reader", city: "Toronto", country: "CA" } });
    const bad = await t.call({ action: "membershipAddress", id: body.id, address: { name: "Ada", line1: "1 Rue", city: "Paris", postalCode: "75001", country: "FR" } });
    expect([bad.statusCode, bad.body.code]).toEqual([400, "address"]);
    const moved = await t.call({ action: "membershipAddress", id: body.id, address: { name: "Ada Reader", line1: "5 Press St", city: "Montreal", state: "QC", postalCode: "H2X 1Y4", country: "CA" } });
    expect(moved.body.membership.address).toMatchObject({ line1: "5 Press St", city: "Montreal" });
    t.signIn({ ...ADA, email: "someone@example.com" });
    expect((await t.call({ action: "membershipAddress", id: body.id, address: {} })).statusCode).toBe(404);
  });

  test("a box added to a plan later reaches its members, who are asked for an address; taking it off removes it", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    t.finish("cs_test_000000", "active");
    await t.call({ action: "membershipMine" });
    await t.admin({ op: "savePlan", id: planId, plan: { ...PLAN, box: { items: [{ bookId: "book1" }], cutoffDay: 3 } } });
    expect((await t.call({ action: "membershipMine" })).body.memberships[0]).toMatchObject({ id: body.id, box: true, address: null });
    await t.admin({ op: "savePlan", id: planId, plan: PLAN });
    expect(t.db.store.get(`membershipPlans/${planId}`).box).toBeNull();
    expect((await t.call({ action: "membershipInfo" })).body.plans[0]).not.toHaveProperty("box");
  });

  /** A paid box member who joined in October, with an address (M3b). */
  let people = 0;
  async function boxMember(t, planId, { state = "active", startedAt = "2026-10-01T15:00:00.000Z" } = {}) {
    people += 1;
    t.signIn({ ...ADA, email: `member${people}@example.com`, uid: `u${people}` });
    const { body } = await t.call({ action: "membershipJoin", planId });
    expect(body.id).toBeTruthy();
    const sid = t.opened[t.opened.length - 1].params ? `cs_test_${String(t.opened.length - 1).padStart(6, "0")}` : "";
    t.finish(sid, state === "trial" ? "trialing" : state === "pastDue" ? "past_due" : "active");
    await t.call({ action: "membershipMine" });
    await t.call({ action: "membershipAddress", id: body.id, address: { name: "Ada Reader", line1: "12 Ink Lane", city: "Toronto", state: "ON", postalCode: "M6G 3H1", country: "CA" } });
    t.db.store.set(`memberships/${body.id}`, { ...t.db.store.get(`memberships/${body.id}`), startedAt });
    return body.id;
  }

  test("on and after the cut-off day each paid box member gets one order a month, never twice (M3b)", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0, box: { items: [{ bookId: "book1", quantity: 2 }], cutoffDay: 15 } });
    const id = await boxMember(t, planId);
    expect(await t.desk.sweepBoxes()).toEqual({ made: 1 });
    expect(t.boxCalls[0]).toMatchObject({ membershipId: id, month: "2026-11", plan: { id: planId, box: { cutoffDay: 15 } } });
    expect(t.db.store.get(`memberships/${id}`)).toMatchObject({ lastBoxMonth: "2026-11", lastBoxOrder: `BOX-${id}-2026-11` });
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    expect(t.boxCalls).toHaveLength(1);
    // Next month's box waits for next month's cut-off day.
    t.clock.now = new Date("2026-12-14T17:00:00Z");
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    t.clock.now = new Date("2026-12-15T17:00:00Z");
    expect(await t.desk.sweepBoxes()).toEqual({ made: 1 });
    expect(t.boxCalls[1].month).toBe("2026-12");
    // The owner sees when the last box went.
    expect((await t.admin({ op: "list" })).body.members[0]).toMatchObject({ lastBoxMonth: "2026-12" });
  });

  test("skip next box: no box that month, the next monthly payment held, and it can be brought back (M3c)", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0, box: { items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 15 } });
    const id = await boxMember(t, planId);
    // The 18th is past November's cut-off, so the next box is December's.
    const skip = await t.call({ action: "membershipSkip", id });
    expect(skip.statusCode).toBe(200);
    expect(skip.body.membership).toMatchObject({ state: "active", skipMonth: "2026-12" });
    const sub = t.subs.get(t.db.store.get(`memberships/${id}`).subscription);
    expect(sub).toMatchObject({ paused: true, pausedUntil: "2026-12-03T13:00:00.000Z" });
    expect((await t.call({ action: "membershipSkip", id })).statusCode).toBe(409);
    t.clock.now = new Date("2026-12-15T17:00:00Z");
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    // Brought back before the cut-off: the box comes and the payment is no longer held.
    t.clock.now = new Date("2026-12-10T17:00:00Z");
    const back = await t.call({ action: "membershipUnskip", id });
    expect(back.body.membership.skipMonth).toBe("");
    expect(sub.paused).toBe(false);
    t.clock.now = new Date("2026-12-15T17:00:00Z");
    expect(await t.desk.sweepBoxes()).toEqual({ made: 1 });
  });

  test("pause stops perks and boxes until the member resumes (M3c)", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0, box: { items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 15 } });
    const id = await boxMember(t, planId);
    const email = t.db.store.get(`memberships/${id}`).customer.email;
    const paused = await t.call({ action: "membershipPause", id });
    expect(paused.body.membership).toMatchObject({ state: "paused" });
    expect(await t.desk.hasMembership(email, true)).toBe(false);
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    expect((await t.call({ action: "membershipPause", id })).statusCode).toBe(409);
    expect((await t.admin({ op: "list" })).body.members[0].state).toBe("paused");
    const resumed = await t.call({ action: "membershipUnpause", id });
    expect(resumed.body.membership.state).toBe("active");
    expect(await t.desk.hasMembership(email, true)).toBe(true);
    expect(await t.desk.sweepBoxes()).toEqual({ made: 1 });
  });

  test("no box for a trial, a failed payment, no address, or someone who started paying after the cut-off", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, box: { items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 15 } });
    await boxMember(t, planId, { state: "trial" });
    await boxMember(t, planId, { state: "pastDue" });
    await boxMember(t, planId, { startedAt: "2026-11-17T15:00:00.000Z" });
    const noAddress = await boxMember(t, planId);
    const m = t.db.store.get(`memberships/${noAddress}`);
    t.db.store.set(`memberships/${noAddress}`, { ...m, address: null });
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    expect(t.boxCalls).toHaveLength(0);
  });

  test("a box that can't be made is noted and tried again an hour later; nothing while Memberships is off", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0, box: { items: [{ bookId: "book1", quantity: 1 }], cutoffDay: 15 } });
    const id = await boxMember(t, planId);
    t.boxFail.on = true;
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
    expect(t.db.store.get(`memberships/${id}`).boxProblem).toMatchObject({ month: "2026-11", text: "A product in the box was removed." });
    await t.desk.sweepBoxes();
    expect(t.boxCalls).toHaveLength(1);
    t.boxFail.on = false;
    t.clock.now = new Date(t.clock.now.getTime() + 61 * 60_000);
    expect(await t.desk.sweepBoxes()).toEqual({ made: 1 });
    expect(t.db.store.get(`memberships/${id}`).boxProblem).toBeNull();
    t.db.store.set("platform/features", { ways: { memberships: false } });
    t.clock.now = new Date("2026-12-16T17:00:00Z");
    expect(await t.desk.sweepBoxes()).toEqual({ made: 0 });
  });

  test("three days before the cut-off the owner hears what the boxes are short of, once, and sees it on the Members page", async () => {
    const t = setup();
    const planId = await withPlan(t, { ...PLAN, trialDays: 0, box: { items: [{ bookId: "book1", quantity: 2 }, { bookId: "book2", quantity: 1 }], cutoffDay: 20 } });
    await boxMember(t, planId);
    await boxMember(t, planId);
    t.db.store.set("books/book1", { title: "Salt Hours", trackInventory: true, stockLevel: 3 });
    t.db.store.set("books/book2", { title: "Tote", trackInventory: false });
    const sent = t.emails.length;
    await t.desk.sweepBoxes();
    const stock = t.emails.slice(sent).filter((e) => e.subject.startsWith("[STOCK]"));
    expect(stock).toHaveLength(1);
    expect(stock[0].html).toContain("Salt Hours: 4 needed, 3 on the shelf");
    expect(stock[0].html).toContain("on the 20th for 2 members");
    await t.desk.sweepBoxes();
    expect(t.emails.filter((e) => e.subject.startsWith("[STOCK]"))).toHaveLength(1);
    const list = await t.admin({ op: "list" });
    expect(list.body.boxWarnings).toEqual([{ planId, planName: PLAN.name, cutoffDay: 20, members: 2, month: "2026-11", short: [{ bookId: "book1", variantId: "", title: "Salt Hours", need: 4, have: 3 }] }]);
    // Enough stock: nothing to say.
    t.db.store.set("books/book1", { title: "Salt Hours", trackInventory: true, stockLevel: 9 });
    expect((await t.admin({ op: "list" })).body.boxWarnings).toEqual([]);
  });

  test("a plan without a box asks for no address, and its members have none to change", async () => {
    const t = setup();
    const planId = await withPlan(t);
    const { body } = await t.call({ action: "membershipJoin", planId });
    expect(t.opened[0].params).not.toHaveProperty("shipping_address_collection");
    t.finish("cs_test_000000");
    expect((await t.call({ action: "membershipMine" })).body.memberships[0]).not.toHaveProperty("box");
    expect((await t.call({ action: "membershipAddress", id: body.id, address: {} })).body.code).toBe("state");
  });

  test("a members-only page shows its words only to a signed-in member, and its title to everyone else (M2b)", async () => {
    const t = setup();
    t.db.store.set("pages/p1", { slug: "zine-club", status: "members", title: "Zine club", body: "Secret words", updatedAt: "2026-11-01" });
    t.db.store.set("pages/p2", { slug: "about", status: "published", title: "About", body: "Hello" });
    t.db.store.set("memberships/m1", { state: "active", mode: "test", planId: "x", customer: { email: ADA.email } });
    const shown = await t.call({ action: "membershipPage", slug: "zine-club" });
    expect(shown.body).toMatchObject({ locked: false, page: { id: "p1", slug: "zine-club", title: "Zine club", body: "Secret words" } });
    // A live membership in a test shop, an ended one, signed out: the title only.
    t.db.store.set("memberships/m1", { state: "active", mode: "live", planId: "x", customer: { email: ADA.email } });
    expect((await t.call({ action: "membershipPage", slug: "zine-club" })).body).toEqual({ locked: true, signedIn: true, page: { id: "p1", slug: "zine-club", title: "Zine club" } });
    t.db.store.set("memberships/m1", { state: "ended", mode: "test", planId: "x", customer: { email: ADA.email } });
    expect((await t.call({ action: "membershipPage", slug: "zine-club" })).body.locked).toBe(true);
    t.signIn(null);
    expect((await t.call({ action: "membershipPage", slug: "zine-club" })).body).toMatchObject({ locked: true, signedIn: false });
    // Only members pages, real slugs, and only while Memberships is on.
    for (const slug of ["about", "nope", "../x", ""]) expect((await t.call({ action: "membershipPage", slug })).statusCode).toBe(404);
    t.db.store.set("firstWeek/start", { ways: {} });
    expect((await t.call({ action: "membershipPage", slug: "zine-club" })).statusCode).toBe(404);
  });
});

describe("gift memberships (M5)", () => {
  const BEN = { email: "ben@example.com", uid: "u2", name: "Ben Buyer" };
  const giftPlan = { ...PLAN, gifts: true };

  test("only a plan the owner allows as a gift, never a box plan; the price is months of the plan, paid once", async () => {
    const t = setup();
    const plain = await withPlan(t);
    const giftable = await withPlan(t, giftPlan);
    const info = await t.call({ action: "membershipInfo" });
    const byId = Object.fromEntries(info.body.plans.map((p) => [p.id, p]));
    expect(byId[plain].gifts).toBeUndefined();
    expect(byId[giftable].gifts).toEqual([{ months: 3, priceMinor: 4500 }, { months: 6, priceMinor: 9000 }, { months: 12, priceMinor: 18000 }]);

    t.signIn(BEN);
    expect((await t.call({ action: "membershipGift", planId: plain, gift: { months: 3, email: "ada@example.com" } })).body.code).toBe("plan");
    expect((await t.call({ action: "membershipGift", planId: giftable, gift: { months: 4, email: "ada@example.com" } })).body.code).toBe("months");
    expect((await t.call({ action: "membershipGift", planId: giftable, gift: { months: 3, email: "nope" } })).body.code).toBe("email");
    expect((await t.call({ action: "membershipGift", planId: giftable, gift: { months: 3, email: "BEN@example.com" } })).body.code).toBe("email");

    const r = await t.call({ action: "membershipGift", planId: giftable, gift: { months: 6, email: "Ada@Example.com", name: "Ada", message: "Happy birthday!" } });
    expect(r.statusCode).toBe(200);
    const { params, idem } = t.opened[0];
    expect(params.mode).toBe("payment");
    expect(params).not.toHaveProperty("client_reference_id");
    expect(params.line_items[0].price_data).toEqual({ currency: "cad", unit_amount: 9000, product_data: { name: "Test Press: Gift membership, Friends of the press (6 months)" } });
    expect(params.metadata).toEqual({ gift_membership: r.body.id });
    expect(idem).toBe(`membership-gift-${r.body.id}`);
    expect(t.db.store.get(`membershipGifts/${r.body.id}`)).toMatchObject({ state: "pending", months: 6, priceMinor: 9000, to: { email: "ada@example.com", name: "Ada" }, buyer: { email: BEN.email } });
  });

  test("once paid, the person it's for is a member until the months end, both get one email, and it ends by itself", async () => {
    const t = setup();
    const planId = await withPlan(t, giftPlan);
    t.signIn(BEN);
    const r = await t.call({ action: "membershipGift", planId, gift: { months: 3, email: "ada@example.com", name: "Ada", message: "Enjoy" } });
    expect((await t.call({ action: "membershipGiftStatus", id: r.body.id })).body.gift).toMatchObject({ state: "pending" });

    Object.assign(t.sessions.get("cs_test_000000"), { status: "complete", payment_status: "paid", payment_intent: "pi_1" });
    expect((await t.call({ action: "membershipGiftStatus", id: r.body.id })).body.gift).toEqual({ id: r.body.id, state: "paid", months: 3, plan: PLAN.name, to: "Ada" });
    await t.desk.sweep();
    await t.call({ action: "membershipGiftStatus", id: r.body.id });
    expect(t.emails.filter((e) => e.queue === "membership-gift-given")).toHaveLength(1);
    expect(t.emails.filter((e) => e.queue === "membership-gift-sent")).toHaveLength(1);
    expect(t.emails.find((e) => e.queue === "membership-gift-given")).toMatchObject({ to: "ada@example.com" });
    expect(t.emails.find((e) => e.queue === "membership-gift-given").html).toContain("Enjoy");

    // Someone else can't read Ben's gift.
    t.signIn(ADA);
    expect((await t.call({ action: "membershipGiftStatus", id: r.body.id })).statusCode).toBe(404);

    const mine = await t.call({ action: "membershipMine" });
    expect(mine.body.memberships).toHaveLength(1);
    const m = mine.body.memberships[0];
    expect(m).toMatchObject({ state: "active", gift: { months: 3, from: "Ben Buyer" }, periodEnd: "2027-02-18T13:00:00.000Z" });
    expect(await t.desk.hasMembership(ADA.email, true)).toBe(true);
    // Nothing to cancel or pay; joining waits until it ends.
    expect((await t.call({ action: "membershipCancel", id: m.id })).body.code).toBe("gift");
    expect((await t.call({ action: "membershipJoin", planId })).body.code).toBe("member");
    // In the books once, and not counted as money every month.
    const stored = t.db.store.get(`memberships/${m.id}`);
    expect(stored.payments).toEqual([expect.objectContaining({ amountMinor: 4500, currency: "CAD" })]);
    const listed = (await t.admin({ op: "list" })).body;
    expect(listed.members).toEqual([expect.objectContaining({ email: "ada@example.com", gift: { months: 3, from: "Ben Buyer" } })]);
    expect(listed.totals.monthlyMinor).toBe(0);

    t.clock.now = new Date("2027-02-18T13:02:00Z");
    await t.desk.sweep();
    expect(t.db.store.get(`memberships/${m.id}`)).toMatchObject({ state: "ended", checkAfter: null });
    expect(t.emails.filter((e) => e.queue === "membership-gift-ended")).toHaveLength(1);
    await t.desk.sweep();
    expect(t.emails.filter((e) => e.queue === "membership-gift-ended")).toHaveLength(1);
    expect(await t.desk.hasMembership(ADA.email, true)).toBe(false);
  });

  test("an unpaid gift page closes after its hour and makes no membership; the owner can end a gift at once", async () => {
    const t = setup();
    const planId = await withPlan(t, giftPlan);
    t.signIn(BEN);
    const r = await t.call({ action: "membershipGift", planId, gift: { months: 12, email: "ada@example.com" } });
    t.sessions.get("cs_test_000000").status = "expired";
    t.clock.now = new Date(Date.parse("2026-11-18T13:00:00Z") + (PAGE_MINUTES + 5) * 60_000);
    await t.desk.sweep();
    expect(t.db.store.get(`membershipGifts/${r.body.id}`)).toMatchObject({ state: "ended", checkAfter: null });
    expect([...t.db.store.keys()].filter((k) => k.startsWith("memberships/"))).toEqual([]);

    const r2 = await t.call({ action: "membershipGift", planId, gift: { months: 3, email: "ada@example.com" } });
    Object.assign(t.sessions.get("cs_test_000001"), { status: "complete", payment_status: "paid" });
    await t.call({ action: "membershipGiftStatus", id: r2.body.id });
    const ended = await t.admin({ op: "endNow", id: `g${r2.body.id}` });
    expect(ended.statusCode).toBe(200);
    expect(ended.body.member).toMatchObject({ state: "ended" });
  });
});

describe("members' posts (M5b)", () => {
  test("the owner writes a post for some plans; only their paid-up members read it, and it can be emailed to them once", async () => {
    const t = setup();
    const friends = await withPlan(t);
    const patrons = await withPlan(t, { ...PLAN, name: "Patrons", priceMinor: 5000 });
    // Ada joins Friends.
    await t.call({ action: "membershipJoin", planId: friends });
    t.finish("cs_test_000000", "active");
    await t.call({ action: "membershipMine" });

    expect((await t.admin({ op: "savePost", post: { title: "", body: "x" } })).body.code).toBe("title");
    expect((await t.admin({ op: "savePost", post: { title: "Hi", body: "  " } })).body.code).toBe("body");
    const forPatrons = await t.admin({ op: "savePost", post: { title: "Studio visit", body: "Patrons only.", planIds: [patrons], email: true } });
    expect(forPatrons.body.post).toMatchObject({ title: "Studio visit", planIds: [patrons], emailedTo: 0 });
    t.clock.now = new Date("2026-11-18T14:00:00Z");
    const forAll = await t.admin({ op: "savePost", post: { title: "Winter news", body: "New book soon.\n\nSee you at the fair.", planIds: [], email: true } });
    expect(forAll.body.post.emailedTo).toBe(1);
    const mail = t.emails.filter((e) => e.queue === "membership-post");
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: ADA.email, subject: "[TEST] Test Press: Winter news" });
    expect(mail[0].html).toContain("See you at the fair.");

    const read = await t.call({ action: "membershipPosts" });
    expect(read.body).toEqual({ member: true, posts: [{ id: forAll.body.post.id, title: "Winter news", body: "New book soon.\n\nSee you at the fair.", publishedAt: "2026-11-18T14:00:00.000Z" }] });

    // Editing changes the words, never sends again; the owner's list has both, newest first.
    await t.admin({ op: "savePost", id: forAll.body.post.id, post: { title: "Winter news!", body: "Updated.", email: true } });
    expect(t.emails.filter((e) => e.queue === "membership-post")).toHaveLength(1);
    const list = await t.admin({ op: "posts" });
    expect(list.body.posts.map((p) => p.title)).toEqual(["Winter news!", "Studio visit"]);

    // Someone who isn't a member reads nothing.
    t.signIn({ email: "ben@example.com", uid: "u2", name: "Ben" });
    expect((await t.call({ action: "membershipPosts" })).body).toEqual({ member: false, posts: [] });

    await t.admin({ op: "deletePost", id: forPatrons.body.post.id });
    expect((await t.admin({ op: "posts" })).body.posts).toHaveLength(1);
  });
});
