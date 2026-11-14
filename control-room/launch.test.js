// The Launch page's words: what is ready, and what each walkthrough step still waits for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WALK_STORE, googleSteps, launchSteps, launchSummary, readTicks, saveTicks, walkSteps } from "./launch.js";

const keys = (ready) => ["stripe", "connect-events", "billing-events", "email"].map((id) => ({ id, label: id, ready: ready.includes(id) }));
const launch = (over = {}) => ({ platformUrl: "https://platform.example", signupOpen: false, invites: true, shopMaking: true, keys: keys([]), ...over });

test("the summary counts the keys, the test shop and a way in", () => {
  assert.deepEqual(launchSummary(launch(), null), { ready: 1, total: 6, missing: 5 });
  const all = launch({ keys: keys(["stripe", "connect-events", "billing-events", "email"]) });
  assert.deepEqual(launchSummary(all, { status: "live" }), { ready: 6, total: 6, missing: 0 });
  assert.equal(launchSummary({ ...all, invites: false }, { status: "live" }).missing, 1);
  // Two test shops: ready only when both are live.
  assert.equal(launchSummary(all, [{ status: "live" }, { status: "live" }]).missing, 0);
  assert.equal(launchSummary(all, [{ status: "live" }, { status: "creating" }]).missing, 1);
  assert.equal(launchSummary(all, []).missing, 1);
});

test("each walkthrough step names only what it still waits for", () => {
  const needs = (l) => Object.fromEntries(walkSteps(l).map((s) => [s.id, s.needs]));
  const bare = needs(launch({ shopMaking: false }));
  assert.deepEqual(bare.join, ["Send email from your Google Workspace", "an invite for your test address (Sign-ups)", "the platform's Google access, so it can make a store"]);
  assert.deepEqual(bare.billing, ["Add your Stripe test key", "Let Stripe tell Colophon about plan payments"]);
  assert.deepEqual(bare.cards, ["Add your Stripe test key", "Let Stripe tell Colophon about brands' sales"]);
  const ready = needs(launch({ signupOpen: true, keys: keys(["stripe", "connect-events", "billing-events", "email"]) }));
  assert.ok(Object.values(ready).every((n) => n.length === 0));
  const steps = walkSteps(launch());
  assert.equal(steps[0].href, "https://platform.example/");
  assert.equal(steps.find((s) => s.id === "join").href, "https://platform.example/join/");
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
});

test("ticks survive a reload, and a blocked or broken store reads as none", () => {
  const box = new Map();
  const storage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
  saveTicks(storage, new Set(["front", "join"]));
  assert.deepEqual([...readTicks(storage)], ["front", "join"]);
  box.set(WALK_STORE, "{not json");
  assert.equal(readTicks(storage).size, 0);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(readTicks(blocked).size, 0);
  assert.doesNotThrow(() => saveTicks(blocked, new Set(["front"])));
  assert.equal(readTicks(null).size, 0);
});

test("the to-do list: the first unfinished step is next, every step has plain words and one button", () => {
  const withSecrets = launch({ project: "p", keys: keys(["stripe"]).map((k) => ({ ...k, secret: `${k.id}-secret`, events: k.id.endsWith("events") ? "https://platform.example/e" : null, getIt: "https://x.example" })) });
  const { required, next } = launchSteps(withSecrets, [{ status: "live" }]);
  assert.equal(next.id, "connect-events");
  assert.deepEqual(required.map((s) => s.done), [true, false, false, false, true, true]);
  for (const step of required) {
    assert.doesNotMatch(`${step.title} ${step.why}`, /secret|webhook|_[A-Z]|setting:/i, step.id);
    if (!step.signup) assert.ok(step.action?.href, step.id);
  }
  assert.ok(next.how.some((line) => line.copy === "https://platform.example/e"));
  assert.equal(launchSteps(launch({ keys: keys(["stripe", "connect-events", "billing-events", "email"]), signupOpen: true }), [{ status: "live" }]).next, null);
  const google = googleSteps({ items: [{ id: "a", done: false, title: "T", words: "W", setting: 'X: "yes"', href: "https://g.example" }] });
  assert.equal(google[0].how[0].copy, 'X: "yes"');
  assert.deepEqual(googleSteps(null), []);
});
