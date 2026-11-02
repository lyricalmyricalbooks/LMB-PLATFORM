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

const DAY = 24 * 60;

/** Daily and monthly jobs: minute hour day-of-month month day-of-week, Toronto time. */
export const FIXED_TIMES = Object.freeze({
  "nightly-backups": "0 1 * * *",
  "keep-times": "30 1 * * *",
  closing: "0 2 * * *",
  "dropped-apps": "15 2 * * *",
  "income-record": "30 2 * * *",
  "self-checks": "0 3 * * *",
  bookkeeping: "30 3 * * *",
  // Emails a press reads: in the morning, never at night.
  "trial-tips": "0 9 * * *",
  "shop-checkup": "0 10 * * *",
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

/** Every job's schedule, for the plan and the README. */
export const schedulePlan = () => JOBS.map((job) => ({ name: job.name, every: job.every, cron: cronFor(job) }));
