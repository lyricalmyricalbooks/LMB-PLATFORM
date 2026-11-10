// The whole road a press travels (code plan 6.14, which takes in 5.13), with the real modules joined by their fakes
// (walkthrough/world.js): sign up → the shop maker's setup steps (a dry run first, then for real against a pretend
// Google) → the account page and the control room see the new shop → the owner picks a look → the free trial → a card →
// a failed payment → the plan pauses → a card opens it again → no downgrade, and an older one-app shop given both. Each step asserts what the next one reads, so
// two services that disagree about a field fail here and not in front of a press.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DAY, adminClaims, person, platformWorld } from "./walkthrough/world.js";
import { PUBLISHES, QUESTION } from "./signup/form.js";
import { createShopMaker, shopFromSignup } from "./signup/shopMaker.js";
import { TERMS_VERSION } from "./terms/terms.js";
import { OWNER_WELCOME } from "./setup/later-steps.js";

const ADA = person("uid-ada", "owner@example.com", "Ada");
const STRANGER = person("uid-eve", "eve@example.com");
const signUpDetails = { pressName: "Moth Press", plan: "both", country: "CA", [QUESTION.id]: "fairs", [PUBLISHES.id]: "zines", termsAccepted: true, termsVersion: TERMS_VERSION };

const shopOf = async (w, shopId) => (await w.ask(adminClaims(w.clock), "GET", "/api/control/shops")).body.shops.find((s) => s.shopId === shopId);
const today = async (w) => (await w.ask(adminClaims(w.clock), "GET", "/api/control/today")).body;
const mine = async (w) => (await w.ask(ADA, "GET", "/api/accounts/shops")).body.shops.find((s) => s.pressName === "Moth Press");
const planDoc = (w, shopId) => w.doc(shopId, "platform/plan");
const statusDoc = (w, shopId) => w.doc(shopId, "platform/status");
const sent = (w, kind) => w.email.list().filter((m) => m.kind === kind);

/** The owner adds a card through Stripe's own page (the pretend one), as the Plan & billing page sends them. */
async function addCard(w, shopId) {
  const asked = await w.ask(ADA, "POST", "/api/billing/card", { shopId });
  assert.equal(asked.status, 200);
  const sessionId = asked.body.url.split("/").pop();
  const answer = await w.stripeEvent("checkout.session.completed", w.stripe.completeSetup(sessionId));
  assert.equal(answer.status, 200);
}

