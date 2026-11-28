// When each scheduled job runs, as Cloud Scheduler wants it: a cron line in Toronto time per job in
// services/jobs/index.js JOBS, from its `every`. Jobs that run more than once a day run on a fixed beat (every 5
// minutes, every hour at :07…); daily and monthly ones run at a fixed time chosen here, spread over the night so they
// don't all start together, with the emails to presses in the morning. A daily or monthly job with no time here fails
// the test, so a new one gets a time on purpose.
import { JOBS } from "../services/jobs/index.js";

export const TIME_ZONE = "America/Toronto";
/** Montréal, where the platform's database already lives (waitlist/README.md). */
export const REGION = "northamerica-northeast1";
export const API_SERVICE = "platform-api";
export const JOBS_SERVICE = "platform-jobs";
/** The account Cloud Scheduler calls the jobs server as; the only one allowed to (server/README.md). */
export const schedulerAccount = (project) => `platform-scheduler@${project}.iam.gserviceaccount.com`;
/** Each job's Cloud Scheduler id. */
export const schedulerJobId = (name) => `platform-${name}`;
export const TICK_JOB_NAME = "tick";
export const TICK_CRON = "*/5 * * * *";

const DAY = 24 * 60;

/** Daily and monthly jobs: minute hour day-of-month month day-of-week, Toronto time. */
export const FIXED_TIMES = Object.freeze({
  "nightly-backups": "0 1 * * *",
  "keep-times": "30 1 * * *",
  closing: "0 2 * * *",
  "dropped-apps": "15 2 * * *",
  "every-app": "5 2 * * *",
  "terms-notice": "10 2 * * *",
  // Before the running costs, which bill by the meters it writes.
  "usage-meters": "35 2 * * *",
  "running-costs": "45 2 * * *",
  "bank-feed": "55 2 * * *",
  texts: "5 3 * * *",
  "income-record": "30 2 * * *",
  "self-checks": "0 3 * * *",
  bookkeeping: "30 3 * * *",
  // After QuickBooks has found its own lost companies, so the Shops page is complete in the morning.
  "connection-check": "45 3 * * *",
  // Emails a press reads: in the morning, never at night.
  "trial-tips": "0 9 * * *",
  "shop-checkup": "0 10 * * *",
  "setup-clock": "30 9 * * *",
  "drift-watch": "45 9 * * *",
  // Each morning, before the presses' emails: the orders that went wrong in Chit Chats yesterday.
  "chitchats-note": "15 8 * * *",
  // Each morning: card switches between Stripe and Square left waiting two days.
  "switch-note": "20 8 * * *",
  // Monday mornings: the week's deletions, while there is still time to act on them.
  "deletion-note": "0 8 * * 1",
  "weekly-summary": "10 8 * * 1",
  // The first of each month, before anyone is up.
  "restore-drill": "0 4 1 * *",
});

/** Off the hour, so the hourly and six-hourly jobs don't start with everything else. */
const OFFSET_MINUTE = { 60: 7, 360: 20 };

/** The cron line for one job. */
export function cronFor(job) {
  if (FIXED_TIMES[job.name]) return FIXED_TIMES[job.name];
  const every = job.every;
  if (every >= DAY) throw new Error(`${job.name} runs daily or less often: give it a time in FIXED_TIMES`);
  if (every < 60) {
    if (60 % every !== 0) throw new Error(`${job.name} runs every ${every} minutes, which doesn't divide an hour`);
    return every === 1 ? "* * * * *" : `*/${every} * * * *`;
  }
  const hours = every / 60;
  if (!Number.isInteger(hours) || 24 % hours !== 0) throw new Error(`${job.name} runs every ${every} minutes, which doesn't divide a day`);
  return `${OFFSET_MINUTE[every] ?? 0} ${hours === 1 ? "*" : `*/${hours}`} * * *`;
}

/**
 * The Cloud Scheduler job for one of ours (Cloud Scheduler REST v1, `Job`): an HTTP POST to the jobs server with an
 * OIDC token for the scheduler's account, which Cloud Run checks before the server sees the call. Daily and monthly
 * jobs are retried twice, five minutes apart at least; the frequent ones aren't (the next run is minutes away).
 */
