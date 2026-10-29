# Health checks and nightly backups

Watches every shop on the platform (plan 4.3). Plain Node 22 ES modules, no packages. Tests use pretend pages,
answers and documents (`health.test.js`); nothing here reaches Google from a test.

Shops come only from the registry (live rows), so the owner's own original shop, which is not on the platform, is never
checked. The checks only read.

## Every five minutes (`runner.js`, `checks.js`)

| Check | Passes when | Alerts after |
| --- | --- | --- |
| pages | the shop's home page, `/admin`, `/shop-profile.js` and the stockroom page answer 200 | 2 failed runs in a row |
| checkout | the shop's checkout function answers a browser's preflight from the shop's own address (204, address allowed) | 2 failed runs in a row |
| webhook (shops with a payments account) | no failed payment event in the past day newer than the last good one (`adminSecrets/stripeWebhookStatus`) | the first failed run |
| backup | the shop's last good backup (its own nightly one, or the platform's stand-in) and the stockroom's (the platform's) are under 26 hours old | the first failed run |

A check that can't be made ("couldn't check: …") counts as failing. Every check runs even when another fails.

- **State** sits on the shop's registry row: `health: { checkedAt, ok, checks: { <name>: { ok, detail, since, failures,
  alertedAt } } }`, for the control room. Each change of state is also a registry event (kind `health`).
- **Alerts** go by email to `HEALTH_ALERT_TO` through the platform's email service (`health-alert` in
  `services/email/templates.js`). There are three kinds: when a check starts failing, a reminder every 6 hours while it
  keeps failing, and one note when it recovers. An alert that couldn't be sent is sent on the next run, and so is a
  recovery note.

What each alert means and what to do about it is in `docs/run-book.md`; `runBook.test.js` fails when an alert has no
section there.

After each run the checks job also saves the public status summary (`status/publish.js`), which the status page shows.

## Every night (`nightly.js`)

Each shop backs up its own database every night (its own nightly backup function). The platform adds:

- **the stockroom's database**, which nothing in the stockroom backs up, exported every night;
- **the shop's database**, exported as a stand-in when the shop's own backup has had no success for 22 hours.

Exports go to `backups/<day>/` in the shop's bucket, next to the shop's own. Each one is written on the row
(`platformBackup: { shopAt, stockroomAt }`, which the backup check reads) and as a registry event. A failed export is
an event too. The next five-minute run's backup check then alerts on it.

## Every month: the restore drill (`restoreDrill.js`, plan 13.5)

`node services/health/run.js drill` restores the latest backup of one live shop into a scratch database (`drill-<day>`, in
the shop's own project), counts its books, orders and reviews there and in the live shop, writes `restoreDrill` on the
row and the check `drill` (so a failure shows as a shop with a problem and sends the usual `health-alert` email), and
removes the scratch database. Counts match when within 10% (at least 5 documents); an empty restore of a shop with
documents always fails. It does nothing when the last drill, of any shop, was under 28 days ago; the shop drilled longest
ago goes next. Nothing in the live shop is written, and only a database named `drill-<day>` is ever removed.

New databases (shop and stockroom) are made with seven days of roll-back to the minute (point-in-time recovery), and
step 5 switches it on for an existing one when it is re-run. See "Restore a backup" in `docs/run-book.md`.

**Switched on by Julian:** a monthly schedule for the drill job, and the platform's service account needs the
Cloud Datastore Import Export Admin role on shop projects. **Not tested against Google:** `restoreScratch`,
`removeScratch` and `count` in `clients/google.js` follow Google's Firestore API but have only run against fakes.
Run the drill once against the test shop before trusting it.

## Spending limits per shop (`spending.js`, plan 8.9)

Each shop's Google project gets a budget on the billing account, named `shop:<shop id>` (or with its id kept on the
row as `spending.budgetId`). Google sends each budget's state to a Pub/Sub topic several times a day;
`recordBudgetNotice` reads it and keeps a level on the shop's row, `spending: { level, costAmount, budgetAmount,
currency, intervalStart, at }`:

| Level | When | Costly jobs (photo copies, AI writing, imports) |
| --- | --- | --- |
| normal | under the budget, or no budget | full speed |
| slow | the budget is spent | still run, at most 60 photo copies, 10 AI writings and 2 imports an hour |
| held | twice the budget is spent | wait until the next budget month |

`jobPace(level, job)` says what a job may do, with plain words for the owner. **Checkout, payment events and order emails
are never slowed**, and neither is any job that isn't on the costly list. A change of level is a registry event and one
`health-alert` email (check `spending`) to the platform's alert address; the control room shows the shop as one to
watch. A new budget month brings the level back to normal by itself.

### Switched on by Julian

1. Set a monthly budget per shop project on the billing account, named `shop:<shop id>`, with a Pub/Sub topic for its
   notifications. How much each shop's budget is waits on Julian.
2. Host a push subscription on that topic that calls `recordBudgetNotice` (not built yet).
3. Built (plan 13.4): every notice also writes the level into the shop's own database (`systemStatus/spending`), and the
   shop's hourly photo pass, its photo import and the AI writing assistant read it (`apps/shop/functions/spendingGate.js`).
   Slow: at most 60 photo copies, 2 imported books and 10 AI answers an hour; held: none. Checkout, payment events and
   order emails never call the gate. A level that is missing or unreadable means full speed. A test fails when the shop's
   table differs from `COSTLY_JOBS` here.

## Running it for real

Needs the platform project (`docs/test-shop.md`, steps 1–2) and a schedule. Nothing is scheduled yet.

```
HEALTH_ALERT_TO=<alert address> node services/health/run.js checks   # every 5 minutes
node services/health/run.js nightly                                   # once a night, after the shops' own backups
```

## Not yet

- The schedule itself (Cloud Scheduler jobs in the platform project), and the alert address.
- Telling the press about its own shop's trouble. Alerts go to the platform only; the status page (plan 4.4) is the
  press's view.
- Shops on their own domain are checked at their `web.app` address.
