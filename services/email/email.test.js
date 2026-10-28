// The platform email service (code plan 2.3) against a pretend Resend: who an email is from, where replies go, that
// the key only comes from the environment, retries never send twice, and the shop door checks who is asking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createEmailService, cleanName, fromLine } from "./index.js";
import { resendClient, RESEND_EMAILS_URL } from "./resend.js";
import { handleShopEmail, hashServiceKey, serviceKeyMatches } from "./http.js";
import { fakeResendFetch, fakeSentLog } from "./fakes.js";
import { fakeRegistry } from "../../setup/fakes.js";
import { OWNER_WELCOME } from "../../setup/later-steps.js";

const KEY = "re_test_not_a_real_key";
const SHOP_KEY = "shop-service-key-0123456789abcdef0123456789";

async function make({ answers, env = {}, shop = {} } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", {
    shopId: "moth-press", pressName: "Moth Press", ownerEmail: "Owner@Example.com", status: "live", serviceKeyHash: hashServiceKey(SHOP_KEY), ...shop,
  });
  const resend = fakeResendFetch(answers);
  const sentLog = fakeSentLog();
  const service = createEmailService({ env: { RESEND_API_KEY: KEY, ...env }, fetch: resend.fetch, registry, sentLog, sleep: async () => {} });
  return { registry, resend, sentLog, service };
}

const welcome = { kind: OWNER_WELCOME, to: "owner@example.com", pressName: "Moth Press", links: { shopAdmin: "https://moth-press.web.app/admin" }, idempotencyKey: "moth-press-owner-welcome" };

test("a shop's email comes from the platform address with the press's name, and replies go to the press", async () => {
  const { resend, service } = await make();
  await service.send("moth-press", welcome);
  const [request] = resend.requests;
  assert.equal(request.url, RESEND_EMAILS_URL);
  assert.equal(request.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(request.headers["Idempotency-Key"], "moth-press-owner-welcome");
  assert.equal(request.body.from, '"Moth Press" <notifications@platform.example>');
  assert.deepEqual(request.body.reply_to, ["owner@example.com"]);
  assert.deepEqual(request.body.to, ["owner@example.com"]);
  assert.match(request.body.subject, /Moth Press is ready on Colophon/);
  assert.match(request.body.html, /href="https:\/\/moth-press\.web\.app\/admin"/);
  assert.deepEqual(request.body.tags, [{ name: "kind", value: "owner-welcome" }, { name: "shop", value: "moth-press" }]);
});

test("the press's own reply-to wins, and the name and reply-to come from the registry, not the message", async () => {
  const { resend, service } = await make({ shop: { replyTo: "hello@moth.example" } });
  await service.send("moth-press", { ...welcome, pressName: "Someone Else", replyTo: "thief@x.com", from: "boss@x.com" });
  assert.equal(resend.requests[0].body.from, '"Moth Press" <notifications@platform.example>');
  assert.deepEqual(resend.requests[0].body.reply_to, ["hello@moth.example"]);
});

test("the domain and addresses are settings", async () => {
  const { resend, service } = await make({ env: { PLATFORM_DOMAIN: "colophon.example" } });
  await service.send("moth-press", welcome);
  await service.sendPlatform({ kind: OWNER_WELCOME, to: "owner@example.com", data: { links: { shopAdmin: "https://moth-press.web.app/admin" } }, idempotencyKey: "p1" });
  assert.equal(resend.requests[0].body.from, '"Moth Press" <notifications@colophon.example>');
  assert.equal(resend.requests[1].body.from, '"Colophon" <notifications@colophon.example>');
  assert.deepEqual(resend.requests[1].body.reply_to, ["support@colophon.example"]);
});

test("a press name can't break the From line", () => {
  assert.equal(cleanName('Moth "Press" <evil@x.com>\r\nBcc: a@x.com'), "Moth Press evil@x.com Bcc: a@x.com");
  assert.equal(fromLine("", "notifications@platform.example"), '"Shop" <notifications@platform.example>');
});

test("an email already sent is never sent again, even with Resend's memory gone", async () => {
  const { resend, service } = await make();
  const first = await service.send("moth-press", welcome);
  const second = await service.send("moth-press", welcome);
  assert.equal(resend.requests.length, 1);
  assert.deepEqual(second, { id: first.id, alreadySent: true });
  assert.equal(await service.wasSent("moth-press", OWNER_WELCOME), true);
  assert.equal(await service.wasSent("moth-press", "other-kind"), false);
});

test("a dropped connection or a busy Resend is retried with the same key; one email goes out", async () => {
  const { resend, service } = await make({ answers: ["network", { status: 429, body: { name: "rate_limit_exceeded", message: "slow down" } }] });
  await service.send("moth-press", welcome);
  assert.equal(resend.requests.length, 3);
  assert.equal(new Set(resend.requests.map((r) => r.headers["Idempotency-Key"])).size, 1);
  assert.equal(resend.delivered.length, 1);
});

test("a refusal that a retry can't fix stops at once and is logged as failed", async () => {
  const { resend, sentLog, service } = await make({ answers: [{ status: 403, body: { name: "validation_error", message: "domain not verified" } }] });
  await assert.rejects(service.send("moth-press", welcome), (error) => error.retryable === false && /403 validation_error: domain not verified/.test(error.message));
  assert.equal(resend.requests.length, 1);
  assert.equal(sentLog.entries.get("moth-press-owner-welcome").status, "failed");
  assert.equal(await service.wasSent("moth-press", OWNER_WELCOME), false);
});

test("nothing is sent without the key, and the key must be a Resend key from the environment", async () => {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { pressName: "Moth Press", ownerEmail: "owner@example.com" });
  const resend = fakeResendFetch();
  const service = createEmailService({ env: {}, fetch: resend.fetch, registry, sentLog: fakeSentLog() });
  await assert.rejects(service.send("moth-press", welcome), /email key is missing/);
  assert.equal(resend.requests.length, 0);
  assert.throws(() => resendClient({ apiKey: "sk_live_x", fetch: resend.fetch }), /not a Resend key/);
});

