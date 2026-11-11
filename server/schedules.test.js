import { test } from "node:test";
import assert from "node:assert/strict";
import { JOBS } from "../services/jobs/index.js";
import { scriptedFetch, token } from "../clients/fake-fetch.js";
import { FIXED_TIMES, TIME_ZONE, cronFor, schedulePlan, schedulerJob, schedulerAccount } from "./schedules.js";
import { CLOUD_RUN, RETIRED_JOBS, SCHEDULER, changedFields, setupSchedules } from "./setup-schedules.js";
import { WAITING_JOBS } from "./jobs.js";

const PROJECT = "lmb-platform-prod";
const REGION = "northamerica-northeast1";
const JOBS_URL = "https://platform-jobs-abc123-nn.a.run.app";
const DAY = 24 * 60;
const jobName = (name) => `projects/${PROJECT}/locations/${REGION}/jobs/platform-${name}`;

/** How many minutes apart a cron line's runs are, for the simple shapes we use. */
function gapOf(cron) {
  const [minute, hour, dom, , dow] = cron.split(" ");
  if (dom !== "*") return 30 * DAY;
  if (dow !== "*") return 7 * DAY;
  if (hour === "*") return minute === "*" ? 1 : minute.startsWith("*/") ? Number(minute.slice(2)) : 60;
  if (hour.startsWith("*/")) return Number(hour.slice(2)) * 60;
  return DAY;
}

test("every job has a schedule whose beat matches how often it is meant to run", () => {
  for (const job of JOBS) {
    const cron = cronFor(job);
    assert.match(cron, /^(\*|\*\/\d+|\d+) (\*|\*\/\d+|\d+) (\*|\d+) \* (\*|[0-6])$/, `${job.name}: ${cron}`);
    assert.equal(gapOf(cron), job.every, `${job.name}: ${cron} is not every ${job.every} minutes`);
  }
  assert.equal(cronFor(JOBS.find((j) => j.name === "health-checks")), "*/5 * * * *");
  assert.equal(cronFor(JOBS.find((j) => j.name === "shop-maker")), "* * * * *");
  assert.equal(cronFor(JOBS.find((j) => j.name === "press-messages")), "7 * * * *");
  assert.equal(schedulePlan().length, JOBS.length);
  assert.deepEqual(Object.keys(FIXED_TIMES).filter((name) => !JOBS.some((j) => j.name === name)), [], "a time for a job that doesn't exist");
});

