// functions/email (code plan 1.13) against a fake Firestore, a fake Gmail (nodemailer) and a fake Resend: which sender
// goes first, the fallbacks, what is logged, the retry queue and the Gmail check. No network, no real keys.
import { describe, expect, test, vi } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createEmail } = require("./index.js");
const { createPlatformSender, platformKind } = require("./platformSender.js");

function make({ docs = {}, gmail = null, resend = {}, secret = "re_deployed", failOutbox = false, platformSender = null } = {}) {
  const store = {
    "settings/website": null, "settings/notifications": null, "adminSecrets/gmail": null, "adminSecrets/resend": null,
    ...docs,
  };
  const added = { emailLog: [] };
  const outbox = {};
  const db = {
    collection: (name) => ({
      doc: (id) => ({
        async get() { const data = store[`${name}/${id}`]; return { exists: data != null, data: () => data }; },
        async set(data) { if (failOutbox) throw new Error("UNAVAILABLE"); outbox[id] = data; },
      }),
      async add(entry) { (added[name] ||= []).push(entry); },
    }),
  };
  const gmailSent = [], gmailOpts = [];
  const nodemailer = { createTransport: (opts) => {
    gmailOpts.push(opts);
    return {
      sendMail: async (m) => { if (gmail?.fails) throw new Error(gmail.fails); gmailSent.push(m); return { messageId: "gmail-1" }; },
      verify: async () => { if (gmail?.fails) throw new Error(gmail.fails); return true; },
    };
  } };
  const resendCalls = [];
  class Resend {
    constructor(key) {
      this.emails = { send: async (message, options) => {
        resendCalls.push({ key, message, options });
        const answer = resend[message.from.match(/<(.+)>/)[1]] ?? resend.default;
        return answer || { data: { id: "re-1" }, error: null };
      } };
    }
  }
  const mail = createEmail({
    db, crypto: require("crypto"), Resend, nodemailer, ownerEmail: "owner@example.com", senderName: "Your Press",
    senderEmail: "orders@example.com", readAdminSecret: async (id) => store[`adminSecrets/${id}`] || {},
    resendSecretValue: () => secret, escapeHtml: (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    platformSender,
  });
  return { mail, log: added.emailLog, outbox, gmailSent, gmailOpts, resendCalls };
}

const message = { to: "reader@example.com", subject: "Your order", html: "<p>Thanks</p>" };

describe("send", () => {
  test("Gmail goes first when an app password is saved, from the owner's address with bounded waits", async () => {
    const app = make({ docs: { "adminSecrets/gmail": { appPassword: "abcd efgh" }, "settings/website": { communications: { fromName: "Moth Press", replyTo: "hi@moth.example" } } } });
    expect(await app.mail.send(message)).toEqual({ id: "gmail-1" });
    expect(app.gmailOpts[0]).toEqual({ service: "gmail", auth: { user: "owner@example.com", pass: "abcdefgh" }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
    expect(app.gmailSent[0]).toMatchObject({ from: '"Moth Press" <owner@example.com>', to: "reader@example.com", subject: "Your order", replyTo: "hi@moth.example" });
    expect(app.gmailSent[0].html).toMatch(/<html/i);
    expect(app.resendCalls).toEqual([]);
    expect(app.log).toEqual([expect.objectContaining({ status: "sent", keySource: "gmail", from: "owner@example.com", id: "gmail-1" })]);
  });

  test("a Gmail failure falls back to Resend, and both attempts are logged", async () => {
    const app = make({ docs: { "adminSecrets/gmail": { appPassword: "pw" } }, gmail: { fails: "Invalid login" } });
    expect(await app.mail.send(message)).toEqual({ id: "re-1" });
    expect(app.log.map((e) => [e.status, e.keySource])).toEqual([["fallback", "gmail"], ["sent", "secret"]]);
    expect(app.resendCalls[0]).toMatchObject({ key: "re_deployed", message: { from: "Your Press <orders@example.com>", to: "reader@example.com" } });
  });

  test("the admin-only Resend key wins, and a queued email has one idempotency key per sender address", async () => {
    const app = make({ docs: { "adminSecrets/resend": { apiKey: " re_private " } } });
    await app.mail.send({ ...message, queue: "orderConfirmed", outboxId: "q1" });
    expect(app.resendCalls[0].key).toBe("re_private");
    expect(app.resendCalls[0].options).toEqual({ idempotencyKey: "q1:orders@example.com" });
  });

  test("an unverified sender domain retries from Resend's sandbox address and says so", async () => {
    const app = make({ resend: { "orders@example.com": { data: null, error: { message: "The example.com domain is not verified" } } } });
    expect(await app.mail.send(message)).toEqual({ id: "re-1" });
    expect(app.resendCalls.map((c) => c.message.from)).toEqual(["Your Press <orders@example.com>", "Your Press <onboarding@resend.dev>"]);
    expect(app.log.at(-1)).toMatchObject({ status: "sent", sandbox: true, from: "onboarding@resend.dev" });
  });

  test("an invalid address is refused for good, before any sender is asked", async () => {
    const app = make();
    await expect(app.mail.send({ ...message, to: "not an address\r\nBcc: x@y.z" })).rejects.toMatchObject({ permanent: true });
    expect(app.resendCalls).toEqual([]);
    expect(app.log[0]).toMatchObject({ status: "failed", permanent: true });
  });

  test("with no usable key an important email is parked in the retry queue; others fail and are logged", async () => {
    const queued = make({ secret: "" });
    const err = await queued.mail.send({ ...message, queue: "orderConfirmed", about: { orderId: "o1" } }).catch((e) => e);
    expect(err.queued).toBeTruthy();
    expect(queued.outbox[err.queued]).toMatchObject({ to: ["reader@example.com"], kind: "orderConfirmed", status: "pending", attempts: 1, orderId: "o1" });
    expect(queued.log[0]).toMatchObject({ status: "queued", outboxId: err.queued, orderId: "o1" });

    const plain = make({ secret: "" });
    await expect(plain.mail.send(message)).rejects.toThrow();
    expect(Object.keys(plain.outbox)).toEqual([]);
    expect(plain.log[0]).toMatchObject({ status: "failed" });
  });

  test("a send made by the retry queue itself is never re-queued (the queue logs its own outcome)", async () => {
    const app = make({ secret: "" });
    await expect(app.mail.send({ ...message, queue: "orderConfirmed", outboxId: "q1" })).rejects.toThrow();
    expect(app.outbox).toEqual({});
    expect(app.log).toEqual([]);
  });

  test("the shop's postal address goes into the email footer", async () => {
    const app = make({ docs: { "settings/website": { location: { street: "1 Press Lane", city: "Toronto" } } } });
    await app.mail.send(message);
    expect(app.resendCalls[0].message.html).toContain("1 Press Lane, Toronto");
  });

  test("a queue entry that can't be saved still fails loudly instead of vanishing", async () => {
    const app = make({ secret: "", failOutbox: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await app.mail.send({ ...message, queue: "orderConfirmed" }).catch((e) => e);
    warn.mockRestore();
    expect(err.queued).toBeUndefined();
    expect(app.log[0]).toMatchObject({ status: "failed" });
  });
});

// Plan 2.3b: on a platform shop the backup after Gmail is the platform's shared sender, reached over HTTP with the
// shop's own service key (email/platformSender.js). The press's own Gmail always goes first.
function fakePlatform(answers = []) {
  const calls = [];
  const queue = [...answers];
  // Like the real service: an idempotency key it has sent before answers with the first id and sends nothing.
  const delivered = new Map();
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const next = queue.shift();
    if (next === "network") throw new Error("socket hang up");
    if (next) return { ok: next.status < 300, status: next.status, json: async () => next.body };
    if (!delivered.has(body.idempotencyKey)) delivered.set(body.idempotencyKey, { to: body.to, id: `platform-${delivered.size + 1}` });
    return { ok: true, status: 200, json: async () => ({ ok: true, id: delivered.get(body.idempotencyKey).id }) };
  };
  const sender = createPlatformSender({ url: "https://email.platform.example/shop", shopId: "moth-press", serviceKey: () => "shop-key-0123456789abcdef0123456789", fetch });
  return { sender, calls, inboxes: () => [...delivered.values()].map((d) => d.to) };
}

describe("platform shops", () => {
  test("a shop with Gmail connected sends from its own Gmail and never reaches the platform sender", async () => {
    const platform = fakePlatform();
    const app = make({ docs: { "adminSecrets/gmail": { appPassword: "abcd efgh" } }, platformSender: platform.sender });
    expect(await app.mail.send({ ...message, queue: "orderConfirmed" })).toEqual({ id: "gmail-1" });
    expect(app.gmailSent[0].from).toBe('"Your Press" <owner@example.com>');
    expect(platform.calls).toEqual([]);
    expect(app.resendCalls).toEqual([]);
  });

  test("without Gmail, the platform's shared sender is the backup, never the shop's own Resend key", async () => {
    const platform = fakePlatform();
    const app = make({ docs: { "adminSecrets/resend": { apiKey: "re_private" } }, platformSender: platform.sender });
    expect(await app.mail.send({ to: ["reader@example.com", "second@example.com"], subject: "Your order", html: "<p>Thanks</p>", queue: "orderConfirmed", outboxId: "q1" })).toEqual({ id: "platform-1" });
    expect(app.resendCalls).toEqual([]);
    expect(platform.calls.map((c) => [c.body.to, c.body.idempotencyKey, c.body.kind])).toEqual([
      ["reader@example.com", "q1:reader@example.com", "order-confirmed"],
      ["second@example.com", "q1:second@example.com", "order-confirmed"],
    ]);
    expect(platform.calls[0]).toMatchObject({ url: "https://email.platform.example/shop", headers: { "X-Shop-Id": "moth-press", Authorization: "Bearer shop-key-0123456789abcdef0123456789" } });
    expect(platform.calls[0].body.html).toMatch(/<html/i);
    expect(app.log.at(-1)).toMatchObject({ status: "sent", keySource: "platform", from: "platform", id: "platform-1" });
  });

  test("a Gmail refusal falls back to the platform sender, and the log says so", async () => {
    const platform = fakePlatform();
    const app = make({ docs: { "adminSecrets/gmail": { appPassword: "pw" } }, gmail: { fails: "Invalid login" }, platformSender: platform.sender });
    await app.mail.send(message);
    expect(platform.calls).toHaveLength(1);
    expect(app.log.map((e) => [e.status, e.keySource])).toEqual([["fallback", "gmail"], ["sent", "platform"]]);
    expect(app.log[0].error).toMatch(/platform's shared sender/);
  });

  test("a busy platform parks an important email for a retry; a refusal it can't fix is not queued", async () => {
    const busy = make({ platformSender: fakePlatform([{ status: 503, body: { ok: false, retryable: true, message: "try later" } }]).sender });
    const err = await busy.mail.send({ ...message, queue: "orderConfirmed" }).catch((e) => e);
    expect(err.queued).toBeTruthy();
    expect(busy.log[0]).toMatchObject({ status: "queued", keySource: "platform" });

    const refused = make({ platformSender: fakePlatform([{ status: 422, body: { ok: false, retryable: false, message: "the email has no words" } }]).sender });
    await expect(refused.mail.send({ ...message, queue: "orderConfirmed" })).rejects.toMatchObject({ permanent: true });
    expect(refused.outbox).toEqual({});
    expect(refused.log[0]).toMatchObject({ status: "failed", permanent: true, keySource: "platform" });
  });

  test("a partial send retried from the queue reaches only the recipient still missing it", async () => {
    const platform = fakePlatform([undefined, { status: 503, body: { ok: false, retryable: true, message: "busy" } }]);
    const app = make({ platformSender: platform.sender });
    const email = { to: ["reader@example.com", "second@example.com"], subject: "Your order", html: "<p>Thanks</p>", queue: "orderConfirmed" };
    const err = await app.mail.send(email).catch((e) => e);
    expect(err.queued).toBeTruthy();
    expect(platform.inboxes()).toEqual(["reader@example.com"]);
    // The retry queue sends it again under its own id (sendQueuedEmail passes outboxId).
    await app.mail.send({ ...email, outboxId: err.queued });
    expect(platform.inboxes()).toEqual(["reader@example.com", "second@example.com"]);
  });

  test("an email that isn't queued, tried again soon after a partial send, doesn't double either", async () => {
    const platform = fakePlatform([undefined, { status: 503, body: { ok: false, retryable: true, message: "busy" } }]);
    const app = make({ platformSender: platform.sender });
    const email = { to: ["reader@example.com", "second@example.com"], subject: "Shop alert", html: "<p>New order</p>" };
    await expect(app.mail.send(email)).rejects.toThrow(/busy/);
    await app.mail.send(email);
    expect(platform.inboxes()).toEqual(["reader@example.com", "second@example.com"]);
    // A different email to the same people is a new email.
    await app.mail.send({ ...email, subject: "Another alert" });
    expect(platform.inboxes()).toHaveLength(4);
  });

  test("the sender status tells the admin Gmail's address and the backup", async () => {
    expect(await make({ platformSender: fakePlatform().sender }).mail.senderStatus()).toEqual({ ok: true, gmailAddress: "owner@example.com", gmailSaved: false, backup: "platform" });
    expect(await make({ docs: { "adminSecrets/gmail": { appPassword: "pw" } } }).mail.senderStatus()).toMatchObject({ gmailSaved: true, backup: "resend" });
  });

  test("kind names become the service's form, and a missing service key is a retry, not a loss", async () => {
    expect(platformKind("orderConfirmed")).toBe("order-confirmed");
    expect(platformKind("")).toBe("shop-email");
    const sender = createPlatformSender({ url: "https://email.platform.example/shop", shopId: "moth-press", serviceKey: () => "", fetch: async () => { throw new Error("not called"); } });
    await expect(sender.send({ kind: "x", to: "a@example.com", subject: "s", html: "h", idempotencyKey: "k" })).rejects.toMatchObject({ permanent: false });
    expect(() => createPlatformSender({ url: "http://x.example", shopId: "s", serviceKey: () => "", fetch })).toThrow(/https/);
  });
});

describe("checkGmail", () => {
  test("no saved password, a refused one, an unreachable server, and a working one", async () => {
    expect(await make().mail.checkGmail()).toEqual({ ok: false, error: "No Gmail app password is saved yet." });
    const refused = await make({ docs: { "adminSecrets/gmail": { appPassword: "pw" } }, gmail: { fails: "535-5.7.8 Username and Password not accepted" } }).mail.checkGmail();
    expect(refused.error).toMatch(/Gmail refused this app password/);
    const down = await make({ docs: { "adminSecrets/gmail": { appPassword: "pw" } }, gmail: { fails: "ETIMEDOUT" } }).mail.checkGmail();
    expect(down.error).toMatch(/Gmail could not be reached \(ETIMEDOUT\)/);
    const ok = make({ docs: { "adminSecrets/gmail": { appPassword: "p w" } } });
    expect(await ok.mail.checkGmail()).toEqual({ ok: true });
    expect(ok.gmailOpts[0].auth).toEqual({ user: "owner@example.com", pass: "pw" });
  });
});

describe("one door", () => {
  test("no other functions file opens a mail transport, makes a Resend client or sends through one itself", () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const offenders = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.includes(".test."))
      .filter((f) => /new Resend\(|\.createTransport\(\{|\.emails\.send\(|\.sendMail\(|collection\("emailLog"\)\.add\(/
        .test(fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
