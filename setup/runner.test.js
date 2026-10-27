import { test } from "node:test";
import assert from "node:assert/strict";
import { entryId, latestByStep, runSteps, stepProblems } from "./runner.js";
import { fakeAuditLog, fakeRegistry } from "./fakes.js";

const shop = { shopId: "lmb-test-shop" };

// Fake steps over a pretend world: each step's work is one flag. `failOn` makes a step's act throw once per listed name.
function fakeSteps(world, { failOn = [], names = ["reserve", "project", "firebase", "services", "database"] } = {}) {
  const failures = [...failOn];
  return names.map((name, index) => ({
    number: index + 1,
    name,
    async check() {
      world.checks.push(name);
      return Boolean(world.done[name]);
    },
    async act() {
      world.acts.push(name);
      const at = failures.indexOf(name);
      if (at >= 0) {
        failures.splice(at, 1);
        throw new Error(`${name} broke`);
      }
      world.done[name] = true;
    },
  }));
}

const newWorld = (done = {}) => ({ done: { ...done }, checks: [], acts: [] });
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 27, 12, 0, tick++));

test("runs every step in order and records each one", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const result = await runSteps({ shop, steps: fakeSteps(world), registry, auditLog, now: clock });
  assert.equal(result.ok, true);
  assert.deepEqual(world.acts, ["reserve", "project", "firebase", "services", "database"]);
  assert.deepEqual(result.ran.map((r) => r.status), ["done", "done", "done", "done", "done"]);
  const recorded = await registry.readSteps(shop.shopId);
  assert.deepEqual(recorded.map((e) => [e.step, e.status, e.acted]), [1, 2, 3, 4, 5].map((n) => [n, "done", true]));
  for (const entry of recorded) {
    assert.ok(entry.startedAt <= entry.finishedAt);
    assert.equal(entry.error, undefined);
  }
  assert.equal(auditLog.entries.get(shop.shopId).size, 5);
});

test("each step checks before it acts, so a second run changes nothing", async () => {
  const world = newWorld();
  const steps = fakeSteps(world);
  await runSteps({ shop, steps, registry: fakeRegistry(), auditLog: fakeAuditLog(), now: clock });
  world.acts.length = 0;
  // A fresh registry forgets the first run, so every step is asked again and every check says done.
  const second = await runSteps({ shop, steps, registry: fakeRegistry(), auditLog: fakeAuditLog(), now: clock });
  assert.equal(second.ok, true);
  assert.deepEqual(world.acts, []);
  assert.deepEqual(second.ran.map((r) => r.status), Array(5).fill("already-done"));
});

test("work done outside the runner is skipped, and recorded as done without acting", async () => {
  const world = newWorld({ project: true });
  const registry = fakeRegistry();
  const result = await runSteps({ shop, steps: fakeSteps(world), registry, auditLog: fakeAuditLog(), now: clock });
  assert.equal(result.ok, true);
  assert.ok(!world.acts.includes("project"));
  const project = (await registry.readSteps(shop.shopId)).find((e) => e.step === 2);
  assert.equal(project.status, "done");
  assert.equal(project.acted, false);
});

test("a failure stops the run, is recorded with its reason, and later steps don't run", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const result = await runSteps({ shop, steps: fakeSteps(world, { failOn: ["firebase"] }), registry, auditLog, now: clock });
  assert.equal(result.ok, false);
  assert.equal(result.failedStep, 3);
  assert.equal(result.error, "firebase broke");
  assert.deepEqual(world.acts, ["reserve", "project", "firebase"]);
  const latest = latestByStep(await registry.readSteps(shop.shopId));
  assert.equal(latest[3].status, "failed");
  assert.equal(latest[3].error, "firebase broke");
  assert.equal(latest[4], undefined);
  assert.ok([...auditLog.entries.get(shop.shopId).values()].some((e) => e.status === "failed"));
});

test("after a failure the next run starts at the failed step", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const steps = fakeSteps(world, { failOn: ["services"] });
  await runSteps({ shop, steps, registry, auditLog, now: clock });
  world.checks.length = 0;
  world.acts.length = 0;
  const lines = [];
  const result = await runSteps({ shop, steps, registry, auditLog, now: clock, print: (line) => lines.push(line) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ran.map((r) => r.status), ["done-before", "done-before", "done-before", "done", "done"]);
  assert.deepEqual(world.acts, ["services", "database"]);
  assert.ok(!world.checks.includes("reserve"), "steps done before are not asked again");
  assert.ok(lines.includes("Resuming lmb-test-shop at step 4."));
  assert.equal(latestByStep(await registry.readSteps(shop.shopId))[4].status, "done");
});

