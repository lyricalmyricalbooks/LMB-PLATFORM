# Control room

The platform's own admin (code plan 2.8). Platform admins only: a confirmed email on `PLATFORM_ADMIN_EMAILS`
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

## Not yet

- **Schedules:** the daily self-check sweep and the shop maker's sweep (Cloud Scheduler in the platform project).
- **More callers:** the release runner and billing changes don't run the self-checks yet; the daily sweep covers them.
- **Hosting** the page and the `/api` function.
- **Permissions:** the platform's service account needs permission to manage each shop's users. It already has it as
  owner of the projects it makes.
