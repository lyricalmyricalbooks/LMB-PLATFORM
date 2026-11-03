// Account-only sign-up (code plan 18.3): sign-up makes the account's setup record and nothing else. No trial, no card,
// no shop, no shop maker. A record is made only for a confirmed email, and a repeat start gives the same record back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountStart, MAX_SETUP_PRESSES } from "./accountStart.js";
import { SignupError } from "./signup.js";

const ADA = { uid: "uid-ada", email: "owner@example.com", email_verified: true };
const NOW = new Date("2026-11-03T09:00:00Z");

function fakePresses() {
  const rows = new Map();
  return {
    rows,
    get: async (id) => rows.get(id) ?? null,
    set: async (id, row) => rows.set(id, row),
    create: async (id, row) => (rows.has(id) ? false : (rows.set(id, row), true)),
    listByOwner: async (uid) => [...rows.values()].filter((r) => r.ownerUid === uid),
  };
}

test("starting makes one setup record in setup, and nothing else is touched", async () => {
  const presses = fakePresses();
  // createAccountStart takes no billing, shop or shop-maker client at all, so none of them can run here.
  const start = createAccountStart({ presses, now: () => NOW });
  const result = await start.start(ADA, { pressName: "Moth Press" });
  assert.deepEqual(result, { pressId: "moth-press", status: "setup" });
  assert.equal(presses.rows.size, 1);
  assert.equal(presses.rows.get("moth-press").ownerEmail, "owner@example.com");
  assert.equal(presses.rows.get("moth-press").pressName, "Moth Press");
});

test("an unconfirmed email makes no record", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW });
  await assert.rejects(start.start({ ...ADA, email_verified: false }, { pressName: "Moth" }), (error) => {
    assert.ok(error instanceof SignupError);
    assert.equal(error.status, 403);
    return true;
  });
  assert.equal(presses.rows.size, 0);
});

test("starting the same press again gives the same record back", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW });
  const first = await start.start(ADA, { pressName: "Moth Press" });
  const second = await start.start(ADA, { pressName: "moth press" });
  assert.equal(second.pressId, first.pressId);
  assert.equal(presses.rows.size, 1);
});

test("a taken press id gets a short suffix instead of overwriting", async () => {
  const presses = fakePresses();
  await presses.set("moth-press", { pressId: "moth-press", ownerUid: "someone-else", pressName: "Other", status: "setup" });
  const start = createAccountStart({ presses, now: () => NOW, suffix: () => "x7k2" });
  const result = await start.start(ADA, { pressName: "Moth Press" });
  assert.equal(result.pressId, "moth-press-x7k2");
  assert.equal(presses.rows.get("moth-press").ownerUid, "someone-else");
});

test("one account can hold up to five presses in setup", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW });
  for (let i = 0; i < MAX_SETUP_PRESSES; i += 1) await start.start(ADA, { pressName: `Press ${i} Books` });
  await assert.rejects(start.start(ADA, { pressName: "One Too Many" }), (error) => error.status === 429);
});

test("a short press name still gets a valid id", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW, suffix: () => "x7k2" });
  const result = await start.start(ADA, { pressName: "Ink" });
  assert.equal(result.pressId, "ink-x7k2");
  assert.equal(presses.rows.get("ink-x7k2").pressName, "Ink");
});

test("when an id is taken between the check and the save, the other press's record is never overwritten", async () => {
  const presses = fakePresses();
  const others = [];
  // Another press takes each id first, as if it started at the same moment.
  presses.create = async (id, row) => {
    if (!presses.rows.has(id) && others.length < 1) { presses.rows.set(id, { pressId: id, ownerUid: "someone-else" }); others.push(id); }
    return presses.rows.has(id) ? false : (presses.rows.set(id, row), true);
  };
  const start = createAccountStart({ presses, now: () => NOW, suffix: () => "x7k2" });
  const result = await start.start(ADA, { pressName: "Moth Press" });
  assert.equal(result.pressId, "moth-press-x7k2");
  assert.equal(presses.rows.get("moth-press").ownerUid, "someone-else");
});

test("starting with no name again gives back the press still in setup, not a second empty one", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW, suffix: () => "x7k2" });
  const first = await start.start(ADA, {});
  const second = await start.start(ADA, {});
  assert.equal(second.pressId, first.pressId);
  assert.equal(presses.rows.size, 1);
  assert.match(first.pressId, /^[a-z0-9-]{8,40}$/);
});

test("two sign-ins at the same moment (two open tabs) end with one press", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW });
  const [a, b] = await Promise.all([start.start(ADA, {}), start.start(ADA, {})]);
  assert.equal(a.pressId, b.pressId);
  assert.equal(presses.rows.size, 1);
});

test("a person whose press has moved past setup gets it back, not a new empty one", async () => {
  const presses = fakePresses();
  const start = createAccountStart({ presses, now: () => NOW });
  const { pressId } = await start.start(ADA, {});
  presses.rows.get(pressId).status = "open";
  const again = await start.start(ADA, {});
  assert.deepEqual(again, { pressId, status: "open" });
  assert.equal(presses.rows.size, 1);
});
