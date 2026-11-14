# Control room

The platform's own admin (code plan 2.8; closing a shop, emergency payments, the breach register and the backup person
are plan 8.4 to 8.7; the owner's controls are Phase 9). Platform admins only: a confirmed email on
`PLATFORM_ADMIN_EMAILS` (comma-separated). The list is empty unless it is set, so nobody is an admin by accident.

## Two-step sign-in (plan 9.1)

Every control-room call, the support inbox's and account recovery's admin calls and the backup person's run book also
need a sign-in that used a second step and is under 12 hours old (`controlRoom.js` `twoStepProblem`: the ID token's
`firebase.sign_in_second_factor` and `auth_time`, both signed by Firebase). The page signs in with Google, then asks
for the 6-digit code from an authenticator app. A listed admin who has no authenticator yet is shown a set-up screen
(a code to scan, the key to type, then one code to confirm), and signs in again after it.

Before it works, in the platform project (Julian's step): Authentication › Settings › **Multi-factor authentication**,
turn on **Authenticator app (TOTP)** (this upgrades sign-in to Identity Platform, free at this size), then set
`PLATFORM_ADMIN_EMAILS` to his address on the web door. Without that, the set-up screen says it isn't turned on yet.

## Today (`today.js`, plan 9.2)

The page opens on the numbers: monthly income, shops live, on a free trial, paying, signed up this week, failed
payments, paused and closed, then **Needs you** (shops with a problem, failed plan payments, the repair queue, waiting
support requests, recoveries to check, new shops stuck while being made), each a link to its place on the page. Income
counts each paying shop at its plan price (`billing.amount` when billing keeps it, else today's price), less its own
`billing.percentOff`; the test shop never counts. `GET /api/control/today`; give `createControlRoom` `settings`
(`liveSettings`), `supportStore`, `recoveryStore` and `signups` for the full list.

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, like the sign-up page; sign in with Google.

It wears the Colophon bento look (`look/colophon.css`, `room.css`), laid out by the control room redesign (11 November
2026): the menu has five groups, and every older page lives in one of them (`palette.js` `GROUPS`; nothing was removed).

- **Today** (`#today`): a verdict tile ("3 things need you", apricot; mint when nothing does), **Needs you** with each
  line's next step (Open shop opens the record beside the page; Answer, Fix, Check go to the inbox), the income, shops
  and failed-payment tiles, shop health as one bar (each line opens the shops with that health), quick actions and
  "Since yesterday" from the activity log. The test shop, brands at risk, still time to talk, tax lines and everything
  for every shop fold under **More on Today**; a failed update to the test shop is lifted into Needs you.
- **Shops** (tabs Shops, Sign-ups, Setting up): a search pill, quick filters (All, Needs a look, Free trial, Paying,
  Payment failing, At risk) and every older filter under **More filters**. A shop's record opens beside the list at
  `#shop/<shop id>`, with what's wrong first, the facts, "Do for this shop" and the careful actions last.
- **Inbox** (tabs Support, Repairs, Account recovery, App store): the list beside the one you're reading (stacked on a
  phone); Support adds **Send and close** and **Open shop**.
- **Money** (tabs Income, Failed payments, Why brands leave, Costs, Prices and sign-up).
- **Platform**: a card for each tool (Launch, Switches, Jobs and releases, Messages to brands, Run book, Breach register,
  Activity log) with its state, and the **Danger zone** (emergency payments, which also asks you to type MOVE ALL).
- The **find bar** (Ctrl K or ⌘K, `palette.js`) finds shops, pages and actions. Every older address still opens its
  page (`#support`, `#tickets`, `#test-shop`, `#payments`…). A phone gets a tab bar of the five groups at the bottom.
- The counts in the menu add up each group's pages (support, repairs, recovery and apps under Inbox, and so on).

The colour tokens and styles in `look/` are copies of `shared/admin-look/`, written by `node shared/admin-look/sync.mjs`:
change the source there, never the copies. Day or night is kept in the browser.

- **Every shop** with its plan, release version, status, billing, last release check and health. Shops with a problem
  come first.
- **Health** (`shopHealth`):
  - **Problem**: the last release check failed, a live shop has no saved profile, or something is in the repair queue.
  - **Look**: not live yet, the plan is paused or ended, or the test shop was never checked.
  - **OK**: none of these.
- **Your test shop** (plan 9.10): a card on Today with the platform's own test shop, its last release check, links to
  its storefront and admin, and **Reset the sample books** (the five sample books and the shipping zone go back to 5
  copies each; logged; only the test shop). Until the test shop exists, the card says to use the demo.
- **View this shop**: a 30-minute support sign-in to the shop's admin that only looks (plan 9.8). It asks why first.
  The shop's rules and server refuse anything it tries to change, and the admin shows "viewing only".
- **Make changes**: the same visit with staff access. It asks why, then asks a second time.
  - Who, why and until when go in the registry and in the shop's own audit log before the sign-in is made.
  - If the log can't be written, there is no sign-in.
- **Switches** (`setup/steps.js` `SWITCHES`): a box for each. It asks why, then changes the switch the same way as the
  command below.

- **Close this shop** (plan 8.4, `closure.js`): for abuse. It asks why, logs it, then turns on the shop's own pause
  (`settings/website` `maintenance`: the pause page with the press's own words, and checkout closed on the shop's
  server) and records `closure` on the registry row, where the platform payment service refuses the shop. A self-check
  turns the pause back on if the press turns it off. **Open this shop again** puts the pause back as it was.
- **Card payments** (plan 8.5, `emergencyPayments.js`): the emergency payments switch, per shop and for every live
  shop at once, below the list. Only for when the platform's Stripe account is paused. See below.

New trials can't take real money before Stripe has checked the press: the payment service refuses a live payment
until the account's `charges_enabled` is true (`services/payments/service.js` `liveChargesAllowed`).

## One shop's record, its fee, and switches for every shop (plan 9.3, 9.6, 9.7)

- **Search and filters** over the shop list: press name, shop id or owner email; health, plan and billing state.
- **Open record** (`POST /api/control/shop { shopId }`): owner, plan and billing, setup steps, connections (payments,
  web address, Google, email sending), the per-order fee, the last checks and the shop's control-room history. No
  customer details.
- **Fee on each order** (`POST /api/control/fee { shopId, basisPoints, refunded, reason }`): any change is written to
  the row as `platformFee.next { basisPoints, refunded, from }` 30 days ahead and the press is emailed
  (`platform-fee-changing`) once; `services/payments/fees.js` `feeForShop` uses it from `from` on. Setting today's fee
  again cancels a change that hasn't started. Pass `feeDefaults` (`readFeeSettings(env)`) to show the platform's fee.
- **Switches for every shop** (`POST /api/control/switch-all { name, on, reason }`): `setSwitch` for every live shop,
  each logged; a failure is reported and the rest carry on. **New shops start with** (`GET`/`POST
  /api/control/new-shop-switches`): kept as `platformState/newShopSwitches`; the shop maker passes them to the setup
  steps as `config.switchDefaults`, which step 6 uses only where the shop has nothing saved. Give `createControlRoom`
  `platformState`.

## The command line (`switch.js`)

```bash
CONTROL_ROOM_BY=you@yourpress.example RELEASE_BUILD_ROOT=/var/lmb/builds \
node control-room/switch.js <shop id> <switch> on|off "<why>"
```

The command and the page's switch boxes both run `setSwitch`. It does four things:

1. Updates the shop's saved profile in the registry. Everything else in the profile is kept.
2. Writes the shop's `/shop-profile.js`.
3. Logs who, from, to and why in the registry and the shop's audit log.
4. Deploys the shop's pages again at the release they're already on, so the new profile is live. That release is
   built first if it isn't on hand.

Running it twice is safe: the second run changes nothing and is logged too. It refuses an unknown switch, a missing
on/off or a reason under 10 characters. With no real clients it refuses, so nothing pretends to have changed a shop.

## The server (`controlRoom.js`, `routes.js`)

`createControlRoom({ registry, auditLog, profileFiles, publish, shopAccess, repairs, admins })`, added to the
platform's one web door with `routes: controlRoutes(room)`:

| Route | What |
| --- | --- |
| `GET /api/control/shops` | every shop, its health and switches |
| `GET /api/control/test-shop` | `{ testShop }`: the test shop's card, or null |
| `POST /api/control/test-shop/reset` | `{ shopId }` -> `{ shopId, reset }` |
| `POST /api/control/test-shop/open` | `{ shopId }` -> `{ shopId, url }`: a test shop's admin, signed in as its owner (logged first; test shops only) |
| `POST /api/control/google-run-again` | `{ shopId, step }` -> `{ outcome }`: one Google step again (needs `googleSteps`) |
| `POST /api/control/act-as` | `{ shopId, reason, mode? }` (`"view"`, the default, or `"edit"`) -> `{ url, expiresAt, mode }`; `"edit"` asks the press first and opens only with an approved `requestId` (19.6, below) |
| `POST /api/control/switch` | `{ shopId, name, on, reason }` |

## The support sign-in (`supportAccess.js`)

`supportAccess({ identity, registry, serviceAccount })` is the real `shopAccess`. It makes a custom sign-in token in the
shop's project for the support account `colophon-support`, carrying `support: { by, reason, until }` (an hour at
most). Then it opens `<site>/admin/#support=<token>`. The platform's service account signs the token through IAM
(`clients/identity.js`); there is no key file.

