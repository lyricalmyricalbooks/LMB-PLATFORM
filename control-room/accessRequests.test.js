// The press says yes before "Make changes" (code plan 19.6): the control room asks, the owner is emailed and answers on
// the account page, and only an approved, unexpired, unused request opens one 30-minute staff sign-in. Looking only
// ("view") needs no yes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACT_AS_MINUTES, controlRoomAdmins, createControlRoom } from "./controlRoom.js";
import { controlRoutes } from "./routes.js";
import { REQUEST_HOURS, VISITS_SHOWN, createAccessRequests, statusAt } from "./accessRequests.js";
import { fakeAccessRequestStore, fakeActivity, fakeShopAccess } from "./fakes.js";
import { accessRequestRoutes } from "../accounts/accessRequestRoutes.js";
import { createAccounts } from "../accounts/accounts.js";
import { fakeAccountStores, fakeShopData } from "../accounts/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { TEMPLATES } from "../services/email/templates.js";
import { platformSettings } from "../services/settings.js";
import { fakeAuditLog, fakeProfileFiles, fakeRegistry } from "../setup/fakes.js";

const SHOP = "moth-press";
const OTHER_SHOP = "other-press";
const OWNER = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const OTHER_OWNER = { uid: "uid-two", email: "two@example.com", email_verified: true };
const HOUR = 3600_000;