test("the whole road: sign up, a shop made, a look picked, a trial, a card, a failed payment, a pause, a card, no downgrade, every app", async () => {
  const w = platformWorld({ suffix: () => "k3f9q" });
  const START = w.clock.ms();

  // ── Sign up ──
  const plans = (await w.ask(null, "GET", "/api/plans")).body;
  assert.equal(plans.signupOpen, true);
  assert.deepEqual(plans.plans.map((p) => p.plan), ["both"]);
  assert.equal((await w.ask(null, "POST", "/api/signup", signUpDetails)).status, 401, "signed in first");

  const signed = await w.ask(ADA, "POST", "/api/signup", signUpDetails);
  assert.equal(signed.status, 200);
  const { shopId } = signed.body;
  assert.equal(shopId, "moth-press-k3f9q");
  assert.equal(signed.body.status, "queued");
  assert.equal(signed.body.trialEnd, new Date(START + 14 * DAY).toISOString(), "the trial starts at sign-up, with no card");
  assert.equal((await w.stores.accounts.get(ADA.uid)).shops[shopId], "owner");
  // The shop doesn't exist yet: neither the registry nor its database knows its plan.
  assert.equal(await w.registry.getShop(shopId), null);
  assert.equal(planDoc(w, shopId), null);
  assert.equal((await w.billing.status(shopId)).status, "trialing");
  assert.equal((await w.ask(ADA, "GET", "/api/signup")).body.shops[0].status, "queued");

  // ── The shop maker: a dry run changes nothing, then the real run ──
  const row = await w.stores.signups.get(shopId);
  const dry = await w.run(shopFromSignup(row, { testMode: true }), { dryRun: true });
  assert.equal(dry.ok, true);
  assert.ok(dry.ran.every((step) => step.status === "would-run"), "a dry run only says what it would do");
  assert.equal(await w.registry.getShop(shopId), null);
  assert.deepEqual(w.google.calls, [], "and calls nothing");

  assert.deepEqual(await w.shopMaker.sweep(), [{ shopId, status: "ready" }]);
  const ready = (await w.ask(ADA, "GET", "/api/signup")).body.shops[0];
  assert.equal(ready.status, "ready");
  assert.equal(ready.siteUrl, `https://${shopId}.web.app`);
  const shop = await w.registry.getShop(shopId);
  assert.deepEqual([shop.status, shop.plan, shop.ownerEmail, shop.pressName], ["live", "both", "owner@example.com", "Moth Press"]);
  assert.ok(w.services.world.sent.has(`${shopId} ${OWNER_WELCOME}`), "the owner has the way in");
  // The shop maker handed the new shop its plan, in the registry and in the shop's own database.
  assert.deepEqual([shop.billing.status, shop.billing.access, shop.billing.hasCard], ["trialing", "open", false]);
  assert.equal(shop.billing.trialEnd, new Date(START + 14 * DAY).toISOString());
  assert.deepEqual([planDoc(w, shopId).state, planDoc(w, shopId).plan, planDoc(w, shopId).access, planDoc(w, shopId).hasCard], ["trial", "both", "open", false]);
  assert.equal(planDoc(w, shopId).link, `${w.settings.platformUrl}/account/billing?shop=${shopId}`);
  assert.equal(statusDoc(w, shopId).access, "open");
  // The sign-up answers reached the shop's setup guide, in the words the shop's admin reads.
  const start = w.doc(shopId, "firstWeek/start");
  const { createdAt, ...answers } = start;
  assert.equal(typeof createdAt, "string");
  assert.deepEqual(answers, { sellingToday: "fairs", publishes: "zines", country: "CA", plan: "both" });
  // The trial began before the shop existed, so it is in the registry's record of the shop.
  assert.ok([...w.registry.events.get(shopId).values()].some((e) => e.what === "trial-started"), "the trial is on the shop's record");

  // ── The owner's account page and the control room both see the shop ──
  const card = await mine(w);
  assert.deepEqual([card.role, card.status, card.plan, card.access], ["owner", "live", "both", "open"]);
  assert.ok(card.adminUrl.startsWith(`https://${shopId}.web.app`));
  assert.equal((await w.ask(STRANGER, "GET", "/api/accounts/shops")).body.shops.length, 0, "a stranger sees nothing");
  assert.equal((await w.ask(ADA, "GET", "/api/control/shops")).status, 403, "the control room is for platform admins");
  const listed = await shopOf(w, shopId);
  assert.deepEqual([listed.plan, listed.status, listed.billingStatus, listed.access, listed.ownerEmail], ["both", "live", "trialing", "open", "owner@example.com"]);
  assert.notEqual(listed.health.level, "problem", listed.health.reasons.join("; "));
  let numbers = await today(w);
  assert.deepEqual([numbers.counts.shops, numbers.counts.live, numbers.counts.trial, numbers.counts.paying, numbers.counts.signupsThisWeek], [1, 1, 1, 0, 1]);
  assert.deepEqual(numbers.needs, []);

  // ── The owner opens the admin and picks a look (Choose your look, plan 6.3) ──
  assert.equal(start.welcome, undefined, "the welcome has not been done, so the admin shows it");
  // Every answer sign-up can write has suggested looks in the shop's own list.
  const chooseLook = readFileSync("apps/shop/src/app/admin/lookGallery.ts", "utf8");
  const suggested = Object.fromEntries([...chooseLook.matchAll(/^\s+(\w+): \[((?:"[\w-]+",?\s*)+)\],?$/gm)].map((m) => [m[1], [...m[2].matchAll(/"([\w-]+)"/g)].map((t) => t[1])]));
  for (const option of PUBLISHES.options) assert.ok(suggested[option.id]?.length >= 2, `the shop suggests looks for "${option.id}"`);
  const pickedTheme = suggested[start.publishes][0];
  // What the admin writes when the owner chooses (`updateFirstWeek({ welcome })`): merged into the same document.
  await w.services.shopData.set(shopId, "firstWeek/start", { ...start, welcome: { theme: pickedTheme, at: w.clock.date().toISOString() } });
  assert.equal(w.doc(shopId, "firstWeek/start").welcome.theme, "press-gutter");
  assert.equal(w.doc(shopId, "firstWeek/start").publishes, "zines", "choosing a look keeps the sign-up answers");

  // ── The trial ──
  w.clock.days(11);
  assert.equal(w.stripe.world.subscriptions.size, 1, "one subscription for the one shop");
  const [sub] = [...w.stripe.world.subscriptions.keys()];
  await w.stripeEvent("customer.subscription.trial_will_end", w.stripe.subscription(sub));
  const warning = sent(w, "trial-ending")[0];
  assert.deepEqual([warning.to, warning.data.hasCard, warning.data.link], ["owner@example.com", false, planDoc(w, shopId).link]);

  // ── A card ──
  const stranger = await w.ask(STRANGER, "POST", "/api/billing/card", { shopId });
  assert.equal(stranger.status, 403, "only the shop's owner can add a card");
  await addCard(w, shopId);
  assert.equal(planDoc(w, shopId).hasCard, true);
  assert.equal(planDoc(w, shopId).nextPaymentAt, planDoc(w, shopId).trialEnd, "the trial's end is the first payment");
  assert.equal((await shopOf(w, shopId)).billingStatus, "trialing");
  assert.equal((await w.registry.getShop(shopId)).billing.hasCard, true);

  // The trial ends and the first month is paid.
  w.clock.days(3);
  await w.stripeEvent("customer.subscription.updated", w.stripe.payMonth(sub));
  assert.equal(planDoc(w, shopId).state, "active");
  numbers = await today(w);
  assert.deepEqual([numbers.counts.trial, numbers.counts.paying, numbers.monthlyIncome], [0, 1, 500]);

  // ── A failed payment: the shop stays open, the press is told, the control room hears ──
  w.clock.days(30);
  w.stripe.world.subscriptions.get(sub).status = "past_due";
  await w.stripeEvent("invoice.payment_failed", { id: "in_late", currency: "cad", amount_due: 3900, attempt_count: 1, next_payment_attempt: w.clock.ms() / 1000 + 3 * 86400, parent: { subscription_details: { subscription: sub } } });
  await w.stripeEvent("customer.subscription.updated", w.stripe.subscription(sub));
  const failed = sent(w, "payment-failed")[0];
  assert.deepEqual([failed.to, failed.data.price], ["owner@example.com", "$39.00"]);
  assert.deepEqual([planDoc(w, shopId).state, statusDoc(w, shopId).access], ["payment-problem", "open"]);
  numbers = await today(w);
  assert.equal(numbers.counts.failedPayments, 1);
  assert.ok(numbers.needs.some((n) => n.kind === "payment" && n.shopId === shopId), "the control room's Needs you list has it");

  // ── Pause: Stripe gives up on the card ──
  w.stripe.world.subscriptions.get(sub).status = "paused";
  await w.stripeEvent("customer.subscription.paused", w.stripe.subscription(sub));
  assert.equal(sent(w, "card-needed").length, 1);
  assert.deepEqual([planDoc(w, shopId).state, planDoc(w, shopId).access, statusDoc(w, shopId).access], ["paused", "paused", "paused"]);
  assert.equal((await mine(w)).access, "paused", "the account page says so");
  const paused = await shopOf(w, shopId);
  assert.equal(paused.access, "paused");
  assert.ok(paused.health.reasons.some((r) => /paused until a card is added/.test(r)));
  numbers = await today(w);
  assert.deepEqual([numbers.counts.paused, numbers.counts.failedPayments], [1, 0]);

  // ── A card opens it again, at once ──
  await addCard(w, shopId);
  assert.equal(w.stripe.world.subscriptions.get(sub).status, "active");
  assert.deepEqual([planDoc(w, shopId).state, planDoc(w, shopId).access, statusDoc(w, shopId).access, planDoc(w, shopId).hasCard], ["active", "open", "open", true]);
  assert.equal((await mine(w)).access, "open");
  assert.equal((await shopOf(w, shopId)).access, "open");
  numbers = await today(w);
  assert.deepEqual([numbers.counts.paused, numbers.counts.paying], [0, 1]);

  // ── No downgrade any more: every shop keeps the website and the stockroom (10 November 2026) ──
  const refused = await w.ask({ ...ADA, firebase: { sign_in_second_factor: "totp" } }, "POST", "/api/billing/change-plan", { shopId, plan: "shop" });
  assert.equal(refused.status, 400);
  assert.equal((await w.registry.getShop(shopId)).plan, "both");

  // ── An older shop on one app gets the other overnight, at the same fee ──
  await w.billing.changePlan({ shopId, plan: "shop" });
  w.clock.days(31);
  await w.billing.closeDroppedApps();
  assert.equal((await w.registry.getShop(shopId)).plan, "shop", "the older shop had only the website");
  assert.deepEqual(await w.billing.giveEveryApp(), [shopId]);
  assert.equal((await w.registry.getShop(shopId)).plan, "both");
  assert.equal(planDoc(w, shopId).plan, "both", "the shop's own copy follows");
  const told = sent(w, "plan-changed").at(-1).data;
  assert.equal(told.everything, true);
  assert.deepEqual(told.adds, ["stockroom"]);
  assert.deepEqual(await w.billing.giveEveryApp(), [], "safe to run twice");

  // Everything since the shop's database existed is in the shop's own log.
  const what = [...w.auditLog.entries.get(shopId).values()].map((e) => e.what);
  for (const entry of ["card-added", "payment-failed", "stripe-paused", "plan-changed", "app-closed"]) assert.ok(what.includes(entry), `the shop's log has ${entry}`);
});

