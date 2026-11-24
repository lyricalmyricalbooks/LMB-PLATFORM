import test from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";
import { createTexts, phoneE164, runTexts, textParts } from "./index.js";
import { partPriceText, readTextConfig, textCents } from "./config.js";
import { fakeTextLog, fakeTwilioFetch } from "./fakes.js";

const SID = `AC${"1".repeat(32)}`;
const ENV = { TEXTS: "on", TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: "twilio-test-token", TWILIO_FROM: "+18885550123" };
const KEY = { "fern-comb": "fern-comb-service-key-0123456789abcdef", "jo-studio": "jo-studio-service-key-0123456789abcdef" };

async function build({ env = ENV, answer = null, at = "2026-11-17T16:00:00Z", dailyLimit } = {}) {
  const registry = fakeRegistry();
  await registry.createShop("fern-comb", { shopId: "fern-comb", status: "live", serviceKeyHash: hashServiceKey(KEY["fern-comb"]), billing: { access: "open", currency: "CAD" } });
  await registry.createShop("jo-studio", { shopId: "jo-studio", status: "live", serviceKeyHash: hashServiceKey(KEY["jo-studio"]), billing: { access: "paused", currency: "USD" } });
  const log = fakeTextLog();
  const twilio = fakeTwilioFetch({ answer });
  const clock = { at };
  const texts = createTexts({ env, fetch: twilio.fetch, registry, log, now: () => new Date(clock.at), ...(dailyLimit ? { dailyLimit } : {}) });
  const call = (shop, op, args = {}, key = KEY[shop]) => texts.shopCall({ headers: { "X-Shop-Id": shop, Authorization: `Bearer ${key}` }, body: { op, args } });
  const send = (args = {}) => call("fern-comb", "texts.send", { to: "(416) 555-0199", body: "Reminder: Cut and colour at Fern & Comb tomorrow 10:00. Reply STOP to opt out.", kind: "booking-reminder", idempotencyKey: "bk1-reminder", ...args });
  return { registry, log, twilio, texts, call, send, clock };
}

test("the settings: off without TEXTS and the keys; the keys are checked; prices per currency", () => {
  assert.equal(readTextConfig({}).on, false);
  assert.equal(readTextConfig({ TEXTS: "on" }).on, false, "on needs the Twilio keys too");
  assert.equal(readTextConfig(ENV).on, true);
  assert.throws(() => readTextConfig({ ...ENV, TWILIO_AUTH_TOKEN: "" }), /go together/);
  assert.throws(() => readTextConfig({ ...ENV, TWILIO_FROM: "" }), /TWILIO_FROM is needed/);
  assert.throws(() => readTextConfig({ ...ENV, TWILIO_FROM: "+4420" }), /TWILIO_FROM/);
  assert.throws(() => readTextConfig({ ...ENV, TWILIO_ACCOUNT_SID: "nope" }), /TWILIO_ACCOUNT_SID/);
  const config = readTextConfig(ENV);
  assert.deepEqual([textCents(config, "CAD", 0), textCents(config, "CAD", 100), textCents(config, "USD", 100), textCents(config, "CAD", 3)], [0, 160, 116, 5]);
  assert.deepEqual([partPriceText(16_000), partPriceText(11_600), partPriceText(20_000)], ["1.6¢", "1.2¢", "2¢"]);
});

test("numbers: Canadian and US numbers only, written any way", () => {
  assert.deepEqual(["416-555-0199", "(416) 555 0199", "+1 416 555 0199", "1-416-555-0199", "4165550199"].map(phoneE164), Array(5).fill("+14165550199"));
  assert.deepEqual(["+44 20 7946 0958", "555-0199", "011 416 555 0199", "0165550199", ""].map(phoneE164), ["", "", "", "", ""]);
});

test("parts: 160 plain characters in one, longer texts in 153s, accents and emoji in the wider alphabet", () => {
  assert.deepEqual([textParts("a".repeat(160)), textParts("a".repeat(161)), textParts("a".repeat(306)), textParts("a".repeat(307))], [1, 2, 2, 3]);
  assert.equal(textParts("€".repeat(80)), 1, "extension characters take two places");
  assert.equal(textParts("€".repeat(81)), 2);
  assert.deepEqual([textParts("ç".repeat(70)), textParts("ç".repeat(71)), textParts("👋".repeat(35))], [1, 2, 1]);
});

test("off: shops see it as not open and nothing is sent", async () => {
  const { call, send, twilio } = await build({ env: {} });
  assert.deepEqual(await call("fern-comb", "texts.status"), { available: false, price: "", replies: false });
  assert.deepEqual(await send(), { ok: false, retryable: false, message: "Text reminders aren't open yet." });
  assert.equal(twilio.sent.length, 0);
});

