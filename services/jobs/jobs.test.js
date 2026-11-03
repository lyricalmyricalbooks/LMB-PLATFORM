// The jobs page (code plan 19.11): every scheduled job is listed, each run is recorded (the last 50 kept), a job that
// misses its runs alerts once, and "Run now" is logged and admins only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOBS, JOB_LATE, KEEP_RUNS, createJobs, summaryOf } from "./index.js";
import { fakeJobRuns } from "./fakes.js";
import { SERVER_ONLY, createJobsPage, jobsRoutes } from "../../control-room/jobs.js";
import { controlRoomAdmins } from "../../control-room/controlRoom.js";
import { fakeActivity } from "../../control-room/fakes.js";
import { TEMPLATES } from "../email/templates.js";
import { createApi } from "../../signup/api.js";
import { fakeVerifyIdToken } from "../../signup/fakes.js";
import { platformSettings } from "../settings.js";

const START = Date.parse("2026-11-02T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(START / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

function world() {
  let clock = START;
  const store = fakeJobRuns();
  const sent = [];
  const email = { sendPlatform: async (message) => void sent.push(message) };
  const jobs = createJobs({ store, email, alertTo: "alerts@example.com", now: () => new Date(clock) });
  return { store, sent, jobs, now: () => new Date(clock), tick: (minutes) => void (clock += minutes * 60_000) };
}

test("every job the platform's code schedules is listed once, with its gap", () => {
  const names = JOBS.map((j) => j.name);
  assert.equal(new Set(names).size, names.length);
  for (const job of JOBS) {
    assert.ok(Number.isInteger(job.every) && job.every > 0, job.name);
    assert.ok(job.words && !/[A-Z]{3,}|API|webhook|Firebase/.test(job.words), `${job.name}: plain words`);
    // Each names the code it runs, and that code is really there.
    const [file, fn] = job.code.split(" ");
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    if (fn) assert.ok(source.includes(fn), `${job.code}`);
  }
  assert.equal(JOBS.find((j) => j.name === "health-checks").every, 5);
});

test("a run is recorded with its time, result and summary; a failure is a run, never a crash", async () => {
  const w = world();
  const ok = await w.jobs.runJob("trial-tips", async () => { w.tick(0.05); return { sent: [1, 2], skipped: 4 }; });
  assert.deepEqual([ok.ok, ok.error, ok.summary, ok.ms], [true, null, "skipped 4, sent 2", 3000]);
  const bad = await w.jobs.runJob("trial-tips", async () => { throw new Error("the email service didn't answer"); });
  assert.deepEqual([bad.ok, bad.error], [false, "the email service didn't answer"]);
  const soft = await w.jobs.runJob("keep-times", async () => ({ ok: false, error: "one collection couldn't be read" }));
  assert.equal(soft.ok, false);
  const [status] = (await w.jobs.jobsStatus()).filter((j) => j.name === "trial-tips");
  assert.equal(status.lastRun.ok, false);
  assert.equal(status.lastSuccessAt, ok.startedAt);
  assert.equal(status.runs, 2);
  await assert.rejects(w.jobs.runJob("no-such-job", async () => 1), /no job called/);
  assert.equal(summaryOf("made 2 shops"), "made 2 shops");
  assert.equal(summaryOf({ summary: "all fine", checked: 3 }), "all fine");
});

test("the run log keeps the newest 50 runs of each job", async () => {
  const w = world();
  for (let i = 0; i < KEEP_RUNS + 7; i += 1) {
    await w.jobs.runJob("health-checks", async () => ({ checked: i }));
    w.tick(5);
  }
  await w.jobs.runJob("shop-maker", async () => ({ made: 1 }));
  const runs = await w.store.list("health-checks", { limit: 500 });
  assert.equal(runs.length, KEEP_RUNS);
  assert.equal(runs[0].summary, `checked ${KEEP_RUNS + 6}`, "newest first");
  assert.equal(runs.at(-1).summary, "checked 7", "the oldest seven are gone");
  assert.equal((await w.store.list("shop-maker")).length, 1, "each job keeps its own");
});

test("a missed run alerts once; it alerts again only after it runs on time and goes late again", async () => {
  const w = world();
  // The health checks run every 5 minutes; the shop maker every minute and keeps the checking going.
  await w.jobs.runJob("health-checks", async () => ({}));
  const late = async () => (await w.jobs.jobsStatus()).find((j) => j.name === "health-checks");
  w.tick(9);
  await w.jobs.runJob("shop-maker", async () => ({}));
  assert.equal((await late()).late, false, "9 minutes is within twice the gap");
  assert.equal(w.sent.length, 0);

  w.tick(2);
  await w.jobs.runJob("shop-maker", async () => ({}));
  assert.equal((await late()).late, true);
  assert.equal(w.sent.length, 0, "a run checks the others at most every 5 minutes (the shop maker runs every minute)");
  w.tick(3);
  await w.jobs.runJob("shop-maker", async () => ({}));
  assert.equal(w.sent.length, 1);
  assert.deepEqual([w.sent[0].kind, w.sent[0].to, w.sent[0].data.job], [JOB_LATE, "alerts@example.com", "health-checks"]);
  for (let i = 0; i < 5; i += 1) {
    w.tick(1);
    await w.jobs.runJob("shop-maker", async () => ({}));
    await w.jobs.alertLate();
  }
  assert.equal(w.sent.length, 1, "once, however often it is checked");

  // It runs again: back on time, no email. Then it stops again: a second alert.
  await w.jobs.runJob("health-checks", async () => ({}));
  w.tick(5);
  await w.jobs.runJob("shop-maker", async () => ({}));
  assert.equal(w.sent.length, 1);
  w.tick(6);
  await w.jobs.runJob("shop-maker", async () => ({}));
  assert.equal(w.sent.length, 2);
  assert.notEqual(w.sent[1].idempotencyKey, w.sent[0].idempotencyKey);

  // A job that has never run is shown as not run yet, never as late.
  const never = (await w.jobs.jobsStatus()).find((j) => j.name === "restore-drill");
  assert.deepEqual([never.never, never.late, never.lastRun], [true, false, null]);
  assert.ok(!w.sent.some((m) => m.data.job === "restore-drill"));
});

test("an alert that couldn't be sent is tried again on the next check", async () => {
  const w = world();
  let down = true;
  const sent = [];
  const jobs = createJobs({ store: w.store, alertTo: "alerts@example.com", now: w.now, email: { sendPlatform: async (m) => { if (down) throw new Error("no answer"); sent.push(m); } } });
  await jobs.runJob("health-checks", async () => ({}));
  w.tick(20);
  const quiet = console.error;
  console.error = () => {};
  try {
    await jobs.alertLate();
  } finally {
    console.error = quiet;
  }
  assert.equal(sent.length, 0);
  down = false;
  await jobs.alertLate();
  assert.equal(sent.length, 1);
});

test("the late alert email says which job and since when, in plain words", () => {
  const parts = TEMPLATES[JOB_LATE]({ job: "health-checks", words: "Health checks of every shop", every: 5, lastRunAt: "2026-11-02T12:00:00Z" }, { settings: platformSettings({}) });
  assert.match(parts.subject, /Job late: Health checks of every shop/);
  assert.match(parts.text, /every 5 minutes/);
  assert.match(parts.text, /once/);
  assert.match(TEMPLATES[JOB_LATE]({ job: "nightly-backups", every: 1440 }, { settings: platformSettings({}) }).text, /every 1 day/);
  assert.throws(() => TEMPLATES[JOB_LATE]({}, { settings: platformSettings({}) }), /names no job/);
});

test("the Jobs page: admins only; Run now is logged with its reason, then runs; a server-only job answers 409", async () => {
  const w = world();
  const activity = fakeActivity();
  let made = 0;
  const page = createJobsPage({
    admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), runner: w.jobs, activity, now: w.now,
    jobs: { "shop-maker": async () => ({ made: (made += 1) }) },
  });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: jobsRoutes(page), log: () => {} });
  const ask = (claims, method, path, body) => api({ method, path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });

  assert.equal((await ask(PRESS, "GET", "/api/control/jobs")).status, 403);
  assert.equal((await ask(PRESS, "POST", "/api/control/jobs/run", { name: "shop-maker", reason: "a press is waiting on it" })).status, 403);
  const list = await ask(ADMIN, "GET", "/api/control/jobs");
  assert.equal(list.status, 200);
  assert.equal(list.body.jobs.length, JOBS.length);
  assert.equal(list.body.jobs.find((j) => j.name === "shop-maker").canRun, true);
  assert.equal(list.body.jobs.find((j) => j.name === "nightly-backups").canRun, false);

  assert.equal((await ask(ADMIN, "POST", "/api/control/jobs/run", { name: "shop-maker", reason: "short" })).status, 400);
  assert.equal((await ask(ADMIN, "POST", "/api/control/jobs/run", { name: "no-such-job", reason: "a press is waiting on it" })).status, 404);
  const serverOnly = await ask(ADMIN, "POST", "/api/control/jobs/run", { name: "nightly-backups", reason: "a backup was missed last night" });
  assert.deepEqual([serverOnly.status, serverOnly.body.message], [409, SERVER_ONLY]);
  assert.equal(activity.rows.size, 0, "nothing refused is logged");

  const ran = await ask(ADMIN, "POST", "/api/control/jobs/run", { name: "shop-maker", reason: "a press is waiting on it" });
  assert.equal(ran.status, 200);
  assert.deepEqual([ran.body.run.ok, ran.body.run.summary, ran.body.run.by], [true, "made 1", "admin@example.com"]);
  const [logged] = [...activity.rows.values()];
  assert.deepEqual([logged.what, logged.by, logged.detail.job, logged.detail.reason], ["job-run", "admin@example.com", "shop-maker", "a press is waiting on it"]);
  assert.equal((await w.store.list("shop-maker"))[0].reason, "a press is waiting on it");
});
