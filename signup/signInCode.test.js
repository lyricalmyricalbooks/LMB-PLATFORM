// The six-digit sign-in code (code plan 18.3): one use, ten minutes, five tries, five codes an hour, and only a hash
// is ever stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignInCode, CODES_PER_HOUR, CODE_TRIES } from "./signInCode.js";

function harness({ start = new Date("2026-11-03T09:00:00Z"), digits = [123456] } = {}) {
  let clock = start.getTime();
  const rows = new Map();
  const sent = [];
  let next = 0;
  const service = createSignInCode({
    store: { get: async (k) => rows.get(k) ?? null, set: async (k, v) => rows.set(k, v), remove: async (k) => rows.delete(k) },
    sendEmail: async (message) => { sent.push(message); },
    now: () => new Date(clock),
    random: () => (digits[next++ % digits.length] ?? 0) / 1_000_000,
  });
  return { service, rows, sent, tick: (ms) => { clock += ms; } };
}

test("a code is sent, and works once", async () => {
  const h = harness();
  assert.deepEqual(await h.service.send("Owner@Example.com"), { ok: true });
  assert.equal(h.sent[0].to, "owner@example.com");
  assert.equal(h.sent[0].code, "123456");
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, true);
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, false, "a used code does not work twice");
});

test("only a hash is stored, never the code", async () => {
  const h = harness();
  await h.service.send("owner@example.com");
  const [row] = [...h.rows.values()];
  assert.equal(JSON.stringify(row).includes("123456"), false);
  assert.match(row.hash, /^[0-9a-f]{64}$/);
});

test("a code runs out after ten minutes", async () => {
  const h = harness();
  await h.service.send("owner@example.com");
  h.tick(11 * 60_000);
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, false);
});

test("five wrong tries lock the code", async () => {
  const h = harness();
  await h.service.send("owner@example.com");
  for (let i = 0; i < CODE_TRIES; i += 1) await h.service.check("owner@example.com", "000001");
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, false);
});

test("a sixth code in an hour is refused, and an hour later it is allowed", async () => {
  const h = harness();
  for (let i = 0; i < CODES_PER_HOUR; i += 1) assert.equal((await h.service.send("owner@example.com")).ok, true);
  assert.equal((await h.service.send("owner@example.com")).ok, false);
  h.tick(61 * 60_000);
  assert.equal((await h.service.send("owner@example.com")).ok, true);
});

test("an unknown address gets the same plain refusal, not a hint", async () => {
  const h = harness();
  const result = await h.service.check("nobody@example.com", "123456");
  assert.equal(result.ok, false);
  assert.match(result.message, /didn't match/);
});