test("a step whose check still fails after acting counts as failed", async () => {
  const world = newWorld();
  const steps = fakeSteps(world).slice(0, 1);
  steps[0].act = async () => {}; // does nothing, so the check after it still says not done
  const result = await runSteps({ shop, steps, registry: fakeRegistry(), auditLog: fakeAuditLog(), now: clock });
  assert.equal(result.ok, false);
  assert.match(result.error, /check still says it isn't done/);
});

test("a check that throws stops the run before acting", async () => {
  const world = newWorld();
  const steps = fakeSteps(world);
  steps[1].check = async () => {
    throw new Error("Google didn't answer");
  };
  const result = await runSteps({ shop, steps, registry: fakeRegistry(), auditLog: fakeAuditLog(), now: clock });
  assert.equal(result.failedStep, 2);
  assert.deepEqual(world.acts, ["reserve"]);
});

test("the audit log gets the whole history once the shop's database exists", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  // The audit log only exists after the "database" step has run.
  const auditLog = fakeAuditLog({ isReady: () => world.done.database });
  const steps = fakeSteps(world, { names: ["reserve", "project", "database", "rules"], failOn: ["project"] });
  await runSteps({ shop, steps, registry, auditLog, now: clock });
  assert.equal(auditLog.entries.size, 0, "nothing written before the database exists");
  await runSteps({ shop, steps, registry, auditLog, now: clock });
  const audit = [...auditLog.entries.get(shop.shopId).values()];
  const recorded = await registry.readSteps(shop.shopId);
  assert.equal(audit.length, recorded.length);
  assert.deepEqual(new Set(audit.map(entryId)), new Set(recorded.map(entryId)));
  assert.ok(audit.some((e) => e.step === 2 && e.status === "failed"), "the earlier failure reached the audit log");
});

test("dry run prints the plan and changes nothing", async () => {
  const world = newWorld({ reserve: true });
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const lines = [];
  const result = await runSteps({ shop, steps: fakeSteps(world), registry, auditLog, dryRun: true, print: (l) => lines.push(l) });
  assert.equal(result.ok, true);
  assert.deepEqual(world.acts, []);
  assert.deepEqual(await registry.readSteps(shop.shopId), []);
  assert.equal(auditLog.entries.size, 0);
  assert.deepEqual(result.ran.map((r) => r.status), ["already-done", "would-run", "would-run", "would-run", "would-run"]);
  // Once a step would act, later checks are not asked: their project may not exist yet.
  assert.deepEqual(world.checks, ["reserve", "project"]);
  assert.deepEqual(lines, [
    "Dry run for lmb-test-shop: nothing will be changed.",
    "1. reserve: already done, would skip",
    "2. project: would run",
    "3. firebase: would run",
    "4. services: would run",
    "5. database: would run",
  ]);
});

test("dry run after a failure shows where the real run would resume", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const steps = fakeSteps(world, { failOn: ["firebase"] });
  await runSteps({ shop, steps, registry, auditLog: fakeAuditLog(), now: clock });
  const before = (await registry.readSteps(shop.shopId)).length;
  const result = await runSteps({ shop, steps, registry, auditLog: fakeAuditLog(), dryRun: true });
  assert.deepEqual(result.ran.map((r) => r.status), ["done-before", "done-before", "would-run", "would-run", "would-run"]);
  assert.equal((await registry.readSteps(shop.shopId)).length, before);
});

test("badly numbered or incomplete steps are refused before anything runs", async () => {
  const world = newWorld();
  const steps = fakeSteps(world);
  assert.deepEqual(stepProblems(steps), []);
  assert.deepEqual(stepProblems([]), ["there are no steps"]);
  assert.deepEqual(stepProblems([steps[0], steps[2]]), ["step 2 is numbered 3"]);
  assert.deepEqual(stepProblems([{ ...steps[0], name: " ", act: undefined }]), ["step 1 has no name", "step 1 has no act"]);
  await assert.rejects(
    runSteps({ shop, steps: [steps[1]], registry: fakeRegistry(), auditLog: fakeAuditLog() }),
    /step 1 is numbered 2/,
  );
  await assert.rejects(runSteps({ shop: {}, steps, registry: fakeRegistry(), auditLog: fakeAuditLog() }), /no shopId/);
  assert.deepEqual(world.acts, []);
});

test("the runner has no way to delete anything", async () => {
  const { readFile } = await import("node:fs/promises");
  const code = await readFile(new URL("./runner.js", import.meta.url), "utf8");
  assert.doesNotMatch(code.replace(/^\s*\/\/.*$/gm, ""), /delete|remove/i);
});