test("a failed setup step: the press sees plain words and Try again, the control room sees it stuck, and the retry carries on", async () => {
  const { fakeGoogle } = await import("./setup/fakes.js");
  const w = platformWorld({ suffix: () => "k3f9q", google: fakeGoogle({ failOnce: ["projects.create"] }) });
  const { shopId } = (await w.ask(ADA, "POST", "/api/signup", signUpDetails)).body;
  await w.shopMaker.sweep();

  const waiting = (await w.ask(ADA, "GET", "/api/signup")).body.shops[0];
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.canRetry, true);
  assert.match(waiting.message, /We couldn't finish making your shop's own space\. Nothing is lost/);
  assert.doesNotMatch(waiting.message, /projects\.create|Google/i);
  assert.equal(await planDoc(w, shopId), null, "the shop has no plan copy while it has no database");
  let numbers = await today(w);
  assert.ok(numbers.needs.some((n) => n.kind === "signup"), "the control room sees a new shop stuck while being made");

  assert.equal((await w.ask(STRANGER, "POST", "/api/signup/retry", { shopId })).status, 404, "only the owner can press Try again");
  w.clock.tick(60_000);
  assert.equal((await w.ask(ADA, "POST", "/api/signup/retry", { shopId })).body.status, "queued");
  assert.deepEqual(await w.shopMaker.sweep(), [{ shopId, status: "ready" }]);

  assert.equal(w.stripe.world.subscriptions.size, 1, "the retry did not start a second trial");
  assert.deepEqual([planDoc(w, shopId).state, (await w.registry.getShop(shopId)).billing.status], ["trial", "trialing"]);
  assert.equal(w.google.calls.filter(([name]) => name === "projects.create").length, 2, "only the failed step ran again");
  numbers = await today(w);
  assert.deepEqual(numbers.needs, []);
});

