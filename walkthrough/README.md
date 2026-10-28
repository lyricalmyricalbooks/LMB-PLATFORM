# Walkthrough

The platform's own pages on made-up data, on one computer: `npm run walkthrough` (code plan 6.14). Plain Node 22 ES
modules, no packages of its own, no emulators, no network. The plain-words guide is in
[docs/demo-shop.md](../docs/demo-shop.md); `npm run demo` is the shop and stockroom, this is the pages around them.

| File | What it does |
| --- | --- |
| `run.js` | The command. Prints the addresses. `--port <number>` (or `WALKTHROUGH_PORT`) picks another port than 5180. |
| `server.js` | `startWalkthrough({ port })`: serves the pages' own files from their folders, the web door at `/api`, a stand-in card page, and the placeholder at `/`. Port 0 picks a free port (the tests). |
| `world.js` | `platformWorld()`: the whole platform joined with pretend services (see below). The server and `road.test.js` both use it. |
| `stub/` | The sign-in library, the waitlist's store: stand-ins the pages load in place of Google's and the platform project's. |
| `walkthrough.test.js` | Starts the server on a random port; each page answers 200; the card and sign-up routes work. |

## What it serves

| Address | Page | Notes |
| --- | --- | --- |
| `/` | one line: "Start page coming" | **Left free** for the control room's start page (`/` or `/start`). Nothing else is served at `/` or `/start`. |
| `/waitlist/` | `waitlist/index.html` | Plans from `/api/plans` and **Start your free trial** (the walkthrough turns sign-up on). The form keeps sign-ups in memory. |
| `/signup/` | `signup/index.html` | "Continue with Google" signs in as `newcomer@example.com`, who has no shop yet. |
| `/account/` (and `/accounts/`) | `accounts/index.html` | Signs in as `owner@example.com`, who has two presses. |
| `/account/billing?shop=moth-press` | `accounts/billing.html` | The press on its free trial. |
| `/account/billing?shop=paper-wasp` | `accounts/billing.html` | The press paused until a card is added. |
| `/help/`, `/terms/` | `help/`, `terms/` | The pages the others link to. |
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
- One web door carries every route. When the real door is hosted, it needs this same list.
