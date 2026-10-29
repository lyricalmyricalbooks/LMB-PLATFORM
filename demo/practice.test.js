// The practice card and inbox the walkthrough's shop pays and sends through (practicePay.js, practiceMail.js,
// practiceServices.js). Everything here is in memory or on a local port; nothing reaches Stripe or an email sender.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRACTICE_CARDS, PRACTICE_KEYS, createPracticeStripe, parseForm, practiceStripeScript, signWebhook } from "./practicePay.js";
import { PRACTICE_MAIL_KEY, createPracticeInbox, practiceMailApi } from "./practiceMail.js";
import { inboxPage, practiceEnv, startPracticeServices } from "./practiceServices.js";

test("Stripe's form bodies are read into objects", () => {
  assert.deepEqual(parseForm("amount=1200&currency=cad&metadata[order_id]=A-1&expand[0]=latest_charge"), {
    amount: "1200", currency: "cad", metadata: { order_id: "A-1" }, expand: { 0: "latest_charge" },
  });
});

test("webhooks are signed the way the shop checks them", () => {
  const header = signWebhook('{"a":1}', "whsec_x", 1700000000);
  const expected = createHmac("sha256", "whsec_x").update('1700000000.{"a":1}').digest("hex");
  assert.equal(header, `t=1700000000,v1=${expected}`);
});

test("the practice keys look like test keys, so the shop takes them, and are never live ones", () => {
  assert.match(PRACTICE_KEYS.publishable, /^pk_test_[A-Za-z0-9]{24,}$/);
  assert.match(PRACTICE_KEYS.secret, /^sk_test_/);
  assert.match(PRACTICE_KEYS.webhookSecret, /^whsec_/);
  assert.match(PRACTICE_MAIL_KEY, /^re_/);
});

test("the good practice card pays and tells the shop; the declined one is declined", async () => {
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url, init }); return new Response("{}"); };
  const stripe = createPracticeStripe({ webhookUrl: "http://127.0.0.1:5001/hook", fetch });
  const intent = stripe.api("POST", "/v1/payment_intents", {}, { amount: "2600", currency: "cad", metadata: { order_id: "A-1" } }).body;
  assert.equal(intent.status, "requires_payment_method");

  const declinedIntent = stripe.api("POST", "/v1/payment_intents", {}, { amount: "900", currency: "cad" }).body;
  const declined = await stripe.confirm({ client_secret: declinedIntent.client_secret, card: PRACTICE_CARDS.declined });
  assert.equal(declined.error.code, "card_declined");

  assert.equal((await stripe.confirm({ client_secret: "pi_wrong_secret", card: PRACTICE_CARDS.good })).error.type, "invalid_request_error");
  const paid = await stripe.confirm({ client_secret: intent.client_secret, card: PRACTICE_CARDS.good });
  assert.equal(paid.paymentIntent.status, "succeeded");

  const read = stripe.api("GET", `/v1/payment_intents/${intent.id}`, { expand: { 0: "latest_charge.balance_transaction" } }).body;
  assert.equal(read.amount_received, 2600);
  assert.equal(read.latest_charge.balance_transaction.fee, Math.round(2600 * 0.029 + 30));

  const types = sent.map(({ init }) => JSON.parse(init.body).type);
  assert.deepEqual(types, ["payment_intent.payment_failed", "payment_intent.succeeded"]);
  for (const { url, init } of sent) {
    assert.equal(url, "http://127.0.0.1:5001/hook");
    const [, time, signature] = /^t=(\d+),v1=([0-9a-f]+)$/.exec(init.headers["Stripe-Signature"]);
    assert.equal(signature, createHmac("sha256", PRACTICE_KEYS.webhookSecret).update(`${time}.${init.body}`).digest("hex"));
  }

  // Refunds can't go over what was paid.
  assert.equal(stripe.api("POST", "/v1/refunds", {}, { payment_intent: intent.id, amount: "1000" }).status, 200);
  assert.equal(stripe.api("POST", "/v1/refunds", {}, { payment_intent: intent.id, amount: "2000" }).status, 400);
  assert.equal(stripe.api("GET", "/v1/something_else").status, 404);
});

