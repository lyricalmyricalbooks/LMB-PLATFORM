# server/

The platform's server program, hosted in the platform project `lmb-platform-prod` (code plan 15.6). It runs the
platform's own services for real: sign-up, accounts, billing, payments, email, the control room and every scheduled job.
Everything here was built and tested on pretend Google and Stripe. Nothing has been deployed yet.

## Two servers, one program

One program (`main.js`) starts as one of two Cloud Run services in Montréal (`northamerica-northeast1`), chosen by
`PLATFORM_ROLE`:

| Service | Who can reach it | What it does |
| --- | --- | --- |
| `platform-api` | Anyone. The waitlist site (https://lmb-platform-prod.web.app) sends `/api/**`, `/tips/off` and `/checkup/off` to it (`waitlist/firebase.json`). | The web door: every `/api` address the walkthrough has, plus Stripe's events and the emails' turn-off pages. |
| `platform-jobs` | Only the scheduler's own account (`platform-scheduler`). Anyone else gets 401 or 403 from Google before the program sees the call. | `POST /jobs/<name>` runs one scheduled job, records the run, and answers 200, or 500 when the run failed. An unknown name answers 404. |

Plain `node:http`, no npm packages. Google sign-in tokens come from the machine's own metadata server
(`metadata.js`), never from a key file. Keys come from Secret Manager, which Cloud Run hands to the program as settings.
Stripe stays in test mode: the program refuses to start with `BILLING_MODE` other than `test` or with a live Stripe key.

## The web door's addresses

| Address | Goes to |
| --- | --- |
| `POST /api/billing/events` | Stripe's plan events (services/billing) |
| `/api/payments/...` | The payment service: shops' calls, `/api/payments/stripe/events`, Square's sign-in and events |
| `POST /api/email/shop` | Shops sending an email through the platform (services/email) |
| `GET /tips/off`, `GET /checkup/off` | The "stop these emails" links in trial tips and the monthly check-up |
| everything else under `/api` | The same routes as `walkthrough/world.js`, through `signup/api.js` (sign-in checked with Google's keys, fair-use limits, new-device alerts). `world.test.js` fails if the two lists drift. |

## What is real and what isn't connected yet

Real, in the platform project's Firestore: the shop registry and audit log, sign-up accounts and sign-ups, fair-use
counters, the waitlist and its invites, plans, subscriptions and billing events, payment events (each handled once), the
per-order fee ledger, memberships and team invites (`teamInvites`, kept apart from the waitlist's `invites`), access
requests, support, repairs, recoveries, devices, activity, income history, job runs, delivery numbers, notes, messages
to presses, data-export requests, trial-tips and check-up records, and each shop's and stockroom's own data read with the
platform's token. Real outside services: Google sign-in links, the sign-in check, email through Google (Gmail, once `GMAIL_SENDING` is on) and Stripe (test mode).

Not connected yet (`notConnected.js`). Each answers in plain words, never with made-up data:

| Piece | Waits on |
| --- | --- |
| Making new shops | `SHARED_SHOPS_PROJECT` and `SHARED_SHOPS_DOMAIN` in `env.yaml` (the shared system, `docs/shared-system.md`): with both set, a shop is made in seconds in the shared project and the Launch page shows making shops on |
| Putting a shop's pages live again, rolling back, self-checks | The release runner's hosted home (4.1) |
| Opening a shop's admin from the control room | A support sign-in per shop, after 15.5 and 15.7 |
| Downloading all of a shop's data | The export bucket and its download links (19.16) |
| Keeping a press's product file until its shop opens | The platform's import bucket and its signed upload links (18.7): `stagedFiles` in `world.js` needs `uploadUrl`, `stat`, `read` and `remove` on a private bucket |
| Deleting a closed shop's project | Your go, once the organization exists |
| Deleting a closed app's records after its 90 days | Server access to each shop's project, after 15.5 (until then the Apps closing list shows each one waiting) |
| Marking a closing email that bounced | Reading returned mail in the platform's Google mailbox (Gmail has no delivery events) |
| Web addresses for shops | The shared system (`SHARED_SHOPS_PROJECT` and `SHARED_SHOPS_DOMAIN`): then `/api/domains` and the `web-addresses` job run (`services/domains/hosted.js`); a free address's lines are written once `SHOP_ADDRESS_ZONE` and `SHOP_ADDRESS_ZONE_PROJECT` name its Cloud DNS zone |
| QuickBooks | The platform's QuickBooks app keys (`docs/accounting.md`) |
| Facebook & Instagram, Pinterest and TikTok | Each network's app keys and `SOCIAL_ENABLED` (`docs/social.md`): `/api/social` already answers "off" |
| What each shop costs | Google's billing export to BigQuery (the Costs page shows its empty state) |

## The schedules

`schedules.js` turns each job in `services/jobs` into a Cloud Scheduler job, `platform-<name>`, in Toronto time.
`setup-schedules.js` creates or updates them and pauses the four that can't run yet.

| Job | When | |
| --- | --- | --- |
| health-checks | every 5 minutes | on |
| shop-maker | every minute | paused |
| web-addresses | every 10 minutes | paused until the shared system is on |
| press-messages | every hour, at 7 past | on |
| nightly-backups | 01:00 | on |
| keep-times | 01:30 | on |
| closing | 02:00 | on |
| dropped-apps | 02:15 | on |
| income-record | 02:30 | on |
| self-checks | 03:00 | paused |
| bookkeeping | 03:30 | on (warns QuickBooks owners before their connection ends) |
| connection-check | 03:45 | on (asks Google about each connected shop; the Shops page lists every Google, QuickBooks and social connection that stopped working) |
| trial-tips | 09:00 | on |
| shop-checkup | 10:00 (each shop gets one a month) | on |
| deletion-note | 08:00 on Mondays (only when a closed app's records go that week) | on |
| weekly-summary | 08:10 on Mondays | on |
| restore-drill | 04:00 on the 1st of each month | on |

A daily or monthly job is tried twice more if Google can't reach it; a frequent one just waits for its next turn. A late
or failed job emails `HEALTH_ALERT_TO`.

## Files

`http.js` (reading requests, safety headers), `verifyIdToken.js` (the sign-in check), `metadata.js` (Google tokens),
`world.js` (every piece put together), `jobs.js` (one runner per job), `schedules.js` and `setup-schedules.js`,
`main.js`, `Dockerfile`, `.gcloudignore`, `cloudbuild.yaml`, `deploy.js`, `env.example.yaml`, `smoke.js`. The pretend
Google for the tests is `fakes.js` and `clients/fake-firestore.js`.

## Your steps, once

GitHub now does steps 3 and 4 on every merge to main, as soon as the five secrets exist and the repository variable
`SERVER_SETTINGS` holds step 2's lines (`site/README.md`). The steps below are the same thing by hand.

Each command prints what it would do and changes nothing. Add `--apply` to do it. Every step is safe to run twice.
Run them from the repo's top folder, signed in with `gcloud auth login` as an owner of `lmb-platform-prod`.

1. **Store the five passwords the server needs in Google's safe.** In the Google Cloud console for `lmb-platform-prod`,
   open Secret Manager and create these secrets, each with its value as the first version:
   - `stripe-platform-test-key`: the platform Stripe account's test secret key (`sk_test_...`). Never the live one.
   - `stripe-billing-webhook-secret`: the signing secret of the plan-events address (step 6).
   - `stripe-connect-webhook-secret-test`: the signing secret of the Connect events address (step 6).
   - `trial-tips-secret` and `checkup-secret`: any two different random phrases of 16 characters or more.

   The two Stripe signing secrets only exist after step 6. Put a placeholder in first, then add the real value as a new
   version and run step 3 again.
2. **Fill in the server's settings.** Copy `server/env.example.yaml` to `server/env.yaml` (it is never committed) and put
   in your addresses: who may open the control room, where alerts go, and the platform's web address. No passwords go
   in this file; the deploy refuses one that looks like a key.
3. **Put the server online.** Run `node server/deploy.js` and read the plan, then `node server/deploy.js --apply`. It
   makes the three service accounts and their roles, checks the secrets exist, lets both servers send email as `platform-mail` and prints its client id, builds the program, starts both
   servers and sends the platform site's `/api` addresses to the web server (`site/build.js --api`).
4. **Switch on the schedules.** Run `node server/setup-schedules.js`, then `node server/setup-schedules.js --apply`.
5. **Check every door.** Run `node server/smoke.js --jobs-url <the platform-jobs address>`. The address is on the
   console's Cloud Run page, next to `platform-jobs`, and step 4 prints it too. Every line must say ok. It also checks
   the jobs server turns strangers away.
6. **Point Stripe at the server.** In the platform Stripe account (test mode), add two event addresses:
   `https://lmb-platform-prod.web.app/api/billing/events` (the plan events) and
   `https://lmb-platform-prod.web.app/api/payments/stripe/events` (Connect, events on connected accounts). Copy each
   signing secret into step 1's secret and run step 3 again.
7. **Tell the server how many hops sit in front of it.** Once, open `/api/plans` and look for `x-forwarded-for` in the
   web server's log. If it holds more than the visitor's own address, set `LIMIT_PROXY_HOPS` in `env.yaml` to the
   number of extra addresses and run step 3 again. The fair-use limits count visitors by that address.
8. **After the Google organization exists:** give the `platform-jobs` account its roles on the shops folder (it reads
   and backs up each shop) and run step 4 again. The shop maker, web addresses, self-checks and QuickBooks stay paused
   until their own code steps land.

If the build in step 3 stops with a permissions error, give the project's Cloud Build account the
"Artifact Registry Writer" and "Storage Object Viewer" roles once, then run step 3 again.

Live payments need your go: that is a later change to `BILLING_MODE`, the live keys and the live event addresses.

## Email through Google

Every email (sign-in links, billing, receipts, the terms notice, alerts) goes out through the Gmail API from one Google
Workspace mailbox, `PLATFORM_SENDER_EMAIL` (notifications@ the platform domain). There is no sending key: the servers
sign in as that mailbox through the `platform-mail` service account (`services/email/gmail.js`). Julian, once:

1. **Google Workspace on the platform domain**, with a real (licensed) user `notifications@<domain>`. Make
   `support@<domain>` a group or an alias of yours so replies reach you.
2. **Prove the domain sends its own mail.** Workspace admin: Apps › Google Workspace › Gmail › Authenticate email:
   generate the DKIM key and add its TXT line at the domain's DNS, then press Start authentication. Add SPF
   (`v=spf1 include:_spf.google.com ~all`) and DMARC (`_dmarc` TXT `v=DMARC1; p=quarantine; rua=mailto:<you>`).
3. **Allow the mail account to send as the mailbox.** The deploy prints `platform-mail`'s client id. Workspace admin:
   Security › Access and data control › API controls › Manage domain-wide delegation › Add new: that client id, scope
   `https://www.googleapis.com/auth/gmail.send` only.
4. **Switch it on.** Add `GMAIL_SENDING: "on"` to the repository variable `SERVER_SETTINGS`; the next deploy carries it.
   The control room's Launch page shows "Email through Google" ready.

Limits to know: a Workspace mailbox sends about **2,000 emails a day** (10,000 recipients). Over that, Gmail refuses for up
to 24 hours and the email is logged as failed (retryable). Shops whose own Gmail is connected send from it and don't
count. Google's rules forbid bulk marketing from Workspace, so shop newsletters should go from the press's own Gmail.
When the platform outgrows one mailbox, the next step is more mailboxes or Google's SMTP relay (10,000 a day each).

## Receipts by email (beta)

Each shop can get its own receipts address, `receipts+<shop>.<8 letters>@<platform domain>`. The owner forwards
receipts to it and checks them in the shop admin (Bookkeeping › Receipts) before any becomes an expense
(`services/receipts`). The addresses are plus-addresses of the same mailbox as above, so there is nothing to make per
shop, and nobody's own Gmail is read. Julian, once, after "Email through Google":

1. **Give the mailbox the receipts address.** Workspace admin: Directory › Users › the notifications user › Add
   alternate emails: `receipts@<domain>` (or set `PLATFORM_RECEIPTS_EMAIL` to another address of that mailbox).
2. **Let the mail account read that mailbox.** Workspace admin: Security › Access and data control › API controls ›
   Manage domain-wide delegation › the `platform-mail` line › Edit: add the scope
   `https://www.googleapis.com/auth/gmail.modify` beside `gmail.send`. It covers Colophon's own mailbox only.
3. **Switch it on.** Add `RECEIPT_MAIL: "on"` to the repository variable `SERVER_SETTINGS`; the next deploy carries it.
   The Launch page shows "Receipts by email (beta)" ready, and shops' "Opening soon" becomes "Set up".

A receipt is binned in the mailbox once the owner adds or dismisses it (Google deletes binned mail after 30 days). A
shop is handed at most 150 emails a day.

