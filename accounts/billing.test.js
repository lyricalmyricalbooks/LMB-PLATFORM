// The billing door (code plan 6.4) and the Plan & billing page (6.5), against the real billing service and the pretend
// Stripe: only the shop's owner (from the shop's own team) gets in, every call is logged, each reaches the billing
// service once, card pages come back only to /account/billing; and the page's words for each state, with pretend data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAccounts } from "./accounts.js";
import { billingRoutes } from "./billingRoutes.js";
import { billingWords, planChangeWords } from "./billingWords.js";
import { fakeAccountStores, fakeShopData } from "./fakes.js";
import { createApi } from "../signup/api.js";
import { fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
import { createBilling } from "../services/billing/billing.js";
import { createPaymentWay } from "../services/billing/paymentWay.js";
import { fakeFeeLedgerStore } from "../services/payments/feeLedgerFakes.js";
import { fakeBillingStores, fakeBillingStripe, fakePlatformEmail } from "../services/billing/fakes.js";
import { createStripeApi } from "../services/payments/stripeApi.js";
import { platformSettings } from "../services/settings.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const OWNER = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SECOND_OWNER = { uid: "uid-bea", email: "bea@example.com", email_verified: true };
const STAFF = { uid: "uid-cal", email: "cal@example.com", email_verified: true };
const BOOKKEEPER = { uid: "uid-dee", email: "dee@example.com", email_verified: true };
const STRANGER = { uid: "uid-eve", email: "eve@example.com", email_verified: true };
const SHOP = "moth-press";
const NOW = Date.parse("2026-10-28T12:00:00Z");

async function world() {
  const settings = platformSettings({});
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", plan: "both", status: "live", ownerEmail: OWNER.email });
  const auditLog = fakeAuditLog();
  const email = fakePlatformEmail();
  const stripe = fakeBillingStripe({ clock: () => NOW / 1000 });
  const deps = {
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings, ...fakeBillingStores(), registry, auditLog, email, now: () => NOW,
  };
  const real = createBilling(deps);
  const paymentWay = createPaymentWay({ ...deps, billing: real, feeLedger: fakeFeeLedgerStore(), live: async () => ({ payAsYouSell: { basisPoints: 200 }, foundingOffer: { percentOff: 25 } }) });
  await real.startTrial({ account: { accountId: OWNER.uid, email: OWNER.email }, shopId: SHOP, pressName: "Moth Press", plan: "both" });

  // Counts each call that reaches the billing service.
  const calls = [];
  const billing = Object.fromEntries(["status", "cardLink", "cancel", "keep", "changePlan", "invoices"].map((name) => [name, (...args) => {
    calls.push(name);
    return real[name](...args);
  }]));

  const stores = fakeAccountStores();
  const signupStores = fakeSignupStores();
  const accounts = createAccounts({ accounts: signupStores.accounts, ...stores, registry, shopData: fakeShopData(), auditLog, email, settings, now: () => new Date(NOW) });
  for (const [person, role] of [[SECOND_OWNER, "owner"], [STAFF, "staff"], [BOOKKEEPER, "bookkeeper"]]) {
    await stores.memberships.set(SHOP, person.email, { shopId: SHOP, email: person.email, accountId: person.uid, role });
  }
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings, routes: billingRoutes({ billing, paymentWay, accounts, registry, auditLog, settings, now: () => new Date(NOW) }) });
  const ask = (claims, route, body = {}) => api({ method: "POST", path: `/api/billing/${route}`, body: { shopId: SHOP, ...body }, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const logged = () => [...registry.events.get(SHOP).values()].filter((e) => e.source === "billing-door");
  return { ask, calls, stripe, registry, auditLog, logged, real };
}

const ROUTES = ["status", "card", "cancel", "keep", "change-plan", "invoices"];

test("staff, a bookkeeper, strangers and the signed-out are refused every billing call, and the refusals are logged", async () => {
  const w = await world();
  for (const route of ROUTES) {
    for (const person of [STAFF, BOOKKEEPER, STRANGER]) {
      const answer = await w.ask(person, route, { plan: "shop" });
      assert.equal(answer.status, 403, `${person.email} ${route}`);
      assert.match(answer.body.message, /Only the shop's owner/);
    }
    const signedOut = await (await world()).ask(null, route);
    assert.equal(signedOut.status, 401);
  }
  assert.deepEqual(w.calls, [], "nothing reached billing");
  assert.equal(w.logged().length, ROUTES.length * 3);
  assert.ok(w.logged().every((e) => e.outcome === "refused"));
  assert.equal(w.stripe.requests.filter((r) => r.method === "POST" && r.path.startsWith("/v1/subscriptions/")).length, 0);
});

test("the owner's calls each reach billing once and are logged, a second owner from the shop's team too", async () => {
  const w = await world();
  const expect = { status: "status", card: "cardLink", cancel: "cancel", keep: "keep", "change-plan": "changePlan", invoices: "invoices" };
  for (const route of ROUTES) {
    const before = w.calls.length;
    const answer = await w.ask(OWNER, route, { plan: "shop" });
    assert.equal(answer.status, 200, `${route}: ${answer.body.message}`);
    assert.deepEqual(w.calls.slice(before), [expect[route]], route);
  }
  assert.deepEqual(w.logged().map((e) => [e.what, e.by, e.outcome]), ROUTES.map((route) => [`billing-${route}`, OWNER.email, "done"]));
  assert.equal([...w.auditLog.entries.get(SHOP).values()].filter((e) => e.source === "billing-door").length, ROUTES.length);
  assert.equal((await w.ask(SECOND_OWNER, "status")).status, 200);
});

test("the answers: status, a preview that changes nothing, then the change; cancel and keep", async () => {
  const w = await world();
  const { billing } = (await w.ask(OWNER, "status")).body;
  assert.deepEqual([billing.plan, billing.planName, billing.price, billing.status, billing.trialDaysLeft, billing.hasCard], ["both", "Shop and stockroom", "$39.00", "trialing", 14, false]);
  assert.equal(JSON.stringify(billing).includes("cus_"), false, "no Stripe ids reach the page");

  const { preview } = (await w.ask(OWNER, "change-plan", { plan: "shop", preview: true })).body;
  assert.deepEqual([preview.closes, preview.immediate], [["stockroom"], true]);
  assert.equal((await w.real.status(SHOP)).plan, "both", "the preview changed nothing");
  assert.deepEqual((await w.ask(OWNER, "change-plan", { plan: "shop" })).body, { ok: true, plan: "shop", changed: true });
  assert.equal((await w.ask(OWNER, "change-plan", { plan: "gold" })).status, 400);

  assert.equal((await w.ask(OWNER, "cancel")).body.cancelAtPeriodEnd, true);
  assert.equal((await w.ask(OWNER, "keep")).body.cancelAtPeriodEnd, false);
  assert.deepEqual((await w.ask(OWNER, "invoices")).body.invoices, []);
  assert.equal((await w.ask(OWNER, "status", { shopId: "" })).status, 400);
});

test("two ways to pay: the owner sees how the shop pays and switches to pay as you sell; others are refused", async () => {
  const w = await world();
  for (const person of [STAFF, BOOKKEEPER, STRANGER]) {
    assert.equal((await w.ask(person, "payment-way")).status, 403);
    assert.equal((await w.ask(person, "payment-way/switch", { to: "payAsYouSell" })).status, 403);
  }
  const first = (await w.ask(OWNER, "payment-way")).body;
  assert.equal(first.view.title, "How you pay");
  assert.equal(first.view.button.to, "payAsYouSell");
  assert.match(first.view.lines.join(" "), /2% of your website sales, never more than \$39 a month/);
  const switched = (await w.ask(OWNER, "payment-way/switch", { to: "payAsYouSell" })).body;
  assert.equal(switched.changed, true);
  assert.equal(switched.view.way, "payAsYouSell");
  assert.equal(switched.view.button.to, "monthly");
  assert.equal((await w.ask(OWNER, "payment-way/switch", { to: "payAsYouSell" })).body.changed, false, "a repeat changes nothing");
  assert.ok(w.logged().some((e) => e.what === "billing-payment-way-switch" && e.outcome === "done"));
});

test("the card page comes back only to this shop's Plan & billing page, whatever the page asks", async () => {
  const w = await world();
  const answer = await w.ask(OWNER, "card", { returnUrl: "https://evil.example/" });
  const session = w.stripe.world.sessions.get(answer.body.url.split("/").pop());
  assert.equal(session.success_url, "https://platform.example/account/billing?shop=moth-press&card=added");
  const cancelUrl = w.stripe.requests.find((r) => r.path === "/v1/checkout/sessions").params.cancel_url;
  assert.equal(cancelUrl, "https://platform.example/account/billing?shop=moth-press");
});

// ── The page's words, with pretend data ──
const PLANS = [{ plan: "shop", name: "Shop", price: "$29.00", apps: ["shop"] }, { plan: "stockroom", name: "Stockroom", price: "$19.00", apps: ["stockroom"] }, { plan: "both", name: "Shop and stockroom", price: "$39.00", apps: ["shop", "stockroom"] }];
const base = { plan: "both", planName: "Shop and stockroom", price: "$39.00", plusTax: false, status: "trialing", access: "open", trialEnd: "2026-11-11T12:00:00Z", trialDaysLeft: 9, currentPeriodEnd: "2026-11-11T12:00:00Z", nextPaymentAt: null, cancelAtPeriodEnd: false, hasCard: false, card: null, appsClosing: null, closedApps: {}, plans: PLANS };

test("the page says where the plan stands in each state", () => {
  assert.match(billingWords(base).when, /^Free trial: 9 days left, until 11 November 2026\. Add a card/);
  assert.match(billingWords(base).card, /No card yet/);
  const card = { brand: "visa", last4: "4242", expMonth: 4, expYear: 2029 };
  const withCard = billingWords({ ...base, hasCard: true, card, plusTax: true });
  assert.match(withCard.when, /first payment of \$39\.00, plus tax is on 11 November 2026/);
  assert.equal(withCard.card, "Visa ending 4242, runs out 04/2029.");
  assert.match(billingWords({ ...base, status: "active", hasCard: true, card, nextPaymentAt: "2026-12-11T12:00:00Z" }).when, /^Next payment: \$39\.00 on 11 December 2026\.$/);
  assert.equal(billingWords({ ...base, status: "past_due", hasCard: true }).state, "Payment problem");
  assert.match(billingWords({ ...base, status: "paused", access: "paused" }).when, /paused\. Add a card/);
  const cancelled = billingWords({ ...base, status: "active", cancelAtPeriodEnd: true });
  assert.equal(cancelled.state, "Cancelled");
  assert.match(cancelled.cancel, /Keep your plan any time before 11 November 2026/);
  assert.equal(billingWords({ ...base, status: "canceled", access: "closed" }).state, "Closed");
  assert.match(billingWords({ ...base, appsClosing: { apps: ["stockroom"], at: "2026-11-11T12:00:00Z" } }).closing, /doesn't have the stockroom\. It stays open until 11 November 2026.*90 days/);
});

test("the plan change says what changes and the prorated amount before anything happens", () => {
  const up = planChangeWords({ planName: "Shop and stockroom", price: "$39.00", adds: ["shop"], closes: [], immediate: false, prorated: { amount: 1000, text: "$10.00" } }, { ...base, status: "active" });
  assert.deepEqual(up, ["You move to the Shop and stockroom plan, $39.00 a month.", "The shop opens straight away.", "For the rest of this month you pay $10.00, added to your next bill."]);
  const down = planChangeWords({ planName: "Shop", price: "$29.00", adds: [], closes: ["stockroom"], immediate: false, closesAt: "2026-11-11T12:00:00Z", downloadUntil: "2027-02-09T12:00:00Z", prorated: null }, { ...base, status: "active" });
  assert.match(down[1], /^The stockroom stays open until 11 November 2026, the end of the month you've paid for, then closes\. You can download everything in it until 9 February 2027\.$/);
  assert.equal(down[2], "Your new price starts with your next payment.");
  const trial = planChangeWords({ planName: "Shop", price: "$29.00", adds: [], closes: ["stockroom"], immediate: true, downloadUntil: "2027-01-26T12:00:00Z" }, base);
  assert.match(trial[1], /^The stockroom closes now/);
  assert.match(trial[2], /free trial, so this happens now and costs nothing today/);
});

test("the page: every part of the plan, a spot for the two ways to pay, text only, plain words, no rival named", () => {
  const page = readFileSync(new URL("./billing.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./billing.js", import.meta.url), "utf8");
  const words = readFileSync(new URL("./billingWords.js", import.meta.url), "utf8");
  for (const id of ["view-loading", "view-error", "view-none", "view-signin", "plan-price", "card-button", "change-form", "change-preview", "invoices", "cancel-button", "keep-button", "payment-way"]) {
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  assert.match(page, /name="viewport" content="width=device-width/);
  assert.match(page, /<script type="module" src="\/accounts\/billing\.js">/, "the script loads from its own folder at /account/billing");
  for (const route of ROUTES) assert.ok(app.includes(`"/billing/${route}"`), `the page calls ${route}`);
  assert.match(app, /No invoices yet/);
  assert.match(app, /Change card/);
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(app + words, /node:/);
  const all = (page.replace(/<!--[\s\S]*?-->/g, "") + app + words).toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!all.includes(rival), rival);
  const shown = (page.replace(/<!--[\s\S]*?-->|<style[\s\S]*?<\/style>|<[^>]+>/g, " ") + [...(app + words).matchAll(/"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2]).filter((s) => / /.test(s)).join(" ")).toLowerCase();
  for (const word of ["firebase", "google cloud", " api ", "webhook", "secret", "deploy", "stripe"]) assert.ok(!shown.includes(word), `the page says "${word.trim()}"`);
  // The account page's shop card links here for owners.
  assert.match(readFileSync(new URL("./app.js", import.meta.url), "utf8"), /\/account\/billing\?shop=/);
});
