# Sign-up

A press signs itself up, with no help (code plan 2.5): sign in, name the press, pick a plan, answer one question it may
skip, and start the free trial with no card. The shop maker then makes the shop (2.6). The answer travels with the
shop (`shopFromSignup` › `sellingToday`) and setup step 12 writes it to the shop's `firstWeek/start`, where the
Overview's first-week list reads it (plan 3.3).

## The page (`index.html`, `app.js`)

Plain HTML and browser JavaScript, no framework and no build step (`docs/decisions.md`). Firebase's own browser library
is loaded from Google, at one fixed version (`config.js`), for sign-in only.

1. **Sign in**: Continue with Google, or an emailed sign-in link. No password. The link email comes from the platform
   (`notifications@`, signed Colophon) through `services/email`, not from Firebase's own sender.
2. **About your press**: press name, the shop's web address (a preview made from the name, `<address>.web.app`, with
   **Change**; checked against the registry and other sign-ups as they type, `POST /api/signup/address`, same rules as
   the shop id: 6 to 30 lowercase letters, digits and hyphens, starting with a letter), the plan (shop, stockroom or
   both, with prices from the settings), the country (it sets the shop's starting currency), "How do you sell today?"
   and "What do you sell?" (books, zines, comics, art and prints, a mix, clothing, shoes, jewelry, music or something else; plan 10.1), each with **Skip this question**, and the terms
   tick box. No card is asked for.
3. **Making your shop**: each shop in the making with plain words, the way in once it's ready, and a **Try again**
   button when the shop maker hit a snag (2.6).

`form.js` holds the questions and checks; the page and the server use the same file.

**The front door's design pass (25 November 2026, `join/`).** The live page is `join/` (email, code, then About your
brand). It asks only what the shop needs to be made: brand name (with the web address it will get, shown under the
name), kind of shop (Bookshop, Product shop, Services, built from `SHOP_TYPES` in `form.js`), country and the terms.
**Nothing about the shop's look is asked here** (Julian, 25 November 2026 evening): no starter picture, no "Your shop
starts as…", no "Or design your shop first", and no "What do you sell?" chips. A product shop is saved as `sells: "other"`
(a press that already saved its kinds keeps them), and the look step in the shop's setup guide asks what it sells and
shows the starter websites; Settings › What you sell changes the kinds later. Only a starter deliberately picked on a
sample shop (Use this starter) travels with the answers (`look`/`lookStyle`). A services shop still says what it does.
On a wide screen "Your new store" shows the brand, kind and address, a three-step "What happens next" (we make your shop,
you pick its look, add your first things and open) and the trial's facts. Under 900px the tile is left out and a strip
above the form gives the trial's facts. One main button; Sign out is in the header. Saved answers from before are kept.

**No dead ends (25 November 2026, sign-up to open shop plan, move 1).** The front page's buttons say what they do: closed,
every start button reads "Join the waitlist"; open, they read "Start your shop" and go to `join/`, and the note says
"N days free from today" (the trial starts when the shop is made, not when it opens). On `join/`, a country that isn't
open yet shows a calm "Your place is saved" page (`#view-later`, with Change my country) instead of a red error, and a
new press without an invite while sign-up is closed (`/api/press/open` answers 403 with `closed: true`) sees "You're on
the waitlist" (`#view-invite`): `join/waitlist.js` adds the email to the front page's waitlist with the sample shop's
starter as the source, and the saved answers carry on when the invite comes. "Start another shop" on the account page
goes to `join/?another=1`, which makes a second empty press record once (`accountStart.js` `another`).

**Never asked twice (25 November 2026, move 2).** Opening a shop saves a starter picked on a sample shop as
`look`/`lookStyle` (the page picks none itself since that evening), and the admin's first Get started step no
longer asks the brand name or country (`apps/shop/docs/agent-notes/admin.md`).

**No wait, one sign-in (25 November 2026, move 3).** Open my shop starts the shop maker at once
(`createFrontDoor({ startMaking })`, `server/jobsNudge.js` on Cloud Run: the web door calls the private jobs server with an
identity token; the deploy gives the web door the invoker role). The minute's sweep stays the safety net. "Go to my store"
and `join/?open=<shopId>` (the admin's "Email me a sign-in code") go through the account switcher, which opens the admin
already signed in (`accounts/shopSignIn.js`). That needs the platform to sign for the shops' project (Service Account
Token Creator on its Firebase admin account and Firebase Authentication Admin, as support visits do); until then the
switcher gives the plain admin address and nothing else changes.

## The server (`signup.js`, `api.js`)

`createApi({ signup, verifyIdToken, settings, routes })` is the platform's one web door, hosted later as one function
behind `/api` in the platform project:

