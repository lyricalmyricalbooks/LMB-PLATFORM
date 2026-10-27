// Email retry queue: an email every sender refused is kept (server-only emailOutbox) and sent
// again on a widening schedule; the admin can see, retry or stop it without ever reading its
// HTML. Bad addresses never send or queue; old delivery rows are pruned.
import { describe, expect, test } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";

const realRequire = createRequire(import.meta.url);
const outbox = realRequire("./emailOutbox");
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js"), "utf8");

describe("pure rules", () => {
  test("recipients must be real single-line addresses", () => {
    expect(outbox.cleanRecipients(" reader@example.com ")).toEqual(["reader@example.com"]);
    expect(outbox.cleanRecipients(["a@example.com", "b@example.org"])).toEqual(["a@example.com", "b@example.org"]);
    expect(outbox.cleanRecipients("reader@example.com\r\nBcc: x@evil.test")).toBeNull();
    expect(outbox.cleanRecipients("not-an-address")).toBeNull();
    expect(outbox.cleanRecipients("")).toBeNull();
    expect(outbox.cleanRecipients(undefined)).toBeNull();
  });

  test("subjects and sender names cannot break mail headers", () => {
    expect(outbox.cleanSubject("Hi\r\nBcc: x@evil.test")).toBe("Hi Bcc: x@evil.test");
    expect(outbox.cleanSubject("x".repeat(400))).toHaveLength(250);
    expect(outbox.cleanFromName('Shop "Books" <x>\nBcc')).toBe("Shop Books x Bcc");
    expect(outbox.cleanFromName("")).toBe("Lyricalmyrical Books");
  });

  test("retries widen from 15 minutes and give up after the last try", () => {
    const now = Date.parse("2026-10-09T12:00:00.000Z");
    expect(outbox.nextRetryAt(1, now)).toBe("2026-10-09T12:15:00.000Z");
    expect(outbox.nextRetryAt(2, now)).toBe("2026-10-09T12:30:00.000Z");
    expect(outbox.nextRetryAt(outbox.MAX_ATTEMPTS - 1, now)).toBe("2026-10-10T00:00:00.000Z");
    expect(outbox.nextRetryAt(outbox.MAX_ATTEMPTS, now)).toBeNull();
  });

  test("an entry sends when due and not leased; a given-up one only by hand", () => {
    const now = Date.parse("2026-10-09T12:00:00.000Z");
    const due = { status: "pending", nextAttemptAt: "2026-10-09T11:59:00.000Z" };
    expect(outbox.canSendNow(due, now)).toBe(true);
    expect(outbox.canSendNow({ ...due, nextAttemptAt: "2026-10-09T12:30:00.000Z" }, now)).toBe(false);
    expect(outbox.canSendNow({ ...due, nextAttemptAt: "2026-10-09T12:30:00.000Z" }, now, { force: true })).toBe(true);
    expect(outbox.canSendNow({ ...due, leaseUntil: "2026-10-09T12:05:00.000Z" }, now, { force: true })).toBe(false);
    expect(outbox.canSendNow({ status: "failed", nextAttemptAt: null }, now)).toBe(false);
    expect(outbox.canSendNow({ status: "failed", nextAttemptAt: null }, now, { force: true })).toBe(true);
    expect(outbox.canSendNow(null, now, { force: true })).toBe(false);
  });

  test("only a wrong address counts as permanent", () => {
    expect(outbox.isPermanentEmailError("reader@x is not a valid email address")).toBe(true);
    expect(outbox.isPermanentEmailError("550 5.1.1 Recipient address rejected")).toBe(true);
    expect(outbox.isPermanentEmailError("The Resend API key is missing or invalid.")).toBe(false);
    expect(outbox.isPermanentEmailError("ETIMEDOUT")).toBe(false);
  });

  test("the admin summary never carries the message itself", () => {
    const view = outbox.publicOutboxEntry("abc", { to: ["r@example.com"], subject: "S", html: "<p>GIFT-CODE</p>", attempts: 2, status: "pending" });
    expect(JSON.stringify(view)).not.toContain("GIFT-CODE");
    expect(view).toMatchObject({ id: "abc", to: "r@example.com", attempts: 2, status: "pending" });
  });

  test("a gift-card email always keeps its code; unknown placeholders read as blank", () => {
    expect(outbox.withRequiredPlaceholders("gift_card", "Enjoy!")).toBe("Enjoy!\n\nYour gift card code: {{code}}");
    expect(outbox.withRequiredPlaceholders("gift_card", "Code: {{ code }}")).toBe("Code: {{ code }}");
    expect(outbox.withRequiredPlaceholders("order_confirmation", "Hi")).toBe("Hi");
    expect(outbox.blankUnknownPlaceholders("Order {{order_number}} for {{ name }}")).toBe("Order  for ");
  });
});