export function schedulerJob({ project, region = REGION, job, jobsUrl }) {
  const base = String(jobsUrl ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(base)) throw new Error("the jobs server's address must be an https address with no path");
  const daily = job.every >= DAY;
  return {
    name: `projects/${project}/locations/${region}/jobs/${schedulerJobId(job.name)}`,
    description: job.words.slice(0, 500),
    schedule: cronFor(job),
    timeZone: TIME_ZONE,
    attemptDeadline: job.every < 10 ? "300s" : "1800s",
    retryConfig: daily ? { retryCount: 2, minBackoffDuration: "300s", maxDoublings: 2 } : { retryCount: 0 },
    httpTarget: {
      uri: `${base}/jobs/${job.name}`,
      httpMethod: "POST",
      oidcToken: { serviceAccountEmail: schedulerAccount(project), audience: base },
    },
  };
}

/**
 * One Cloud Scheduler job (`platform-tick`) wakes the jobs server every 5 minutes, keeping Cloud Scheduler inside
 * Google's free 3-job allowance ($0/mo instead of $2.70/mo for 30 jobs).
 */
export function platformTickJob({ project, region = REGION, jobsUrl }) {
  const base = String(jobsUrl ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(base)) throw new Error("the jobs server's address must be an https address with no path");
  return {
    name: `projects/${project}/locations/${region}/jobs/${schedulerJobId(TICK_JOB_NAME)}`,
    description: "Runs every scheduled platform job that is due",
    schedule: TICK_CRON,
    timeZone: TIME_ZONE,
    attemptDeadline: "1800s",
    retryConfig: { retryCount: 0 },
    httpTarget: {
      uri: `${base}/jobs/_tick`,
      httpMethod: "POST",
      oidcToken: { serviceAccountEmail: schedulerAccount(project), audience: base },
    },
  };
}

function localParts(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), mi: Number(parts.minute) };
}

function zonedToUtc(y, mo, d, h, mi, timeZone) {
  const offsetAt = (ms) => {
    const p = localParts(ms, timeZone);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60_000) * 60_000;
  };
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - offsetAt(guess - offsetAt(guess));
}

/** Latest wall-clock occurrence at or before `nowMs` for a fixed-minute cron (`M H|* *|DOM * *|DOW`). */
export function latestCronOccurrence(cron, nowMs, timeZone = TIME_ZONE) {
  const [minStr, hourStr, domStr, , dowStr] = cron.split(" ");
  const minute = Number(minStr);
  if (!Number.isInteger(minute)) return 0;
  const today = localParts(nowMs, timeZone);
  const hourStep = hourStr === "*" ? 1 : hourStr.startsWith("*/") ? Number(hourStr.slice(2)) : null;
  const fixedHour = hourStep === null ? Number(hourStr) : null;
  const dom = domStr === "*" ? null : Number(domStr);
  const dow = dowStr === "*" ? null : Number(dowStr);
  const maxDays = dom !== null ? 62 : dow !== null ? 8 : 2;
  for (let back = 0; back < maxDays; back += 1) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d - back));
    if (dom !== null && day.getUTCDate() !== dom) continue;
    if (dow !== null && day.getUTCDay() !== dow) continue;
    const hours = hourStep !== null ? Array.from({ length: 24 / hourStep }, (_, i) => i * hourStep).reverse() : [fixedHour];
    for (const h of hours) {
      const at = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, minute, timeZone);
      if (at <= nowMs) return at;
    }
  }
  return 0;
}

/** True when `job` should run at `nowMs` given its last run time (`lastRunMs`, 0 if never run). */
export function isCronDue(job, nowMs, lastRunMs = 0, timeZone = TIME_ZONE) {
  const cron = cronFor(job);
  const [minStr, hourStr] = cron.split(" ");
  if (hourStr === "*" && (minStr === "*" || minStr.startsWith("*/"))) {
    return !lastRunMs || nowMs - lastRunMs >= job.every * 60_000 - 30_000;
  }
  const latest = latestCronOccurrence(cron, nowMs, timeZone);
  if (!latest) return false;
  if (!lastRunMs) return job.every < DAY ? true : nowMs - latest < 15 * 60_000;
  return latest > lastRunMs;
}

/** Every job's schedule, for the plan and the README. */
export const schedulePlan = () => JOBS.map((job) => ({ name: job.name, every: job.every, cron: cronFor(job) }));
