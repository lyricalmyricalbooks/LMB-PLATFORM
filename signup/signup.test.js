// Sign-up (code plan 2.5): who can sign up, what is checked, that the trial starts with no card, that a repeat gives
// the same shop, and that the page asks one skippable question and never asks for a card or names a rival.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSignup, personOf, CLOSED_WORDS, MAX_SHOPS_PER_ACCOUNT, LINKS_PER_HOUR } from "./signup.js";
import { createApi } from "./api.js";
import { checkAddress, checkSignup, slugFromPressName, QUESTION } from "./form.js";
import { fakeAuth, fakeInvites, fakeSignupStores, fakeVerifyIdToken } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { fakeRegistry } from "../setup/fakes.js";
import { shopProblems } from "../setup/steps.js";
import { TERMS_VERSION } from "../terms/terms.js";

const ADA = { uid: "uid-ada", email: "Ada@Example.com", email_verified: true, name: "Ada" };
// Sign-up open to anyone (the control room's setting); closed is tested on its own.
const OPEN = async () => ({ signupOpen: true, signupDailyCap: 10 });

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
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), live: OPEN, suffix: () => `aaaa${n++}` });
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}) });
  const ask = (method, path, body, claims) => api({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { stores, registry, email, trials, signup, ask };
}

const details = { pressName: "Moth Press", plan: "both", country: "CA", termsAccepted: true, termsVersion: TERMS_VERSION };

test("signing up starts the free trial with no card and queues a shop the shop maker accepts", async () => {
  const { ask, trials, stores } = make();
  const answer = await ask("POST", "/api/signup", { ...details, sellingToday: "fairs" }, ADA);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.shopId, "moth-press-aaaa0");
  assert.equal(answer.body.status, "queued");
  assert.deepEqual(trials, [{ account: { accountId: "uid-ada", email: "ada@example.com", name: "Ada" }, shopId: "moth-press-aaaa0", pressName: "Moth Press", plan: "both", country: "CA" }], "the country sets the currency the press pays in");
  const row = stores.signups.rows.get("moth-press-aaaa0");
  assert.equal(row.answer, "fairs");
  assert.equal(row.currency, "CAD");
  assert.deepEqual(shopProblems({ shopId: row.shopId, pressName: row.pressName, ownerEmail: row.ownerEmail, plan: row.plan, country: row.country, currency: row.currency, paymentProvider: row.paymentProvider }), []);
  assert.deepEqual(stores.accounts.rows.get("uid-ada").shops, { "moth-press-aaaa0": "owner" });
});

test("a press signing up from a French browser gets the platform's emails in French; anything else stays unset", async () => {
  const { ask, trials, stores } = make();
  await ask("POST", "/api/signup", { ...details, language: "fr" }, ADA);
  assert.equal(stores.signups.rows.get("moth-press-aaaa0").language, "fr");
  assert.equal(trials[0].language, "fr", "kept on the plan, where the emails read it");
  assert.equal(checkSignup({ ...details, language: "en" }).details.language, "en", "a choice of English is kept too");
  assert.equal(checkSignup(details).details.language, undefined, "nothing said: Quebec's rule decides");
  assert.equal(checkSignup({ ...details, language: "<b>" }).details.language, undefined);
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
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), live: OPEN, suffix: () => "bbbbb" });
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
  assert.deepEqual(Object.keys(answer.body.problems).sort(), ["country", "pressName", "terms"]);
});

