// Messages to presses (code plan 19.14): who sees a message (every shop, one plan, one shop), when it ends, that it
// goes only to the shop's admin document, and that an important one is emailed once per shop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MESSAGES_DOC, MAX_WORDS, createPressMessages, messageRoutes, messageState, messagesForShop } from "./messages.js";
import { fakePressMessages } from "./messagesFakes.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeActivity } from "./fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { createApi } from "../signup/api.js";
import { platformSettings } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";

const START = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;
const claimsAt = (email, ms) => ({ uid: `uid-${email}`, email, email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(ms / 1000) });

async function world({ withEmail = true } = {}) {
  let clock = START;
  const now = () => new Date(clock);
  const registry = fakeRegistry();
  const shops = [
    ["moth-press", "shop", "live"], ["owl-press", "both", "live"], ["fern-press", "stockroom", "live"],
    ["new-press", "shop", "creating"], ["gone-press", "shop", "live"],
  ];
  for (const [shopId, plan, status] of shops) {
    await registry.createShop(shopId, { shopId, projectId: shopId, pressName: shopId.replace("-", " "), ownerEmail: `${shopId}@example.com`, plan, status, ...(shopId === "gone-press" ? { closing: { stage: "deleted" } } : {}) });
    await registry.saveProfile(shopId, { siteUrl: `https://${shopId}.web.app` });
  }
  const auditLog = fakeAuditLog();
  const shopData = fakeShopData();
  const store = fakePressMessages();
  const activity = fakeActivity();
  const email = fakePlatformEmail();
  const messages = createPressMessages({
    store, registry, auditLog, shopData, activity, ...(withEmail ? { email } : {}),
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), now,
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: messageRoutes(messages) });
  const admin = () => claimsAt("admin@example.com", clock);
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const banner = (shopId) => shopData.docs.get(`${shopId} ${MESSAGES_DOC}`) ?? null;
  return { registry, auditLog, shopData, store, activity, email, messages, admin, ask, banner, tick: (ms) => void (clock += ms), now };
}

const ends = (days) => new Date(START + days * DAY).toISOString();
const base = { words: "New: shipping labels from your admin.", endsAt: ends(7), reason: "telling every press about labels" };

test("only platform admins list, add or end messages", async () => {
  const w = await world();
  const stranger = claimsAt("someone@example.com", START);
  for (const [method, path, body] of [["GET", "/api/control/messages"], ["POST", "/api/control/messages/add", { ...base, audience: { all: true } }], ["POST", "/api/control/messages/end", { id: "x", reason: "not needed any more" }]]) {
    assert.equal((await w.ask(stranger, method, path, body)).status, 403, path);
  }
  assert.equal(w.store.rows.size, 0);
  const added = await w.ask(w.admin(), "POST", "/api/control/messages/add", { ...base, audience: { all: true } });
  assert.equal(added.status, 200);
  assert.equal((await w.ask(w.admin(), "GET", "/api/control/messages")).body.messages.length, 1);
});

test("every shop: each live shop admin gets it; not a shop being made, a deleted one, or a stockroom with no admin", async () => {
  const w = await world();
  const { message, shops } = await w.messages.add(w.admin(), { ...base, audience: { all: true } });
  assert.equal(shops, 2);
  for (const shopId of ["moth-press", "owl-press"]) {
    assert.deepEqual(w.banner(shopId).messages, [{ id: message.id, words: base.words, level: "info", startsAt: new Date(START).toISOString(), endsAt: base.endsAt }]);
  }
  for (const shopId of ["fern-press", "new-press", "gone-press"]) assert.equal(w.banner(shopId), null, shopId);
  // What the shop reads is only the words and dates: never who wrote it, why, or who else sees it.
  assert.deepEqual(Object.keys(w.banner("moth-press").messages[0]).sort(), ["endsAt", "id", "level", "startsAt", "words"]);
  const listed = await w.messages.list(w.admin());
  assert.equal(listed.messages[0].reaches, 3, "the stockroom-only press is reached too (by email when important)");
  assert.equal(listed.messages[0].state, "showing");
});

