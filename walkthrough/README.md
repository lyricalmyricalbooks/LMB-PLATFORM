# Walkthrough

The platform's own pages on made-up data, on one computer: `npm run walkthrough` (code plan 6.14), with a start page that
links them all as a shopper, as a press and as the platform owner (plan 9.11). `npm run walkthrough:all` (`--with-demo`)
also starts `npm run demo`: the real shop, checkout, emails and stockroom on the emulators, which the start page's first
three sections link to. Plain Node 22 ES
modules, no packages of its own, no emulators, no network. The plain-words guide is in
[docs/demo-shop.md](../docs/demo-shop.md); `npm run demo` is the shop and stockroom, this is the pages around them.

| File | What it does |
| --- | --- |
| `run.js` | The command. Prints the addresses. `--port <number>` (or `WALKTHROUGH_PORT`) picks another port than 5180; `--with-demo` also starts the demo in the same terminal (its `--fresh`, `--no-functions` and `--new-press` pass through) and waits for it to save on Ctrl+C. |
| `server.js` | `startWalkthrough({ port })`: serves the pages' own files from their folders, the web door at `/api`, a stand-in card page, and the start page at `/` (and `/start`). Port 0 picks a free port (the tests). Seeds three presses for the owner (trial, paused, paying), the presses and history of `seedRoom.js`, the platform's test shop (the demo shop, with a passed release check) the waitlist, an invite, a help request and health checks. `/status/` reads `/walkthrough/status`. |
| `startPage.js` | `START_SECTIONS` (every link, who it signs in as, what to try there) and `startPage()`. Walkthrough links name their person with `?as=`, so they open as that person whoever signed in last. |
| `browser-check.js` | `node walkthrough/browser-check.js` (CI job `walkthrough-browser`): Chromium opens the start page and every walkthrough link on it as its person, and fails on a page error, a console error, a failed `/api` call or a page that never shows its signed-in view. The demo's links are left out. `WALKTHROUGH_SHOTS=<folder>` keeps screenshots. |
| `world.js` | `platformWorld()`: the whole platform joined with pretend services (see below). The server and `road.test.js` both use it. |
| `stub/` | The sign-in library, the waitlist's store: stand-ins the pages load in place of Google's and the platform project's. |
| `walkthrough.test.js` | Starts the server on a random port; each page answers 200; the card and sign-up routes work. |

## What it serves

| Address | Page | Notes |
| --- | --- | --- |
| `/` (and `/start`) | the start page (`startPage.js`) | Five sections: as a shopper (the demo's shop, checkout, practice inbox), the press's website admin, its stockroom, a press joining the platform, and the platform owner. |
| `/control/` | `control-room/index.html` | Signs in as `admin@example.com` with two-step claims (`firebase.sign_in_second_factor: "totp"`, a fresh `auth_time`), so every panel opens. This sign-in is never remembered, so the other pages keep their own person. |
| `/waitlist/` | `waitlist/index.html` | Plans from `/api/plans` and **Start your free trial** (the walkthrough turns sign-up on). The form keeps sign-ups in memory. |
| `/signup/` | `signup/index.html` | "Continue with Google" signs in as `newcomer@example.com`, who has no shop yet. |
| `/account/` (and `/accounts/`) | `accounts/index.html` | Signs in as `owner@example.com`, who has three presses: Moth Press (trial), Paper Wasp Press (paused) and Fieldnote Editions (paying). |
| `/account/billing?shop=moth-press` | `accounts/billing.html` | The press on its free trial. |
| `/account/billing?shop=paper-wasp` | `accounts/billing.html` | The press paused until a card is added. |
| `/account/billing?shop=fieldnote` | `accounts/billing.html` | The press paying monthly. |
| `/status/` | `status/` | Service status over the walkthrough's shops. |
| `/help/`, `/terms/` | `help/`, `terms/` | The pages the others link to. |
| `/inbox` | the practice inbox (`practiceEmail.js`) | Every platform email the walkthrough sends (sign-in links, invites, the shop-ready email, trial, billing and support), written by the real email service from its real templates (`services/email/fakes.js` `practiceEmailService`) and kept in memory. |
| `/walkthrough/card` | a stand-in for Stripe's card page | **Add a card** sends the owner here; its button adds the test card. |

`?as=name@example.com` on any page signs in as someone else. A press made on the sign-up page is made for real by the
shop maker (against a pretend Google, once a second) and shows on the account page of the same person.

The pages' files are sent as they are, apart from `signup/config.js` (the sign-in library and the platform project's web
settings), `waitlist/config.js` (the plans door and the sign-up address; the platform project) and
`waitlist/firestoreStore.js`; nothing on disk changes. Only `.html`, `.js`, `.css`, `.svg`, `.png` and `.ico` files in the
pages' folders are served, never `*.test.js`.

## The whole platform together (`world.js`)

`platformWorld()` joins, with the repo's own fakes: sign-up (`signup/`), the shop maker running the sixteen setup steps
(`setup/`) against a pretend Google, billing (`services/billing/`) against a pretend Stripe with the shop's own copy of its
plan, accounts (`accounts/`), the control room (`control-room/`), and one web door (`signup/api.js`) with the account,
billing, control-room and Try again routes. `road.test.js` (root, in `npm test`) walks a press along it: sign up → the
setup steps (a dry run, then for real) → the account page and the control room see the shop → a look picked → the free
trial → a card → a failed payment → a pause → a card → a downgrade.

Joined here because no hosted web door exists yet (plan 6.14):

- Sign-up starts the trial through billing (`createSignup({ billing })`).
- The shop maker calls `billing.publishPlan(shopId)` once a new shop's database exists (`createShopMaker({ billing })`).
  `publishPlan` now also copies the plan onto the registry row, which the control room reads; a trial that began at
  sign-up had neither copy until the next billing event. A failure there goes to the repair queue (`shop-plan`) and never
  holds the press up.
- One web door carries every route: sign-up, accounts, billing, the control room and what sits beside it (platform
  settings and the waitlist, the backup person's run book, the support inbox, account recovery). When the real door is
  hosted, it needs this same list.

## The web version (`site/build.js`)

`node walkthrough/site/build.js <folder>` (with `npm run demo` running) opens every stop on the start page in Chromium, as the
person it names, and writes `<folder>/index.html` with a picture of each stop and what to try there. The workflow
`.github/workflows/walkthrough-site.yml` does this on every merge to `main` and publishes the folder with GitHub Pages, so the
walkthrough can be opened in a browser with nothing installed. They are pictures, not a live copy: nothing on that page
can be clicked into. Made-up data only.