test("the emails presses read go out in the morning, and the night jobs don't all start at once", () => {
  for (const name of ["trial-tips", "shop-checkup"]) {
    const hour = Number(FIXED_TIMES[name].split(" ")[1]);
    assert.ok(hour >= 8 && hour <= 11, `${name} at ${hour}`);
  }
  const night = Object.entries(FIXED_TIMES).filter(([name]) => !["trial-tips", "shop-checkup", "restore-drill", "deletion-note", "weekly-summary"].includes(name)).map(([, cron]) => cron);
  assert.equal(new Set(night).size, night.length);
  assert.throws(() => cronFor({ name: "new-daily", every: DAY }), /give it a time/);
  assert.throws(() => cronFor({ name: "odd", every: 7 }), /doesn't divide an hour/);
  assert.throws(() => cronFor({ name: "odd", every: 300 }), /doesn't divide a day/);
});

test("a schedule calls the jobs server as the scheduler's account, in Toronto time", () => {
  const job = schedulerJob({ project: PROJECT, job: JOBS.find((j) => j.name === "trial-tips"), jobsUrl: `${JOBS_URL}/` });
  assert.deepEqual(job, {
    name: jobName("trial-tips"),
    description: "Setup tips during the free trial",
    schedule: "0 9 * * *",
    timeZone: TIME_ZONE,
    attemptDeadline: "1800s",
    retryConfig: { retryCount: 2, minBackoffDuration: "300s", maxDoublings: 2 },
    httpTarget: { uri: `${JOBS_URL}/jobs/trial-tips`, httpMethod: "POST", oidcToken: { serviceAccountEmail: schedulerAccount(PROJECT), audience: JOBS_URL } },
  });
  assert.equal(schedulerJob({ project: PROJECT, job: JOBS[0], jobsUrl: JOBS_URL }).retryConfig.retryCount, 0);
  assert.throws(() => schedulerJob({ project: PROJECT, job: JOBS[0], jobsUrl: "http://plain.example" }), /https/);
});

test("only the fields we set count as a change: Google's own defaults don't", () => {
  const want = schedulerJob({ project: PROJECT, job: JOBS[0], jobsUrl: JOBS_URL });
  const have = { ...structuredClone(want), state: "ENABLED", userUpdateTime: "x", retryConfig: { retryCount: 0, maxRetryDuration: "0s", minBackoffDuration: "5s", maxBackoffDuration: "3600s", maxDoublings: 5 } };
  assert.deepEqual(changedFields(want, have), []);
  have.schedule = "*/10 * * * *";
  have.httpTarget.uri = "https://old.example/jobs/health-checks";
  assert.deepEqual(changedFields(want, have), ["schedule", "httpTarget"]);
});

/** Google's answers for a project that has some schedules already. */
function plan({ existing = {}, apply = false, retired = {} }) {
  const script = [{ method: "GET", url: `${CLOUD_RUN}/projects/${PROJECT}/locations/${REGION}/services/platform-jobs`, json: { uri: JOBS_URL } }];
  for (const job of JOBS) {
    const want = schedulerJob({ project: PROJECT, job, jobsUrl: JOBS_URL });
    const have = existing[job.name];
    script.push(have ? { method: "GET", url: `${SCHEDULER}/${want.name}`, json: have(want) } : { method: "GET", url: `${SCHEDULER}/${want.name}`, status: 404, json: { error: { status: "NOT_FOUND", message: "Job not found" } } });
    if (!apply) continue;
    const waiting = Boolean(WAITING_JOBS[job.name]);
    if (!have) {
      script.push({ method: "POST", url: `${SCHEDULER}/projects/${PROJECT}/locations/${REGION}/jobs`, body: want, json: { ...want, state: "ENABLED" } });
      if (waiting) script.push({ method: "POST", url: `${SCHEDULER}/${want.name}:pause`, body: {}, json: {} });
    }
  }
  // A job the code no longer has: read, and removed when it is still there.
  for (const name of RETIRED_JOBS) {
    const url = `${SCHEDULER}/${jobName(name)}`;
    script.push(retired[name] ? { method: "GET", url, json: { name: jobName(name) } } : { method: "GET", url, status: 404, json: { error: { status: "NOT_FOUND", message: "Job not found" } } });
    if (retired[name] && apply) script.push({ method: "DELETE", url, json: {} });
  }
  return script;
}

test("a schedule for a job the code no longer has is removed", async () => {
  const fetch = scriptedFetch(plan({ apply: true, retired: { "own-email-addresses": true } }));
  const { actions } = await setupSchedules({ fetch, token, apply: true, print: () => {} });
  fetch.done();
  assert.deepEqual(actions.find((a) => a.job === "own-email-addresses").does, ["delete"]);
});

test("the first run, with --apply, makes every schedule and pauses the ones that can't run yet", async () => {
  const fetch = scriptedFetch(plan({ apply: true }));
  const lines = [];
  const { actions } = await setupSchedules({ fetch, token, apply: true, print: (line) => lines.push(line) });
  fetch.done();
  assert.equal(actions.length, JOBS.length);
  assert.deepEqual(actions.find((a) => a.job === "shop-maker").does, ["create", "pause"]);
  assert.deepEqual(actions.find((a) => a.job === "trial-tips").does, ["create"]);
  assert.deepEqual(actions.find((a) => a.job === "shop-checkup").does, ["create"]);
  assert.match(lines.join("\n"), /shop-maker .*paused: waits on the Google organization/);
  assert.match(lines.at(-1), new RegExp(`Done: ${JOBS.length} schedules changed`));
});

test("without --apply it only reads, and says what it would do", async () => {
  const fetch = scriptedFetch(plan({ apply: false }));
  const lines = [];
  await setupSchedules({ fetch, token, print: (line) => lines.push(line) });
  fetch.done();
  assert.ok(fetch.seen.every((request) => request.method === "GET"));
  assert.match(lines.at(-1), /would change\. Run again with --apply/);
});

test("run again, it changes only what differs: a moved address, a job now able to run, one paused by hand", async () => {
  const existing = Object.fromEntries(JOBS.map((job) => [job.name, (want) => ({ ...want, state: WAITING_JOBS[job.name] ? "PAUSED" : "ENABLED" })]));
  existing["health-checks"] = (want) => ({ ...want, state: "ENABLED", httpTarget: { ...want.httpTarget, uri: "https://old.example/jobs/health-checks" } });
  existing["press-messages"] = (want) => ({ ...want, state: "PAUSED" });
  existing["self-checks"] = (want) => ({ ...want, state: "ENABLED" });
  const script = plan({ existing });
  // The writes, in order, after their job's read.
  const after = (name, ...writes) => script.splice(script.findIndex((s) => s.url === `${SCHEDULER}/${jobName(name)}`) + 1, 0, ...writes);
  const want = (name) => schedulerJob({ project: PROJECT, job: JOBS.find((j) => j.name === name), jobsUrl: JOBS_URL });
  after("health-checks", { method: "PATCH", url: `${SCHEDULER}/${jobName("health-checks")}?updateMask=httpTarget`, body: want("health-checks"), json: {} });
  after("self-checks", { method: "POST", url: `${SCHEDULER}/${jobName("self-checks")}:pause`, body: {}, json: {} });
  after("press-messages", { method: "POST", url: `${SCHEDULER}/${jobName("press-messages")}:resume`, body: {}, json: {} });
  const fetch = scriptedFetch(script);
  const { actions } = await setupSchedules({ fetch, token, apply: true, print: () => {} });
  fetch.done();
  assert.deepEqual(actions.filter((a) => a.does.length).map((a) => `${a.job}: ${a.does.join(" ")}`).sort(), [
    "health-checks: update httpTarget", "press-messages: resume", "self-checks: pause",
  ]);
});

test("with no jobs server yet it says to deploy first, and a given address skips the lookup", async () => {
  const missing = scriptedFetch([{ method: "GET", url: `${CLOUD_RUN}/projects/${PROJECT}/locations/${REGION}/services/platform-jobs`, status: 404, json: { error: { status: "NOT_FOUND", message: "not found" } } }]);
  await assert.rejects(setupSchedules({ fetch: missing, token, print: () => {} }), /deploy\.js --apply first/);
  const script = plan({}).slice(1);
  const fetch = scriptedFetch(script);
  const { jobsUrl } = await setupSchedules({ fetch, token, jobsUrl: JOBS_URL, print: () => {} });
  assert.equal(jobsUrl, JOBS_URL);
  fetch.done();
});
