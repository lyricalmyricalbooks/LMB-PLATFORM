// Canada first (code plan 15.23): the tax presets, addresses and shipping are Canadian, so a press in another country
// has its place kept on a "later" list, with no shop made, no trial started and no use of the daily cap, until that
// country is opened (settings.openCountries).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSignup, LATER_WORDS } from "./signup.js";
import { fakeAuth, fakeInvites, fakeSignupStores } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { fakeRegistry } from "../setup/fakes.js";
import { TERMS_VERSION } from "../terms/terms.js";

const press = (n) => ({ uid: `uid-${n}`, email: `press${n}@example.com`, email_verified: true, name: `Press ${n}` });
const details = (n, country = "CA") => ({ pressName: `Press number ${n}`, plan: "shop", country, termsAccepted: true, termsVersion: TERMS_VERSION });

function make({ env = {}, invited = [], stores = fakeSignupStores() } = {}) {
  const trials = [];
  const invites = fakeInvites(invited);
  const signup = createSignup({
    ...stores, registry: fakeRegistry(), email: fakePlatformEmail(), auth: fakeAuth(), settings: platformSettings(env),
    now: () => new Date("2026-10-28T15:00:00Z"), invites, suffix: () => "abcde",
    billing: { startTrial: async (args) => (trials.push(args.shopId), { status: "trialing", trialEnd: null }) },
    live: async () => ({ signupDailyCap: 1 }),
  });
  return { signup, trials, stores, invites };
}

test("a press outside Canada is kept on a later list: no shop, no trial, plain words", async () => {
  const { signup, trials, stores } = make();
  const answer = await signup.start(press(1), details(1, "US"));
  assert.equal(answer.status, "later");
  assert.equal(answer.message, LATER_WORDS);
  assert.match(LATER_WORDS, /^Colophon starts in Canada\./);
  assert.equal(trials.length, 0, "no trial days lost while waiting");
  const row = stores.signups.rows.get(answer.shopId);
  assert.equal(row.country, "US");
  assert.ok(!row.trialStartedAt && !row.admittedAt);
  assert.equal((await signup.mine(press(1)))[0].message, LATER_WORDS);
  // Signing up again changes nothing.
  assert.equal((await signup.start(press(1), details(1, "US"))).status, "later");
  assert.equal(trials.length, 0);
});

test("a later press never uses the day's room, and an invite does not skip the rule", async () => {
  const { signup, trials, invites } = make({ invited: ["press2@example.com"] });
  assert.equal((await signup.start(press(1), details(1, "GB"))).status, "later");
  assert.equal((await signup.start(press(2), details(2, "FR"))).status, "later", "invited, but the country is not open");
  assert.equal((await invites.isInvited("press2@example.com")), true);
  assert.equal(invites.used?.size ?? 0, 0, "the invite is kept for when the country opens");
  assert.equal((await signup.start(press(3), details(3))).status, "queued", "the one shop of the day goes to a Canadian press");
  assert.equal(trials.length, 1);
});

test("with a country opened in the settings, its presses start like anyone else; a waiting press joins the line", async () => {
  const open = make({ env: { SIGNUP_OPEN_COUNTRIES: "CA,US" } });
  assert.equal((await open.signup.start(press(1), details(1, "US"))).status, "queued");
  const first = make();
  assert.equal((await first.signup.start(press(2), details(2, "US"))).status, "later");
  const opened = make({ env: { SIGNUP_OPEN_COUNTRIES: "CA,US" }, stores: first.stores });
  const again = await opened.signup.start(press(2), details(2, "US"));
  assert.equal(again.status, "queued", "its country opened, so it starts (the day has room)");
  assert.equal(opened.trials.length, 1);
});

test("the waitlist and sign-up pages say Colophon starts in Canada", () => {
  assert.match(readFileSync(new URL("../waitlist/index.html", import.meta.url), "utf8"), /we're starting in Canada/);
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /Colophon starts in Canada\. If your press is somewhere else, we'll save your place/);
  assert.match(readFileSync(new URL("./app.js", import.meta.url), "utf8"), /later: "Colophon starts in Canada/);
});