test("one plan, or one shop: only those shops", async () => {
  const w = await world();
  await w.messages.add(w.admin(), { ...base, words: "For shop-and-stockroom presses.", audience: { plan: "both" } });
  assert.equal(w.banner("owl-press").messages.length, 1);
  assert.equal(w.banner("moth-press"), null);

  const one = await w.messages.add(w.admin(), { ...base, words: "Your new address is live.", audience: { shopId: "moth-press" } });
  assert.equal(w.banner("moth-press").messages[0].id, one.message.id);
  assert.equal(w.banner("owl-press").messages.length, 1);
  // A one-shop message is in that shop's own history and audit log as well as the activity log.
  assert.ok([...w.registry.events.get("moth-press").values()].some((e) => e.what === "press-message-added" && e.message === one.message.id));
  assert.ok([...w.auditLog.entries.get("moth-press").values()].some((e) => e.what === "press-message-added"));
  assert.equal([...w.activity.rows.values()].filter((e) => e.what === "press-message-added").length, 2);

  await assert.rejects(w.messages.add(w.admin(), { ...base, audience: { shopId: "nobody-press" } }), (e) => e.status === 404);
  await assert.rejects(w.messages.add(w.admin(), { ...base, audience: { plan: "gold" } }), (e) => e.status === 400);
  await assert.rejects(w.messages.add(w.admin(), { ...base, audience: { all: true, plan: "shop" } }), (e) => e.status === 400);
});

test("the words are plain text up to 400 characters, with an end date at most 60 days away and a reason", async () => {
  const w = await world();
  const all = { audience: { all: true } };
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, words: "x".repeat(MAX_WORDS + 1) }), /400 characters/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, words: "Hello <b>there</b>" }), /plain words/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, words: "Hello &amp; there" }), /plain words/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, words: "   " }), /Write the message/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, endsAt: undefined }), /ends/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, endsAt: ends(61) }), /60 days/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, endsAt: ends(-1) }), /after now/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, startsAt: ends(3), endsAt: ends(2) }), /after it starts/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, level: "loud" }), /info or important/);
  await assert.rejects(w.messages.add(w.admin(), { ...base, ...all, reason: "short" }), /at least 10/);
  assert.equal(w.store.rows.size, 0);
  // "Orders > 5" is words, not markup.
  assert.equal((await w.messages.add(w.admin(), { ...base, ...all, words: "Orders over 5 > ship free this week." })).added, true);
});

test("expiry: an ended or past message leaves the shop's admin, and an upcoming one waits for its start", async () => {
  const w = await world();
  const later = await w.messages.add(w.admin(), { ...base, words: "Maintenance on Sunday.", audience: { all: true }, startsAt: ends(2), endsAt: ends(3) });
  assert.equal(later.message.state, "upcoming");
  // Written ahead, so it starts on time; the admin's banner waits for startsAt.
  assert.equal(w.banner("moth-press").messages[0].startsAt, ends(2));
  w.tick(2.5 * DAY);
  assert.equal(messageState(await w.store.get(later.message.id), w.now().getTime()), "showing");
  w.tick(1 * DAY);
  assert.equal(messageState(await w.store.get(later.message.id), w.now().getTime()), "ended");
  await w.messages.sweep();
  assert.deepEqual(w.banner("moth-press").messages, [], "the nightly sweep takes it off");

  const now = await w.messages.add(w.admin(), { ...base, audience: { all: true }, endsAt: new Date(w.now().getTime() + 5 * DAY).toISOString() });
  assert.equal(w.banner("owl-press").messages.length, 1);
  const ended = await w.messages.end(w.admin(), { id: now.message.id, reason: "labels are delayed again" });
  assert.equal(ended.ended, true);
  assert.deepEqual(w.banner("owl-press").messages, []);
  assert.equal((await w.messages.end(w.admin(), { id: now.message.id, reason: "labels are delayed again" })).ended, false);
  assert.ok([...w.activity.rows.values()].some((e) => e.what === "press-message-ended" && e.detail.reason === "labels are delayed again"));
  await assert.rejects(w.messages.end(w.admin(), { id: "msg-nothing", reason: "not needed any more" }), (e) => e.status === 404);
  assert.equal((await w.messages.list(w.admin())).messages.every((m) => m.state === "ended"), true);
});

