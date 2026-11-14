import { test } from "node:test";
import assert from "node:assert/strict";
import { JOBS } from "../services/jobs/index.js";
import { RUNNERS, WAITING_JOBS, jobsHandler, runnerFor, waitingJobs } from "./jobs.js";
import { hostedWorld } from "./world.js";
import { TEST_ENV, TEST_PROJECT, fakeOutside } from "./fakes.js";

const build = (env = TEST_ENV, log = () => {}) => {
  const outside = fakeOutside();
  const world = hostedWorld({ env, fetch: outside.fetch, token: outside.token, log: () => {} });
  return { outside, world, handle: jobsHandler(world, { log }) };
};

test("every scheduled job has a runner, and nothing runs that isn't a scheduled job", () => {
  assert.deepEqual(JOBS.map((j) => j.name).filter((name) => !RUNNERS[name]), [], "jobs with no runner in server/jobs.js");
  assert.deepEqual(Object.keys(RUNNERS).filter((name) => !JOBS.some((j) => j.name === name)), []);
  for (const name of Object.keys(WAITING_JOBS)) assert.ok(RUNNERS[name], name);
  assert.ok(RUNNERS["trial-tips"] && RUNNERS["shop-checkup"], "the trial tips and the monthly check-up are scheduled");
  const { world } = build();
  for (const job of JOBS) assert.equal(typeof runnerFor(world, job.name), "function", job.name);
  assert.throws(() => runnerFor(world, "nope"), /no runner/);
});

test("a job runs once per call and is recorded; a good run answers 200", async () => {
  const { handle, outside } = build();
  const answer = await handle({ method: "POST", path: "/jobs/press-messages", headers: {} });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.run.name, "press-messages");
  assert.equal(answer.body.run.ok, true);
  assert.equal(outside.firestore.paths(TEST_PROJECT, "jobRuns/").length, 1);
  for (const name of ["trial-tips", "shop-checkup", "dropped-apps"]) {
    const done = await handle({ method: "POST", path: `/jobs/${name}`, headers: {} });
    assert.equal(done.status, 200, `${name}: ${JSON.stringify(done.body)}`);
  }
  assert.deepEqual(outside.other, []);
});

test("the health, backup, keep-times and drill jobs read the server's own platform project, never the default one", async () => {
  const outside = fakeOutside();
  const projects = new Set();
  const fetch = async (url, init) => {
    const match = /\/projects\/([^/]+)\/databases\//.exec(String(url));
    if (match) projects.add(match[1]);
    return outside.fetch(url, init);
  };
  const world = hostedWorld({ env: TEST_ENV, fetch, token: outside.token, log: () => {} });
  for (const name of ["health-checks", "nightly-backups", "keep-times", "restore-drill"]) {
    projects.clear();
    await runnerFor(world, name)();
    assert.deepEqual([...projects], [TEST_PROJECT], name);
  }
});

test("a job that can't run yet is a failed run that says what it waits for, answered 500 so the scheduler notices", async () => {
  const logged = [];
  const { handle } = build(TEST_ENV, (line) => logged.push(line));
  const answer = await handle({ method: "POST", path: "/jobs/shop-maker", headers: {} });
  assert.equal(answer.status, 500);
  assert.equal(answer.body.run.ok, false);
  assert.match(answer.body.run.error, /isn't switched on yet/);
  assert.match(logged.join("\n"), /shop-maker failed/);
  const { handle: bare } = build({ ...TEST_ENV, TRIAL_TIPS_SECRET: "" });
  const tips = await bare({ method: "POST", path: "/jobs/trial-tips", headers: {} });
  assert.equal(tips.status, 500);
  assert.match(tips.body.run.error, /switched on yet/);
});

test("an unknown job is 404 and anything but a POST is 405", async () => {
  const { handle, outside } = build();
  assert.equal((await handle({ method: "POST", path: "/jobs/no-such-job", headers: {} })).status, 404);
  assert.equal((await handle({ method: "POST", path: "/jobs/", headers: {} })).status, 404);
  assert.equal((await handle({ method: "POST", path: "/api/plans", headers: {} })).status, 404);
  assert.equal((await handle({ method: "GET", path: "/jobs/press-messages", headers: {} })).status, 405);
  assert.equal(outside.firestore.paths(TEST_PROJECT, "jobRuns/").length, 0, "nothing ran");
});

test("with the shared system's two settings, the shop-maker job runs and its schedule isn't paused", async () => {
  const shared = { ...TEST_ENV, SHARED_SHOPS_PROJECT: "lmb-test-shop", SHARED_SHOPS_DOMAIN: "shops.example" };
  const { handle } = build(shared);
  const answer = await handle({ method: "POST", path: "/jobs/shop-maker", headers: {} });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.run.ok, true);
  assert.ok(waitingJobs(TEST_ENV)["shop-maker"]);
  assert.equal(waitingJobs(shared)["shop-maker"], undefined);
  assert.equal(waitingJobs(shared)["web-addresses"], undefined, "web addresses need no deploy there");
  assert.equal(waitingJobs(TEST_ENV)["web-addresses"], undefined, "a press's own domain needs no setting, so the check always runs");
  assert.ok(waitingJobs(shared)["self-checks"], "the others still wait");
});
