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
import { runRunningCosts } from "../services/billing/runningCostJob.js";
import { weeklyDeletionNote } from "../control-room/deletionNote.js";
import { weeklySummary } from "../control-room/weeklySummary.js";
import { switchNote } from "../control-room/switchNote.js";
import { chitChatsNote } from "../control-room/chitChatsNote.js";
import { controlRoomPeople } from "../control-room/people.js";
import { NOT_CONNECTED, NotConnected, notConnectedFn } from "./notConnected.js";

const quiet = () => {};
/** The platform owner's notes go to PLATFORM_ADMIN_EMAIL, else to the alert address. */
const ownerOf = (env) => controlRoomPeople(env).adminEmail ?? (String(env.HEALTH_ALERT_TO ?? "").trim() || null);
// The server's own platform project (PLATFORM_PROJECT), never the default one baked into the command-line runs.
const health = (parts, job) => realHealth({ job, env: parts.env, fetch: parts.fetch, token: parts.token, projectId: parts.projectId, print: quiet });

export const RUNNERS = Object.freeze({
  "health-checks": ({ parts }) => () => health(parts, "checks"),
  // The shared system makes shops once its two settings are there (server/world.js sharedShopRun).
  "shop-maker": ({ shopMaker, parts }) => (parts?.sharedShops ? () => shopMaker.sweep() : notConnectedFn(NOT_CONNECTED.shopMaking)),
  "web-addresses": ({ parts }) => (parts?.domains ? () => parts.domains.checkAll() : notConnectedFn(NOT_CONNECTED.domains)),
  "nightly-backups": ({ parts }) => () => health(parts, "nightly"),
  "keep-times": ({ parts }) => () => realRetention({ fetch: parts.fetch, token: parts.token, projectId: parts.projectId, print: quiet }),
  "self-checks": () => notConnectedFn(NOT_CONNECTED.selfChecks),
  closing: ({ closing }) => () => closing.sweep(),
  "dropped-apps": ({ billing }) => () => billing.closeDroppedApps(),
  // Every shop gets the website and the stockroom (10 November 2026): shops on an older plan move to it.
  "every-app": ({ billing }) => () => billing.giveEveryApp(),
  // The terms changed: presses on older words are emailed 30 days ahead (terms/notice.js).
  "terms-notice": ({ termsNotice }) => () => termsNotice.sweep(),
  // Pay what you use: needs a way to read each shop's cost (the billing export or the shared system's meters).
  // The shared system's per-shop meters (services/usage), written before the running costs read them.
  "usage-meters": ({ parts }) => (parts?.usage ? () => parts.usage.run() : notConnectedFn(NOT_CONNECTED.usageMeters)),
  "running-costs": ({ billing, parts }) => (parts?.costReader?.configured || parts?.usageMeters
    ? () => runRunningCosts({ billing, registry: parts.registry, meters: parts.usageMeters ?? null, reader: parts.costReader ?? null, now: parts.now })
    : notConnectedFn(NOT_CONNECTED.runningCosts)),
  "trial-tips": ({ trialTips }) => (trialTips ? () => trialTips.run() : notConnectedFn(NOT_CONNECTED.trialTips)),
  "shop-checkup": ({ checkups }) => (checkups ? () => checkups.run() : notConnectedFn(NOT_CONNECTED.checkups)),
  bookkeeping: () => notConnectedFn(NOT_CONNECTED.bookkeeping),
  "income-record": ({ parts }) => async () => runBusinessNightly({ registry: parts.registry, settings: await parts.live(), incomeHistory: parts.incomeHistory, billing: parts.billing, now: parts.now }),
  "press-messages": ({ pressMessages }) => () => pressMessages.sweep(),
  // Colophon's own apps are put (back) on the store first, so their alerts always have a listing to go to.
  "app-alerts": ({ appAlerts, parts }) => async () => {
    await parts?.ownApps?.ensure();
    return appAlerts.sweep();
  },
  "chitchats-tracking": ({ chitchats }) => () => chitchats.sweep(),
  "mailchimp-sync": ({ parts }) => () => parts.mailchimp.sweep(),
  "setup-clock": ({ setupClock }) => () => setupClock.sweep(),
  "drift-watch": ({ driftWatch }) => () => driftWatch.sweep(),
  "deletion-note": ({ parts }) => () => weeklyDeletionNote({ registry: parts.registry, email: parts.email, to: ownerOf(parts.env), now: parts.now }),
  "weekly-summary": ({ parts }) => async ({ byHand = false } = {}) => weeklySummary({ byHand, registry: parts.registry, email: parts.email, to: ownerOf(parts.env), settings: await parts.live(), shopData: parts.shopData ?? null, now: parts.now }),
  "switch-note": ({ parts }) => () => switchNote({ registry: parts.registry, email: parts.email, to: ownerOf(parts.env), now: parts.now }),
  "chitchats-note": ({ parts }) => () => chitChatsNote({ stores: parts.chitchatsStores, registry: parts.registry, email: parts.email, to: ownerOf(parts.env), now: parts.now }),
  "restore-drill": ({ parts }) => () => health(parts, "drill"),
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
  "running-costs": NOT_CONNECTED.runningCosts,
  "usage-meters": NOT_CONNECTED.usageMeters,
});

/** The jobs still waiting with the server's settings (server/env.yaml). */
export function waitingJobs(env = {}) {
  const shared = Boolean(String(env.SHARED_SHOPS_PROJECT ?? "").trim() && String(env.SHARED_SHOPS_DOMAIN ?? "").trim());
  // With the shared system on, it makes shops, meters each one's use and bills running costs by those meters.
  const on = new Set(shared ? ["shop-maker", "usage-meters", "running-costs", "web-addresses"] : []);
  return Object.fromEntries(Object.entries(WAITING_JOBS).filter(([name]) => !on.has(name)));
}

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
