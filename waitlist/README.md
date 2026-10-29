# Waitlist

The public waitlist page for presses: `index.html`, a single static page with no build step.

`signup.js` is the sign-up handler. It checks the form, quietly ignores bots (the hidden `website` field), and stores
each email once, keyed by a hash of the address so the record id doesn't show it. It uses only browser built-ins, so the
page runs it directly.

Sign-ups are stored in Firestore in the platform's own Firebase project, `lmb-platform-prod` (database in Montréal,
delete protection on), which is separate from every shop's project. There is no server: `firestoreStore.js` adds each
sign-up straight from the page, and `firestore.rules` only lets the page add a well-formed record under the right id.
Nobody can read, change or delete sign-ups through the web; the owner reads them in the Firebase console. A repeat email
is refused by the database and counts as done. `config.js` holds the project's public web values; empty `projectId`
switches the form off.

Check it: `npx firebase-tools@15.32.1 emulators:exec --only firestore --project demo-waitlist "node firestore-emulator.mjs"`
(CI job `waitlist-rules`).

Publish it with the other platform pages, from `site/` (see its README): the waitlist is the site's home page and the
rules go out with it. This folder's `firebase.json` holds only the rules, for the emulator check. There is no
`.firebaserc`, so a deploy has to name the project.

The product is called Colophon (`page.test.js` keeps the page on that name). Which domain to buy: run
`node waitlist/domain-check.js` (it only reads, over RDAP) and see `docs/name-and-domain.md`.

## Pricing (code plan 6.1)

`pricing.js` adds the three plans, "Free for 14 days, no card needed", **Start your free trial** and, above the form,
"Not ready yet? Join the waitlist". The plans, prices and trial come from the platform's `GET /api/plans`
(`signup/api.js`, from the settings). They show only when `config.js` has `PLANS_URL` and `SIGNUP_URL` (empty until
sign-up is hosted) and the answer says `signupOpen` (the control room's live setting, off by default); anything else,
including no answer, leaves today's page. The founding price shows only when the founding offer is set; under the shop
and shop-and-stockroom plans, "or 2% of your website sales, never more than $29 a month" shows only when pay as you sell
is over 0% (the percent and cap come from the answer). Proven by `pricing.test.js`.

Copy rules: never name a rival shop platform; prices and trial lengths only from `/api/plans`, never typed into the page.
