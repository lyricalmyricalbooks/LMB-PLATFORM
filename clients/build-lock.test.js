import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCK_FILE, buildLock } from "./build-lock.js";

const folder = () => mkdtemp(join(tmpdir(), "lmb-lock-"));
const exists = (path) => access(path).then(() => true, () => false);

test("two deploys into one build folder take turns, and the lock is gone afterwards", async () => {
  const dir = await folder();
  const withBuildLock = buildLock({ pollMs: 5 });
  const order = [];
  const deploy = (name, ms) => withBuildLock(dir, async () => {
    order.push(`${name} starts`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${name} ends`);
    return name;
  });
  assert.deepEqual(await Promise.all([deploy("a", 30), deploy("b", 1)]), ["a", "b"]);
  assert.deepEqual(order, ["a starts", "a ends", "b starts", "b ends"]);
  assert.equal(await exists(join(dir, LOCK_FILE)), false);
});

test("a failed deploy still lets the next one go", async () => {
  const dir = await folder();
  const withBuildLock = buildLock({ pollMs: 5 });
  await assert.rejects(withBuildLock(dir, async () => { throw new Error("deploy failed"); }), /deploy failed/);
  assert.equal(await withBuildLock(dir, async () => "next"), "next");
});

test("a lock left by a process that died, or a very old one, is taken over", async () => {
  const dir = await folder();
  await writeFile(join(dir, LOCK_FILE), JSON.stringify({ pid: 999999, at: Date.now() }));
  assert.equal(await buildLock({ pollMs: 5, isAlive: () => false })(dir, async () => "ran"), "ran");
  await writeFile(join(dir, LOCK_FILE), JSON.stringify({ pid: process.pid, at: Date.now() - 2 * 60 * 60_000 }));
  assert.equal(await buildLock({ pollMs: 5 })(dir, async () => "ran again"), "ran again");
});

test("a live lock is waited for, then reported instead of waited on for ever", async () => {
  const dir = await folder();
  await writeFile(join(dir, LOCK_FILE), JSON.stringify({ pid: process.pid, at: Date.now() }));
  let clock = 0;
  const withBuildLock = buildLock({ now: () => clock, sleep: async () => { clock += 60_000; }, isAlive: () => true, staleMs: Infinity, waitMs: 5 * 60_000 });
  await assert.rejects(withBuildLock(dir, async () => "never"), /held the release build folder for too long/);
  assert.match(await readFile(join(dir, LOCK_FILE), "utf8"), new RegExp(String(process.pid)), "someone else's lock is left alone");
});