test("a shop's text goes through Twilio from the platform's number, once per key, logged without its words", async () => {
  const { call, send, twilio, log, texts } = await build();
  assert.deepEqual(await call("fern-comb", "texts.status"), { available: true, price: "1.6¢", replies: false });
  const first = await send();
  assert.deepEqual([first.ok, first.parts], [true, 1]);
  assert.equal(twilio.sent.length, 1);
  assert.equal(twilio.sent[0].url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
  assert.deepEqual([twilio.sent[0].form.To, twilio.sent[0].form.From, twilio.sent[0].auth.startsWith("Basic ")], ["+14165550199", "+18885550123", true]);
  const row = log.rows.get("fern-comb/bk1-reminder");
  assert.deepEqual([row.status, row.parts, row.micros, row.currency, row.toEnd, row.month], ["sent", 1, 16_000, "CAD", "0199", "2026-11"]);
  assert.equal(JSON.stringify(row).includes("Reminder"), false, "the words are never kept");
  assert.equal(JSON.stringify(row).includes("4165550199"), false, "nor the whole number");
  assert.deepEqual((await send()).alreadySent, true);
  assert.equal(twilio.sent.length, 1, "the same key never sends twice");
  assert.deepEqual(await texts.monthTexts("2026-11"), { "fern-comb": { texts: 1, parts: 1 } });
  assert.deepEqual(await texts.forShop("fern-comb"), { available: true, month: "2026-11", texts: 1, parts: 1, cents: 2, currency: "CAD" });
});

test("a messaging service sends as itself", async () => {
  const { send, twilio } = await build({ env: { ...ENV, TWILIO_FROM: `MG${"a".repeat(32)}` } });
  await send();
  assert.equal(twilio.sent[0].form.MessagingServiceSid, `MG${"a".repeat(32)}`);
  assert.equal(twilio.sent[0].form.From, undefined);
});

test("the door: a wrong key, a paused shop, a bad number, a long text and a missing key are refused", async () => {
  const { call, send, twilio } = await build();
  await assert.rejects(call("fern-comb", "texts.send", {}, KEY["jo-studio"]), /can't send texts/);
  await assert.rejects(call("nobody", "texts.status", {}, KEY["fern-comb"]), /can't send texts/);
  await assert.rejects(call("fern-comb", "texts.delete"), /Unknown call/);
  assert.match((await call("jo-studio", "texts.send", { to: "4165550199", body: "Hi", idempotencyKey: "k-123456" })).message, /paused/);
  assert.match((await send({ to: "+44 20 7946 0958" })).message, /Canadian and US/);
  assert.match((await send({ body: "a".repeat(460) })).message, /at most 459/);
  assert.match((await send({ idempotencyKey: "" })).message, /its own key/);
  assert.equal(twilio.sent.length, 0);
});

test("Twilio's answers: STOP and bad numbers are final, a slow-down is retried, a dropped line is never sent again", async () => {
  const stop = await build({ answer: () => ({ status: 400, body: { code: 21610, message: "Attempt to send to unsubscribed recipient" } }) });
  const stopped = await stop.send();
  assert.deepEqual([stopped.ok, stopped.retryable, stopped.optedOut], [false, false, true]);
  assert.equal(stop.log.rows.get("fern-comb/bk1-reminder").status, "failed");

  const busy = await build({ answer: (_form, n) => (n === 1 ? { status: 429, body: { code: 20429, message: "Too many requests" } } : null) });
  assert.deepEqual([(await busy.send()).retryable], [true]);
  assert.equal((await busy.send()).ok, true, "a failed send can be tried again with the same key");

  const dropped = await build({ answer: () => new Error("socket hang up") });
  assert.deepEqual((await dropped.send()).retryable, false);
  assert.equal(dropped.log.rows.get("fern-comb/bk1-reminder").status, "unsure");
  assert.deepEqual(await dropped.texts.monthTexts("2026-11"), {}, "an unsure text is never billed");
});

test("the daily limit stops a shop's texts until tomorrow", async () => {
  const { send, clock } = await build({ dailyLimit: 2 });
  assert.equal((await send({ idempotencyKey: "k-000001" })).ok, true);
  assert.equal((await send({ idempotencyKey: "k-000002" })).ok, true);
  const third = await send({ idempotencyKey: "k-000003" });
  assert.deepEqual([third.ok, third.retryable], [false, true]);
  clock.at = "2026-11-18T16:00:01Z";
  assert.equal((await send({ idempotencyKey: "k-000003" })).ok, true);
});

test("the job bills last month's texts", async () => {
  const { send, texts, clock } = await build({ answer: () => ({ body: { sid: "SM1", num_segments: "2" } }) });
  await send();
  clock.at = "2026-12-04T03:05:00Z";
  const calls = [];
  const billing = { billTexts: async (args) => { calls.push(args); return { billed: [{ shopId: "fern-comb", cents: 3 }] }; } };
  const run = await runTexts({ texts, billing, now: () => new Date(clock.at) });
  assert.equal(calls[0].month, "2026-11");
  assert.deepEqual(calls[0].texts, { "fern-comb": { texts: 1, parts: 2 } });
  assert.equal(calls[0].cents("CAD", 2), 3);
  assert.match(run.summary, /2026-11: 1 text from 1 shop; billed 1/);
});

test("replies: Y, C and M come back to the shop and booking that texted the number last", async () => {
  const { fakeTextReplies } = await import("./fakes.js");
  const { twilioSignature, replyWord, REPLY_DAYS } = await import("./index.js");
  const registry = fakeRegistry();
  await registry.createShop("fern-comb", { shopId: "fern-comb", status: "live", serviceKeyHash: hashServiceKey(KEY["fern-comb"]), billing: { access: "open", currency: "CAD" } });
  await registry.createShop("jo-studio", { shopId: "jo-studio", status: "live", serviceKeyHash: hashServiceKey(KEY["jo-studio"]), billing: { access: "open", currency: "USD" } });
  const replies = fakeTextReplies();
  const clock = { at: "2026-11-17T16:00:00Z" };
  const url = "https://platform.example/api/texts/inbound";
  const texts = createTexts({ env: ENV, fetch: fakeTwilioFetch().fetch, registry, log: fakeTextLog(), replies, inboundUrl: url, now: () => new Date(clock.at) });
  const call = (shop, op, args = {}) => texts.shopCall({ headers: { "X-Shop-Id": shop, Authorization: `Bearer ${KEY[shop]}` }, body: { op, args } });
  const incoming = (form, signature = twilioSignature("twilio-test-token", url, form)) =>
    texts.inbound({ headers: { "X-Twilio-Signature": signature }, rawBody: new URLSearchParams(form).toString() });
  const text = (Body, extra = {}) => ({ AccountSid: SID, From: "+14165550199", To: "+18885550123", Body, MessageSid: `SM${Math.random().toString(16).slice(2)}`, ...extra });

  assert.deepEqual(["Y", " yes! ", "Oui", "c", "M.", "cancel", "STOP", "thanks", ""].map(replyWord), ["yes", "yes", "yes", "cancel", "move", "", "", "", ""]);
  assert.equal((await call("fern-comb", "texts.status")).replies, true);

  await call("fern-comb", "texts.send", { to: "416-555-0199", body: "Reminder", idempotencyKey: "bk1-reminder", replyRef: "bk-1001" });
  assert.equal(JSON.stringify([...replies.routes]).includes("4165550199"), false, "the route never keeps the number");
  await call("jo-studio", "texts.send", { to: "+1 212 555 0100", body: "Reminder", idempotencyKey: "jo-reminder", replyRef: "jo-1001" });

  assert.equal((await incoming(text("Y"), "bad-signature")).status, 403, "a post Twilio didn't sign is refused");
  assert.equal((await incoming(text("Y", { AccountSid: `AC${"2".repeat(32)}` }))).status, 403, "another Twilio account is refused");
  const answer = await incoming(text("Y"));
  assert.deepEqual(answer, { status: 200, xml: "<Response></Response>" });
  await incoming(text("hello, running late"));
  await incoming(text("M", { From: "+14165550100" }), undefined);
  const fern = (await call("fern-comb", "texts.replies")).replies;
  assert.deepEqual(fern.map((r) => [r.ref, r.word]), [["bk-1001", "yes"]], "only answers from a number the shop texted");
  assert.deepEqual((await call("jo-studio", "texts.replies")).replies, [], "another shop never sees them");

  await call("jo-studio", "texts.repliesTaken", { ids: [fern[0].id] });
  assert.equal((await call("fern-comb", "texts.replies")).replies.length, 1, "a shop can't take another shop's reply");
  await call("fern-comb", "texts.repliesTaken", { ids: [fern[0].id] });
  assert.deepEqual((await call("fern-comb", "texts.replies")).replies, []);

  clock.at = new Date(Date.parse("2026-11-17T16:00:00Z") + (REPLY_DAYS + 1) * 86_400_000).toISOString();
  await incoming(text("C"));
  assert.deepEqual((await call("fern-comb", "texts.replies")).replies, [], "an answer long after the text is dropped");
});

test("replies stay off without the stores or the address", async () => {
  const registry = fakeRegistry();
  await registry.createShop("fern-comb", { shopId: "fern-comb", status: "live", serviceKeyHash: hashServiceKey(KEY["fern-comb"]), billing: { access: "open" } });
  const texts = createTexts({ env: ENV, fetch: fakeTwilioFetch().fetch, registry, log: fakeTextLog() });
  const call = (op, args = {}) => texts.shopCall({ headers: { "X-Shop-Id": "fern-comb", Authorization: `Bearer ${KEY["fern-comb"]}` }, body: { op, args } });
  assert.equal((await call("texts.status")).replies, false);
  assert.deepEqual(await call("texts.replies"), { replies: [] });
  assert.equal((await texts.inbound({ headers: {}, rawBody: "" })).status, 404);
});
