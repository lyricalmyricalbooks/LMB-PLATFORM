# Run book

What to do when something goes wrong on the platform (code plan 5.14). It is for Julian, and for the backup person
when Julian can't be reached. Each step points at a real button or command. Nothing here is automatic. You decide.

Before you change anything for a press, write down why. Every control-room button asks for a reason and logs it in
the registry, in the shop's own audit log and in the control room's activity log.

## When an alert email comes

The health checks (`services/health/`) look at every live shop every five minutes. When something breaks, they email
the alert address (`HEALTH_ALERT_TO`). The subject says the press, the shop id and what happened:

- **"… failing"**: a check has just started failing. Pages and checkout email only after two failed runs in a row
  (about ten minutes), so one slow answer doesn't wake you. The others email at once.
- **"… still failing"**: the same problem, six hours later. You get one of these every six hours until it is fixed.
- **"… working again"**: it passes again. Nothing to do.

The email's "What the check saw" line is the detail. The control room shows the same thing on the shop's row, under
Health. To look again after a fix, use **Check now** on that shop, or wait five minutes for the next run.

Look first at the public status page (`status/`). If every shop shows the same problem, the cause is the platform or
Google, not one press. Post a status note (see "Tell presses about a problem" below).

### pages

**What it means:** the shop's home page, `/admin`, `/shop-profile.js` or the stockroom page didn't answer, or answered
with an error or an empty page. Shoppers may be seeing an error instead of the shop.

**What to do:**

