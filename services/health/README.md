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

## Every night (`nightly.js`)

Each shop backs up its own database every night (its own nightly backup function). The platform adds:

- **the stockroom's database**, which nothing in the stockroom backs up, exported every night;
- **the shop's database**, exported as a stand-in when the shop's own backup has had no success for 22 hours.

Exports go to `backups/<day>/` in the shop's bucket, next to the shop's own. Each one is written on the row
(`platformBackup: { shopAt, stockroomAt }`, which the backup check reads) and as a registry event. A failed export is
an event too. The next five-minute run's backup check then alerts on it.

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
