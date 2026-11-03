// The six-digit sign-in code: ten minutes, five codes an hour, ten wrong codes an hour across every code, only hashes
// stored, earlier codes kept working, and every limit holding when requests arrive at the same moment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODES_PER_HOUR, NO_MATCH, TOO_MANY_WRONG, WRONG_PER_HOUR, createSignInCode } from "./signInCode.js";
import { fakeFrontDoorStores } from "./fakes.js";

function harness({ start = new Date("2026-11-03T09:00:00Z"), digits = [123456] } = {}) {
  let clock = start.getTime();
  const { codes } = fakeFrontDoorStores();
  const sent = [];
  let next = 0;
  const service = createSignInCode({
    store: codes,
    sendEmail: async (message) => { sent.push(message); },
    now: () => new Date(clock),
    random: () => (digits[next++ % digits.length] ?? 0) / 1_000_000,
  });
  return { service, rows: codes.rows, sent, tick: (ms) => { clock += ms; } };
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
  assert.match(row.codes[0].hash, /^[0-9a-f]{64}$/);
});

test("a code runs out after ten minutes", async () => {
  const h = harness();
  await h.service.send("owner@example.com");
  h.tick(11 * 60_000);
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, false);
});

test("a new code doesn't stop an earlier one from working", async () => {
  const h = harness({ digits: [111111, 222222] });
  await h.service.send("owner@example.com");
  await h.service.send("owner@example.com");
  assert.equal((await h.service.check("owner@example.com", "111111")).ok, true);
  assert.equal((await h.service.check("owner@example.com", "222222")).ok, false, "signing in uses up every waiting code");
});

test("ten wrong codes in an hour lock every code until the hour has passed", async () => {
  const h = harness();
  await h.service.send("owner@example.com");
  for (let i = 0; i < WRONG_PER_HOUR; i += 1) await h.service.check("owner@example.com", "000001");
  const locked = await h.service.check("owner@example.com", "123456");
  assert.deepEqual(locked, { ok: false, message: TOO_MANY_WRONG });
  h.tick(61 * 60_000);
  await h.service.send("owner@example.com");
  assert.equal((await h.service.check("owner@example.com", "123456")).ok, true, "an hour later a new code works");
});

test("a sixth code in an hour is refused, and an hour later it is allowed", async () => {
  const h = harness();
  for (let i = 0; i < CODES_PER_HOUR; i += 1) assert.equal((await h.service.send("owner@example.com")).ok, true);
  assert.equal((await h.service.send("owner@example.com")).ok, false);
  h.tick(61 * 60_000);
  assert.equal((await h.service.send("owner@example.com")).ok, true);
});

test("using or locking codes never resets the hourly limit on sending", async () => {
  const h = harness();
  for (let i = 0; i < CODES_PER_HOUR; i += 1) {
    await h.service.send("owner@example.com");
    await h.service.check("owner@example.com", "123456");
  }
  assert.equal((await h.service.send("owner@example.com")).ok, false);
  assert.equal(h.sent.length, CODES_PER_HOUR);
});

test("a wrong code reads the same whether or not a code is waiting", async () => {
  const h = harness();
  const nothing = await h.service.check("nobody@example.com", "123456");
  await h.service.send("owner@example.com");
  const wrong = await h.service.check("owner@example.com", "654321");
  assert.deepEqual(nothing, { ok: false, message: NO_MATCH });
  assert.deepEqual(wrong, nothing);
  assert.equal(h.rows.size, 1, "a guess at an address with no code writes nothing");
});

test("guesses sent all at once are still held to ten, so the right code can't be found by a burst", async () => {
  const h = harness({ digits: [424242] });
  await h.service.send("owner@example.com");
  const guesses = Array.from({ length: 200 }, (_, i) => String(i).padStart(6, "0"));
  const answers = await Promise.all([...guesses, "424242"].map((code) => h.service.check("owner@example.com", code)));
  assert.equal(answers.at(-1).ok, false, "the right code, sent after ten wrong ones in the same burst, is locked out");
  assert.equal(answers.filter((a) => a.message === NO_MATCH).length, WRONG_PER_HOUR);
});

test("sends all at once are still held to five emails an hour", async () => {
  const h = harness();
  const answers = await Promise.all(Array.from({ length: 30 }, () => h.service.send("owner@example.com")));
  assert.equal(answers.filter((a) => a.ok).length, CODES_PER_HOUR);
  assert.equal(h.sent.length, CODES_PER_HOUR);
});

test("without a test random source, codes are six digits from the crypto source", async () => {
  const { codes } = fakeFrontDoorStores();
  const sent = [];
  const service = createSignInCode({ store: codes, sendEmail: async (m) => { sent.push(m); } });
  await service.send("owner@example.com");
  assert.match(sent[0].code, /^\d{6}$/);
  assert.equal((await service.check("owner@example.com", sent[0].code)).ok, true);
});
