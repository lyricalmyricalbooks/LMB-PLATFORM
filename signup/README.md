# Sign-up

A press signs itself up, with no help (code plan 2.5): sign in, name the press, pick a plan, answer one question it may
skip, and start the free trial with no card. The shop maker then makes the shop (2.6).

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, no framework and no build step (`docs/decisions.md`). Firebase's own browser library
is loaded from Google, at one fixed version (`config.js`), for sign-in only.

1. **Sign in**: Continue with Google, or an emailed sign-in link. No password. The link email comes from the platform
   (`notifications@`, signed Colophon) through `services/email`, not from Firebase's own sender.
2. **About your press**: press name, the plan (shop, stockroom or both, with prices from the settings), the country (it
   sets the shop's starting currency), and "How do you sell today?" with a **Skip this question** button. No card is
   asked for.
3. **Making your shop**: each shop in the making with plain words, the way in once it's ready, and a **Try again**
   button when the shop maker hit a snag (2.6).

`form.js` holds the questions and checks; the page and the server use the same file.

## The server (`signup.js`, `api.js`)

`createApi({ signup, verifyIdToken, settings, routes })` is the platform's one web door, hosted later as one function
behind `/api` in the platform project:

| Route | Who | What |
| --- | --- | --- |
| `GET /api/plans` | anyone | the plans, prices, trial length and product name |
| `POST /api/signin-link` | anyone | emails a sign-in link; the same answer for any address; five an hour per address |
| `POST /api/signup` | signed in, confirmed email | starts the trial (services/billing) and queues the shop |
| `GET /api/signup` | signed in | the person's shops in the making |

- Only a confirmed email can own a shop (an email link or Google confirms it).
- The shop id is the press name made web-safe plus five random characters (`moth-press-k3f9q`), because Google project
  ids are shared by everyone. An id the registry or another sign-up has is skipped.
- Signing up again for the same press (a double click, a lost answer) gives back the same shop and the same trial; a
  trial that failed to start is started on the next try, for the same shop.
- One account can start up to five shops this way.

## The shop maker from sign-up (`shopMaker.js`, plan 2.6)

A sign-up is queued. `sweep()` (a scheduled function, every minute) runs the setup steps (`setup/runner.js` with
`shopSteps`) for each queued shop and each shop due another try. The runner resumes at the failed step, holds the
shop's lock and logs every step, so a retry is simply another run.

| Status | What the press sees |
| --- | --- |
| `queued`, `making` | progress; the page checks every few seconds |
| `ready` | the way into the admin; the welcome email is on its way (setup step 14) |
| `waiting` | "We couldn't finish <what the step does>. Nothing is lost: press Try again", plus automatic tries after 1, 5 and 15 minutes; after three, the repair queue hears about it |
| `needs-help` | a step stopped for a person (setup's "a person decides" stops): no button, "we've been told", and the repair queue gets it |

`POST /api/signup/retry { shopId }` is the **Try again** button: the shop's owner only, only when a retry can help, not
within half a minute of the last try. It queues the shop for the next sweep. Each step's words for the press are in
`STEP_WORDS`; no Google or step names reach the page.

## Not yet

- Hosting the page and the `/api` function in the platform project, with Google and email-link sign-in turned on there.
- The real stores (Firestore in the platform project: `accounts`, `signups`, `throttle`).