The shop copy does the rest (`apps/shop/functions/CLAUDE.md` › Platform support visits):

- it treats the visit as **staff**, never owner, until `until`;
- its rules check the same time;
- the admin takes the token out of the address and shows a banner with who, why and until when;
- it signs out at the end.

## The press says yes before "Make changes" (`accessRequests.js`, plan 19.6)

**View this shop** (act as, `mode: "view"`) is unchanged: logged, then a 30-minute look-only sign-in, no yes needed.
Making changes now waits for the press:

1. **Ask the press** in the shop's drawer (`POST /api/control/act-as { shopId, reason, mode: "edit" }`, no
   `requestId`) makes a support-access request `{ id, shopId, by, reason, askedAt, expiresAt (24 hours), status }`,
   logs `access-asked` like every action (registry, the shop's audit log, the activity log), and emails the shop's
   owner (`support-access-request`: who, why, and **Approve or decline** on their account page). No sign-in is made.
2. The owner approves or declines on their account page (`accounts/accessRequestRoutes.js`); the answer goes in the
   registry and the shop's audit log.
3. Once approved, the drawer shows **Open their admin**: `act-as { shopId, mode: "edit", requestId }` uses the request
   (an atomic `update`, so two clicks make one sign-in), logs the visit and makes the 30-minute staff sign-in. A
   request that is waiting or declined is refused (403); one that ran out or was used is refused (409), in plain
   words. A sign-in that can't be made gives the yes back.

Status: `waiting`, `approved`, `declined`, `expired` (a waiting or approved request past its 24 hours) or `used`.
`POST /api/control/access-requests { shopId }` lists a shop's requests for the drawer. Without `accessRequests`
passed to `createControlRoom`, "edit" is refused (503) rather than opened without a yes.

**Emergencies don't wait for a yes.** Closing a shop for abuse (`closeShop`) and moving its card payments
(`movePayments`) still act at once, with a log entry, as before.

## Support requests

The page's **Support requests** lists the requests presses send from their account page (`services/support/`):
waiting, answered or closed. **Send the answer** emails it to the press and keeps it on the request; **Close** files
it. The calls are `POST /api/control/support`, `/api/control/support/answer` and `/api/control/support/close`
(`services/support/routes.js`).

## Self-checks after every change (`selfChecks.js`, plan 2.11)

After the platform changes a shop, these look at the shop as the platform left it. They run:

- after a switch change;
- when the shop maker finishes;
- from **Check now** on the page;
- on the daily sweep (`self-check.js`).

| Check | Passes when | On failure |
| --- | --- | --- |
| profile | a live shop has a saved profile with no problems, and every switch is written down | a missing switch is written down as off and published (what setup does); anything else goes to the repair queue |
| profile-file | the `/shop-profile.js` the platform keeps matches the saved profile | rewritten from the saved profile, and the pages are deployed again at their release |
| release | the rules, the server code and every app's pages are on the release the registry records | repair queue |
| service-key | a shop with a shop app has its service key, and it matches the registry's hash | repair queue |
| plan | a shop whose plan has ended is not still marked live | repair queue (a person decides) |

- **Fixes:** a fix is tried once and the check runs again. A fix that fails goes to the queue with what went wrong.
- **One check failing doesn't stop the others.** A check that can't be made ("couldn't check: …") counts as failing.
- **Logging:** each run is a registry event (`self-check`).
- **What else watches the shops:** `services/health` watches every five minutes whether the pages, checkout, payment
  events and backups work. Its failing checks also show in the control room's health.

```bash
RELEASE_BUILD_ROOT=/var/lmb/builds node control-room/self-check.js [<shop id>]   # one shop, or every live shop
```

## The repair queue (`repairs.js`)

Each item is one problem for one shop that needs a person. The shop maker reports steps that keep failing or stop
for a person; the self-checks report the rest.

- **No duplicates.** The same problem again counts on the open item and doesn't add a new one. A problem that comes
  back after it was fixed reopens the same item, so its history stays in one place.
- **Closing:**
  - a check that passes again closes its own items ("fixed itself"), and the shop maker closes its own when the
    shop is ready;
  - a person can **Mark fixed** with a note.
- **Logging:** each item opened or closed is in the registry and the shop's audit log.
- **Storage:** items live in `repairs/<id>` in the platform project (`clients/stores.js` `firestoreRepairs`).

| Route | What |
| --- | --- |
| `POST /api/control/repairs` | `{ status: "open" \| "fixed" }` |
| `POST /api/control/repairs/fixed` | `{ id, note }` |
| `POST /api/control/check` | `{ shopId }`: run the self-checks now |

## Account recovery

**Account recovery** lists requests from people who lost the email address their account uses
(`accounts/recovery.js`): to check, approved and waiting, moved, denied or stopped. Each shows what the person wrote,
whether the old address has an account and which shops it owns. **Approve** needs a note on how you checked; **Deny**
needs the reason the person is sent. An approved request can be recorded as moved only after its 72-hour wait, and only
with **I've moved it by hand** ticked: the steps are in `accounts/README.md`, "Recovery: applying". The calls are
`POST /api/control/recovery`, `/approve`, `/deny` and `/apply` (`accounts/recoveryRoutes.js`).

## Emergency payments (`emergencyPayments.js`, plan 8.5)

`POST /api/control/payments` `{ shopId | all: true, to: "own" | "square" | "platform", reason }`. Off unless used.

- **own**: the shop takes cards with the press's own Stripe keys (`SHOP_PAYMENT_MODE="own"`, the shop's own-key
  path; the admin then shows the key fields under Settings › Payments).