test("important: each targeted owner is emailed once, even when it is added twice or swept again", async () => {
  const w = await world();
  const important = { ...base, level: "important", words: "Card payments pause tonight from 1 to 2 am.\n\nNothing to do on your side.", audience: { all: true } };
  const first = await w.messages.add(w.admin(), important);
  assert.equal(first.emailed, 3, "both shop admins and the stockroom-only press");
  const again = await w.messages.add(w.admin(), important);
  assert.equal(again.added, false);
  assert.equal(again.emailed, 0);
  await w.messages.sweep();
  const sent = w.email.list();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((m) => m.to).sort(), ["fern-press@example.com", "moth-press@example.com", "owl-press@example.com"]);
  assert.ok(sent.every((m) => m.kind === "press-message" && m.idempotencyKey === `press-message/${first.message.id}/${m.shopId}`));
  assert.equal(sent.find((m) => m.shopId === "fern-press").data.link, null, "a stockroom-only press has no shop admin to open");
  assert.equal(sent.find((m) => m.shopId === "moth-press").data.link, "https://moth-press.web.app/admin");
  assert.deepEqual(Object.keys((await w.store.get(first.message.id)).emailed).sort(), ["fern-press", "moth-press", "owl-press"]);

  // A shop that goes live later gets the banner and its one email from the sweep.
  await w.registry.updateShop("new-press", { status: "live" });
  await w.messages.sweep();
  await w.messages.sweep();
  assert.equal(w.email.list().filter((m) => m.shopId === "new-press").length, 1);
  assert.equal(w.banner("new-press").messages[0].level, "important");

  // An info message emails nobody.
  await w.messages.add(w.admin(), { ...base, words: "Just so you know.", audience: { all: true } });
  assert.equal(w.email.list().length, 4);
});

test("sending again after one owner's email failed finishes the same message: no second message, nobody emailed twice", async () => {
  const w = await world();
  const send = w.email.sendPlatform;
  let failOnce = true;
  w.email.sendPlatform = async (message) => {
    if (message.shopId === "owl-press" && failOnce) {
      failOnce = false;
      throw new Error("the email service hiccuped (pretend)");
    }
    return send(message);
  };
  const important = { ...base, level: "important", audience: { all: true } };
  const first = await w.messages.add(w.admin(), important);
  assert.deepEqual(first.failed, ["owl-press"]);
  assert.equal(first.emailed, 2, "one shop's failure doesn't stop the shops after it");
  w.tick(5 * 60_000);
  const retry = await w.messages.add(w.admin(), important);
  assert.equal(retry.added, false);
  assert.equal(retry.message.id, first.message.id);
  assert.equal((await w.store.list()).length, 1);
  const sent = w.email.list();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map((m) => m.to).sort(), ["fern-press@example.com", "moth-press@example.com", "owl-press@example.com"]);
});

test("an important message with no way to email is refused, so nobody thinks the presses were told", async () => {
  const w = await world({ withEmail: false });
  await assert.rejects(w.messages.add(w.admin(), { ...base, level: "important", audience: { all: true } }), (e) => e.status === 503);
  assert.equal(w.store.rows.size, 0);
});

