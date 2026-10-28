// Sign-up (code plan 2.5): who can sign up, what is checked, that the trial starts with no card, that a repeat gives
// the same shop, and that the page asks one skippable question and never asks for a card or names a rival.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSignup, personOf, MAX_SHOPS_PER_ACCOUNT, LINKS_PER_HOUR } from "./signup.js";
import { createApi } from "./api.js";
import { checkSignup, slugFromPressName, QUESTION } from "./form.js";
import { fakeAuth, fakeSignupStores, fakeVerifyIdToken } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { fakeRegistry } from "../setup/fakes.js";
import { shopProblems } from "../setup/steps.js";

const ADA = { uid: "uid-ada", email: "Ada@Example.com", email_verified: true, name: "Ada" };

function make() {
  const stores = fakeSignupStores();
  const registry = fakeRegistry();
  const email = fakePlatformEmail();
  const trials = [];
  const billing = {
    async startTrial(args) {
      trials.push(args);
      return { status: "trialing", trialEnd: "2026-11-11T00:00:00.000Z" };
    },
  };
  let n = 0;
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), suffix: () => `aaaa${n++}` });
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}) });
  const ask = (method, path, body, claims) => api({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { stores, registry, email, trials, signup, ask };
}

const details = { pressName: "Moth Press", plan: "both", country: "CA" };

test("signing up starts the free trial with no card and queues a shop the shop maker accepts", async () => {
  const { ask, trials, stores } = make();
  const answer = await ask("POST", "/api/signup", { ...details, sellingToday: "fairs" }, ADA);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.shopId, "moth-press-aaaa0");
  assert.equal(answer.body.status, "queued");
  assert.deepEqual(trials, [{ account: { accountId: "uid-ada", email: "ada@example.com", name: "Ada" }, shopId: "moth-press-aaaa0", pressName: "Moth Press", plan: "both" }]);
  const row = stores.signups.rows.get("moth-press-aaaa0");
  assert.equal(row.answer, "fairs");
  assert.equal(row.currency, "CAD");
  assert.deepEqual(shopProblems({ shopId: row.shopId, pressName: row.pressName, ownerEmail: row.ownerEmail, plan: row.plan, country: row.country, currency: row.currency, paymentProvider: row.paymentProvider }), []);
  assert.deepEqual(stores.accounts.rows.get("uid-ada").shops, { "moth-press-aaaa0": "owner" });
});

test("the question can be skipped, and an unknown answer counts as skipped", async () => {
  const { ask, stores } = make();
  await ask("POST", "/api/signup", details, ADA);
  assert.equal(stores.signups.rows.get("moth-press-aaaa0").answer, null);
  assert.equal(checkSignup({ ...details, sellingToday: "carrier pigeon" }).details.answer, null);
});

test("signing up twice (a double click, a lost answer) gives the same shop and one trial", async () => {
  const { ask, trials, stores } = make();
  const first = await ask("POST", "/api/signup", details, ADA);
  const second = await ask("POST", "/api/signup", { ...details, pressName: "moth press" }, ADA);
  assert.equal(second.body.shopId, first.body.shopId);
  assert.equal(trials.length, 1);
  assert.equal(stores.signups.rows.size, 1);
});

test("a trial that failed to start is started on the next try, for the same shop", async () => {
  const { stores, registry, email } = make();
  let fail = true;
  const billing = { startTrial: async () => { if (fail) throw new Error("Stripe is down"); return { status: "trialing", trialEnd: null }; } };
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), suffix: () => "bbbbb" });
  await assert.rejects(signup.start(ADA, details), /Stripe is down/);
  fail = false;
  const again = await signup.start(ADA, details);
  assert.equal(again.shopId, "moth-press-bbbbb");
  assert.ok(stores.signups.rows.get("moth-press-bbbbb").trialStartedAt);
});

test("only a signed-in person with a confirmed email can sign up", async () => {
  const { ask } = make();
  assert.equal((await ask("POST", "/api/signup", details)).status, 401);
  const unconfirmed = await ask("POST", "/api/signup", details, { ...ADA, email_verified: false });
  assert.equal(unconfirmed.status, 403);
  assert.match(unconfirmed.body.message, /Confirm your email/);
  assert.throws(() => personOf({}), /Sign in first/);
});