| Route | Who | What |
| --- | --- | --- |
| `GET /api/plans` | anyone | the plans, prices, trial length and product name; `signupOpen`, the founding price (only when `foundingOffer.percentOff` is set), pay as you sell under the shop and both plans (only when `payAsYouSell.basisPoints` is over 0, capped at the plan's price) and the terms version |
| `POST /api/signup/address` | signed in | `{ pressName? , address? }`: the web address preview, free or not, with plain words |
| `POST /api/signin-link` | anyone | emails a sign-in link; the same answer for any address; five an hour per address |
| `POST /api/signup` | signed in, confirmed email | starts the trial (services/billing) and queues the shop |
| `GET /api/signup` | signed in | the person's shops in the making |

- Only a confirmed email can own a shop (an email link or Google confirms it).
- The shop id is the press name made web-safe plus five random characters (`moth-press-k3f9q`), because Google project
  ids are shared by everyone. An id the registry or another sign-up has is skipped.
- Signing up again for the same press (a double click, a lost answer) gives back the same shop and the same trial; a
  trial that failed to start is started on the next try, for the same shop.
- One account can start up to five shops this way.
- The terms (plan 6.2): no sign-up without the tick and today's version (`terms/terms.js`). The row keeps
  `{ termsVersion, termsAcceptedAt }` from the first sign-up; a re-run never changes it. "What do you sell?" is kept as
  `publishes` and travels with the shop (`shopFromSignup` › `publishes`, read by the welcome screen, 6.3).

## Fair-use limits on the whole door (`limits.js`, plan 19.5)

`createApi({ limits })` takes an optional limiter (`createLimits({ throttle, admins })`), on the same throttle store as
the sign-in links (`count(key, sinceIso)`, `add(key, atIso)`):

| What | Limit | Counted per |
| --- | --- | --- |
| every signed-in call | 120 a minute | signed-in person (`uid`); control-room admins (on the list, two-step) skip it |
| costly calls: `POST /api/signup/retry`, `/api/control/check`, `/api/control/google-run-again`, `/api/billing/card` | 10 per 10 minutes, each call on its own | person, admins included |
| `GET /api/plans` | 300 a minute | network |
| `POST /api/signin-link` | 20 an hour (on top of 5 an hour per address) | network |

The network is the first `x-forwarded-for` address, else `request.ip`; keys are hashed, so the store never holds an
address or id in the clear. Over a limit: 429, "You're going a bit fast. Wait a minute and try again." and `retryAfter`
(seconds). Refused calls aren't counted. If the counter can't be read or written the call goes through and it's logged,
so a broken counter never locks everyone out. The walkthrough wires it with an in-memory counter and limits a hundred
times higher. A path may carry a query (`?shopId=…`), handed to routes as `request.query`.

## The daily cap and invites (plan 6.13)

At most `signupDailyCap` new shops (live settings, default 10) start each Toronto day. A press over the cap gets status
`in-line` and the words "We're making a few shops a day. You're next in line, and we'll email you when yours starts."
Its trial doesn't start while it waits, so no free days are lost. `admitFromLine()` (called first by the shop maker's
`sweep`, given `line: signup`) lets the oldest in as room opens, starts the trial and sends `shop-starting` once.
An email invited from the control room (`invites`: `isInvited(email)`, `markUsed(email, shopId)`, from
`waitlist/invites.js`) skips the cap and the line, doesn't count towards the cap, and an invite that arrives while the
press waits lets it straight in on its next visit. The day's count is one record (`signupDays/<day>`) taken in a
transaction by sign-up and by the line alike, so presses arriving together can't go over the cap.

While sign-up is closed (`signupOpen` off, the default) a new press needs an invite (403 otherwise); a press that already
has a sign-up row carries on. Each new row is written with the account's claim on its press (`signupClaims/<uid>`) in
one transaction: a double click gets the first shop back, an account can't pass its limit of shops, and a new press can
never take an address already in use, even one of the same account's.

Sign-up reads the control room's `liveSettings({ env, store })` (services/settings.js) through `live.js`: whether sign-up
is open, the daily cap, the founding offer and pay as you sell, with the control room's saved changes on top.

## The shop maker from sign-up (`shopMaker.js`, plan 2.6)

A sign-up is queued. `sweep()` (a scheduled function, every minute) runs the setup steps (`setup/runner.js` with
`shopSteps`) for each queued shop and each shop due another try. The runner resumes at the failed step, holds the
shop's lock and logs every step, so a retry is simply another run.

| Status | What the press sees |
| --- | --- |
| `in-line` | over the daily cap: "You're next in line"; the page checks every minute |
| `queued`, `making` | progress; the page checks every few seconds |
| `ready` | the way into the admin; the welcome email is on its way (setup step 14) |
| `waiting` | "We couldn't finish <what the step does>. Nothing is lost: press Try again", plus automatic tries after 1, 5 and 15 minutes; after three, the repair queue hears about it |
| `needs-help` | a step stopped for a person (setup's "a person decides" stops): no button, "we've been told", and the repair queue gets it |

Once a shop is `ready`, the shop maker hands it its plan (`createShopMaker({ billing })` calls `billing.publishPlan`, plan 6.14): the trial that began at sign-up is written into the shop's own database (the trial banner) and onto the registry row (the control room). A snag there goes to the repair queue and never holds the press up.

`POST /api/signup/retry { shopId }` is the **Try again** button: the shop's owner only, only when a retry can help, not
within half a minute of the last try. It queues the shop for the next sweep. Each step's words for the press are in
`STEP_WORDS`; no Google or step names reach the page.

## Not yet

- Hosting the page and the `/api` function in the platform project, with Google and email-link sign-in turned on there.
- The real stores (Firestore in the platform project: `accounts`, `signups`, `throttle`).
