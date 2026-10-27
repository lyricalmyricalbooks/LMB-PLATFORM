// functions/email (code plan 1.13) against a fake Firestore, a fake Gmail (nodemailer) and a fake Resend: which sender
// goes first, the fallbacks, what is logged, the retry queue and the Gmail check. No network, no real keys.
import { describe, expect, test, vi } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createEmail } = require("./index.js");

function make({ docs = {}, gmail = null, resend = {}, secret = "re_deployed", failOutbox = false } = {}) {
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
    const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
    const offenders = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && !f.includes(".test."))
      .filter((f) => /new Resend\(|\.createTransport\(\{|\.emails\.send\(|\.sendMail\(|collection\("emailLog"\)\.add\(/
        .test(fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*\/\/.*$/gm, "")));
    expect(offenders).toEqual([]);
  });
});
