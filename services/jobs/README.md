# Jobs

Every job the platform runs on a schedule, each run recorded, and one email when a job stops running on time (code
plan 19.11). Plain Node 22 ES modules, no packages; tests use `fakes.js`, never a live project or email account. The
control room's **Jobs** page shows it (`control-room/jobs.js`).

## The jobs

Found in the code; `every` is the intended gap. The hosted server (`server/`) runs each one on a schedule: `server/jobs.js`
gives every job its runner, `server/schedules.js` its time (Toronto time), and `server/setup-schedules.js` makes them
in Cloud Scheduler. A job whose parts aren't connected yet is made paused (`server/README.md` lists them).

| Job | Every | Runs |
| --- | --- | --- |
| `health-checks` | 5 minutes | `services/health/run.js checks` (and the status page) |
| `shop-maker` | 1 minute | `signup/shopMaker.js` `sweep()` |
| `web-addresses` | 10 minutes | `services/domains/domains.js` `checkAll()` |
| `own-email-addresses` | 6 hours | `services/email/ownDomain.js` `checkAll()` |
| `nightly-backups` | 1 day | `services/health/run.js nightly` |
| `keep-times` | 1 day | `services/retention/run.js` |
| `self-checks` | 1 day | `control-room/self-check.js` |
| `closing` | 1 day | `services/billing/closing.js` `sweep()` |
| `dropped-apps` | 1 day | `services/billing/billing.js` `closeDroppedApps()` |
| `income-record` | 1 day | `control-room/nightly.js` `runBusinessNightly()`: the income record (19.7) and the card-expiry reminders (19.9) |
| `press-messages` | 1 hour | `control-room/messages.js` `sweep()`: ended messages off shop admins, new shops reached (19.14) |
| `setup-clock` | 1 day | `signup/setupClock.js` `sweep()`: a press in setup is emailed 30 and 7 days before its setup is cleared, then cleared (18.11) |
| `trial-tips` | 1 day | `services/trial-tips/index.js` `run()` |
| `shop-checkup` | 1 day | `services/checkup/index.js` `run()`: the monthly check-up email, at most one per shop a month (14.9) |
| `bookkeeping` | 1 day | `services/accounting/index.js` `nightly()` |
| `deletion-note` | 7 days | `control-room/deletionNote.js` `weeklyDeletionNote()`: a Monday note to the platform owner listing closed apps deleted within the week |
| `restore-drill` | 30 days | `services/health/run.js drill` |

Not jobs, so not listed: the tax watch (worked out when the control room opens), support requests and the newsletter
guard (they answer people and the email sender as they come), and spending limits (Google sends budget notices).

## Using it

```js
const jobs = createJobs({ store: firestoreJobRuns(platform), email, alertTo: env.HEALTH_ALERT_TO });
const run = await jobs.runJob("health-checks", () => realHealth({ job: "checks" }));
process.exitCode = run.ok ? 0 : 1;
```

- `runJob(name, fn)` records `{ name, startedAt, finishedAt, ms, ok, error, summary }` (the error in plain words; the
  summary is the job's own `summary` or its counts, "checked 3, sent 1"). It never throws: a failed job is a run with
  `ok: false`, and a job that answers `{ ok: false }` counts as failed. Each job keeps its newest 50 runs.
- `jobsStatus({ now })`: each job's last run, last success, how long it took, `late` when the last run started more
  than twice its gap ago, and `never` when it has never run (never counted late: until a schedule calls it, nothing
  could have run it).
- `alertLate({ now })`: one `job-late` email to the alert address (`HEALTH_ALERT_TO`, the health checks' address) per
  job that goes late; another only after the job has run on time and gone late again. `runJob` calls it after a
  run at most once every 5 minutes (`LATE_CHECK_MINUTES`; it reads only each job's newest run), and opening the Jobs
  page calls it too. An email that couldn't be sent is tried again on the next check.

## The run log

`clients/stores.js` `firestoreJobRuns`: `jobRuns/<name>-<startedAt>`, the oldest past 50 per job removed after each
run; `jobState/<name>` holds when the late alert went. `fakes.js` `fakeJobRuns` is the same in memory.