async function world() {
  let clock = Date.parse("2026-11-02T12:00:00Z");
  const now = () => new Date(clock);
  const settings = platformSettings({});
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", plan: "shop", status: "live", ownerEmail: OWNER.email });
  await registry.createShop(OTHER_SHOP, { shopId: OTHER_SHOP, pressName: "Other Press", plan: "shop", status: "live", ownerEmail: OTHER_OWNER.email });
  const auditLog = fakeAuditLog();
  const activity = fakeActivity();
  const email = fakePlatformEmail();
  const shopAccess = fakeShopAccess();
  const store = fakeAccessRequestStore();
  const requests = createAccessRequests({ store, email, settings, now });
  const room = createControlRoom({
    registry, auditLog, profileFiles: fakeProfileFiles(), publish: async () => ({ apps: [] }), shopAccess, activity, accessRequests: requests,
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), now,
  });
  const accounts = createAccounts({ accounts: fakeSignupStores().accounts, ...fakeAccountStores(), registry, shopData: fakeShopData(), auditLog, email, settings, now });
  const door = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings, log: () => {},
    routes: { ...controlRoutes(room), ...accessRequestRoutes({ requests, accounts, activity, registry, auditLog, now }) },
  });
  const admin = () => ({ uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(clock / 1000) });
  const ask = (claims, method, path, body) => door({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const askPress = (shopId = SHOP, reason = "you asked us to fix a book's price") => ask(admin(), "POST", "/api/control/act-as", { shopId, reason, mode: "edit" });
  const openWith = (requestId, shopId = SHOP) => ask(admin(), "POST", "/api/control/act-as", { shopId, mode: "edit", requestId });
  const answer = (claims, id, approve) => ask(claims, "POST", "/api/account/access-requests/answer", { id, approve });
  const logged = (shopId = SHOP) => [...(registry.events.get(shopId)?.values() ?? [])];
  return { registry, auditLog, activity, email, shopAccess, store, requests, room, ask, askPress, openWith, answer, logged, admin, tick: (ms) => void (clock += ms) };
}

test("no yes, no staff sign-in: Make changes asks the press, emails the owner and opens nothing", async () => {
  const w = await world();
  const asked = await w.askPress();
  assert.equal(asked.status, 200);
  assert.deepEqual([asked.body.asked, asked.body.emailed, asked.body.request.status, asked.body.url], [true, true, "waiting", undefined]);
  assert.equal(asked.body.request.expiresAt, new Date(Date.parse(asked.body.request.askedAt) + REQUEST_HOURS * HOUR).toISOString());
  assert.equal(w.shopAccess.calls.length, 0);

  // Logged like every control-room action: the registry, the shop's audit log and the activity log.
  const entry = w.logged().find((e) => e.what === "access-asked");
  assert.deepEqual([entry.by, entry.reason, entry.requestId], ["admin@example.com", "you asked us to fix a book's price", asked.body.request.id]);
  assert.ok(w.auditLog.entries.get(SHOP).has(entry.id));
  assert.equal((await w.activity.list({ shopId: SHOP }))[0].what, "access-asked");

  // The owner's email: who, why, approve or decline on the account page.
  const [mail] = w.email.list();
  assert.deepEqual([mail.kind, mail.to, mail.shopId], ["support-access-request", OWNER.email, SHOP]);
  const parts = TEMPLATES[mail.kind](mail.data, { settings: platformSettings({}), pressName: mail.data.pressName });
  assert.match(parts.subject, /asks to make changes in Moth Press/);
  assert.match(parts.text, /admin@example\.com/);
  assert.match(parts.text, /Why: you asked us to fix a book's price/);
  assert.match(parts.text, /Approve or decline: https:\/\/.*\/accounts\//);

  // Trying to open with a request that's still waiting is refused, in plain words.
  const early = await w.openWith(asked.body.request.id);
  assert.equal(early.status, 403);
  assert.match(early.body.message, /hasn't said yes yet/);
  assert.equal((await w.openWith("no-such-request")).status, 404);
  assert.equal(w.shopAccess.calls.length, 0);
  // A reason is still needed to ask.
  assert.equal((await w.askPress(SHOP, "help")).status, 400);
});

test("approve: exactly one 30-minute staff sign-in, recorded in the shop's audit log", async () => {
  const w = await world();
  const { request } = (await w.askPress()).body;
  const listed = await w.ask(OWNER, "GET", `/api/account/access-requests?shopId=${SHOP}`);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.requests.map((r) => [r.id, r.status, r.by]), [[request.id, "waiting", "admin@example.com"]]);

  const yes = await w.answer(OWNER, request.id, true);
  assert.deepEqual([yes.status, yes.body.request.status, yes.body.request.answeredBy], [200, "approved", OWNER.email]);
  const approved = w.logged().find((e) => e.what === "support-access-approved");
  assert.deepEqual([approved.by, approved.requestId, approved.asker], [OWNER.email, request.id, "admin@example.com"]);
  assert.ok(w.auditLog.entries.get(SHOP).has(approved.id), "in the shop's own audit log");
  // Saying yes twice changes nothing and logs once.
  assert.equal((await w.answer(OWNER, request.id, true)).status, 200);
  assert.equal(w.logged().filter((e) => e.what === "support-access-approved").length, 1);

  // Two clicks at once: one sign-in.
  const opened = await Promise.all([w.openWith(request.id), w.openWith(request.id)]);
  assert.deepEqual(opened.map((a) => a.status).sort(), [200, 409]);
  const ok = opened.find((a) => a.status === 200);
  assert.equal(ok.body.mode, "edit");
  assert.match(ok.body.url, /support=1/);
  assert.deepEqual(w.shopAccess.calls, [{ shopId: SHOP, by: "admin@example.com", reason: "you asked us to fix a book's price", minutes: ACT_AS_MINUTES, mode: "edit" }]);
  assert.equal(ACT_AS_MINUTES, 30);
  const visit = w.logged().find((e) => e.what === "act-as");
  assert.deepEqual([visit.mode, visit.requestId], ["edit", request.id]);
  // Used once: asking to open again is refused.
  const again = await w.openWith(request.id);
  assert.equal(again.status, 409);
  assert.match(again.body.message, /has been used/);
  assert.equal((await w.requests.forShop(SHOP))[0].status, "used");
  // A late "no" can't undo a visit that happened.
  assert.equal((await w.answer(OWNER, request.id, false)).status, 409);
});

test("the yes is for the person who asked: another admin can't spend it", async () => {
  const w = await world();
  const { request } = (await w.askPress()).body;
  assert.equal((await w.answer(OWNER, request.id, true)).status, 200);
  await assert.rejects(w.requests.use({ id: request.id, shopId: SHOP, by: "second-admin@example.com" }), (error) => error.status === 403 && /Only they can use/.test(error.message));
  assert.equal((await w.requests.forShop(SHOP))[0].status, "approved", "still there for the person the press said yes to");
  assert.equal((await w.openWith(request.id)).status, 200);
});

test("a sign-in that can't be made gives the yes back, so the visit can be tried again", async () => {
  const w = await world();
  const { request } = (await w.askPress()).body;
  await w.answer(OWNER, request.id, true);
  w.shopAccess.fail = true;
  assert.equal((await w.openWith(request.id)).status, 500);
  assert.equal((await w.requests.forShop(SHOP))[0].status, "approved");
  w.shopAccess.fail = false;
  assert.equal((await w.openWith(request.id)).status, 200);
});

test("a request runs out after 24 hours, answered or not", async () => {
  const w = await world();
  const first = (await w.askPress()).body.request;
  w.tick(REQUEST_HOURS * HOUR);
  const late = await w.answer(OWNER, first.id, true);
  assert.equal(late.status, 409);
  assert.match(late.body.message, /ran out after 24 hours/);
  assert.equal((await w.requests.forShop(SHOP))[0].status, "expired");

  // Approved, then left unused past the 24 hours: it no longer opens the shop.
  const second = (await w.askPress()).body.request;
  w.tick(HOUR);
  await w.answer(OWNER, second.id, true);
  w.tick(REQUEST_HOURS * HOUR);
  const stale = await w.openWith(second.id);
  assert.equal(stale.status, 409);
  assert.match(stale.body.message, /ran out after 24 hours/);
  assert.equal(w.shopAccess.calls.length, 0);
  assert.equal(statusAt({ status: "used", expiresAt: "2000-01-01T00:00:00Z" }, Date.now()), "used", "a used request stays used");
});

test("declined: the admin can't open the shop to make changes", async () => {
  const w = await world();
  const { request } = (await w.askPress()).body;
  const no = await w.answer(OWNER, request.id, false);
  assert.deepEqual([no.status, no.body.request.status], [200, "declined"]);
  assert.ok(w.logged().some((e) => e.what === "support-access-declined"));
  const refused = await w.openWith(request.id);
  assert.equal(refused.status, 403);
  assert.match(refused.body.message, /said no/);
  assert.equal((await w.answer(OWNER, request.id, true)).status, 409, "an answer stands");
  assert.equal(w.shopAccess.calls.length, 0);
});

test("another person's shop is refused: its requests, its answers and its requests used elsewhere", async () => {
  const w = await world();
  const { request } = (await w.askPress()).body;
  assert.equal((await w.ask(OTHER_OWNER, "GET", `/api/account/access-requests?shopId=${SHOP}`)).status, 403);
  const stranger = await w.answer(OTHER_OWNER, request.id, true);
  assert.equal(stranger.status, 403);
  assert.equal((await w.answer(OTHER_OWNER, "made-up-id", true)).status, 403, "no hint whether a request exists");
  assert.equal((await w.requests.forShop(SHOP))[0].status, "waiting");
  // The same request can't open another shop.
  await w.answer(OWNER, request.id, true);
  assert.equal((await w.openWith(request.id, OTHER_SHOP)).status, 404);
  // Only control-room admins ask or open.
  assert.equal((await w.ask(OWNER, "POST", "/api/control/act-as", { shopId: SHOP, mode: "edit", requestId: request.id })).status, 403);
  assert.equal((await w.ask(OWNER, "POST", "/api/control/access-requests", { shopId: SHOP })).status, 403);
  assert.equal(w.shopAccess.calls.length, 0);
});

test("view mode still works without a yes; the account page lists the last 10 visits", async () => {
  const w = await world();
  for (let i = 0; i < VISITS_SHOWN + 2; i += 1) {
    w.tick(60_000);
    const look = await w.ask(w.admin(), "POST", "/api/control/act-as", { shopId: SHOP, reason: `looking at the orders page, visit ${i}` });
    assert.equal(look.status, 200);
  }
  assert.ok(w.shopAccess.calls.every((c) => c.mode === "view"));
  assert.equal(w.store.rows.size, 0, "no request needed to look");
  const { body } = await w.ask(OWNER, "GET", `/api/account/access-requests?shopId=${SHOP}`);
  assert.equal(body.visits.length, VISITS_SHOWN);
  assert.deepEqual([body.visits[0].by, body.visits[0].mode, body.visits[0].reason], ["admin@example.com", "view", `looking at the orders page, visit ${VISITS_SHOWN + 1}`]);
  // The control room sees the shop's requests too.
  await w.askPress();
  const listed = await w.ask(w.admin(), "POST", "/api/control/access-requests", { shopId: SHOP });
  assert.deepEqual(listed.body.requests.map((r) => r.status), ["waiting"]);
});

test("the pages: the shop drawer asks the press and opens on a yes; the account page answers and lists visits", () => {
  const room = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(room, /"Ask the press"/);
  assert.match(room, /"Open their admin"/);
  assert.doesNotMatch(room, /button\("Make changes"/);
  const account = readFileSync(new URL("../accounts/app.js", import.meta.url), "utf8");
  for (const path of ["/account/access-requests?shopId=", "/account/access-requests/answer"]) assert.ok(account.includes(path), path);
  assert.match(account, /"Approve"/);
  assert.match(account, /"Decline"/);
  assert.match(readFileSync(new URL("../accounts/index.html", import.meta.url), "utf8"), /id="access-requests"/);
});
