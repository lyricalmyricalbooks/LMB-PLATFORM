// The jobs page (code plan 19.11): every job the platform runs on a schedule, each run recorded, and an email when one
// stops running.
//
//   JOBS                      every scheduled job in the code, with how often it is meant to run
//   createJobs({ store, email, alertTo, now })
//     runJob(name, fn)        runs one job and records it: { name, startedAt, finishedAt, ms, ok, error, summary }.
//                             Never throws: a failed job is a run with ok false (the hosted scheduler reads `ok`).
//                             Each job keeps its last 50 runs. After every run it checks the other jobs are on time.
//     jobsStatus({ now })     each job: its last run, last success, how long it took, and `late` when the last run
//                             started more than twice its gap ago. A job that has never run is `never`, not late: until
//                             a schedule calls it, nothing could have run it.
//     alertLate({ now })      emails the alert address (HEALTH_ALERT_TO, the health checks' address) once for each job
//                             that has gone late; it emails again only after the job has run on time and gone late again
//
// Clients passed in:
//   store   the run log (fakes.js has one in memory; clients/stores.js firestoreJobRuns is the real one):
//           add(name, run) keeps the newest KEEP_RUNS per job; list(name, { limit }) -> runs, newest first;
//           getState(name) / setState(name, state): whether the late alert was sent
//   email   sendPlatform(message) (services/email)
//   alertTo the platform's alert address; without it nothing is emailed and the page still shows the late jobs
//
// The hosted schedules wrap each job: `jobs.runJob("health-checks", () => realHealth({ job: "checks" }))`.
export const KEEP_RUNS = 50;
export const LATE_TIMES = 2;
export const JOB_LATE = "job-late";
const DAY = 24 * 60;

/** Every scheduled job in the platform's code. `every` is the intended gap, in minutes. */
export const JOBS = Object.freeze([
  { name: "health-checks", words: "Health checks of every shop, and the status page", every: 5, code: "services/health/run.js checks" },
  { name: "shop-maker", words: "Make the shops waiting in the sign-up line", every: 1, code: "signup/shopMaker.js sweep" },
  { name: "web-addresses", words: "Check web addresses that aren't live yet", every: 10, code: "services/domains/domains.js checkAll" },
  { name: "own-email-addresses", words: "Check presses' own sending addresses", every: 6 * 60, code: "services/email/ownDomain.js checkAll" },
  { name: "nightly-backups", words: "Nightly backups of every shop and the stockroom", every: DAY, code: "services/health/run.js nightly" },
  { name: "keep-times", words: "Remove records past the time they are kept", every: DAY, code: "services/retention/run.js" },
  { name: "self-checks", words: "Self-checks of every live shop", every: DAY, code: "control-room/self-check.js" },
  { name: "closing", words: "Close unpaid or ended shops on their dates", every: DAY, code: "services/billing/closing.js sweep" },
  { name: "dropped-apps", words: "Close an app a plan dropped once its month ends", every: DAY, code: "services/billing/billing.js closeDroppedApps" },
  { name: "trial-tips", words: "Setup tips during the free trial", every: DAY, code: "services/trial-tips/index.js run" },
  { name: "bookkeeping", words: "Send the day's sales to each press's bookkeeping", every: DAY, code: "services/accounting/index.js nightly" },
  { name: "income-record", words: "Write down the night's income, and remind presses a month before their card runs out", every: DAY, code: "control-room/nightly.js runBusinessNightly" },
  { name: "press-messages", words: "Take ended messages off shop admins, and reach shops opened since", every: 60, code: "control-room/messages.js sweep" },
  { name: "restore-drill", words: "Monthly test that a backup can be restored", every: 30 * DAY, code: "services/health/run.js drill" },
]);

const BY_NAME = new Map(JOBS.map((job) => [job.name, job]));
export const jobNamed = (name) => BY_NAME.get(name) ?? null;