test("a snag giving the new shop its plan never holds the press up: it goes to the repair queue", async () => {
  const w = platformWorld({ suffix: () => "k3f9q" });
  const { shopId } = (await w.ask(ADA, "POST", "/api/signup", signUpDetails)).body;
  const maker = createShopMaker({
    signups: w.stores.signups, run: w.run, registry: w.registry, repairs: w.repairs, now: w.clock.date,
    billing: { publishPlan: async () => { throw new Error("the shop's database didn't answer (pretend error)"); } },
  });
  assert.deepEqual(await maker.sweep(), [{ shopId, status: "ready" }]);
  const [item] = await w.repairs.open(shopId);
  assert.equal(item.check, "shop-plan");
  // The next billing change, or the real shop maker, writes the plan.
  await w.billing.publishPlan(shopId);
  assert.equal(planDoc(w, shopId).state, "trial");
});

// ── The start (code plan 17.16): every stage of Get started, walked the way the shop's admin writes it ──────────────
// A press signed up and its shop made (both apps, cards through the platform). Each stage writes its marker into
// firstWeek/start, the shape firestore.rules checks. The run's stages are read from startRun.ts, so a stage added there
// fails this walk until it is walked here. Not walked: sample import (plan 17.5, waiting on real sample files); the bring
// stage stands in for it. Stripe's own connection states are not in the fake world, so Get paid writes the markers the
// page writes once Stripe says ready, or the press skips it.
const startedShop = async () => {
  const w = platformWorld({ suffix: () => "k3f9q" });
  const { shopId } = (await w.ask(ADA, "POST", "/api/signup", signUpDetails)).body;
  assert.deepEqual(await w.shopMaker.sweep(), [{ shopId, status: "ready" }]);
  const doc = () => w.doc(shopId, "firstWeek/start");
  const write = (patch) => w.services.shopData.set(shopId, "firstWeek/start", { ...doc(), ...patch });
  return { w, shopId, doc, write };
};

