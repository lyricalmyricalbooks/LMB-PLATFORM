# LMB Platform

The platform behind the press shop and stockroom subscription. It creates and runs one Firebase copy per press.

The shop and the stockroom used by the platform are copies in `apps/`:

- `apps/shop/`: the product's shop, a copy of [LyricalmyricalWebsite](https://github.com/lyricalmyricalbooks/LyricalmyricalWebsite).
- `apps/stockroom/`: the product's stockroom, a copy of [lyrical-inventory](https://github.com/lyricalmyricalbooks/lyrical-inventory).

Julian's own website and stockroom repos are never changed for the platform; they must keep working in all circumstances.



## What lives here

| Folder | What it does |
| --- | --- |
| `apps/` | Copies of the shop and the stockroom for the platform. Julian's own repos are never changed. |
| `setup/` | The shop maker. It creates a press's Firebase copy in numbered steps, each safe to re-run. |
| `clients/` | The platform's real connections to Google (Firestore, the registry, sign-in for the test owner), each tested with a fake `fetch`. |
| `release-check/` | The full purchase every update must pass on the test shop: buy, stock drop in the shop and stockroom, email, refund. |
| `releases/` | Notes on how a new shop and stockroom version reaches every press. |
| `status/` | The public status page: whether pages, checkout, payments and backups are working, counted across shops and naming none. |
| `services/support/` | The support inbox: presses ask from their account page, the platform team answers from the control room, and every answer is emailed. |
| `services/health/` | Checks every shop's pages, checkout, payment events and backups every five minutes, emails the platform when one fails, and backs up what the shops don't each night. |
| `services/release-runner/` | Builds a release once and sends it to the test shop, then every other platform shop; stops and rolls back at the first failed check. |
| `control-room/` | Platform admin: every shop's health, plan, version and switches, a logged "act as this shop" button, and a command to turn one shop switch on or off. |
| `services/payments/` | The one service that holds the Stripe platform key. It handles checkout and Stripe events for all shops. |
| `services/billing/` | Each press's Colophon plan (shop, stockroom or both) on the platform's own Stripe account: free trial with no card, card, cancel, plan changes and the billing emails. |
| `services/email/` | The one service that holds the email sender key. |
| `services/trial-tips/` | Setup tips by email on days 2, 4, 7, 21 and 60 of a press's trial, each for the next step of their shop's setup guide they haven't done; tips can be turned off, billing emails can't. |
| `services/domains/` | A press's own web address from their shop's settings: saved, allowed to call the shop's server code, served by Firebase Hosting, then registered for Apple Pay and Google Pay. |
| `google/` | Connect Google: one sign-in links the press's Analytics, Search Console, Google Shopping, own web address, email sending and the optional extras, and one teardown undoes it on the closing timeline. Off until switched on. |
| `services/accounting/` | The QuickBooks link: a press connects their QuickBooks company from their shop's settings and each night's sales, refunds, card fees and payouts are sent once. Off until switched on (`docs/accounting.md`). |
| `signup/` | Sign-up, plan choice and billing. |
| `accounts/` | One sign-in for every shop a person belongs to: the shop switcher, and invites with a role for each shop's team. |
| `waitlist/` | The public waitlist page. |
| `help/` | Plain answers to the questions presses ask most, one for every first-week step, and what our help includes, as one static page with search. |
| `terms/` | The terms, privacy policy, data agreement and shutdown promise on one page, with the version sign-up records. |
| `plain-words/` | The list of words no press may read (Firebase, key, webhook and the rest), and the tests that read the sign-up, account, billing and help pages, the setup steps, the emails, the shop's admin and the stockroom against it. Also a phone-width check of the press-facing pages. |
| `demo/` | `npm run demo`: the test shop, admin, Studio and stockroom on your own computer, against the Firebase emulators (`docs/demo-shop.md`). |
| `profile/` | The shop profile format: what differs between shops, read by both apps when the page opens. |
| `docs/` | Decisions and plans: `code-plan.md` (the build order, one pull request per line), `shop-setup.md`, `payments.md`, `test-shop.md`, `name-and-domain.md`, `first-hour-test.md`, `demo-shop.md`, `accounting.md`, `run-book.md` (what to do about each alert, and how to pause a shop, refund a fee, restore a backup and stop a release), `decisions.md`. |

The plan behind all of this is the "Press platform build plan" doc.

## Checks

```bash
npm test
```

CI runs the same check on every pull request.

> This repo is public for now. Make it private before the first paying press.