function harness({ docs: extra = {}, gmailFails = true, resendFails = true, patch = "", failOutboxDelete = 0 } = {}) {
  const docs = { settings: { website: { payments: {} }, notifications: {} }, adminSecrets: { gmail: { appPassword: "abcd" }, resend: { apiKey: "re_live_key" } }, ...extra };
  const logs = [];
  const delivered = [];
  const state = { gmailFails, resendFails, failOutboxDelete, resendOptions: [] };
  const clone = v => (v === undefined ? v : structuredClone(v));
  const ref = (name, id) => ({
    id,
    path: `${name}/${id}`,
    get ref() { return this; },
    async get() { const data = docs[name]?.[id]; return { id, ref: this, exists: !!data, data: () => clone(data) }; },
    async set(data, opts) { docs[name] = docs[name] || {}; docs[name][id] = opts?.merge ? { ...(docs[name][id] || {}), ...data } : { ...data }; },
    async update(data) { docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async delete() {
      if (name === "emailOutbox" && state.failOutboxDelete > 0) { state.failOutboxDelete -= 1; throw new Error("delete failed"); }
      if (docs[name]) delete docs[name][id];
    },
  });
  const matches = (v, op, value) => op === "array-contains" ? Array.isArray(v) && v.includes(value) : op === "==" ? v === value : op === "<=" ? typeof v === "string" && v <= value
    : op === "<" ? typeof v === "string" && v < value : op === ">=" ? String(v || "") >= value : op === "in" ? value.includes(v) : true;
  const query = (name, filters = []) => ({
    where: (field, op, value) => query(name, [...filters, { field, op, value }]),
    orderBy: () => query(name, filters),
    select: () => query(name, filters),
    startAfter: () => query(name, filters),
    limit: () => query(name, filters),
    async get() {
      const rows = Object.entries(docs[name] || {}).filter(([, d]) => filters.every(f => matches(f.field.split(".").reduce((v, k) => (v == null ? undefined : v[k]), d), f.op, f.value)))
        .map(([id, data]) => ({ id, ref: ref(name, id), data: () => clone(data) }));
      return { empty: !rows.length, docs: rows, size: rows.length };
    },
  });
  const db = {
    collection: name => ({
      doc: id => ref(name, id),
      add: async data => { if (name === "emailLog") logs.push(data); },
      ...query(name),
    }),
    batch() {
      const ops = [];
      return { delete: r => ops.push(() => r.delete()), update: (r, d) => ops.push(() => r.update(d)), set: (r, d, o) => ops.push(() => r.set(d, o)), async commit() { for (const op of ops) await op(); } };
    },
    async getAll(...refs) { return Promise.all(refs.map(r => r.get())); },
    async runTransaction(fn) { return fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: r => r.delete(), create: (r, d) => r.set(d) }); },
  };
  const admin = {
    initializeApp() {},
    firestore: Object.assign(() => db, { FieldValue: { increment: n => n, arrayUnion: (...x) => x } }),
    auth: () => ({ verifyIdToken: async () => ({ email: "lyricalmyricalbooks@gmail.com", email_verified: true }), getUserByEmail: async () => { throw new Error("none"); } }),
  };
  const wrap = (...args) => args.at(-1);
  const nodemailer = { createTransport: () => ({ verify: async () => { if (state.gmailFails) throw new Error("535-5.7.8 Username and Password not accepted"); return true; }, sendMail: async (m) => { if (state.gmailFails) throw new Error("Invalid login"); delivered.push(m); return { messageId: "gmail-1" }; } }) };
  const Resend = class { constructor() { this.emails = { send: async (m, options) => { state.resendOptions.push(options); if (state.resendFails) return { data: null, error: { message: "boom" } }; delivered.push(m); return { data: { id: "re-1" }, error: null }; } }; } };
  const mockRequire = name => {
    if (name === "firebase-admin") return admin;
    if (name === "stripe") return class {};
    if (name === "resend") return { Resend };
    if (name === "nodemailer") return nodemailer;
    if (name.startsWith("firebase-functions/v2/")) return new Proxy({}, { get: () => wrap });
    if (name === "firebase-functions/params") return { defineSecret: () => ({ value: () => "fake" }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  vm.runInNewContext(`${source}\nautoApproveShippingAddress = async () => {};
module.exports.__sendEmail = (m) => sendEmail(m);
module.exports.__runOutbox = (now, opts) => runEmailOutbox(now, opts);
module.exports.__compile = (...a) => compileEmailTemplate(...a);
module.exports.__defaults = () => loadNotificationSettings();
${patch}`,
    { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "off" } }, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error("no network"); } },
    { filename: "index.js" });
  const callFn = async (fn, body) => {
    const res = { code: 200, body: null, set() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
    await module.exports[fn]({ method: "POST", headers: { authorization: "Bearer t" }, body }, res);
    return res;
  };
  const call = body => callFn("sendTestEmail", body);
  return { docs, logs, delivered, state, call, callFn, exports: module.exports };
}

const order = (extra = {}) => ({ orderId: "AB-1", customer: { name: "Reader", email: "reader@example.com", address: {} }, items: [{ id: "b", title: "Book", quantity: 1, price: 3 }], total: 3.39, subtotal: 3, shipping: 0, paymentMethod: "Stripe", ...extra });
const updated = (before, after) => ({ data: { before: { data: () => before }, after: { data: () => after } }, params: { orderId: "o1" } });

describe("sending", () => {
  test("a queued kind that every sender refuses is kept for a retry instead of lost", async () => {
    const app = harness();
    const err = await app.exports.__sendEmail({ to: "reader@example.com", subject: "Order confirmed", html: "<p>Hi</p>", queue: "orderConfirmed" }).catch(e => e);
    expect(err.queued).toMatch(/^[a-f0-9]{24}$/);
    const entry = app.docs.emailOutbox[err.queued];
    expect(entry).toMatchObject({ to: ["reader@example.com"], subject: "Order confirmed", html: "<p>Hi</p>", status: "pending", attempts: 1, kind: "orderConfirmed" });
    expect(Date.parse(entry.nextAttemptAt)).toBeGreaterThan(Date.now());
    expect(app.logs.map(l => l.status)).toEqual(["fallback", "queued"]);
    expect(app.logs[1]).toMatchObject({ outboxId: err.queued, kind: "orderConfirmed" });
  });

  test("an unqueued send that fails is only logged as failed", async () => {
    const app = harness();
    await expect(app.exports.__sendEmail({ to: "reader@example.com", subject: "Hi", html: "<p>Hi</p>" })).rejects.toThrow();
    expect(app.docs.emailOutbox).toBeUndefined();
    expect(app.logs.at(-1).status).toBe("failed");
  });

  test("a bad or header-smuggling address is refused before any sender is tried, and never queued", async () => {
    const app = harness({ gmailFails: false, resendFails: false });
    const err = await app.exports.__sendEmail({ to: "reader@example.com\nBcc: x@evil.test", subject: "Hi", html: "<p>Hi</p>", queue: "welcome" }).catch(e => e);
    expect(err.permanent).toBe(true);
    expect(app.delivered).toHaveLength(0);
    expect(app.docs.emailOutbox).toBeUndefined();
    expect(app.logs).toHaveLength(1);
    expect(app.logs[0]).toMatchObject({ status: "failed", permanent: true });
    expect(app.logs[0].to).not.toMatch(/\n/);
  });

  test("a newline in the subject never reaches the mail headers", async () => {
    const app = harness({ gmailFails: false });
    await app.exports.__sendEmail({ to: "reader@example.com", subject: "Hi\r\nBcc: x@evil.test", html: "<p>Hi</p>" });
    expect(app.delivered[0].subject).toBe("Hi Bcc: x@evil.test");
  });

  test("a queued order email keeps its claim, so a re-run trigger neither resends nor queues it twice", async () => {
    const app = harness();
    const event = updated(order({ paymentStatus: "unpaid" }), order({ paymentStatus: "paid" }));
    await app.exports.onOrderUpdated(event);
    await app.exports.onOrderUpdated(event);
    const entries = Object.values(app.docs.emailOutbox);
    expect(entries.map(e => e.kind).sort()).toEqual(["orderConfirmed", "shopNewOrder"]);
    expect(app.docs["email-claims"].o1_orderConfirmed.queuedAs).toBeTruthy();
    expect(entries.find(e => e.kind === "orderConfirmed").claimId).toBe("o1_orderConfirmed");
  });
});