test("a shop id taken in the registry is skipped, and an account has a limit on new shops", async () => {
  const { stores, registry, email, trials } = make();
  await registry.createShop("moth-press-taken", { shopId: "moth-press-taken" });
  const ids = ["taken", "fresh"];
  const signup = createSignup({ ...stores, registry, billing: { startTrial: async (a) => (trials.push(a), { status: "trialing" }) }, email, auth: fakeAuth(), settings: platformSettings({}), live: OPEN, suffix: () => ids.shift() ?? `x${trials.length}abc` });
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
  // Words Google refuses in a project id are left out of a made-up address, so it always passes the typed rules too.
  assert.equal(slugFromPressName("Google Books"), "books");
  for (const name of ["Google Books", "Null Island Press", "Undefined Editions", "SSL Zines", "goognullle", "Google"]) {
    const id = `${slugFromPressName(name)}-abcde`;
    assert.equal(checkAddress(id).ok, true, `${name} -> ${id}`);
    assert.deepEqual(shopProblems({ shopId: id, pressName: name, ownerEmail: "a@example.com", plan: "shop", country: "CA", currency: "CAD", paymentProvider: "stripe" }), [], id);
  }
  assert.match(shopProblems({ shopId: "google-press-abcde", pressName: "x", ownerEmail: "a@example.com", plan: "shop", country: "CA", currency: "CAD", paymentProvider: "stripe" }).join(), /Google refuses/);
});

test("a press named after a word Google refuses still signs up, with an address Google takes", async () => {
  const { signup } = make();
  const { shopId } = await signup.start(ADA, { ...details, pressName: "Google Books" });
  assert.equal(shopId, "books-aaaa0");
});

test("closed sign-up: a new press needs an invite; one already signed up carries on", async () => {
  const { stores, registry, email, trials } = make();
  let open = true;
  const invites = fakeInvites(["bea@example.com"]);
  const billing = { startTrial: async (a) => (trials.push(a), { status: "trialing" }) };
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), invites, live: async () => ({ signupOpen: open, signupDailyCap: 10 }), suffix: () => "ccccc" });
  const first = await signup.start(ADA, details);
  open = false;
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}) });
  const refused = await api({ method: "POST", path: "/api/signup", body: { ...details, pressName: "Second Press" }, headers: { Authorization: `Bearer ${JSON.stringify(ADA)}` } });
  assert.deepEqual([refused.status, refused.body.message], [403, CLOSED_WORDS]);
  assert.equal(trials.length, 1, "no second trial");
  assert.equal(stores.signups.rows.size, 1);
  assert.equal((await signup.start(ADA, details)).shopId, first.shopId, "the press already signed up carries on");
  const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true, name: "Bea" };
  assert.equal((await signup.start(BEA, { ...details, pressName: "Bea Books" })).status, "queued", "an invited email may start");
  // The default settings are closed too.
  const closedByDefault = createSignup({ ...fakeSignupStores(), registry: fakeRegistry(), billing, email, auth: fakeAuth(), settings: platformSettings({}), live: async () => platformSettings({}) });
  await assert.rejects(closedByDefault.start(ADA, details), (error) => error.status === 403);
});

test("closed sign-up: a platform admin may start a shop without an invite, so the owner can try it end to end", async () => {
  const { stores, registry, email, trials } = make();
  const billing = { startTrial: async (a) => (trials.push(a), { status: "trialing" }) };
  const invites = fakeInvites([]);
  const signup = createSignup({ ...stores, registry, billing, email, auth: fakeAuth(), settings: platformSettings({}), invites, admins: [" ADA@example.com "], live: async () => ({ signupOpen: false, signupDailyCap: 0 }), suffix: () => "ddddd" });
  assert.equal((await signup.start(ADA, details)).status, "queued", "the admin skips the waitlist and the daily cap");
  const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true, name: "Bea" };
  await assert.rejects(signup.start(BEA, { ...details, pressName: "Bea Books" }), (error) => error.status === 403, "everyone else still needs an invite");
  const unconfirmed = { ...ADA, uid: "uid-ada-2", email_verified: false };
  await assert.rejects(signup.start(unconfirmed, { ...details, pressName: "Third Press" }), "an admin's email must be confirmed too");
  // No invite store at all: the admin still gets in, and nothing tries to use up an invite.
  const bare = createSignup({ ...fakeSignupStores(), registry: fakeRegistry(), billing, email, auth: fakeAuth(), settings: platformSettings({}), admins: ["ada@example.com"], live: async () => ({ signupOpen: false, signupDailyCap: 10 }) });
  assert.equal((await bare.start(ADA, details)).status, "queued");
});