test("no file outside services/email reads the email key", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // apps/ are the shop copies, which keep their own Resend fallback for presses that bring their own key.
        if (!["node_modules", ".git", ".claude"].includes(entry.name) && path !== "./apps" && path !== "./services/email") walk(path);
      } else if (/\.(m?js)$/.test(entry.name) && !path.endsWith(".test.js") && readFileSync(path, "utf8").includes("RESEND_API_KEY")) offenders.push(path);
    }
  };
  walk(".");
  assert.deepEqual(offenders, []);
});

test("abandoned or unknown shops, bad addresses and missing keys are refused", async () => {
  const { service, resend } = await make({ shop: { status: "abandoned" } });
  await assert.rejects(service.send("moth-press", welcome), /abandoned/);
  await assert.rejects(service.send("nobody-press", welcome), /no shop nobody-press/);
  const ok = await make();
  await assert.rejects(ok.service.send("moth-press", { ...welcome, to: "a@x.com, b@x.com" }), /one email address/);
  await assert.rejects(ok.service.send("moth-press", { ...welcome, idempotencyKey: "" }), /idempotency key/);
  await assert.rejects(ok.service.send("moth-press", { ...welcome, links: { shopAdmin: "javascript:alert(1)" } }), /https/);
  assert.equal(resend.requests.length + ok.resend.requests.length, 0);
});

test("a shop's own email (no template) needs a subject and words, and its HTML is passed as the shop wrote it", async () => {
  const { resend, service } = await make();
  await assert.rejects(service.send("moth-press", { kind: "order-confirmed", to: "reader@example.com", idempotencyKey: "o1" }), /no subject/);
  await service.send("moth-press", { kind: "order-confirmed", to: "reader@example.com", subject: "Your order", html: "<p>Thanks</p>", idempotencyKey: "o1" });
  assert.equal(resend.requests[0].body.html, "<p>Thanks</p>");
  assert.equal(resend.requests[0].body.subject, "Your order");
});

test("the shop door: the right key sends, scoped to the shop; a wrong key or unknown shop gets one answer", async () => {
  const { service, registry, sentLog, resend } = await make();
  const ask = (headers, body = { kind: "order-confirmed", to: "reader@example.com", subject: "Your order", text: "Thanks", idempotencyKey: "order-1" }) =>
    handleShopEmail({ method: "POST", headers, body }, { service, registry, sentLog });
  const good = await ask({ "X-Shop-Id": "moth-press", Authorization: `Bearer ${SHOP_KEY}` });
  assert.equal(good.status, 200);
  assert.equal(resend.requests[0].headers["Idempotency-Key"], "moth-press/order-1");
  const wrong = await ask({ "X-Shop-Id": "moth-press", Authorization: "Bearer not-the-key-0123456789abcdef0123456789" });
  const unknown = await ask({ "X-Shop-Id": "nobody-press", Authorization: `Bearer ${SHOP_KEY}` });
  assert.deepEqual(wrong, unknown);
  assert.equal(wrong.status, 401);
  assert.equal((await handleShopEmail({ method: "GET" }, { service, registry, sentLog })).status, 405);
  assert.equal(resend.requests.length, 1);
});

test("the shop door stops a shop at its daily limit and says a retry is fine later", async () => {
  const { service, registry, sentLog } = await make();
  const ask = (n) => handleShopEmail(
    { method: "POST", headers: { "x-shop-id": "moth-press", authorization: `Bearer ${SHOP_KEY}` }, body: { kind: "notice", to: "reader@example.com", subject: "Hi", text: "Hi", idempotencyKey: `n${n}` } },
    { service, registry, sentLog, dailyLimit: 2 },
  );
  assert.equal((await ask(1)).status, 200);
  assert.equal((await ask(2)).status, 200);
  const third = await ask(3);
  assert.equal(third.status, 429);
  assert.equal(third.body.retryable, true);
});

test("service keys are compared by hash and refuse short or malformed values", () => {
  assert.equal(serviceKeyMatches(SHOP_KEY, hashServiceKey(SHOP_KEY)), true);
  assert.equal(serviceKeyMatches("short", hashServiceKey("short")), false);
  assert.equal(serviceKeyMatches(SHOP_KEY, "nothex"), false);
});
