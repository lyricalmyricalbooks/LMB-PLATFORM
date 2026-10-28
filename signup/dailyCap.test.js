// The daily cap on new shops and waitlist invites (code plan 6.13): over the cap a press waits in line with no trial
// running, is let in oldest first as room opens and gets an email; an invited email skips the cap and the line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSignup, IN_LINE_WORDS } from "./signup.js";
import { createShopMaker } from "./shopMaker.js";
import { fakeAuth, fakeInvites, fakeSignupStores } from "./fakes.js";
import { fakePlatformEmail } from "../services/billing/fakes.js";
import { platformSettings } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";
import { liveSettings } from "./live.js";
import { fakeRegistry } from "../setup/fakes.js";
import { TERMS_VERSION } from "../terms/terms.js";

const press = (n) => ({ uid: `uid-${n}`, email: `press${n}@example.com`, email_verified: true, name: `Press ${n}` });
const details = (n) => ({ pressName: `Press number ${n}`, plan: "shop", country: "CA", termsAccepted: true, termsVersion: TERMS_VERSION });

function make({ cap = 2, invited = [] } = {}) {
  let clock = Date.parse("2026-10-28T15:00:00Z"); // 11:00 in Toronto
  const now = () => new Date(clock);
  const stores = fakeSignupStores();
  const email = fakePlatformEmail();
  const invites = fakeInvites(invited);
  const trials = [];
  const settings = { cap };
  const signup = createSignup({
    ...stores, registry: fakeRegistry(), email, auth: fakeAuth(), settings: platformSettings({}), now, invites, suffix: () => "abcde",
    billing: { startTrial: async (args) => (trials.push(args.shopId), { status: "trialing", trialEnd: null }) },
    live: async () => ({ signupDailyCap: settings.cap }),
  });
  return { stores, email, invites, trials, signup, settings, now, tick: (minutes) => { clock += minutes * 60_000; } };
}

test("the cap: the first presses of the day start, the next one waits in line with no trial running", async () => {
  const { signup, trials, stores } = make({ cap: 2 });
  assert.equal((await signup.start(press(1), details(1))).status, "queued");
  assert.equal((await signup.start(press(2), details(2))).status, "queued");
  const third = await signup.start(press(3), details(3));
  assert.equal(third.status, "in-line");
  assert.equal(third.message, IN_LINE_WORDS);
  assert.match(IN_LINE_WORDS, /^We're making a few shops a day\. You're next in line/);
  assert.equal(trials.length, 2, "no trial days lost while waiting");
  const row = stores.signups.rows.get(third.shopId);
  assert.ok(row.linedUpAt);
  assert.ok(!row.trialStartedAt);
  assert.deepEqual((await signup.mine(press(3)))[0].message, IN_LINE_WORDS);
  // Signing up again while in line keeps the place and starts nothing.
  assert.equal((await signup.start(press(3), details(3))).status, "in-line");
  assert.equal(trials.length, 2);
});

test("the queue lets presses in oldest first when the day turns, and emails each once", async () => {
  const { signup, trials, email, tick } = make({ cap: 1 });
  await signup.start(press(1), details(1));
  for (const n of [2, 3, 4]) {
    tick(1);
    await signup.start(press(n), details(n));
  }
  assert.deepEqual(await signup.admitFromLine(), [], "no room left today");

  tick(24 * 60); // the next day in Toronto
  assert.deepEqual(await signup.admitFromLine(), ["press-number-2-abcde"]);
  assert.deepEqual(await signup.admitFromLine(), [], "the day's room is used");
  tick(24 * 60);
  assert.deepEqual(await signup.admitFromLine(), ["press-number-3-abcde"]);
  assert.deepEqual(trials, ["press-number-1-abcde", "press-number-2-abcde", "press-number-3-abcde"]);

  const sent = email.list().filter((m) => m.kind === "shop-starting");
  assert.deepEqual(sent.map((m) => m.to), ["press2@example.com", "press3@example.com"]);
  const words = TEMPLATES["shop-starting"](sent[0].data, { settings: platformSettings({}), pressName: "" });
  assert.match(words.text, /started making Press number 2/);
  assert.match(words.text, /No card needed/);
  assert.match(words.html, /href="https:\/\/platform\.example\/signup\/"/);
});

test("a raised cap lets more in at once, and a trial that fails to start keeps its place", async () => {
  const w = make({ cap: 0 });
  await w.signup.start(press(1), details(1));
  await w.signup.start(press(2), details(2));
  w.settings.cap = 5;
  let failing = true;
  const signup = createSignup({
    ...w.stores, registry: fakeRegistry(), email: w.email, auth: fakeAuth(), settings: platformSettings({}), now: w.now, suffix: () => "zzzzz",
    billing: { startTrial: async ({ shopId }) => { if (failing && shopId === "press-number-1-abcde") throw new Error("down"); return { status: "trialing" }; } },
    live: async () => ({ signupDailyCap: 5 }),
  });
  assert.deepEqual(await signup.admitFromLine(), ["press-number-2-abcde"]);
  assert.equal(w.stores.signups.rows.get("press-number-1-abcde").status, "in-line");
  failing = false;
  assert.deepEqual(await signup.admitFromLine(), ["press-number-1-abcde"]);
});

test("an invited email skips the cap and the line, doesn't use up the day's room, and the invite is marked used", async () => {
  const { signup, invites, trials } = make({ cap: 1, invited: ["press9@example.com"] });
  await signup.start(press(1), details(1));
  const guest = await signup.start(press(9), details(9));
  assert.equal(guest.status, "queued");
  assert.deepEqual([...invites.used], [["press9@example.com", "press-number-9-abcde"]]);
  assert.ok(trials.includes("press-number-9-abcde"));
  assert.equal((await signup.start(press(2), details(2))).status, "in-line");

  // Invited while already waiting: straight in on the next try.
  invites.invite("press2@example.com");
  assert.equal((await signup.start(press(2), details(2))).status, "queued");
  assert.equal(invites.used.get("press2@example.com"), "press-number-2-abcde");
});

test("the shop maker's sweep lets the line in first, so a shop let in is made in the same run", async () => {
  const { signup, stores, tick } = make({ cap: 1 });
  await signup.start(press(1), details(1));
  await stores.signups.set("press-number-1-abcde", { ...stores.signups.rows.get("press-number-1-abcde"), status: "ready" });
  await signup.start(press(2), details(2));
  const made = [];
  const maker = createShopMaker({ signups: stores.signups, registry: { getProfile: async () => null }, line: signup, run: async (shop) => (made.push(shop.shopId), { ok: true }) });
  assert.deepEqual(await maker.sweep(), []);
  tick(24 * 60);
  assert.deepEqual(await maker.sweep(), [{ shopId: "press-number-2-abcde", status: "ready" }]);
  assert.deepEqual(made, ["press-number-2-abcde"]);
});

test("sign-up reads the control room's live settings: closed and 10 shops a day unless changed", async () => {
  const base = await liveSettings({ env: {} });
  assert.equal(base.signupOpen, false);
  assert.equal(base.signupDailyCap, 10);
  const saved = { get: async () => ({ values: { signupOpen: true, signupDailyCap: 3 } }) };
  const changed = await liveSettings({ env: {}, store: saved });
  assert.equal(changed.signupOpen, true, "the control room's value wins");
  assert.equal(changed.signupDailyCap, 3);
});

test("the page tells a press in line the same words and keeps checking", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.ok(app.includes(`"in-line": "${IN_LINE_WORDS}"`));
  assert.match(app, /"in-line"\)\) following = setTimeout\(follow/);
});