describe("the retry sweep", () => {
  const pending = (extra = {}) => ({ to: ["reader@example.com"], subject: "Order confirmed", html: "<p>Hi</p>", kind: "orderConfirmed", status: "pending", attempts: 1,
    createdAt: "2026-10-09T10:00:00.000Z", nextAttemptAt: new Date(Date.now() - 60_000).toISOString(), leaseUntil: null, ...extra });
  const ID = "a".repeat(24);

  test("sends a due email once the sender works again and clears it from the queue", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ claimId: "o1_orderConfirmed" }) }, "email-claims": { o1_orderConfirmed: { queuedAs: ID } } } });
    const result = await app.exports.__runOutbox();
    expect(result).toMatchObject({ tried: 1, sent: 1 });
    expect(app.delivered).toHaveLength(1);
    expect(app.docs.emailOutbox[ID]).toBeUndefined();
    expect(app.logs.at(-1)).toMatchObject({ status: "sent", outboxId: ID, attempt: 2 });
    expect(app.docs["email-claims"].o1_orderConfirmed.sentAt).toBeTruthy();
  });

  test("leaves emails that aren't due yet alone", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ nextAttemptAt: new Date(Date.now() + 600_000).toISOString() }) } } });
    expect((await app.exports.__runOutbox()).tried).toBe(0);
    expect(app.delivered).toHaveLength(0);
  });

  test("a failed retry waits longer; the last one gives up and says so", async () => {
    const app = harness({ docs: { emailOutbox: { [ID]: pending() } } });
    await app.exports.__runOutbox();
    expect(app.docs.emailOutbox[ID]).toMatchObject({ attempts: 2, status: "pending", leaseUntil: null });
    expect(Date.parse(app.docs.emailOutbox[ID].nextAttemptAt) - Date.now()).toBeGreaterThan(25 * 60_000);
    expect(app.logs.at(-1)).toMatchObject({ status: "queued", attempt: 2 });

    app.docs.emailOutbox[ID] = { ...app.docs.emailOutbox[ID], attempts: outbox.MAX_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1000).toISOString() };
    await app.exports.__runOutbox();
    expect(app.docs.emailOutbox[ID]).toMatchObject({ status: "failed", nextAttemptAt: null });
    expect(app.docs.emailOutbox[ID].gaveUpAt).toBeTruthy();
    expect(app.logs.at(-1).status).toBe("failed");
    expect(app.logs.at(-1).error).toMatch(/Gave up after/);
  });

  test("a leased entry (another run is sending it) is skipped", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ leaseUntil: new Date(Date.now() + 300_000).toISOString() }) } } });
    await app.exports.__runOutbox();
    expect(app.delivered).toHaveLength(0);
  });

  test("delivery rows older than 90 days and given-up entries older than 30 days are removed", async () => {
    const old = new Date(Date.now() - 100 * 86400_000).toISOString();
    const recent = new Date().toISOString();
    const app = harness({ docs: {
      emailLog: { a: { at: old, to: "x@example.com" }, b: { at: recent, to: "y@example.com" } },
      emailOutbox: { [ID]: pending({ status: "failed", nextAttemptAt: null, gaveUpAt: old }), ["b".repeat(24)]: pending({ status: "failed", nextAttemptAt: null, gaveUpAt: recent }) },
    } });
    const result = await app.exports.__runOutbox();
    expect(result).toMatchObject({ prunedLog: 1, prunedOutbox: 1 });
    expect(Object.keys(app.docs.emailLog)).toEqual(["b"]);
    expect(Object.keys(app.docs.emailOutbox)).toEqual(["b".repeat(24)]);
  });
});

describe("admin actions (Settings › Notifications)", () => {
  const ID = "c".repeat(24);
  const entry = (extra = {}) => ({ to: ["reader@example.com"], subject: "Your gift card", html: "<p>CODE-1234</p>", kind: "giftCard", status: "failed", attempts: 8, nextAttemptAt: null, createdAt: "2026-10-09T10:00:00.000Z", ...extra });

  test("lists the queue without the message bodies", async () => {
    const app = harness({ docs: { emailOutbox: { [ID]: entry() } } });
    const res = await app.call({ action: "emailQueue" });
    expect(res.code).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("CODE-1234");
  });

  test("Retry now sends even a given-up email; Stop removes one and records it", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: entry(), ["d".repeat(24)]: entry({ status: "pending" }) } } });
    expect((await app.call({ action: "retryEmail", id: ID })).body).toMatchObject({ status: "sent" });
    expect(app.docs.emailOutbox[ID]).toBeUndefined();
    expect((await app.call({ action: "retryEmail", id: ID })).code).toBe(409);
    const stop = await app.call({ action: "cancelEmail", id: "d".repeat(24) });
    expect(stop.body).toMatchObject({ status: "cancelled" });
    expect(app.logs.at(-1)).toMatchObject({ status: "cancelled" });
    expect((await app.call({ action: "cancelEmail", id: "../x" })).code).toBe(400);
  });

  test("Send test uses unsaved edits and brand, and refuses unknown templates or addresses", async () => {
    const app = harness({ gmailFails: false });
    const res = await app.call({ templateId: "order_confirmation", email: "owner@example.com",
      template: { subject: "Draft subject {{order_id}}", body: "Draft body for {{customer_name}} {{typo}}" }, brand: { brandColor: "#123456", logoUrl: "javascript:alert(1)" } });
    expect(res.code).toBe(200);
    expect(app.delivered[0].subject).toBe("[TEST] Draft subject LM-98241");
    expect(app.delivered[0].html).toContain("Draft body for Julianne Smith");
    expect(app.delivered[0].html).not.toContain("{{typo}}");
    expect(app.delivered[0].html).toContain("#123456");
    expect(app.delivered[0].html).not.toContain("javascript:");
    expect((await app.call({ templateId: "brand", email: "owner@example.com" })).code).toBe(400);
    expect((await app.call({ templateId: "__proto__", email: "owner@example.com" })).code).toBe(400);
    expect((await app.call({ templateId: "order_confirmation", email: "a@b.com\nBcc: c@d.com" })).code).toBe(400);
  });
});