test("missing details come back field by field in plain words", async () => {
  const { ask } = make();
  const answer = await ask("POST", "/api/signup", { pressName: " ", plan: "gold", country: "ZZ" }, ADA);
  assert.equal(answer.status, 400);
  assert.deepEqual(Object.keys(answer.body.problems).sort(), ["country", "plan", "pressName"]);
});

test("a shop id taken in the registry is skipped, and an account has a limit on new shops", async () => {
  const { stores, registry, email, trials } = make();
  await registry.createShop("moth-press-taken", { shopId: "moth-press-taken" });
  const ids = ["taken", "fresh"];
  const signup = createSignup({ ...stores, registry, billing: { startTrial: async (a) => (trials.push(a), { status: "trialing" }) }, email, auth: fakeAuth(), settings: platformSettings({}), suffix: () => ids.shift() ?? `x${trials.length}abc` });
  assert.equal((await signup.start(ADA, details)).shopId, "moth-press-fresh");
  for (let i = 1; i < MAX_SHOPS_PER_ACCOUNT; i += 1) await signup.start(ADA, { ...details, pressName: `Press ${i}` });
  await assert.rejects(signup.start(ADA, { ...details, pressName: "One too many" }), /up to 5 shops/);
});

test("shop ids are made from the press name and always fit Google's rules", () => {
  assert.equal(slugFromPressName("Moth & Flame Éditions!"), "moth-and-flame-editions");
  assert.equal(slugFromPressName("42"), "press");
  assert.equal(slugFromPressName("A very long press name that keeps going and going"), "a-very-long-press-name-t");
  for (const name of ["Moth Press", "42", "Ö", "a—b", "x".repeat(90), "---"]) {
    assert.match(`${slugFromPressName(name)}-abcde`, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, name);
  }
});

test("the sign-in link comes from the platform, says the same whoever asks, and is limited per address", async () => {
  const { ask, email } = make();
  const answer = await ask("POST", "/api/signin-link", { email: "Ada@Example.com" });
  assert.deepEqual(answer, { status: 200, body: { ok: true } });
  const [sent] = email.list();
  assert.equal(sent.kind, "sign-in-link");
  assert.equal(sent.to, "ada@example.com");
  assert.match(sent.data.link, /^https:\/\/platform\.example\/signup\/\?finish=1/);
  for (let i = 1; i < LINKS_PER_HOUR; i += 1) await ask("POST", "/api/signin-link", { email: "ada@example.com" });
  assert.equal((await ask("POST", "/api/signin-link", { email: "ada@example.com" })).status, 429);
  assert.equal((await ask("POST", "/api/signin-link", { email: "not an email" })).status, 400);
});

test("the plans route lists the three plans with prices and the trial, and unknown routes are 404", async () => {
  const { ask } = make();
  const { body } = await ask("GET", "/api/plans");
  assert.deepEqual(body.plans.map((p) => [p.plan, p.priceText]), [["shop", "$29.00"], ["stockroom", "$19.00"], ["both", "$39.00"]]);
  assert.equal(body.trialDays, 14);
  assert.equal(body.productName, "Colophon");
  assert.equal((await ask("GET", "/api/nothing")).status, 404);
});

test("the person's shops in the making are listed for them only", async () => {
  const { ask } = make();
  await ask("POST", "/api/signup", details, ADA);
  assert.equal((await ask("GET", "/api/signup", undefined, ADA)).body.shops.length, 1);
  assert.equal((await ask("GET", "/api/signup", undefined, { ...ADA, uid: "uid-other" })).body.shops.length, 0);
});

test("the page: email link or Google, one skippable question, no card asked, no rival named", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(page, /Continue with Google/);
  assert.match(page, /Email me a sign-in link/);
  assert.match(page, /Skip this question/);
  assert.match(page, /No card needed/);
  assert.doesNotMatch(page + app, /card ?number|cvc|expiry|type="tel"/i);
  assert.equal(QUESTION.options.length, 5);
  const words = (page + app + readFileSync(new URL("./form.js", import.meta.url), "utf8")).toLowerCase();
  for (const rival of ["big cartel", "bigcartel", "shopify", "squarespace", "etsy", "wix", "woocommerce"]) assert.ok(!words.includes(rival), rival);
});
