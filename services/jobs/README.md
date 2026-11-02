# Jobs

Every job the platform runs on a schedule, each run recorded, and one email when a job stops running on time (code
plan 19.11). Plain Node 22 ES modules, no packages; tests use `fakes.js`, never a live project or email account. The
control room's **Jobs** page shows it (`control-room/jobs.js`).

## The jobs

Found in the code; `every` is the intended gap. Nothing hosts the schedules yet, so each still needs one.

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
| `card-expiry` | 1 day | `services/billing/billing.js` `cardExpiryReminders()` |
| `trial-tips` | 1 day | `services/trial-tips/index.js` `run()` |
| `bookkeeping` | 1 day | `services/accounting/index.js` `nightly()` |
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
  job that goes late; another only after the job has run on time and gone late again. `runJob` calls it after every
  run, and opening the Jobs page calls it too. An email that couldn't be sent is tried again on the next check.

## The run log

`clients/stores.js` `firestoreJobRuns`: `jobRuns/<name>-<startedAt>`, the oldest past 50 per job removed after each
run; `jobState/<name>` holds when the late alert went. `fakes.js` `fakeJobRuns` is the same in memory.