test("the inbox keeps what the shop sends, newest first, and saves it to its file", (t) => {
  const file = join(tmpdir(), `practice-inbox-${process.pid}.json`);
  t.after(() => rmSync(file, { force: true }));
  const inbox = createPracticeInbox({ file });
  assert.equal(practiceMailApi(inbox, "POST", "/emails", { from: "shop@yourpress.example", to: "a@example.com", subject: "First", html: "<p>1</p>" }).status, 200);
  practiceMailApi(inbox, "POST", "/emails/batch", [{ to: ["b@example.com"], subject: "Second" }]);
  assert.deepEqual(inbox.all().map((m) => m.subject), ["Second", "First"]);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).map((m) => m.subject), ["Second", "First"]);
  assert.deepEqual(createPracticeInbox({ file }).all().map((m) => m.subject), ["Second", "First"]);
  assert.equal(practiceMailApi(inbox, "GET", "/nothing", {}), null);
});

test("the inbox page escapes what it shows and keeps each email in a sandbox", () => {
  const inbox = createPracticeInbox();
  const entry = inbox.send({ to: "a@example.com", subject: "<script>alert(1)</script>", html: "<p>hi</p>" });
  const page = inboxPage(inbox.all(), entry.id);
  assert.ok(!page.includes("<script>alert(1)</script>"));
  assert.match(page, /&lt;script&gt;/);
  assert.match(page, /<iframe[^>]+sandbox/);
});

test("the browser's practice card form talks only to the practice service", () => {
  const script = practiceStripeScript("http://127.0.0.1:5175");
  assert.match(script, /window\.Stripe\s*=/);
  assert.match(script, /http:\/\/127\.0\.0\.1:5175/);
  assert.ok(!/stripe\.com/.test(script));
  assert.deepEqual(practiceEnv("http://127.0.0.1:5175"), { DEMO_STRIPE_URL: "http://127.0.0.1:5175", RESEND_BASE_URL: "http://127.0.0.1:5175" });
});

test("the shop sends Stripe to the practice service only on the emulators", () => {
  const functions = readFileSync(new URL("../apps/shop/functions/index.js", import.meta.url), "utf8");
  assert.match(functions, /process\.env\.FUNCTIONS_EMULATOR === "true" && process\.env\.DEMO_STRIPE_URL/);
});

test("the practice service answers the card, the email sender and the inbox on one port", async (t) => {
  const services = await startPracticeServices({ port: 0 });
  t.after(() => services.close());
  const intent = await (await fetch(`${services.url}/v1/payment_intents`, { method: "POST", body: "amount=500&currency=cad" })).json();
  assert.equal(intent.amount, 500);
  const paid = await (await fetch(`${services.url}/practice/confirm`, { method: "POST", body: JSON.stringify({ client_secret: intent.client_secret, card: PRACTICE_CARDS.good }) })).json();
  assert.equal(paid.paymentIntent.status, "succeeded");
  assert.equal((await fetch(`${services.url}/emails`, { method: "POST", body: JSON.stringify({ to: "a@example.com", subject: "Hello" }) })).status, 200);
  assert.deepEqual((await (await fetch(`${services.url}/inbox.json`)).json()).map((m) => m.subject), ["Hello"]);
  assert.match(await (await fetch(`${services.url}/inbox`)).text(), /Hello/);
});

test("the practice service hands out the sample files to import, and nothing else under /samples", async (t) => {
  const services = await startPracticeServices({ port: 0 });
  t.after(() => services.close());
  for (const name of ["new-products.csv", "old-shop-products.csv", "old-shop-customers.csv"]) {
    const response = await fetch(`${services.url}/samples/${name}`);
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get("content-disposition"), new RegExp(`attachment; filename="${name}"`));
    const text = await response.text();
    assert.ok(text.split("\r\n").length > 3, name);
    assert.ok(!/@(?!example\.com)/.test(text), `${name} uses only made-up addresses`);
  }
  assert.equal((await fetch(`${services.url}/samples/nothing.csv`)).status, 404);
  assert.equal((await fetch(`${services.url}/samples/..%2Fpackage.json`)).status, 404);
});
