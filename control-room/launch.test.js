// The Launch page's words: what is ready, and what each walkthrough step still waits for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WALK_STORE, launchSummary, readTicks, saveTicks, walkSteps } from "./launch.js";

const keys = (ready) => ["stripe", "connect-events", "billing-events", "email"].map((id) => ({ id, label: id, ready: ready.includes(id) }));
const launch = (over = {}) => ({ platformUrl: "https://platform.example", signupOpen: false, invites: true, shopMaking: true, keys: keys([]), ...over });

test("the summary counts the keys, the test shop and a way in", () => {
  assert.deepEqual(launchSummary(launch(), null), { ready: 1, total: 6, missing: 5 });
  const all = launch({ keys: keys(["stripe", "connect-events", "billing-events", "email"]) });
  assert.deepEqual(launchSummary(all, { status: "live" }), { ready: 6, total: 6, missing: 0 });
  assert.equal(launchSummary({ ...all, invites: false }, { status: "live" }).missing, 1);
});

test("each walkthrough step names only what it still waits for", () => {
  const needs = (l) => Object.fromEntries(walkSteps(l).map((s) => [s.id, s.needs]));
  const bare = needs(launch({ shopMaking: false }));
  assert.deepEqual(bare.join, ["email", "an invite for your test address (Sign-ups)", "the platform's Google access, so it can make a store"]);
  assert.deepEqual(bare.billing, ["stripe", "billing-events"]);
  assert.deepEqual(bare.cards, ["stripe", "connect-events"]);
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
