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

## Support requests

The page's **Support requests** lists the requests presses send from their account page (`services/support/`):
waiting, answered or closed. **Send the answer** emails it to the press and keeps it on the request; **Close** files
it. The calls are `POST /api/control/support`, `/api/control/support/answer` and `/api/control/support/close`
(`services/support/routes.js`).

## Account recovery

**Account recovery** lists requests from people who lost the email address their account uses
(`accounts/recovery.js`): to check, approved and waiting, moved, denied or stopped. Each shows what the person wrote,
whether the old address has an account and which shops it owns. **Approve** needs a note on how you checked; **Deny**
needs the reason the person is sent. An approved request can be recorded as moved only after its 72-hour wait, and only
with **I've moved it by hand** ticked: the steps are in `accounts/README.md`, "Recovery: applying". The calls are
`POST /api/control/recovery`, `/approve`, `/deny` and `/apply` (`accounts/recoveryRoutes.js`).

## Not yet

- **The shop side of "act as this shop"** (`shopAccess.supportSignIn`). It needs:
  - a function in the shop copy that makes a short, support-only sign-in;
  - a banner in the admin while support is signed in.
- **The repair queue** (`repairs.open`, plan 2.11).
- **Hosting** the page and the `/api` function.