test("templates: spaced placeholders fill, button links must be web links, the gift-card code survives an edit", async () => {
  const app = harness();
  const settings = await app.exports.__defaults();
  settings.gift_card = { ...settings.gift_card, body: "Hi {{ recipient_name }}, enjoy!" };
  const gift = app.exports.__compile("gift_card", settings, { recipient_name: "Sam", code: "ABCD-EFGH", button_url: "javascript:alert(1)" });
  expect(gift.html).toContain("Hi Sam, enjoy!");
  expect(gift.html).toContain("ABCD-EFGH");
  expect(gift.html).not.toContain("javascript:");
  const ok = app.exports.__compile("order_cancelled", { ...settings, order_cancelled: { ...settings.order_cancelled, buttonText: "View" } }, { customer_name: "R", order_id: "1", button_url: 'https://shop.test/track?a=1&b="x"' });
  expect(ok.html).toContain('href="https://shop.test/track?a=1&amp;b=&quot;x&quot;"');
});

describe("review fixes", () => {
  const ID = "e".repeat(24);
  const pending = (extra = {}) => ({ to: ["reader@example.com"], toLower: ["reader@example.com"], subject: "Order confirmed", html: "<p>Hi</p>", kind: "orderConfirmed", status: "pending", attempts: 1,
    createdAt: "2026-10-09T10:00:00.000Z", nextAttemptAt: new Date(Date.now() - 60_000).toISOString(), leaseUntil: null, ...extra });

  test("an order email is not sent after the order was refunded or cancelled", () => {
    expect(outbox.staleOrderEmailReason("orderConfirmed", { paymentStatus: "refunded" })).toMatch(/refunded/);
    expect(outbox.staleOrderEmailReason("shippedResend_x", { paymentStatus: "paid", status: "cancelled" })).toMatch(/cancelled/);
    expect(outbox.staleOrderEmailReason("orderPendingPayment", { paymentStatus: "paid" })).toMatch(/paid/);
    expect(outbox.staleOrderEmailReason("orderConfirmed", null)).toMatch(/no longer exists/);
    expect(outbox.staleOrderEmailReason("orderConfirmed", { paymentStatus: "paid" })).toBe("");
    expect(outbox.staleOrderEmailReason("welcome", null)).toBe("");
  });

  test("the sweep drops a stale order email instead of sending it", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ orderId: "o1" }) }, orders: { o1: { paymentStatus: "refunded" } } } });
    await app.exports.__runOutbox();
    expect(app.delivered).toHaveLength(0);
    expect(app.docs.emailOutbox[ID]).toBeUndefined();
    expect(app.logs.at(-1)).toMatchObject({ status: "cancelled", outboxId: ID });
  });

  test("a delivered retry whose queue cleanup fails is never sent again", async () => {
    const app = harness({ gmailFails: false, failOutboxDelete: 1, docs: { emailOutbox: { [ID]: pending() } } });
    await app.exports.__runOutbox();
    await app.exports.__runOutbox(Date.now() + 2 * 3600_000);
    expect(app.delivered).toHaveLength(1);
    expect(app.docs.emailOutbox[ID]).toMatchObject({ status: "sent", nextAttemptAt: null });
    expect((await app.call({ action: "emailQueue" })).body.entries).toEqual([]);
  });

  test("a queued send gives Resend a stable idempotency key, reused on the retry", async () => {
    const app = harness({ gmailFails: true, resendFails: true, docs: { adminSecrets: { resend: { apiKey: "re_live_key" } } } });
    const err = await app.exports.__sendEmail({ to: "reader@example.com", subject: "S", html: "<p>x</p>", queue: "welcome" }).catch(e => e);
    expect(app.state.resendOptions[0].idempotencyKey.startsWith(`${err.queued}:`)).toBe(true);
    app.state.resendFails = false;
    app.docs.emailOutbox[err.queued].nextAttemptAt = new Date(Date.now() - 1000).toISOString();
    await app.exports.__runOutbox();
    expect(app.state.resendOptions.at(-1).idempotencyKey).toBe(app.state.resendOptions[0].idempotencyKey);
  });

  test("a gift card delivered by a retry is recorded as emailed", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ kind: "giftCard", giftCardId: "g1" }) }, giftCards: { g1: { enabled: true, history: [] } } } });
    await app.exports.__runOutbox();
    expect(app.docs.giftCards.g1.emailedAt).toBeTruthy();
    expect(app.docs.giftCards.g1.history.at(-1)).toMatchObject({ type: "emailed" });
  });

  test("a disabled gift card's code is not sent later", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending({ kind: "giftCard", giftCardId: "g1" }) }, giftCards: { g1: { enabled: false } } } });
    await app.exports.__runOutbox();
    expect(app.delivered).toHaveLength(0);
  });

  test("Stop refuses while a send is in progress", async () => {
    const app = harness({ docs: { emailOutbox: { [ID]: pending({ leaseUntil: new Date(Date.now() + 300_000).toISOString() }) } } });
    expect((await app.call({ action: "cancelEmail", id: ID })).code).toBe(409);
    expect(app.docs.emailOutbox[ID]).toBeTruthy();
  });

  test("the sweep stops sending once its time budget is spent", async () => {
    const app = harness({ gmailFails: false, docs: { emailOutbox: { [ID]: pending(), ["f".repeat(24)]: pending() } } });
    const result = await app.exports.__runOutbox(Date.now(), { budgetMs: -1 });
    expect(result.sent).toBe(0);
    expect(app.delivered).toHaveLength(0);
  });

  test("privacy erase removes queued emails and delivery rows for that address; export lists them", async () => {
    const app = harness({ docs: { emailOutbox: { [ID]: pending({ kind: "contactNotify" }) }, emailLog: { l1: { to: "reader@example.com", at: new Date().toISOString() }, l2: { to: "other@example.com", at: new Date().toISOString() } } } });
    const exported = await app.callFn("createStripeCheckoutSession", { action: "privacyExport", email: "reader@example.com" });
    expect(exported.body.emailsWaitingToSend).toHaveLength(1);
    expect(JSON.stringify(exported.body)).not.toContain("<p>Hi</p>");
    const erased = await app.callFn("createStripeCheckoutSession", { action: "privacyErase", email: "reader@example.com" });
    expect(erased.body.deleted).toMatchObject({ queuedEmails: 1, emailLogRows: 1 });
    expect(app.docs.emailOutbox[ID]).toBeUndefined();
    expect(Object.keys(app.docs.emailLog)).toEqual(["l2"]);
  });

  test("privacy erase finds mixed-case rows, gift cards, notes; redacts unpaid orders; reviews per choice", async () => {
    const now = new Date().toISOString();
    const app = harness({ docs: {
      reviewContacts: { r1: { email: "Reader@Example.com" } },
      reviews: { r1: { authorName: "Reader", title: "Lovely", body: "I live at 5 Elm St", status: "approved" } },
      contactMessages: { m1: { email: "READER@example.com", message: "hi" } },
      "abandoned-carts": { c1: { email: "Reader@example.com", customer: { email: "Reader@example.com" } } },
      emailLog: { l1: { to: "a@example.com, reader@example.com", at: now }, l2: { to: "other@example.com", at: now } },
      giftCards: { g1: { purchaserEmail: "reader@example.com", recipientEmail: "friend@example.com", recipientName: "Friend", senderName: "Reader", message: "Happy birthday", balanceMinor: 2500, code: "SECRET-CODE" },
        g2: { purchaserEmail: "x@example.com", recipientEmail: "reader@example.com", recipientName: "Reader", message: "Enjoy", balanceMinor: 1000, code: "C2" },
        g3: { purchaserEmail: "x@example.com", recipientEmail: "y@example.com", message: "not theirs" } },
      orders: {
        paid1: { customer: { email: "reader@example.com", name: "Reader", phone: "1" }, paymentStatus: "paid", status: "completed" },
        unpaid1: { customer: { email: "reader@example.com", name: "Reader", phone: "1", address: { street: "5 Elm" } }, paymentStatus: "pending", status: "pending_payment", orderNote: "gift for Mum" },
        cancelled1: { customer: { email: "reader@example.com", name: "Reader" }, paymentStatus: "unpaid", status: "cancelled" },
      },
      "order-operations": { paid1: { activity: [{ type: "note", message: "Reader is difficult" }, { type: "event", message: "Packed" }] }, unpaid1: { activity: [{ type: "note", message: "x" }] } },
    } });
    const exported = (await app.callFn("createStripeCheckoutSession", { action: "privacyExport", email: "reader@example.com" })).body;
    expect(exported.reviews).toHaveLength(1);
    expect(exported.contactMessages).toHaveLength(1);
    expect(exported.savedCarts).toHaveLength(1);
    expect(exported.giftCards.map(c => c.id).sort()).toEqual(["g1", "g2"]);
    expect(JSON.stringify(exported.giftCards)).not.toContain("SECRET-CODE");
    expect(exported.emailDeliveryLog.map(r => r.id)).toEqual(["l1"]);
    expect(exported.orderNotesAndHistory.map(r => r.id).sort()).toEqual(["paid1", "unpaid1"]);

    const erased = (await app.callFn("createStripeCheckoutSession", { action: "privacyErase", email: "Reader@Example.com", reviewAction: "remove-text" })).body;
    expect(erased.deleted).toMatchObject({ savedCarts: 1, contactMessages: 1, reviewContacts: 1, emailLogRows: 1 });
    expect(app.docs.reviewContacts.r1).toBeUndefined();
    expect(app.docs["abandoned-carts"].c1).toBeUndefined();
    expect(app.docs.reviews.r1).toMatchObject({ authorName: "Anonymous", title: "", body: "" });
    expect(Object.keys(app.docs.emailLog)).toEqual(["l2"]);
    expect(app.docs.giftCards.g1).toMatchObject({ recipientEmail: "", purchaserEmail: "", message: "", balanceMinor: 2500 });
    expect(app.docs.giftCards.g2).toMatchObject({ recipientEmail: "", recipientName: "" });
    expect(app.docs.giftCards.g3.message).toBe("not theirs");
    expect(erased.keptOrders).toEqual(["paid1"]);
    expect(erased.redactedUnpaidOrders.sort()).toEqual(["cancelled1", "unpaid1"]);
    expect(app.docs.orders.unpaid1.customer).toEqual({ name: "", email: "", phone: "", address: {} });
    expect(app.docs.orders.unpaid1.orderNote).toBe("");
    expect(app.docs.orders.paid1.customer.email).toBe("reader@example.com");
    expect(app.docs["order-operations"].unpaid1).toBeUndefined();
    expect(app.docs["order-operations"].paid1.activity[0].message).not.toContain("difficult");
    expect(app.docs["order-operations"].paid1.activity[1].message).toBe("Packed");
  });

  test("privacy erase can unpublish the review instead", async () => {
    const app = harness({ docs: { reviewContacts: { r1: { email: "reader@example.com" } }, reviews: { r1: { authorName: "R", body: "b", status: "approved" } } } });
    await app.callFn("createStripeCheckoutSession", { action: "privacyErase", email: "reader@example.com", reviewAction: "unpublish" });
    expect(app.docs.reviews.r1).toMatchObject({ authorName: "Anonymous", status: "rejected", body: "b" });
  });

  describe("newsletter double opt-in", () => {
    const linkOf = (html, name) => { const m = html.match(new RegExp(`href="[^"]*[?&]${name}=1&amp;e=([^&"]+)&amp;t=([a-f0-9]{40})`)); return m && { e: decodeURIComponent(m[1]), t: m[2] }; };
    const signup = (app, email = "Reader@Example.com") => app.callFn("createStripeCheckoutSession", { action: "newsletterSignup", email, source: "website-footer" });
    const mailTo = (app, to) => app.delivered.filter(m => m.to === to || (Array.isArray(m.to) && m.to.includes(to)));

    test("signup is pending with a consent record and mails one signed confirmation link", async () => {
      const app = harness({ gmailFails: false });
      expect((await signup(app)).code).toBe(200);
      expect(app.docs.newsletter["reader@example.com"]).toMatchObject({ status: "pending", source: "website-footer" });
      expect(app.docs.newsletter["reader@example.com"].consentText).toMatch(/confirms by email link/);
      expect(app.docs.newsletter["reader@example.com"].requestedAt).toBeTruthy();
      const mail = mailTo(app, "reader@example.com");
      expect(mail).toHaveLength(1);
      expect(linkOf(mail[0].html, "newsletter_confirm")).toBeTruthy();
      expect(linkOf(mail[0].html, "unsubscribe")).toBeTruthy();
      await signup(app);
      expect(mailTo(app, "reader@example.com")).toHaveLength(1);
    });

    test("only the signed link confirms; an unsubscribe link or a bad token does not", async () => {
      const app = harness({ gmailFails: false });
      await signup(app);
      const html = mailTo(app, "reader@example.com")[0].html;
      const confirm = linkOf(html, "newsletter_confirm");
      const unsub = linkOf(html, "unsubscribe");
      const call = (email, token) => app.callFn("createStripeCheckoutSession", { action: "newsletterConfirm", email, token });
      expect((await call(confirm.e, "0".repeat(40))).code).toBe(400);
      expect((await call(confirm.e, unsub.t)).code).toBe(400);
      expect(app.docs.newsletter["reader@example.com"].status).toBe("pending");
      expect((await call(confirm.e, confirm.t)).code).toBe(200);
      expect(app.docs.newsletter["reader@example.com"]).toMatchObject({ status: "confirmed" });
      expect(app.docs.newsletter["reader@example.com"].confirmedAt).toBeTruthy();
    });

    test("the unsubscribe link deletes the subscriber and records the opt-out; the old confirm link cannot revive it", async () => {
      const app = harness({ gmailFails: false });
      await signup(app);
      const html = mailTo(app, "reader@example.com")[0].html;
      const confirm = linkOf(html, "newsletter_confirm");
      const unsub = linkOf(html, "unsubscribe");
      await app.callFn("createStripeCheckoutSession", { action: "newsletterConfirm", email: confirm.e, token: confirm.t });
      const out = await app.callFn("createStripeCheckoutSession", { action: "unsubscribe", email: unsub.e, token: unsub.t });
      expect(out.code).toBe(200);
      expect(app.docs.newsletter["reader@example.com"]).toBeUndefined();
      expect(Object.keys(app.docs["marketing-optout"] || {})).toHaveLength(1);
      expect((await app.callFn("createStripeCheckoutSession", { action: "newsletterConfirm", email: confirm.e, token: confirm.t })).code).toBe(410);
      expect(app.docs.newsletter["reader@example.com"]).toBeUndefined();
    });

    test("signups nobody confirmed for 30 days are pruned; confirmed and fresh ones stay", async () => {
      const old = new Date(Date.now() - 31 * 864e5).toISOString();
      const app = harness({ docs: { newsletter: {
        "old@example.com": { status: "pending", requestedAt: old },
        "new@example.com": { status: "pending", requestedAt: new Date().toISOString() },
        "ok@example.com": { status: "confirmed", requestedAt: old },
      } } });
      const result = await app.exports.__runOutbox(Date.now(), {});
      expect(result.prunedPending).toBe(1);
      expect(Object.keys(app.docs.newsletter).sort()).toEqual(["new@example.com", "ok@example.com"]);
    });
  });

  test("the order table never lands in a subject line", async () => {
    const app = harness();
    const settings = await app.exports.__defaults();
    const compiled = app.exports.__compile("order_confirmation", { ...settings, order_confirmation: { ...settings.order_confirmation, subject: "Order {{items_table}} {{order_id}}" } }, { order_id: "A1", items_table: "<table>x</table>" });
    expect(compiled.subject).toBe("Order A1");
  });
});