- **square**: cards through Square on the platform (the press connects Square from the same page).
- **platform**: back to how it was before, from what the move saved (`paymentsEmergency.before`).

Each move logs, saves `paymentsEmergency` on the registry row (and `payments` for Square, which the payment service
routes by), rewrites the shop's server settings file and deploys its server code again at its release, writes the
profile's `payments` and deploys its pages again, then emails the press (`payments-moved`) with what to do. Running it
again finishes a move that stopped half-way and sends no second email. Every live shop at once skips a stockroom alone
and a shop not on the platform's Stripe, and one shop's trouble doesn't stop the others.

## Breach register (`breaches.js`, plan 8.6)

Every privacy breach, whether or not it had to be reported: the day found, what happened, the shops and people
affected, reported to the Privacy Commissioner yes/no, people told yes/no. Kept at least two years (`keepUntil`); there
is no way to delete an entry from here or its store (`breaches/<id>`). Marks and notes only add to its history. Each
affected shop's history and audit log name the entry, not its details. Calls: `POST /api/control/breaches`,
`/breaches/record`, `/breaches/update`.

The privacy contact shown with it is `PLATFORM_PRIVACY_CONTACT` (`people.js`), privacy@ the platform domain until
Julian names one.

## The backup person (`backupPerson.js`, `runbook.js`, plan 8.7)

