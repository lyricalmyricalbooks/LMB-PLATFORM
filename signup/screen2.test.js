// Sign-up screen 2 (code plan 6.2): the web address preview with Change, "What do you sell?" and the terms tick box.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSignup } from "./signup.js";
import { createApi } from "./api.js";
import { checkAddress, checkSignup, PUBLISHES } from "./form.js";
import { shopFromSignup } from "./shopMaker.js";
import { fakeAuth, fakeSignupStores, fakeVerifyIdToken } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { fakeRegistry } from "../setup/fakes.js";
import { TERMS_VERSION } from "../terms/terms.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true, name: "Ada" };
const BEA = { uid: "uid-bea", email: "bea@example.com", email_verified: true, name: "Bea" };
const details = { pressName: "Moth Press", plan: "both", country: "CA", termsAccepted: true, termsVersion: TERMS_VERSION };

function make({ now = () => new Date("2026-10-28T15:00:00Z") } = {}) {
  const stores = fakeSignupStores();
  const registry = fakeRegistry();
  const signup = createSignup({
    ...stores, registry, email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings({}), now, suffix: () => "k3f9q",
    billing: { startTrial: async () => ({ status: "trialing", trialEnd: null }) },
    live: async () => ({ signupDailyCap: 10 }),
  });
  const api = createApi({ signup, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), live: async () => ({ signupOpen: true }) });
  const ask = (method, path, body, claims = ADA) => api({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  return { stores, registry, signup, ask };
}

test("the web address follows the shop id's rules, in plain words", () => {
  assert.deepEqual(checkAddress("Moth-Press"), { ok: true, address: "moth-press", problem: null });
  assert.equal(checkAddress("moth-press.web.app").address, "moth-press");
  assert.match(checkAddress("moth").problem, /at least 6/);
  assert.match(checkAddress("x".repeat(31)).problem, /30 letters/);
  assert.match(checkAddress("moth press!").problem, /only letters, numbers and hyphens/);
  assert.match(checkAddress("42-moth-press").problem, /Start with a letter/);
  assert.match(checkAddress("moth-press-").problem, /End with a letter/);
  assert.match(checkAddress("googlepress").problem, /isn't available/);
  assert.match(checkAddress("colophon").problem, /isn't available/);
  for (const ok of ["moth-press", "abcdef", "a".repeat(30)]) assert.match(ok, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
});

test("the preview suggests the press's own name, then checks a changed address against the registry as they type", async () => {
  const { ask, registry } = make();
  const suggested = await ask("POST", "/api/signup/address", { pressName: "Moth Press" });
  assert.deepEqual(suggested.body, { ok: true, address: "moth-press", url: "https://moth-press.web.app", free: true, problem: null });

  await registry.createShop("moth-press", { shopId: "moth-press" });
  assert.equal((await ask("POST", "/api/signup/address", { pressName: "Moth Press" })).body.address, "moth-press-k3f9q", "a taken name gets five characters");
  const taken = await ask("POST", "/api/signup/address", { address: "moth-press" });
  assert.equal(taken.body.free, false);
  assert.match(taken.body.problem, /taken/);
  const bad = await ask("POST", "/api/signup/address", { address: "Moth Press!" });
  assert.equal(bad.body.free, false);
  assert.match(bad.body.problem, /only letters/);
  assert.equal((await ask("POST", "/api/signup/address", { address: "moth-and-flame" })).body.free, true);
  assert.equal((await ask("POST", "/api/signup/address", { address: "moth-and-flame" }, null)).status, 401, "signed in only");
});

test("sign-up refuses an address that clashes or has bad characters, and keeps a chosen one", async () => {
  const { ask, registry, stores } = make();
  await registry.createShop("moth-press", { shopId: "moth-press" });
  const clash = await ask("POST", "/api/signup", { ...details, address: "moth-press" });
  assert.equal(clash.status, 409);
  assert.match(clash.body.problems.address, /taken/);
  const bad = await ask("POST", "/api/signup", { ...details, address: "moth_press" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.problems.address, /only letters/);

  const mine = await ask("POST", "/api/signup", { ...details, address: "moth-and-flame" });
  assert.equal(mine.body.shopId, "moth-and-flame");
  // Another person's sign-up holds it now.
  const other = await ask("POST", "/api/signup", { ...details, pressName: "Flame", address: "moth-and-flame" }, BEA);
  assert.equal(other.status, 409);
  assert.equal(stores.signups.rows.size, 1);
});

test("What do you sell? is skippable, and the answer travels with the shop", async () => {
  const { ask, stores } = make();
  assert.deepEqual(PUBLISHES.options.map((o) => o.id), ["books", "zines", "comics", "prints", "mix", "clothing", "shoes", "jewelry", "music", "other"]);
  assert.equal(PUBLISHES.label, "What do you sell?");
  await ask("POST", "/api/signup", { ...details, publishes: "zines" });
  const row = stores.signups.rows.get("moth-press-k3f9q");
  assert.equal(row.publishes, "zines");
  assert.equal(shopFromSignup(row, { testMode: true }).publishes, "zines");
  assert.equal(checkSignup({ ...details, publishes: "pottery" }).details.publishes, null);
  assert.equal(shopFromSignup({ ...row, publishes: undefined }, { testMode: true }).publishes, null);
});

test("sign-up is refused without the tick, and with words the page no longer shows", async () => {
  const { ask, stores } = make();
  const unticked = await ask("POST", "/api/signup", { ...details, termsAccepted: false });
  assert.equal(unticked.status, 400);
  assert.match(unticked.body.problems.terms, /Tick the box/);
  const stale = await ask("POST", "/api/signup", { ...details, termsVersion: "2020-01-01" });
  assert.equal(stale.status, 409);
  assert.match(stale.body.problems.terms, /terms again/);
  assert.equal(stores.signups.rows.size, 0);
});

test("the agreement is stored with the version and date, and a re-run keeps the first one", async () => {
  let clock = Date.parse("2026-10-28T15:00:00Z");
  const { signup, stores } = make({ now: () => new Date(clock) });
  await signup.start(ADA, details);
  const first = stores.signups.rows.get("moth-press-k3f9q");
  assert.equal(first.termsVersion, TERMS_VERSION);
  assert.equal(first.termsAcceptedAt, "2026-10-28T15:00:00.000Z");
  clock += 86_400_000;
  await signup.start(ADA, details);
  assert.equal(stores.signups.rows.get("moth-press-k3f9q").termsAcceptedAt, "2026-10-28T15:00:00.000Z");
});

test("the page: address preview with Change, the publish question with Skip, and the terms tick box", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(page, /id="address-preview"/);
  assert.match(page, />Change</);
  assert.match(page, /id="publishes"/);
  assert.match(page, /id="skip-publishes"/);
  assert.match(page, /name="termsAccepted" type="checkbox" required/);
  assert.match(page, /href="[^"]*terms\/"/);
  assert.match(app, /\/signup\/address/);
  assert.match(app, /termsVersion/);
});
