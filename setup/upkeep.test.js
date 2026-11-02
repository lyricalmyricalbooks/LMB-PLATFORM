import { test } from "node:test";
import assert from "node:assert/strict";
import { OLD_SWEEPS, TICK_JOB, createJobHooks, deleteAllJobs, jobIdOf, retireOldJobs, upkeepStep } from "./upkeep.js";
import { fakeGoogle } from "./fakes.js";
import { REGION } from "./steps.js";

const P = "lmb-test-shop";
const shop = { shopId: P };
const oldJobs = () => new Set([...OLD_SWEEPS.map((n) => jobIdOf(n)), "some-other-job"]);
function world() {
  const google = fakeGoogle();
  google.world.firebase.add(P);
  google.world.schedulerJobs.set(P, oldJobs());
  return google;
}

test("the step deletes the ten old jobs and sets the cleanup rule; a second run changes nothing", async () => {
  const google = world();
  google.world.schedulerJobs.get(P).add(TICK_JOB());
  const step = upkeepStep({ google, config: {} });
  assert.equal(await step.check({ shop }), false);
  await step.act({ shop });
  assert.equal(await step.check({ shop }), true);
  assert.deepEqual([...google.world.schedulerJobs.get(P)].sort(), [TICK_JOB(), "some-other-job"].sort(), "the tick and a job that isn't ours stay");
  assert.ok(google.world.buildCleanup.has(P));
  const before = google.calls.length;
  await step.act({ shop });
  assert.equal(google.calls.length, before, "nothing to delete or set the second time");
});

test("a shop without a build repository yet is not blocked by the cleanup rule", async () => {
  const google = fakeGoogle();
  google.world.schedulerJobs.set(P, new Set());
  assert.equal(await upkeepStep({ google, config: {} }).check({ shop }), true);
});

test("retireOldJobs never touches the tick job", async () => {
  const google = world();
  google.world.schedulerJobs.get(P).add(TICK_JOB());
  const deleted = await retireOldJobs({ scheduler: google.scheduler, projectId: P });
  assert.equal(deleted.length, 10);
  assert.ok(!deleted.includes(TICK_JOB()));
});

test("a paused or closed shop has no jobs, and reopening deploys the server code again", async () => {
  const google = world();
  google.world.schedulerJobs.get(P).add(TICK_JOB());
  const redeployed = [];
  const hooks = createJobHooks({ scheduler: google.scheduler, redeploy: async (s) => { redeployed.push(s.shopId); } });
  await hooks.onPause({ shopId: P });
  assert.deepEqual([...google.world.schedulerJobs.get(P)], ["some-other-job"], "only the server code's own jobs go");
  await hooks.onClose({ shopId: P });
  assert.deepEqual(await deleteAllJobs({ scheduler: google.scheduler, projectId: P }), [], "already gone is fine");
  await hooks.onReopen({ shopId: P });
  assert.deepEqual(redeployed, [P]);
  assert.equal(REGION, "northamerica-northeast1");
});