describe("order table in templates", () => {
  test("a body with {{items_table}} gets the table once, in place", () => {
    const app = harness();
    const settings = { order_confirmation: { subject: "S", body: "Top\n{{items_table}}\nBottom", buttonText: "", signoff: "Bye" } };
    const { html } = app.exports.__compile("order_confirmation", settings, { items_table: '<table id="t"></table>', customer_name: "R" });
    expect(html.split('id="t"').length - 1).toBe(1);
    expect(html.indexOf("Top")).toBeLessThan(html.indexOf('id="t"'));
    expect(html.indexOf('id="t"')).toBeLessThan(html.indexOf("Bottom"));
  });
});

describe("shop alerts and the Gmail check", () => {
  const paidEvent = () => updated(order({ paymentStatus: "unpaid" }), order({ paymentStatus: "paid" }));
  const shipEvent = () => updated(order({ paymentStatus: "paid", fulfillmentStatus: "processing" }), order({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "T1", trackingCarrier: "Canada Post" }));
  const shopMail = app => app.delivered.filter(m => m.to === "lyricalmyricalbooks@gmail.com");

  test("the new-order and shipped-copy switches stop only the shop's emails", async () => {
    const app = harness({ gmailFails: false, docs: { settings: { website: { payments: {} }, notifications: { shopAlerts: { newOrder: false, shipped: false } } } } });
    await app.exports.onOrderUpdated(paidEvent());
    await app.exports.onOrderUpdated(shipEvent());
    expect(shopMail(app)).toHaveLength(0);
    expect(app.delivered.filter(m => m.to === "reader@example.com")).toHaveLength(2);
  });

  test("shop alerts stay on by default, and an older saved new_order_admin switch is honoured", async () => {
    const on = harness({ gmailFails: false });
    await on.exports.onOrderUpdated(paidEvent());
    expect(shopMail(on)).toHaveLength(1);
    const legacy = harness({ gmailFails: false, docs: { settings: { website: { payments: {} }, notifications: { new_order_admin: { enabled: false } } } } });
    await legacy.exports.onOrderUpdated(paidEvent());
    expect(shopMail(legacy)).toHaveLength(0);
  });

  test("Check connection reports a refused password in plain words, without sending anything", async () => {
    const bad = harness({ gmailFails: true });
    const refused = await bad.call({ action: "verifyGmail" });
    expect(refused.body).toMatchObject({ ok: false });
    expect(refused.body.error).toMatch(/refused this app password/);
    expect((await harness({ gmailFails: false }).call({ action: "verifyGmail" })).body).toEqual({ ok: true });
    const none = harness({ docs: { adminSecrets: {} } });
    expect((await none.call({ action: "verifyGmail" })).body.error).toMatch(/No Gmail app password/);
    expect(bad.delivered).toHaveLength(0);
  });
});