One named person, `PLATFORM_BACKUP_PERSON` (nobody by default), who can act when Julian can't be reached. They sign in
to this page and see only the run book:

- **pause releases** (`platformState/releasePause`; the release runner doesn't start, or stops before its next shop),
  and resume them;
- **roll back a shop** to an earlier release (`services/release-runner` `rollBackShop`, refused while a release runs);
- **post a note** on the public status page, or take it down.

The access is sealed: it opens for 12 hours only after the email to Julian's address
(`PLATFORM_ADMIN_EMAIL`) has gone; with no address set it stays shut. Every use is written to `emergencyLog/<id>` and
emailed (`backup-access-used`). Platform admins see the same run book under their list and use it without a seal
(logged, not emailed). Routes: `GET /api/control/emergency`, `POST /api/control/emergency/open`, `/pause-releases`,
`/resume-releases`, `/roll-back`, `/status-note` (`emergencyRoutes`, added to the web door beside `controlRoutes`).

## Platform settings, the waitlist and the activity log (`platformControls.js`, `activity.js`, plan 9.4, 9.5, 9.9)

`createPlatformControls({ admins, settingsStore, env, activity, waitlist, invites, signups })`, added to the web door
with `routes: platformRoutes(controls)`. Platform admins only.

- **Platform settings**: sign-up open or waitlist only, new shops a day, the three plan prices, trial days, the founding
  offer (percent off, how many presses) and pay as you sell (share of each website sale). Saved as
  `platformState/settings` `{ values: { path: value }, updatedAt, updatedBy }`; `services/settings.js` `liveSettings`
  puts them on top of the environment, so sign-up and billing read them with no release. Only real changes are kept: a
  value equal to the environment's is dropped. A new price is a new Stripe price (billing's lookup keys), so presses
  already paying keep theirs.