// One run per shop at a time.

test("a second run on the same shop is turned away while the first is working, and changes nothing", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const auditLog = fakeAuditLog();
  const steps = fakeSteps(world);
  let letGo;
  const held = new Promise((resolve) => (letGo = resolve));
  steps[1].act = async () => {
    await held;
    world.done.project = true;
  };
  const first = runSteps({ shop, steps, registry, auditLog, runId: "run-a" });
  while (!world.checks.includes("project")) await new Promise((resolve) => setImmediate(resolve));
  const recorded = (await registry.readSteps(shop.shopId)).length;
  const lines = [];
  const second = await runSteps({ shop, steps, registry, auditLog, runId: "run-b", print: (line) => lines.push(line) });
  assert.equal(second.ok, false);
  assert.equal(second.locked, true);
  assert.deepEqual(second.ran, []);
  assert.match(second.error, /another run is working on lmb-test-shop/);
  assert.match(lines[0], /^Stopped: another run/);
  assert.equal((await registry.readSteps(shop.shopId)).length, recorded, "the turned-away run recorded nothing");
  assert.equal((await registry.readLock(shop.shopId)).runId, "run-a", "and left the first run's lock alone");
  letGo();
  assert.equal((await first).ok, true);
  assert.equal(registry.locks.size, 0);
  assert.equal(world.acts.filter((name) => name === "reserve").length, 1);
});

test("a lock left by a crashed run lapses and the next run takes it over", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  await registry.takeLock(shop.shopId, { runId: "crashed", takenAt: "2026-10-27T09:00:00.000Z", expiresAt: "2026-10-27T10:00:00.000Z" });
  const result = await runSteps({ shop, steps: fakeSteps(world), registry, auditLog: fakeAuditLog(), now: clock });
  assert.equal(result.ok, true);
  assert.equal(registry.locks.size, 0);
});

test("a run whose lock was taken over stops before its next step", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const steps = fakeSteps(world);
  // Step 2 runs so long its lock lapses, and another run takes the shop meanwhile.
  steps[1].act = async () => {
    world.done.project = true;
    await registry.takeLock(shop.shopId, { runId: "other", takenAt: "2099-01-01T00:00:00.000Z", expiresAt: "2099-01-01T01:00:00.000Z" });
  };
  const result = await runSteps({ shop, steps, registry, auditLog: fakeAuditLog(), now: clock, runId: "slow" });
  assert.equal(result.ok, false);
  assert.equal(result.locked, true);
  assert.match(result.error, /took over lmb-test-shop before step 3/);
  assert.deepEqual(world.acts, ["reserve"]);
  assert.equal((await registry.readLock(shop.shopId)).runId, "other", "the other run keeps its lock");
});

test("the lock is given back after a failure, so the retry can run", async () => {
  const world = newWorld();
  const registry = fakeRegistry();
  const steps = fakeSteps(world, { failOn: ["firebase"] });
  assert.equal((await runSteps({ shop, steps, registry, auditLog: fakeAuditLog(), now: clock })).failedStep, 3);
  assert.equal(registry.locks.size, 0);
  assert.equal((await runSteps({ shop, steps, registry, auditLog: fakeAuditLog(), now: clock })).ok, true);
});

test("a lock on one shop doesn't hold up another", async () => {
  const registry = fakeRegistry();
  await registry.takeLock("other-shop", { runId: "x", takenAt: "2026-10-27T12:00:00.000Z", expiresAt: "2999-01-01T00:00:00.000Z" });
  const result = await runSteps({ shop, steps: fakeSteps(newWorld()), registry, auditLog: fakeAuditLog(), now: clock });
  assert.equal(result.ok, true);
  assert.equal((await registry.readLock("other-shop")).runId, "x");
});

test("a dry run takes no lock, and says when a real run would be turned away", async () => {
  const registry = fakeRegistry();
  await registry.takeLock(shop.shopId, { runId: "busy", takenAt: "2026-10-27T12:00:00.000Z", expiresAt: "2999-01-01T00:00:00.000Z" });
  const lines = [];
  const result = await runSteps({ shop, steps: fakeSteps(newWorld()), registry, auditLog: fakeAuditLog(), dryRun: true, print: (l) => lines.push(l) });
  assert.equal(result.ok, true);
  assert.match(lines[0], /Another run is working on lmb-test-shop until 2999-01-01T00:00:00.000Z; a real run would be turned away/);
  assert.equal((await registry.readLock(shop.shopId)).runId, "busy");
});
