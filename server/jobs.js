// Every scheduled job (services/jobs/index.js JOBS) and what runs it on the hosted jobs server. A test fails when a job
// in JOBS has no entry here, so a new job can't be added without saying how it runs.
//
//   RUNNERS[name]            (world) => () => result   the real run, given the hosted world (server/world.js)
//                            or NOT_CONNECTED piece    the job can't run yet; its schedule is made paused
//   jobsHandler(world)       the jobs server's door:   POST /jobs/<name>  runs it once and records the run
//                            200 with the run when it went well, 500 when it didn't (the scheduler then logs a failure
//                            and retries); 404 for a job that doesn't exist; 405 for anything but POST
//
// The jobs server is private: Cloud Run lets only the scheduler's own account call it (server/README.md). The jobs are
// each safe to run twice, so a retry never sends an email twice or charges twice.
import { JOBS, jobNamed } from "../services/jobs/index.js";
import { realHealth } from "../services/health/run.js";
import { realRetention } from "../services/retention/run.js";
import { runBusinessNightly } from "../control-room/nightly.js";
import { weeklyDeletionNote } from "../control-room/deletionNote.js";
import { controlRoomPeople } from "../control-room/people.js";
import { createOwnDomainSender, resendDomainsFromEnv } from "../services/email/ownDomain.js";
import { NOT_CONNECTED, NotConnected, notConnectedFn } from "./notConnected.js";

const quiet = () => {};

export const RUNNERS = Object.freeze({
  "health-checks": ({ parts }) => () => realHealth({ job: "checks", env: parts.env, fetch: parts.fetch, token: parts.token, print: quiet }),
  "shop-maker": () => notConnectedFn(NOT_CONNECTED.shopMaking),
  "web-addresses": () => notConnectedFn(NOT_CONNECTED.domains),
  "own-email-addresses": ({ parts }) => () => createOwnDomainSender({
    resendDomains: resendDomainsFromEnv({ env: parts.env, fetch: parts.fetch }), registry: parts.registry, auditLog: parts.auditLog,
    // Only a shop that started its own address has anything to check, and starting one needs the domain service.
    domainsCall: notConnectedFn(NOT_CONNECTED.domains), email: parts.email, now: () => parts.now().getTime(),
  }).checkAll(),
  "nightly-backups": ({ parts }) => () => realHealth({ job: "nightly", env: parts.env, fetch: parts.fetch, token: parts.token, print: quiet }),
  "keep-times": ({ parts }) => () => realRetention({ fetch: parts.fetch, token: parts.token, print: quiet }),
  "self-checks": () => notConnectedFn(NOT_CONNECTED.selfChecks),
  closing: ({ closing }) => () => closing.sweep(),
  "dropped-apps": ({ billing }) => () => billing.closeDroppedApps(),
  "trial-tips": ({ trialTips }) => (trialTips ? () => trialTips.run() : notConnectedFn(NOT_CONNECTED.trialTips)),
  "shop-checkup": ({ checkups }) => (checkups ? () => checkups.run() : notConnectedFn(NOT_CONNECTED.checkups)),
  bookkeeping: () => notConnectedFn(NOT_CONNECTED.bookkeeping),
  "income-record": ({ parts }) => async () => runBusinessNightly({ registry: parts.registry, settings: await parts.live(), incomeHistory: parts.incomeHistory, billing: parts.billing, now: parts.now }),
  "press-messages": ({ pressMessages }) => () => pressMessages.sweep(),
  "setup-clock": ({ setupClock }) => () => setupClock.sweep(),
  "deletion-note": ({ parts }) => () => weeklyDeletionNote({ registry: parts.registry, email: parts.email, to: controlRoomPeople(parts.env).adminEmail ?? (String(parts.env.HEALTH_ALERT_TO ?? "").trim() || null), now: parts.now }),
  "restore-drill": ({ parts }) => () => realHealth({ job: "drill", env: parts.env, fetch: parts.fetch, token: parts.token, print: quiet }),
});

/**
 * The jobs that can't run yet, whatever the settings: their schedules are made paused. (Trial tips and the check-up
 * also need their secrets; server/deploy.js stops before deploying when a secret is missing, so on a deployed server
 * they run, and without them each run answers "not connected yet" and fails, which the late-job alert reports.)
 */
export const WAITING_JOBS = Object.freeze({
  "shop-maker": NOT_CONNECTED.shopMaking,
  "web-addresses": NOT_CONNECTED.domains,
  "self-checks": NOT_CONNECTED.selfChecks,
  bookkeeping: NOT_CONNECTED.bookkeeping,
});

/** The run function for one job in this world. */
export function runnerFor(world, name) {
  const make = RUNNERS[name];
  if (!make) throw new Error(`no runner for the job ${name}`);
  return make(world);
}

/** The jobs server's door. */
export function jobsHandler(world, { log = console.error } = {}) {
  return async function handle(request) {
    const match = /^\/jobs\/([a-z0-9-]+)\/?$/.exec(String(request?.path ?? ""));
    if (!match || !jobNamed(match[1]) || !RUNNERS[match[1]]) return { status: 404, body: { ok: false, message: "There's no job with that name." } };
    if (request.method !== "POST") return { status: 405, body: { ok: false, message: "Send a POST." } };
    const name = match[1];
    const run = await world.jobs.runJob(name, runnerFor(world, name));
    if (!run.ok) log(`job ${name} failed: ${run.error}`);
    return { status: run.ok ? 200 : 500, body: { ok: run.ok, run } };
  };
}

export { JOBS, NotConnected };
