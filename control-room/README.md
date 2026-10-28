# Control room

The platform's own admin (code plan 2.8; closing a shop, emergency payments, the breach register and the backup person
are plan 8.4 to 8.7). Platform admins only: a confirmed email on `PLATFORM_ADMIN_EMAILS`
(comma-separated). The list is empty unless it is set, so nobody is an admin by accident.

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, like the sign-up page; sign in with Google.

- **Every shop** with its plan, release version, status, billing, last release check and health. Shops with a problem
  come first.
- **Health** (`shopHealth`):
  - **Problem**: the last release check failed, a live shop has no saved profile, or something is in the repair queue.
  - **Look**: not live yet, the plan is paused or ended, or the test shop was never checked.
  - **OK**: none of these.
- **Act as this shop**: a 30-minute support sign-in to the shop's admin. It asks why first.
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
| `POST /api/control/act-as` | `{ shopId, reason }` -> `{ url, expiresAt }` |
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

The access is sealed: it opens for 12 hours only with a reason, and only after the email to Julian's address
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

## Not yet

- **Schedules:** the daily self-check sweep and the shop maker's sweep (Cloud Scheduler in the platform project).
- **More callers:** the release runner and billing changes don't run the self-checks yet; the daily sweep covers them.
- **Hosting** the page and the `/api` function, with the clients the newer actions take: `shopData`, `envFiles`,
  `deploy`, `build`, `email` and `squareAccount` for closing a shop and the payments switch, `breaches`
  (`firestoreBreaches`), and `emergencyRoutes(createBackupAccess(...))` with `firestorePlatformState`.
- **Julian's choices** (each is a setting): `PLATFORM_ADMIN_EMAIL`, `PLATFORM_BACKUP_PERSON` and
  `PLATFORM_PRIVACY_CONTACT`.
- **Permissions:** the platform's service account needs permission to manage each shop's users. It already has it as
  owner of the projects it makes.