test("a shop's document lists important first, then by start, and leaves out other shops' messages", () => {
  const nowMs = START;
  const row = { shopId: "moth-press", plan: "shop" };
  const m = (id, extra) => ({ id, words: id, level: "info", audience: { all: true }, startsAt: new Date(START - DAY).toISOString(), endsAt: ends(5), ...extra });
  const list = messagesForShop(row, [
    m("b-info"), m("a-important", { level: "important" }), m("c-other", { audience: { shopId: "owl-press" } }),
    m("d-ended", { endedAt: new Date(START).toISOString() }), m("e-past", { endsAt: new Date(START - 1).toISOString() }), m("f-plan", { audience: { plan: "shop" } }),
  ], nowMs);
  assert.deepEqual(list.map((x) => x.id), ["a-important", "b-info", "f-plan"]);
});

test("the email reads plainly and keeps a press's words as words", () => {
  const settings = platformSettings({});
  const parts = TEMPLATES["press-message"]({ words: "Hi <b>all</b>", endsOn: "9 November 2026", link: "https://moth-press.web.app/admin" }, { settings, pressName: "Moth Press" });
  assert.match(parts.subject, /A message from .* for Moth Press/);
  assert.doesNotMatch(parts.html, /<b>all/);
  assert.match(parts.text, /until 9 November 2026/);
  assert.throws(() => TEMPLATES["press-message"]({ words: "" }, { settings, pressName: "P" }), /no words/);
});

test("the banner is the admin's only: the storefront never reads the messages document", () => {
  // The shop's rules let only its admins read platform/messages and no browser write it.
  const rules = readFileSync(new URL("../apps/shop/firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /allow read: if docId == 'status' \|\| \(\(docId == 'plan' \|\| docId == 'messages'\) && isAdmin\(\)\);/);
  // The shop's admin reads it; the storefront's own code never names it.
  const api = readFileSync(new URL("../apps/shop/src/app/admin/platformMessagesApi.ts", import.meta.url), "utf8");
  assert.match(api, /doc\(db, "platform", "messages"\)/);
});

test("a promised notice (price rise, new helper, terms change) is emailed, names its day, and is refused when late", async () => {
  const { NOTICE_DAYS, noticeOnRecord } = await import("./messages.js");
  const w = await world();
  const late = { ...base, words: "Our prices go up.", audience: { all: true }, notice: "price-rise", takesEffect: ends(NOTICE_DAYS - 1) };
  await assert.rejects(w.messages.add(w.admin(), late), /30 days' notice/);
  await assert.rejects(w.messages.add(w.admin(), { ...late, notice: "something-else" }), /Choose what the notice is about/);
  assert.equal(w.store.rows.size, 0);
  const { message, emailed } = await w.messages.add(w.admin(), { ...late, takesEffect: ends(NOTICE_DAYS + 1) });
  assert.equal(message.level, "important", "a notice is always emailed");
  assert.ok(emailed >= 1);
  assert.deepEqual(message.notice, { kind: "price-rise", takesEffect: ends(NOTICE_DAYS + 1) });
  assert.match(message.words, /^Our prices go up\. This takes effect on December 3, 2026\.$/);
  const all = [...w.store.rows.values()];
  assert.equal(noticeOnRecord(all, "price-rise", ends(NOTICE_DAYS + 1)), true);
  assert.equal(noticeOnRecord(all, "price-rise", ends(NOTICE_DAYS)), false, "not for a change before the notice's day");
  assert.equal(noticeOnRecord(all, "new-helper", ends(90)), false, "a price notice isn't a helper notice");
  // The record Julian can point to if a press disputes the notice.
  const { notices } = await w.messages.list(w.admin());
  assert.equal(notices.length, 1);
  assert.equal(notices[0].kind, "price-rise");
  assert.equal(notices[0].daysNotice, NOTICE_DAYS + 1);
  assert.equal(notices[0].emailed, emailed);
});

test("the notice days match what the terms promise", async () => {
  const { NOTICE_DAYS } = await import("./messages.js");
  const { CHANGE_NOTICE_DAYS } = await import("../terms/terms.js");
  assert.equal(NOTICE_DAYS, CHANGE_NOTICE_DAYS);
});
