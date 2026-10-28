# Status page

The public page that says whether Colophon is working (plan 4.4): `index.html`, a static page with no build step, like
the waitlist.

- **What it shows**: one headline (everything working / some shops having trouble / a problem across shops) and, for
  each part (pages, checkout, payments, backups), "Working" or "Trouble for N of M shops". It never names a shop.
- **Where it comes from**: after each five-minute health run (`services/health`), `publish.js` turns every registry
  row's `health` into a summary (`summary.js`) and saves it to `publicStatus/current` in the platform project. That
  one document is the only thing the platform's rules let anyone read (`waitlist/firestore.rules`; the emulator check
  covers it). The page reads it over Firestore's REST address (`page.js`), with no sign-in and no Firebase library,
  and refreshes every minute.
- **When the checks stop**: a summary over 20 minutes old makes the page say it can't confirm the current status,
  rather than showing stale good news.

## Publishing it

A deliberate step on the owner's machine, never from CI. The page is static, so any Hosting site in the platform
project can serve this folder. Create a site for it once (`firebase hosting:sites:create <site>`), then from this
folder: `firebase deploy --only hosting --project lmb-platform-prod` with that site in `firebase.json`. The rules go
out with the waitlist's (`waitlist/`, `firebase deploy --only firestore:rules`).

- **A note from the team**: the run book's status note (control room, plan 8.7) is shown above the headline, for a
  known problem ("we're looking into it"). It is saved in `platformState/statusNote` and goes out with the summary.

## Not yet

- A Hosting site and address for it (Julian).