const plainError = (error) => String(error?.message ?? error ?? "it stopped with no reason given").replace(/\s+/g, " ").trim().slice(0, 300);

/** A short summary of what a job returned: its own `summary`, or its counts ("checked 3, sent 1"). */
export function summaryOf(result) {
  if (typeof result === "string") return result.slice(0, 200);
  if (!result || typeof result !== "object") return "";
  if (typeof result.summary === "string") return result.summary.slice(0, 200);
  const counts = Object.entries(result).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v}`);
  const lists = Object.entries(result).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v.length}`);
  return [...counts, ...lists].join(", ").slice(0, 200);
}

export function createJobs({ store, email = null, alertTo = null, now = () => new Date() }) {
  if (!store) throw new Error("the jobs page needs its run log");

  async function jobsStatus({ now: at = now() } = {}) {
    const nowMs = at.getTime();
    const rows = [];
    for (const job of JOBS) {
      const runs = await store.list(job.name, { limit: KEEP_RUNS });
      const last = runs[0] ?? null;
      const lastOk = runs.find((run) => run.ok) ?? null;
      const late = Boolean(last) && nowMs - Date.parse(last.startedAt) > LATE_TIMES * job.every * 60_000;
      rows.push({
        name: job.name, words: job.words, every: job.every,
        lastRun: last ? { startedAt: last.startedAt, finishedAt: last.finishedAt, ms: last.ms, ok: last.ok, error: last.error ?? null, summary: last.summary ?? "" } : null,
        lastSuccessAt: lastOk?.startedAt ?? null,
        late,
        never: !last,
        runs: runs.length,
      });
    }
    return rows;
  }

  async function alertLate({ now: at = now() } = {}) {
    const sent = [];
    for (const row of await jobsStatus({ now: at })) {
      const state = (await store.getState(row.name)) ?? {};
      if (!row.late) {
        // Back on time: the next time it goes late is a new alert.
        if (state.lateAlertedAt) await store.setState(row.name, { ...state, lateAlertedAt: null, backOnTimeAt: at.toISOString() });
        continue;
      }
      if (state.lateAlertedAt || !email || !alertTo) continue;
      try {
        await email.sendPlatform({
          kind: JOB_LATE, to: alertTo, idempotencyKey: `job-late-${row.name}-${row.lastRun.startedAt}`,
          data: { job: row.name, words: row.words, every: row.every, lastRunAt: row.lastRun.startedAt },
        });
      } catch (failure) {
        // Left unmarked, so the next check sends it again.
        console.error(`couldn't send the late alert for ${row.name}: ${plainError(failure)}`);
        continue;
      }
      await store.setState(row.name, { ...state, lateAlertedAt: at.toISOString() });
      sent.push(row.name);
    }
    return { alerted: sent };
  }

  return {
    jobsStatus,
    alertLate,

    /** Runs one job and records the run. Returns the run. */
    async runJob(name, fn, { by = null, reason = null } = {}) {
      if (!jobNamed(name)) throw new Error(`there is no job called ${name}`);
      const started = now();
      let ok = true;
      let error = null;
      let result;
      try {
        result = await fn();
        if (result && typeof result === "object" && result.ok === false) {
          ok = false;
          error = plainError(result.error ?? "it finished but said something went wrong");
        }
      } catch (failure) {
        ok = false;
        error = plainError(failure);
      }
      const finished = now();
      const run = {
        name, startedAt: started.toISOString(), finishedAt: finished.toISOString(), ms: Math.max(0, finished.getTime() - started.getTime()),
        ok, error, summary: summaryOf(result), ...(by ? { by } : {}), ...(reason ? { reason } : {}),
      };
      await store.add(name, run);
      try {
        await alertLate({ now: finished });
      } catch (failure) {
        console.error(`couldn't check the jobs are on time: ${plainError(failure)}`);
      }
      return run;
    },
  };
}