1. Open the address from the alert in your browser. If it loads now, it was a blip. Wait for "working again".
2. If a release went out in the last hour, that release is the likely cause. Roll the shop back (see "Stop a
   release").
3. If no release went out, use **Check now** in the control room. The self-checks find a missing or wrong profile
   file and redeploy the pages by themselves. Anything they can't fix goes to the repair queue with what went wrong.
4. If every shop is down at once, check Firebase's own status page. Post a status note while you wait.

### checkout

**What it means:** the shop's checkout didn't answer, or doesn't accept orders from the shop's own pages. Shoppers can
browse but can't pay. This one costs the press sales, so treat it first.

**What to do:**

1. If the detail says "doesn't accept the shop's own pages", the shop's server settings are missing its address.
   This often follows a new web address. Run the shop maker's step 8 again for that shop (`setup/`). It rewrites the
   settings file from the registry, with every address the shop has, and redeploys the server code.
2. If the detail shows an error number (500, 503), a release may have broken the server code. Roll the shop back (see
   "Stop a release").

This check only asks whether checkout answers. It can't see a paused Stripe account: you hear about that from Stripe
or from presses. Then use **Card payments** in the control room to move shops to the press's own keys or to Square
(`control-room/emergencyPayments.js`). Each press is emailed with what to do.

### webhook

**What it means:** Stripe is sending payment events (a card was paid, a refund went through), and the shop is
refusing them or failing to process them. Orders can show as unpaid when they were paid, and stock may not go down.

**What to do:**

1. Read the detail. It is the shop's own last error from its payment events.
2. If every shop on Stripe fails at once, the platform's payment service is the cause. It receives Stripe's events
   for every press and passes each one on (`services/payments/`). Check its Stripe event secrets
   (`STRIPE_CONNECT_WEBHOOK_SECRET_LIVE` and `_TEST`).
3. If one shop fails alone, use **Check now**. The service-key check finds a shop key that no longer matches and puts
   it in the repair queue. Run the shop maker's step 8 again for that shop: it gives the shop its key again.
4. Any other error: a release may have broken the server code. Roll the shop back (see "Stop a release").
5. Once it passes again, Stripe sends the missed events again by itself for up to three days. Ask the press to look at
   orders from the time it was failing.

### backup

**What it means:** the shop's last good backup, or its stockroom's, is more than 26 hours old. Nothing is lost yet,
but if the data were damaged now, a day or more of changes would be gone.

**What to do:**

1. Read the detail. "last try: PERMISSION_DENIED" means the shop's server lost permission to export its own database.
   The shop maker's step 10 gives it back. Run setup again for that shop.
2. The nightly run (`node services/health/run.js nightly`) makes a stand-in copy of a shop whose own backup missed a
   night, and always backs up the stockroom. If it didn't run, run it by hand now.
3. A press can also press **Back up now** in their own admin (Settings › General › Backups & export).

### spending

**What it means:** a shop's Google bill has reached its monthly budget. "failing" means the shop's costly jobs (photo
copies, AI writing, imports) now run slowly (the budget is spent) or wait until next month (twice the budget is
spent). "working again" means a new budget month started. Checkout, payment events and order emails are never slowed.

**What to do:**

1. Look at what the shop is doing in the control room's activity log and the shop's history. A large import or many
   photos is normal for a new shop. A loop that never ends is not.
2. If it is normal use, raise that shop's budget on the billing account (the budget named `shop:<shop id>`).
3. If something looks like abuse, close the shop (see "Pause a shop").

## Pause a shop

For abuse, or a shop that is harming shoppers. In the control room, on the shop's row: **Close this shop**, with a
reason (`POST /api/control/close`, `control-room/closure.js`).

- The shop's own pause page goes on, with the press's own words, and checkout closes on the shop's server.
- The payment service refuses the shop from that moment, even before the pause page shows.
- A self-check turns the pause back on if the press turns it off.

To undo it: **Open this shop again**, with a reason (`POST /api/control/reopen`). The pause goes back to what it was
before.

This doesn't stop the press's plan billing. To stop that too, cancel the subscription in Colophon's Stripe account.
The shop stays closed either way.

## Refund a press's platform fee

There is no button for this yet. The per-shop fee setting comes with plan 9.6. Do it in Colophon's own Stripe account,
then tell the press.

- **The plan price** (the monthly or yearly charge): in Stripe, open the press's customer, find the invoice, and
  refund all or part of it. This doesn't change the plan. To end the plan as well, cancel the subscription there, or
  have the press cancel it from their account page (it ends at the end of the paid period).
- **The fee on a sale** (the platform's share of a website order): in Stripe, under Connect, find the collected fee for
  that payment and refund it. When the press refunds an order, the fee already goes back on its own in proportion
  (`services/payments/fees.js`, `refunded` on by default).

Then answer the press's support request in the control room (**Send the answer**), so the refund is written down with
the request and the press gets an email.

## Restore a backup

Restoring overwrites what is in the shop now. Close the shop first (see "Pause a shop") so no new orders arrive while
you work. Open it again after you check the result.

Each shop's backups are in its own Storage bucket, one folder a day: `backups/<day>/`.

- `backups/<day>/export`: the shop's database, a managed export. Restore it with
  `gcloud firestore import gs://<the shop's bucket>/backups/<day>/export --project <shop id>`.
- `backups/<day>/stockroom-export`: the stockroom's database. Restore it with the same command plus
  `--database=stockroom`.
- `backups/<day>/json/`: the shop's own document copy, made even when the export is refused. Download the folder and
  run `apps/shop/scripts/restore-json-backup.mjs`. It does a dry run first and writes only with `--apply`. Use
  `--only books,orders` to put back only some collections.

A press can download their own copy from Settings › General › Backups & export. The same script reads that file too.

After a restore, use **Check now** on the shop, and look at a few recent orders and books with the press.

## Stop a release

A release goes to the test shop first, then to every other shop, one at a time. It stops by itself at the first shop
that fails its check, and puts that shop back on the release it had. You step in when a problem shows up later.

- **Stop it from going further:** in the control room's run book, **Pause releases**, with a reason
  (`POST /api/control/emergency/pause-releases`, `control-room/runbook.js`). A running release stops before its next
  shop, and no new one starts. **Resume releases** undoes it.
- **Put a shop back:** in the run book, **Roll back a shop**, with the shop id and the earlier version
  (`POST /api/control/emergency/roll-back`, `rollBackShop` in `services/release-runner/runner.js`). It is refused while
  a release is running, so pause releases first.
- **Keep one shop out of the next release:** run the release with `RELEASE_HOLD_BACK=<shop id>`
  (`services/release-runner/run.js`).

The backup person can do these three things too, after opening the emergency access with a reason. Julian is emailed
when they do (`control-room/backupPerson.js`).

## Tell presses about a problem

In the run book, **Post a note** puts a short note on the public status page straight away. An empty note takes it
down (`POST /api/control/emergency/status-note`). Say what is affected and when you'll write again. Never name a press.

## Where things are written down

- Each shop's history in the registry, and its own audit log, which the press sees under Activity logs.
- The control room's activity log: every control-room action, kept a year.
- The emergency log (`emergencyLog/`): every use of the run book, with who and why.