describe("notification fixes from the email review", () => {
  const notif = extra => ({ settings: { website: { payments: {} }, notifications: extra } });
  const toShop = app => app.delivered.filter(m => m.to === "lyricalmyricalbooks@gmail.com");
  const toReader = app => app.delivered.filter(m => m.to === "reader@example.com");

  test("pausing a customer email never silences the shop's own alert", async () => {
    const app = harness({ gmailFails: false, docs: notif({ order_confirmation: { enabled: false }, shipping_confirmation: { enabled: false } }) });
    await app.exports.onOrderUpdated(updated(order({ paymentStatus: "unpaid" }), order({ paymentStatus: "paid" })));
    await app.exports.onOrderUpdated(updated(order({ paymentStatus: "paid", fulfillmentStatus: "processing" }), order({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "T1" })));
    expect(toReader(app)).toHaveLength(0);
    expect(toShop(app).map(m => m.subject.split(" ")[0])).toEqual(["[NEW", "[SHIPPED]"]);
  });

  test("a test-mode gift card purchase emails only the shop, once, marked [TEST]", async () => {
    const giftOrder = order({ paymentStatus: "paid", isTest: true, sandboxPayment: true,
      items: [{ id: "gc", title: "Gift card", quantity: 3, price: 50, giftCard: true, giftCardDetails: { recipientEmail: "stranger@example.org", message: "spam" } }] });
    const app = harness({ gmailFails: false, docs: { orders: { o1: giftOrder } } });
    await app.exports.onOrderUpdated(updated({ ...giftOrder, paymentStatus: "unpaid" }, giftOrder));
    expect(app.delivered.filter(m => m.to === "stranger@example.org")).toHaveLength(0);
    const gift = toShop(app).filter(m => /gift card/i.test(m.subject));
    expect(gift).toHaveLength(1);
    expect(gift[0].subject.startsWith("[TEST]")).toBe(true);
  });

  test("pickup customers hear when the order is ready to collect; local deliveries when out and delivered", async () => {
    const pickup = order({ paymentStatus: "paid", fulfillment: { method: "pickup", name: "Shop counter", hours: "Mon–Fri 10–6" } });
    const app = harness({ gmailFails: false });
    await app.exports.onOrderUpdated(updated({ ...pickup, fulfillmentStatus: "processing" }, { ...pickup, fulfillmentStatus: "ready_for_pickup" }));
    await app.exports.onOrderUpdated(updated({ ...pickup, fulfillmentStatus: "processing" }, { ...pickup, fulfillmentStatus: "ready_for_pickup" }));
    expect(toReader(app)).toHaveLength(1);
    expect(toReader(app)[0].html).toContain("ready to collect");
    expect(toReader(app)[0].html).not.toMatch(/Carrier:|Tracking:/);
    const local = order({ paymentStatus: "paid", fulfillmentSelection: { method: "local_delivery" } });
    const app2 = harness({ gmailFails: false });
    await app2.exports.onOrderUpdated(updated({ ...local, fulfillmentStatus: "ready_for_delivery" }, { ...local, fulfillmentStatus: "out_for_delivery" }));
    await app2.exports.onOrderUpdated(updated({ ...local, fulfillmentStatus: "out_for_delivery" }, { ...local, fulfillmentStatus: "delivered" }));
    expect(toReader(app2)).toHaveLength(2);
  });

  test("refund emails: no email for a lost chargeback, gift-card refunds say so, partial refunds are announced", async () => {
    const paid = order({ paymentStatus: "paid" });
    const dispute = harness({ gmailFails: false });
    await dispute.exports.onOrderUpdated(updated(paid, { ...paid, paymentStatus: "refunded", refund: { provider: "dispute", amount: 3.39, currency: "CAD" } }));
    expect(toReader(dispute)).toHaveLength(0);

    const giftPaid = order({ paymentStatus: "paid", total: 0, paymentMethod: "Free", chargedGiftCards: [{ id: "g", minor: 5000, last4: "AB12" }] });
    const gift = harness({ gmailFails: false });
    await gift.exports.onOrderUpdated(updated(giftPaid, { ...giftPaid, paymentStatus: "refunded", giftCardsRestoredAt: "now", refund: { provider: "manual", amount: 0, currency: "CAD" } }));
    expect(toReader(gift)[0].html).toContain("CA$50.00");
    expect(toReader(gift)[0].html).toContain("••••AB12");
    expect(toReader(gift)[0].html).not.toMatch(/business days/);

    const usd = order({ paymentStatus: "paid", paymentMethod: "Interac e-Transfer", total: 40, expectedAmountMinor: 3000, expectedCurrency: "USD" });
    const manual = harness({ gmailFails: false });
    await manual.exports.onOrderUpdated(updated(usd, { ...usd, paymentStatus: "refunded", refund: { provider: "manual", amount: 40, currency: "CAD" }, inventoryRestockedAt: "x" }));
    expect(toReader(manual)[0].html).toContain("US$30.00");

    const partial = harness({ gmailFails: false });
    const card = order({ paymentStatus: "paid", expectedAmountMinor: 3000, expectedCurrency: "USD" });
    await partial.exports.onOrderUpdated(updated(card, { ...card, partiallyRefunded: true, refundedAmountMinor: 1000 }));
    await partial.exports.onOrderUpdated(updated({ ...card, partiallyRefunded: true, refundedAmountMinor: 1000 }, { ...card, partiallyRefunded: true, refundedAmountMinor: 1500 }));
    expect(toReader(partial).map(m => /US\$(\d+\.\d\d)/.exec(m.html)?.[1])).toEqual(["10.00", "5.00"]);
  });

  test("a failed back-in-stock email is queued for a retry instead of waiting for the next restock", async () => {
    const book = { title: "Book", slug: "book", status: "published", trackInventory: true, stockLevel: 0 };
    const app = harness({ docs: { books: { b1: book }, stockAlerts: { a: { email: "reader@example.com", bookId: "b1", variantId: "", status: "waiting" } },
      // Only an address with a checkout attempt is mailed (functions/emailProof.js).
      orders: { o1: { customer: { email: "reader@example.com" }, stripePaymentIntentId: "pi_1" } } } });
    await app.exports.onBookRestocked({ data: { before: { data: () => book }, after: { data: () => ({ ...book, stockLevel: 5 }) } }, params: { bookId: "b1" } });
    const queued = Object.values(app.docs.emailOutbox || {});
    expect(queued.map(e => e.kind)).toEqual(["backInStock"]);
    expect(app.docs.stockAlerts.a).toBeUndefined();
  });

  test("the inventory alert ignores a new edition and escapes titles", async () => {
    const before = { title: "Rock & <Roll>", trackInventory: true, stockLevel: 10, variants: [{ id: "v1", name: "Paper", stock: 10 }] };
    const after = { ...before, variants: [...before.variants, { id: "v2", name: "New <b>", stock: 0 }] };
    const app = harness({ gmailFails: false });
    await app.exports.onBookUpdated({ data: { before: { data: () => before }, after: { data: () => after } }, params: { bookId: "b1" } });
    expect(app.delivered).toHaveLength(0);
    const sold = { ...before, variants: [{ id: "v1", name: "Paper", stock: 0 }] };
    await app.exports.onBookUpdated({ data: { before: { data: () => before }, after: { data: () => sold } }, params: { bookId: "b1" } });
    expect(app.delivered[0].html).toContain("Rock &amp; &lt;Roll&gt;");
  });
});