test("a new press can't take over an address this account already uses", async () => {
  const { signup, stores, trials } = make();
  const { shopId } = await signup.start(ADA, details);
  await assert.rejects(signup.start(ADA, { ...details, pressName: "Other Press", plan: "shop", address: shopId }), (error) => error.status === 409 && Boolean(error.problems?.address));
  assert.equal(stores.signups.rows.get(shopId).pressName, "Moth Press", "the first press's row is untouched");
  assert.equal(trials.length, 1);
});

test("sign-ups sent at the same moment make one shop and one trial, and can't pass the limit on shops", async () => {
  const { signup, stores, trials } = make();
  const answers = await Promise.all([signup.start(ADA, details), signup.start(ADA, details), signup.start(ADA, details)]);
  assert.equal(new Set(answers.map((a) => a.shopId)).size, 1);
  assert.equal(stores.signups.rows.size, 1);
  assert.equal(new Set(trials.map((t) => t.shopId)).size, 1);
  // Many different presses at once: never more than the limit.
  const many = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => signup.start(ADA, { ...details, pressName: `Press number ${i}` })));
  assert.equal(stores.signups.rows.size, MAX_SHOPS_PER_ACCOUNT);
  assert.ok(many.filter((m) => m.status === "rejected").every((m) => m.reason.status === 429));
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

test("the plans route lists the three plans with their fee, what shops pay to run, and the trial; unknown routes are 404", async () => {
  const { ask } = make();
  const { body } = await ask("GET", "/api/plans");
  assert.deepEqual(body.plans.map((p) => [p.plan, p.priceText]), [["both", "$5.00"]]);
  assert.deepEqual([body.usage.feeText, body.usage.sameFee, body.usage.examples.map((e) => e.totalText)], ["$5.00", true, ["$5.51", "$7.53", "$19.95"]]);
  assert.equal(body.trialDays, 14);
  assert.equal(body.productName, "Colophon");
  // The front door's preview: the fee in the shop's billing currency, and which countries can open a shop today.
  assert.deepEqual(body.fees, { CAD: { feeText: "$5", foundingFeeText: "$3.75" }, USD: { feeText: "US$5", foundingFeeText: "US$3.75" } });
  assert.deepEqual(body.openCountries, ["CA"]);
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

test("the web door: our own words reach the press; another service's answer and crashes are logged with a code instead", async () => {
  const lines = [];
  const boom = (error) => async () => {
    throw error;
  };
  const api = createApi({
    signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), log: (line) => lines.push(line),
    routes: {
      "POST /api/ours": boom(Object.assign(new Error("That isn't an email address."), { status: 400 })),
      "POST /api/google": boom(Object.assign(new Error("Request had invalid authentication credentials."), { status: 401, fromProvider: "google" })),
      "POST /api/crash": boom(new TypeError("Cannot read properties of undefined (reading 'shopId')")),
    },
  });
  const ask = (path) => api({ method: "POST", path, body: {}, headers: { Authorization: `Bearer ${JSON.stringify(ADA)}` } });

  const ours = await ask("/api/ours");
  assert.deepEqual([ours.status, ours.body.message], [400, "That isn't an email address."]);
  assert.equal(lines.length, 0);

  // Google's 401 is not "your sign-in ran out", and its words are not for a press.
  const google = await ask("/api/google");
  assert.equal(google.status, 502);
  assert.doesNotMatch(google.body.message, /credentials/);
  assert.match(google.body.message, new RegExp(google.body.ref));
  assert.match(lines[0], new RegExp(`\\[${google.body.ref}\\] \\(google\\).*invalid authentication`));

  const crash = await ask("/api/crash");
  assert.equal(crash.status, 500);
  assert.doesNotMatch(crash.body.message, /undefined/);
  assert.match(lines[1], /POST \/api\/crash failed .*TypeError/);
});
