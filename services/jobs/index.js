// The jobs page (code plan 19.11): every job the platform runs on a schedule, each run recorded, and an email when one
// stops running.
//
//   JOBS                      every scheduled job in the code, with how often it is meant to run
//   createJobs({ store, email, alertTo, now })
//     runJob(name, fn)        runs one job and records it: { name, startedAt, finishedAt, ms, ok, error, summary }.
//                             Never throws: a failed job is a run with ok false (the hosted scheduler reads `ok`).
//                             Each job keeps its last 50 runs. After a run it checks the other jobs are on time (at
//                             most once every 5 minutes, reading only each job's newest run).
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
// The hosted schedules wrap each job: `jobs.runJob("health-checks", () => realHealth({ job: "checks" }))`; server/jobs.js
// gives every job here its runner and server/schedules.js its time (a test fails when one is missing).
export const KEEP_RUNS = 50;
export const LATE_TIMES = 2;
export const JOB_LATE = "job-late";
/** How often, at most, a finished run also checks the other jobs are on time. */
export const LATE_CHECK_MINUTES = 5;
const DAY = 24 * 60;

/** Every scheduled job in the platform's code. `every` is the intended gap, in minutes. */
export const JOBS = Object.freeze([
  { name: "health-checks", words: "Health checks of every shop, and the status page", every: 5, code: "services/health/run.js checks" },
  { name: "shop-maker", words: "Make the shops waiting in the sign-up line", every: 1, code: "signup/shopMaker.js sweep" },
  { name: "web-addresses", words: "Check web addresses: new ones until they work, and each one once a day (still working, and when it runs out)", every: 10, code: "services/domains/domains.js checkAll" },
  { name: "own-email-addresses", words: "Check presses' own sending addresses", every: 6 * 60, code: "services/email/ownDomain.js checkAll" },
  { name: "nightly-backups", words: "Nightly backups of every shop and the stockroom", every: DAY, code: "services/health/run.js nightly" },
  { name: "keep-times", words: "Remove records past the time they are kept", every: DAY, code: "services/retention/run.js" },
  { name: "self-checks", words: "Self-checks of every live shop", every: DAY, code: "control-room/self-check.js" },
  { name: "closing", words: "Close unpaid or ended shops on their dates", every: DAY, code: "services/billing/closing.js sweep" },
  { name: "dropped-apps", words: "Close an app a plan dropped once its month ends", every: DAY, code: "services/billing/billing.js closeDroppedApps" },
  { name: "drift-watch", words: "Spot paying presses whose shop has gone quiet (and send one gentle check-in), moves from an old shop left part-way, and newsletters that stopped", every: DAY, code: "control-room/driftWatch.js sweep" },
  { name: "setup-clock", words: "Warn presses whose setup hasn't been visited, then clear it after 60 days", every: DAY, code: "signup/setupClock.js sweep" },
  { name: "trial-tips", words: "Setup tips during the free trial", every: DAY, code: "services/trial-tips/index.js run" },
  { name: "shop-checkup", words: "The monthly check-up email to each live shop (it runs daily and sends each shop one a month)", every: DAY, code: "services/checkup/index.js run" },
  { name: "bookkeeping", words: "Send the day's sales to each press's bookkeeping", every: DAY, code: "services/accounting/index.js nightly" },
  { name: "income-record", words: "Write down the night's income, and remind presses a month before their card runs out", every: DAY, code: "control-room/nightly.js runBusinessNightly" },
  { name: "app-alerts", words: "Tell installed apps about new orders, sent orders, refunds, product and stock changes", every: 1, code: "services/apps/alerts.js sweep" },
  { name: "chitchats-tracking", words: "Mark orders sent once Chit Chats has their tracking numbers", every: 10, code: "services/chitchats/app.js sweep" },
  { name: "press-messages", words: "Take ended messages off shop admins, and reach shops opened since", every: 60, code: "control-room/messages.js sweep" },
  { name: "deletion-note", words: "Weekly note to the platform owner listing closed apps about to be deleted", every: 7 * DAY, code: "control-room/deletionNote.js weeklyDeletionNote" },
  { name: "restore-drill", words: "Monthly test that a backup can be restored", every: 30 * DAY, code: "services/health/run.js drill" },
]);

const BY_NAME = new Map(JOBS.map((job) => [job.name, job]));
export const jobNamed = (name) => BY_NAME.get(name) ?? null;

const plainError = (error) => String(error?.message ?? error ?? "it stopped with no reason given").replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * The entries of a sweep that answers one line per shop (web addresses, own sending addresses) whose check threw:
 * those sweeps catch each shop's failure so the others still run, and mark it `state: "failed"`.
 */
const failedEntries = (list) => list.filter((entry) => entry && typeof entry === "object" && entry.state === "failed");

/** A short summary of what a job returned: its own `summary`, or its counts ("checked 3, sent 1"). */
export function summaryOf(result) {
  if (typeof result === "string") return result.slice(0, 200);
  if (Array.isArray(result)) {
    const failed = failedEntries(result).length;
    return `checked ${result.length}${failed ? `, failed ${failed}` : ""}`;
  }
  if (!result || typeof result !== "object") return "";
  if (typeof result.summary === "string") return result.summary.slice(0, 200);
  const counts = Object.entries(result).filter(([, v]) => Number.isInteger(v)).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v}`);
  const lists = Object.entries(result).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v.length}`);
  return [...counts, ...lists].join(", ").slice(0, 200);
}

export function createJobs({ store, email = null, alertTo = null, now = () => new Date() }) {
  if (!store) throw new Error("the jobs page needs its run log");

  /** `newestOnly` reads just each job's last run (enough to tell late from on time): what the late check uses. */
  async function jobsStatus({ now: at = now(), newestOnly = false } = {}) {
    const nowMs = at.getTime();
    const rows = [];
    for (const job of JOBS) {
      const runs = await store.list(job.name, { limit: newestOnly ? 1 : KEEP_RUNS });
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
    for (const row of await jobsStatus({ now: at, newestOnly: true })) {
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

  // The check after each run happens at most once every LATE_CHECK_MINUTES (the shop maker runs every minute, and each
  // check reads two records per job).
  let lastCheckMs = -Infinity;

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
        } else if (Array.isArray(result) && failedEntries(result).length) {
          // Every shop failing (a refused key, a provider down) must not show as a run that went well.
          const failed = failedEntries(result);
          ok = false;
          error = plainError(`${failed.length} of ${result.length} failed: ${failed.slice(0, 3).map((f) => `${f.shopId ?? "?"}: ${f.detail ?? "no reason given"}`).join("; ")}`);
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
      if (finished.getTime() - lastCheckMs >= LATE_CHECK_MINUTES * 60_000) {
        lastCheckMs = finished.getTime();
        try {
          await alertLate({ now: finished });
        } catch (failure) {
          console.error(`couldn't check the jobs are on time: ${plainError(failure)}`);
        }
      }
      return run;
    },
  };
}