describe("abandoned-cart reminders can't be used to spam strangers", () => {
  const throttle = realRequire("./emailThrottle");
  const hourAgo = () => new Date(Date.now() - 2 * 3600_000).toISOString();
  const cart = (extra = {}) => ({ email: "stranger@example.org", recovered: false, updatedAt: hourAgo(), items: [{ id: "b1", qty: 1 }], customer: { name: "Buy cheap pills at evil.test now" }, ...extra });
  const docs = (extra = {}) => ({
    books: { b1: { title: "Book", status: "published", retailPrice: 20 } }, "abandoned-carts": { c1: cart() },
    // Reminders need a postal address and an address with a checkout attempt.
    settings: { website: { payments: {}, location: { street: "1 Main St", city: "Toronto" } }, notifications: {} },
    orders: { o1: { customer: { email: "stranger@example.org" }, stripePaymentIntentId: "pi_1" } }, ...extra });

  test("only a plain first name from the visitor is used", () => {
    expect(throttle.reminderFirstName("Sam Smith")).toBe("Sam");
    expect(throttle.reminderFirstName("Zoë")).toBe("Zoë");
    expect(throttle.reminderFirstName("Visit http://evil.test")).toBe("Visit");
    expect(throttle.reminderFirstName("http://evil.test")).toBe("there");
    expect(throttle.reminderFirstName("<b>Hi</b>")).toBe("there");
    expect(throttle.reminderFirstName("")).toBe("there");
  });

  test("the daily cap counts per Toronto day", () => {
    expect(throttle.nextDailyCount(null, "2026-10-10")).toEqual({ day: "2026-10-10", count: 1 });
    expect(throttle.nextDailyCount({ day: "2026-10-10", count: 25 }, "2026-10-10")).toBeNull();
    expect(throttle.nextDailyCount({ day: "2026-10-09", count: 25 }, "2026-10-10")).toEqual({ day: "2026-10-10", count: 1 });
  });

  test("the reminder carries none of the visitor's words", async () => {
    const app = harness({ gmailFails: false, docs: docs() });
    await app.exports.abandonedCartSweep();
    expect(app.delivered).toHaveLength(1);
    expect(app.delivered[0].html).not.toMatch(/pills|evil\.test/);
    expect(app.delivered[0].html).toContain("Hi Buy,");
  });

  test("an address gets one reminder ever, however many carts it leaves", async () => {
    const app = harness({ gmailFails: false, docs: docs() });
    await app.exports.abandonedCartSweep();
    expect(app.delivered).toHaveLength(1);
    const [record] = Object.values(app.docs["abandoned-cart-throttle"]);
    expect(record.expiresAt).toBeUndefined();
    app.docs["abandoned-carts"].c2 = cart();
    await app.exports.abandonedCartSweep();
    expect(app.delivered).toHaveLength(1);
    expect(app.docs["abandoned-carts"].c2.notifySkipped).toBe("throttled");
  });

  test("an older reminder record from months ago still stops a second one and loses its expiry", async () => {
    const key = require("crypto").createHash("sha256").update("stranger@example.org").digest("hex");
    const app = harness({ gmailFails: false, docs: docs({ "abandoned-cart-throttle": { [key]: { lastSentAt: "2026-01-01T00:00:00.000Z", expiresAt: new Date("2026-01-31") } } }) });
    await app.exports.abandonedCartSweep();
    expect(app.delivered).toHaveLength(0);
    expect(app.docs["abandoned-cart-throttle"][key]).toEqual({ lastSentAt: "2026-01-01T00:00:00.000Z" });
  });

  test("over the daily cap nothing is sent and the cart waits for tomorrow", async () => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const app = harness({ gmailFails: false, docs: docs({ "abandoned-cart-throttle": { _daily: { day, count: 25 } } }) });
    await app.exports.abandonedCartSweep();
    expect(app.delivered).toHaveLength(0);
    expect(app.docs["abandoned-carts"].c1.notified).toBeUndefined();
    expect(Object.keys(app.docs["abandoned-cart-throttle"])).toEqual(["_daily"]);
  });
});