- **Sign-ups and the waitlist**: the waitlist newest first, **Invite** (emails `waitlist-invite` once and writes
  `invites/<id>`, which sign-up's daily cap checks with `waitlist/invites.js` `isInvited`), and shops being made with
  **Try again**, which also restarts a stop that needed a person.
- **Activity log**: every control-room action, the shop ones too (`controlRoom.js` `log` writes there when given
  `activity`), as `controlActivity/<id>`, kept a year, read only.

| Route | What |
| --- | --- |
| `GET /api/control/settings` | the editable settings, their values and the environment's |
| `POST /api/control/settings` | `{ values: { path: value }, reset?: [path], reason }` |
| `GET /api/control/waitlist` | the waitlist and the shops being made |
| `POST /api/control/invite` | `{ email }` |
| `POST /api/control/retry` | `{ shopId, reason }`: make a stopped shop again |
| `POST /api/control/activity` | `{ shopId?, limit? }` |

## Income, leaving and failed payments (`incomeHistory.js`, `leaving.js`, `paymentTrouble.js`, `business.js`, `nightly.js`, plan 19.7-19.9)

The business side of the Today page, below the test shop. Admins only (`adminOf`); nothing here changes anything, so
nothing asks for a reason. The routes come from `businessRoutes(createBusinessRoom({ registry, incomeHistory, admins }))`,
joined to the web door next to `controlRoutes` (walkthrough/world.js).

- **Income over time** (19.7). Once a night `snapshotIncome({ registry, settings, store, now })` writes
  `incomeHistory/<YYYY-MM-DD>` (Toronto's day): monthly income in cents, paying, on trial, paused and closed, counted with
  Today's own `monthlyCents` and `planCounts` (`today.js`), the test shop never; and the movements since the last record
  before today: new paying (`trialToPaid` among them), bigger and smaller plans, shops lost, trials ended. Run twice the
  same day, it writes the same key with the same numbers. `history({ store, months: 12, now })` answers the 13 month-end
  values (12 months plus this one so far, `null` for a month with no record), money kept (new paying plus bigger plans)
  and lost (smaller plans plus shops lost) this month in cents, and trials that became paying over the last 90 days.
  The page draws the line as inline SVG in the theme's colours (months along the bottom, income on the left, the last
  point marked and labelled, a hidden table for screen readers), with the three figures above it. Before the first
  night: "The line starts the first night the platform runs."
- **Failed plan payments** (19.9). Shops whose plan payment is failing, unpaid, waiting for a first payment or paused for
  a card, with days since it began (`billing.troubleSince`, or the closing sweep's `pausedAt`) and, for a paused shop, the
  days left before it closes (`PAUSED_DAYS` from `services/billing/closing.js`; download for `DOWNLOAD_DAYS` after). Most
  urgent first: shops closing soonest, then payments still being tried (no closing date yet), longest first. A table;
  a row opens the shop's record.
- **Why presses leave** (19.8). The answers presses gave when they cancelled (`billing.leaving`), by month and reason,
  newest first; counts this month and over the last six months (answers from presses who then kept their plan counted
  apart); the latest words. **Still time to talk**: shops whose plan is set to end, or paused for a missing card, soonest
  first, with their reason and the date it ends.
- **The nightly run**: `runBusinessNightly({ registry, settings, incomeHistory, billing, now, print })` writes the income
  record and runs billing's card-expiry warnings (`services/billing/cardExpiry.js`); each part runs even if the other
  fails. For real: `node control-room/nightly.js` once a night (platform registry, `firestoreIncomeHistory`, live
  settings; the card warnings join once billing is hosted).

| Route | What |
| --- | --- |
| `GET /api/control/income` | `{ months: [{ month, incomeCents, paying, … }], kept, lost, trials, started, currency }` |
| `GET /api/control/leaving` | `{ reasons, months, thisMonth, lastSixMonths, latest, saveList }` |
| `GET /api/control/payment-trouble` | `{ shops: [{ shopId, state, daysSince, daysLeft, closesAt, … }] }` |

## Not yet

- **Schedules:** the daily self-check sweep, the shop maker's sweep and the nightly business run
  (`node control-room/nightly.js`) (Cloud Scheduler in the platform project).
- **More callers:** the release runner and billing changes don't run the self-checks yet; the daily sweep covers them.
- **Hosting** the page and the `/api` function, with the clients the newer actions take: `shopData`, `envFiles`,
  `deploy`, `build`, `email` and `squareAccount` for closing a shop and the payments switch, `breaches`
  (`firestoreBreaches`), and `emergencyRoutes(createBackupAccess(...))` with `firestorePlatformState`.
- **Julian's choices** (each is a setting): `PLATFORM_ADMIN_EMAIL`, `PLATFORM_BACKUP_PERSON` and
  `PLATFORM_PRIVACY_CONTACT`.
- **Permissions:** the platform's service account needs permission to manage each shop's users. It already has it as
  owner of the projects it makes.

## One timeline per shop (`timeline.js`, plan 19.10)

`shopTimeline({ shopId, registry, auditLog?, activity, supportStore?, releases?, emailLog?, limit, before?, kinds? })`
merges, newest first, everything the platform already records about one shop: the registry's events (`readEvents`:
billing, payments, fee, switches, closures, act-as, health, backups, repairs, email…), its release checks and the
release runs that name it (`listReleases`), the control room's activity log for it, its support requests
(`listByShop`) and the platform's own emails about it (the email service's sent log, entries marked `platform`; a
shop's emails to its shoppers are never read). Each entry is `{ at, kind, words, by? }`, `kind` one of billing,
release, health, support, switch, visit, email, other. A control-room action is in the registry and the activity log
at once; it shows once. `kinds` filters; `next` is the `before` of the page after (stable when entries share a time).
The shop's drawer has a **Timeline** section with a chip per kind and **Show older**.

`createTimeline({ admins, registry, activity, supportStore, emailLog })`, on the door with `timelineRoutes(timeline)`:

| Route | What |
| --- | --- |
| `POST /api/control/timeline` | `{ shopId, kinds?, before? }` -> `{ entries, next }` (admins only) |

## The Jobs page (`jobs.js`, plan 19.11)

The jobs and their run log are `services/jobs` (its README lists every scheduled job). The **Jobs** page in the side
menu shows each job, how often it runs, its last run, how long it took and its result (worked, failed, late or not
run yet), with **Run now**. Looking at the page also sends a late alert not sent yet. `createJobsPage({ admins,
runner, jobs, activity })` takes `jobs`, a map of the jobs this server can run itself; **Run now** logs the reason in
the activity log first, then runs it through `runJob`, so it lands in the run log like a scheduled run. A job not in
the map answers 409 "This job can only run on the server."

| Route | What |
| --- | --- |
| `GET /api/control/jobs` | every job with its last run, last success, time taken, `late`, `never`, `canRun` |
| `POST /api/control/jobs/run` | `{ name, reason }`: run one job now (logged) |

## Payments and email delivery (`delivery.js`, plan 19.12)

The shop's record (`POST /api/control/shop`) gains `delivery: { payments: { received, failed }, email: { sent,
bounced, complained } }` over the last 7 days, when `createControlRoom` is given `delivery:
deliveryReader({ deliveryStats, sentLog, reputation })`. Payment events are counted by the payment service
(`deliveryStats`, below); emails sent come from the email service's sent log; bounces and spam reports from the
newsletter guard's own events (`services/email/reputation.js`), so nothing is counted twice. Those reports only come
back for newsletter emails, so the bounce rate shown is never higher than the real one. `shopHealth` takes the counts
as an optional `delivery` and adds a "look" reason when more than 5% of at least 20 emails bounced, or more than 3
payment events failed. Old callers, without it, get what they always got. The drawer shows the counts under the facts.

`deliveryStats` (`clients/stores.js` `firestoreDeliveryStats`, `visibilityFakes.js` `fakeDeliveryStats`):
`add(shopId, kind, at)` raises one counter a day per shop and kind (`deliveryStats/<shopId>_<kind>_<day>`), and
`count(shopId, kind, sinceIso)` adds them up. The payment service takes it as an optional `deliveryStats`.

## Notes and tags on a shop (`notes.js`, plan 19.13)

Private notes (up to 1000 characters) and up to 10 tags (lowercase words or short phrases, 30 characters at most) on a
shop, for the platform only. **Notes are private to the platform: they are never written to the shop's own audit log
or the registry's events**, which a press can come to see. Every add, delete and tag change is written to the control
room's activity log instead (`note-added`, `note-deleted`, `tags-set`), without the note's words; deleting a note and
changing tags ask for a reason. Stored as `shopNotes/<shopId>` (`clients/stores.js` `firestoreShopNotes`,
`visibilityFakes.js` `fakeShopNotes`). The Shops list shows each shop's tags as small pills and its search also matches
tags (`shopSearch.js`, shared by the page and its test); the drawer has a **Notes** section.

`createShopNotes({ admins, store, registry, activity })`, on the door with `notesRoutes(notes)`:

| Route | What |
| --- | --- |
| `POST /api/control/notes` | `{ shopId }`: its notes and tags; `{}`: every shop's tags (`tagsByShop`) |
| `POST /api/control/notes/add` | `{ shopId, words }` |
| `POST /api/control/notes/delete` | `{ shopId, id, reason }` |
| `POST /api/control/tags` | `{ shopId, tags, reason }` |

## Messages to presses (`messages.js`, plan 19.14)

A note from the control room at the top of every shop admin it reaches, from a start to an end date. The status page's
note (the run book) stays for outages.

- **Who:** every shop, the shops on one plan (`shop`, `stockroom`, `both`), or one shop. Only live shops; a shop being
  made or deleted gets nothing.
- **What:** plain words, at most 400 characters, no page markup; `info` or `important`; an end date is required and at
  most 60 days away; a start date is optional (now). A reason goes in the activity log (and a one-shop message in that
  shop's history and audit log).
- **Important** also emails each targeted owner once (`press-message`, key `press-message/<id>/<shopId>`, and the
  message row keeps `emailed`), the stockroom-only presses too. Without an email service an important message is refused.
- **How it reaches the shop:** the admin-only `platform/messages` document in the shop's own database, like billing's
  `platform/plan`: `{ messages: [{ id, words, level, startsAt, endsAt }], updatedAt }`, every message for the shop that
  hasn't ended, upcoming ones too. The shop admin shows each between its dates as a banner over every page, with Close
  (kept in that browser), under the plan's banner (`apps/shop/src/app/admin/platformMessages.ts`, `PlatformMessagesBar.tsx`).
  The shop's rules let only its admins read it and no browser write it; the storefront never reads it. Not the shop
  profile: `/shop-profile.js` is public and changing it means putting the shop's pages live again.
- **End now** takes it off every shop at once. **`sweep()`** (nightly, beside the self-checks) rewrites every live shop's
  document, so ended ones drop off and shops made since get theirs, and emails an important message still showing to an
  owner who hasn't had it. Everything is safe to run twice; adding the same message again changes nothing.
- Store: `pressMessages/<id>` in the platform project (`messagesFakes.js` `fakePressMessages`). The banner on the
  stockroom's own pages is not built: a stockroom-only press gets the important ones by email.

`createPressMessages({ store, registry, auditLog, shopData, email, activity, admins })`, added to the web door with
`messageRoutes(messages)`:

| Route | What |
| --- | --- |
| `GET /api/control/messages` | every message, newest first, with its state (showing, upcoming, ended) and how many shops it reaches |
| `POST /api/control/messages/add` | `{ words, level, audience: { all: true } \| { plan } \| { shopId }, startsAt?, endsAt, reason }` |
| `POST /api/control/messages/end` | `{ id, reason }` |

## Costs (`costs.js`, plan 19.15)

The **Costs** page: this month's Google bill per shop next to what the shop pays, the shops costing more than they pay
first, then the projects that aren't a shop. `GET /api/control/costs` (`createCostsDesk({ registry, reader, settings,
fees, admins })`, `costRoutes(desk)`); the sums and Julian's step to switch Google's billing export on are in
`services/costs/README.md`. Until then the page says "Costs appear once Google's billing export is switched on."

## A press's data (plan 19.16)

**Email the press its data** in a shop's drawer: every collection of the shop and the stockroom's records as
spreadsheet files, emailed to the owner as a link that works 7 days. It asks why; logged in the registry, the shop's
audit log and the activity log before anything is built. `POST /api/control/export { shopId, reason }`
(`services/export/README.md`).

## Took their data (`tookData.js`)

In a shop's drawer, **Took their data**: whether the press has taken a copy of everything, and how. Read only.
`POST /api/control/took-data { shopId }` lists the press's own browser downloads (the shop's `audit-log` lines of type
`export`: "Downloaded the whole shop: …" from **Download your shop**, and "Backed up to a folder on the computer: …" from **Back up to a folder**) and the emailed copies
(`dataExports` rows: asked by the press, the platform or the closing sweep; status; who it went to; when the link ends).
The link itself is never shown. A shop that isn't live shows only the emailed copies.

## Setting up (`setupPresses.js`)

Presses that signed up at the front door and are still in setup mode, or have pressed Open my shop (code plan 18.2 to
18.8). Before this page a press was invisible until its shop was being made. Read only: it reads the setup records
(`presses/<pressId>`, `firestoreFrontDoorStores(...).presses.list()`) and the registry, and shows what the press typed
(name, what it sells, country, plan, website and admin looks, "Selling somewhere already?", email language, the kept
product file's name and rows) with its dates. Never the owner's sign-in id or the kept file's path.

- **Counts:** in setup (signed up this week), ready to open (name and country filled in), opening (now live), bringing a
  shop over (with a product file kept), removed soon.
- **Flags, first in the list:** *Stuck opening*, Open my shop pressed over `STUCK_OPENING_HOURS` (24) ago and the shop
  isn't live (the side menu's badge counts these); *Removed <date>*, idle `GOING_SOON_DAYS` (45) of the 60 after which a
  setup record is removed.
- **Looks presses picked:** how many records chose each website look and each admin look.
- A row whose shop exists opens that shop's record.

| Route | What |
| --- | --- |
| `GET /api/control/presses` | `{ counts, looks: { website, admin }, presses }` (admins only; 503 without the store) |

## Sign-in safety and what was brought over (`signInSafety.js`, `broughtOver.js`)

A live shop's drawer has two read-only sections. **Sign-in safety** lists the owner and every member with two-step on or
off and backup codes left (only the count of hashes in `twoStepBackup/<uid>` is read). **Brought over from the old shop**
adds up the shop's own audit-log lines from its import steps (past orders, customers, gift cards, old shop links) with
one range query on `message`, and shows the photo copy's progress from `systemStatus/photoImport`. Photos still on
the old shop are flagged, because they are lost if the press closes the old shop before the hourly copy finishes.

## No reasons asked (14 November 2026)

Julian asked for the "Why? This goes in the shop's log (at least 10 characters)" prompts to go. Nothing in the control
room asks for a reason any more and no endpoint requires one: `noteOf` in `controlRoom.js` keeps a note if one is sent
and accepts none. Every log entry still records who did what and when. Switches flip at once; careful actions (close a
shop, move card payments, a switch for every shop, pause updates, delete a note, end a message, email a press its data)
ask a styled yes or no (`askBox`/`askYes` in `app.js`), never a browser prompt. The two places that send words to a
person keep a text box: sending an app back to (or off the store for) its maker, and the account-move card (how the
person was checked, and the reason a move is denied), which guards against someone taking over a shop.
`noReasonPrompts.test.js` fails the build if a browser prompt, a "Why?" field or a minimum length comes back.
