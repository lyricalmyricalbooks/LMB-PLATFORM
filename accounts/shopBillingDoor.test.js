// The billing hub's door from the shop's own admin (code plan 22.3): a pass from the shop's own project, the owner only,
// a pass from any other project refused before it's read, the two-step rule for paid plans with the account page to
// finish on, card pages that come back to the admin, CORS for the browser, and every call logged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccounts } from "./accounts.js";
import { createShopBillingDoor, hubPage } from "./shopBillingDoor.js";
import { fakeAccountStores, fakeShopData } from "./fakes.js";
import { fakeSignupStores } from "../signup/fakes.js";
import { createBilling } from "../services/billing/billing.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "../services/billing/fakes.js";
import { createStripeApi } from "../services/payments/stripeApi.js";
import { platformSettings } from "../services/settings.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const SHOP = "moth-press";
const NOW = Date.parse("2026-11-03T12:00:00Z");

/** A pass shaped like Firebase's (header.payload.signature); the pretend verifier checks the project and "signature". */
const pass = (claims, signature = "signed") => [Buffer.from('{"alg":"RS256"}').toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
const OWNER = { aud: SHOP, uid: "shop-uid-1", email: "Owner@example.com", email_verified: true };

async function world({ exports = null } = {}) {
  const settings = platformSettings({});
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, projectId: SHOP, pressName: "Moth Press", plan: "both", status: "live", ownerEmail: "owner@example.com" });
  await registry.createShop("press-two", { shopId: "press-two", projectId: "press-two", plan: "shop", status: "live", ownerEmail: "two@example.com" });
  const auditLog = fakeAuditLog();
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const stores = fakeBillingStores();
  const billing = createBilling({ stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake" } }), mode: "test", settings, ...stores, registry, auditLog, email: fakePlatformEmail(), now: () => NOW });
  await billing.startTrial({ account: { accountId: "acct-1", email: "owner@example.com" }, shopId: SHOP, pressName: "Moth Press", plan: "both" });
  const signupStores = fakeSignupStores();
  const accountStores = fakeAccountStores();
  const accounts = createAccounts({ accounts: signupStores.accounts, ...accountStores, registry, shopData: fakeShopData(), auditLog, email: fakePlatformEmail(), settings, now: () => new Date(NOW) });
  await accountStores.memberships.set(SHOP, "staff@example.com", { shopId: SHOP, email: "staff@example.com", role: "staff" });
  const checked = [];
  const verifierFor = (project) => async (token) => {
    checked.push(project);
    const [, payload, signature] = token.split(".");
    if (signature !== "signed") throw new Error("bad signature");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (claims.aud !== project) throw new Error("wrong project");
    return claims;
  };
  const door = createShopBillingDoor({ billing, exports, accounts, registry, auditLog, settings, verifierFor, now: () => new Date(NOW), log: () => {} });
  const ask = (claims, call, body = {}, { method = "POST", token } = {}) => door({ method, path: `/api/shop-billing/${call}`, body: { shopId: SHOP, ...body }, headers: claims || token ? { authorization: `Bearer ${token ?? pass(claims)}` } : {} });
  const logged = () => [...registry.events.get(SHOP).values()].filter((e) => e.source === "shop-billing-door");
  return { ask, door, registry, stores, checked, logged, settings };
}

test("the shop's owner, signed in to the shop's own admin, sees the plan, with CORS for the browser", async () => {
  const { ask, logged } = await world();
  const answer = await ask(OWNER, "status");
  assert.equal(answer.status, 200);
  assert.equal(answer.body.billing.status, "trialing");
  assert.equal(answer.body.changesNeedTwoStep, false, "a trial needs no second step");
  assert.equal(answer.body.accountPage, "https://platform.example/account/billing?shop=moth-press");
  assert.equal(answer.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(answer.headers["Access-Control-Allow-Credentials"], undefined, "never with cookies");
  assert.deepEqual(logged().map((e) => [e.what, e.by, e.outcome]), [["billing-status", "owner@example.com", "done"]]);
  const preflight = await ask(null, "status", {}, { method: "OPTIONS" });
  assert.equal(preflight.status, 200);
  assert.match(preflight.headers["Access-Control-Allow-Headers"], /Authorization/);
});

test("a pass from any other project is refused before it is checked or read, even with the owner's address", async () => {
  const { ask, checked, logged } = await world();
  for (const aud of ["press-two", "someone-elses-project"]) {
    const answer = await ask({ ...OWNER, aud }, "status");
    assert.equal(answer.status, 403);
  }
  assert.deepEqual(checked, [], "no sign-in check was even started");
  assert.equal(logged().length, 0);
  // Right project, forged signature.
  assert.equal((await ask(null, "status", {}, { token: pass(OWNER, "forged") })).status, 401);
});

test("staff, an unconfirmed address and no sign-in are turned away; a shop that isn't ours too", async () => {
  const { ask, door, logged } = await world();
  assert.equal((await ask({ ...OWNER, email: "staff@example.com" }, "status")).status, 403);
  assert.equal((await ask({ ...OWNER, email_verified: false }, "status")).status, 403);
  assert.equal((await ask(null, "status")).status, 401);
  assert.equal((await door({ method: "POST", path: "/api/shop-billing/status", body: { shopId: "no-such-shop" }, headers: { authorization: `Bearer ${pass({ ...OWNER, aud: "no-such-shop" })}` } })).status, 403);
  assert.equal((await ask(OWNER, "not-a-call")).status, 404);
  assert.deepEqual(logged().map((e) => e.outcome), ["refused"]);
});

test("the card page comes back to the shop's own admin", async () => {
  const { ask, registry } = await world();
  const answer = await ask(OWNER, "card");
  assert.equal(answer.status, 200);
  assert.ok(answer.body.url);
  assert.equal(hubPage(await registry.getShop(SHOP)), "https://moth-press.web.app/admin#settings/billing");
});

test("on a paid plan, changes need the second step: the hub is told and given the account page to finish on", async () => {
  const { ask, registry, stores, logged } = await world();
  await registry.updateShop(SHOP, { billing: { status: "active" } });
  stores.subscriptions.rows.get(SHOP).status = "active";
  const status = await ask(OWNER, "status");
  assert.equal(status.body.changesNeedTwoStep, true);
  const refused = await ask(OWNER, "cancel");
  assert.equal(refused.status, 403);
  assert.equal(refused.body.twoStep, true);
  assert.equal(refused.body.accountPage, "https://platform.example/account/billing?shop=moth-press");
  assert.equal(stores.subscriptions.rows.get(SHOP).cancelAtPeriodEnd, false, "nothing changed");
  // Looking stays free; a pass with the second step goes through.
  assert.equal((await ask(OWNER, "invoices")).status, 200);
  assert.equal((await ask(OWNER, "change-plan", { plan: "shop", preview: true })).status, 200);
  const done = await ask({ ...OWNER, firebase: { sign_in_second_factor: "totp" } }, "cancel");
  assert.equal(done.status, 200);
  assert.ok(logged().some((e) => e.what === "billing-cancel" && e.outcome === "refused: needs two-step sign-in"));
});

test("a billing refusal reaches the hub in plain words, and the hub's own calls go through", async () => {
  const { ask } = await world();
  const refused = await ask(OWNER, "payment-methods/primary", { cardId: "pm_nope" });
  assert.equal(refused.status, 404);
  assert.match(refused.body.message, /isn't saved on your account/);
  const failed = await ask(OWNER, "details/save", { email: "books@moth.example", taxNumber: "123456789RT0001" });
  assert.equal(failed.status, 200);
});

test("Download all your data from the shop's Plan page: the owner's once-a-day copy, emailed to the owner", async () => {
  const asked = [];
  const exports = { async forOwner(claims, { shopId }) { asked.push([claims.uid, claims.email, shopId]); return { shopId, emailedTo: "owner@example.com", expiresAt: "2026-11-10T12:00:00.000Z", extra: "not passed on" }; } };
  const { ask, logged } = await world({ exports });
  assert.equal((await ask({ ...OWNER, email: "staff@example.com" }, "download")).status, 403);
  assert.deepEqual(asked, [], "staff are turned away before a copy is asked for");
  const answer = await ask(OWNER, "download");
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { ok: true, emailedTo: "owner@example.com", expiresAt: "2026-11-10T12:00:00.000Z" });
  assert.deepEqual(asked, [["shop-uid-1", "Owner@example.com", SHOP]]);
  assert.deepEqual(logged().map((e) => [e.what, e.outcome]), [["billing-download", "refused"], ["billing-download", "done"]]);
  // A copy whose email couldn't go keeps its own words (a 502 from services/export), with a code to quote.
  const { ControlError } = await import("../control-room/controlRoom.js");
  const failing = await world({ exports: { async forOwner() { throw new ControlError(502, "The copy of the shop's data couldn't be made just now. Nothing was sent; try again in a few minutes."); } } });
  const failed = await failing.ask(OWNER, "download");
  assert.equal(failed.status, 502);
  assert.match(failed.body.message, /^The copy of the shop's data couldn't be made just now/);
  assert.ok(failed.body.ref);
  // A door with no export service has no download call.
  assert.equal((await (await world()).ask(OWNER, "download")).status, 404);
});