const runStages = () => {
  const source = readFileSync("apps/shop/src/app/admin/startRun.ts", "utf8");
  return [...source.match(/export type RunStep = ([^;]+);/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
};

test("the start, connected path: every stage of Get started is walked in order, from Your press to the shop open", async () => {
  const { w, shopId, doc, write } = await startedShop();
  const at = () => w.clock.date().toISOString();
  const walked = [];
  const stage = async (key, patch) => {
    await write(patch);
    for (const field of Object.keys(patch)) assert.ok(doc()[field], `${key}: ${field} is saved`);
    walked.push(key);
  };

  assert.equal(doc().details, undefined, "the run starts at Your press: nothing done yet");
  await stage("details", { details: { at: at() } });
  await stage("bring", { bring: { at: at(), skipped: true } }); // the press brings the shop over later
  await stage("look", { welcome: { theme: "press-zine", at: at() } });
  await stage("google", { google: { at: at(), connected: true } });
  await stage("payments", { payments: { at: at(), ready: true } }); // Stripe says the card account is ready
  await stage("shipping", { shipping: { at: at(), skipped: true } });
  await write({ finalCheck: { at: at(), opened: false } }); // the final check is shown and ticked through
  await stage("final", { finalCheck: { at: at(), opened: true } }); // then Open your shop

  assert.deepEqual(walked, runStages(), "every stage the run shows was walked, in the run's order");
  assert.equal(statusDoc(w, shopId).access, "open");
  assert.equal((await shopOf(w, shopId)).access, "open", "the control room sees the shop open");
  // Setup step 16 turned the stockroom link on, from today (plan 17.12), for a press with both apps.
  assert.match(w.services.world.links.get(shopId)?.startDay ?? "", /^\d{4}-\d{2}-\d{2}$/);
});

test("the start, disabled path: Google coming soon and Get paid skipped still carry the press through to the shop open", async () => {
  const { w, shopId, doc, write } = await startedShop();
  const at = () => w.clock.date().toISOString();
  await write({
    details: { at: at() },
    bring: { at: at(), skipped: true },
    welcome: { theme: "press-zine", at: at() },
    google: { at: at(), coming: true }, // Google hasn't approved the sign-in yet: the step waits, the run goes on
    payments: { at: at(), skipped: true }, // the press chose to set up Get paid later
    shipping: { at: at(), skipped: true },
    finalCheck: { at: at(), opened: true },
  });
  assert.equal(doc().google.coming, true);
  assert.equal(doc().payments.skipped, true);
  assert.equal((await shopOf(w, shopId)).access, "open", "a skipped Google and Get paid never hold the press up");
});
