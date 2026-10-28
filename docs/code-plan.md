# Code plan

The build plan turned into pull requests, in the order they get built. Written 27 October 2026.

Each line is one small pull request. It names the repo, what it adds and the check that proves it works.

**Your own website and stockroom are never changed by this plan** (decided 27 October 2026). `LyricalmyricalWebsite`
and `lyrical-inventory` stay specific to Lyricalmyrical and must keep working in all circumstances. The product uses
copies of them inside this repo, where Lyricalmyrical is taken out.

Where each line happens: **shop** = `apps/shop/`, **stockroom** = `apps/stockroom/`, **platform** = the rest of this repo.

Status: `done`, `open` (pull request up), `next`, or blank (not started).

## Phase 0: prove demand (runs alongside Phase 1)

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 0.1 | platform | Waitlist page (`waitlist/index.html`) | no rival named (test) | done |
| 0.2 | platform | Waitlist sign-up handler: checks the form, ignores bots, stores each email once (`waitlist/signup.js`) | handler tests with a fake store | done |
| 0.3 | platform | Waitlist storage adapter and hosting: sign-ups go straight from the page to Firestore in the platform project `lmb-platform-prod` (Montréal), add-only rules (`waitlist/firestoreStore.js`, `firestore.rules`, `firebase.json`) | a test sign-up lands in the emulator; rules refuse reads, edits and doctored records (`waitlist-rules` job) | done |
| 0.4 | platform | Product name in the page, domain checked | name test | |

## Phase 1: make it anyone's shop

Gate: a second shop made by the setup script takes a sandbox order end to end, and nothing on it says Lyricalmyrical.

### 1A. The shop profile (one file says what differs between shops)

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.1 | platform | Profile format `profile/shop-profile.schema.json` and Lyricalmyrical's profile as the example | schema test | done |
| 1.0 | shop, stockroom | Copy both apps into `apps/`, every live project id and key replaced by a made-up test project, both test suites in CI | `apps-isolation.test.js`; CI green | done |
| 1.2 | shop | `src/lib/shopProfile.ts` reads `/shop-profile.js` at page open; Firebase settings, project id, region and bot-check key come from it (built once on your website, then undone there; the copy in `apps/shop` has it). The build scripts (sitemap, catalog file, publish check, prerender) read the same file | unit tests | done |
| 1.3 | stockroom | `src/lib/shop-profile.js` reads the same file (`public/shop-profile.js`, loaded before the app); `src/firebase.js` uses it; the `lyrical` data folder name kept in one constant (`DATA_ROOT`); the profile format gains an optional `firebase.databaseURL` | unit tests | done |
| 1.4 | shop | Server side: `functions/shopConfig.js` reads owner, sender, site address and allowed web addresses from the shop project's own `functions/.env.<project id>` (written by the setup script), placeholders as fallback; `index.js`, `roles.js`, `shopSettings.js` and `searchConsole.js` stop naming them. Plan moves to 2.4 (billing). Firestore and Storage rules still name the owner address: 1.14b | function tests | done |
| 1.5 | shop, stockroom | A copy check: each app's copy of the profile format matches the platform's | `apps/shop/src/lib/shopProfileFormat.test.ts`, `apps/stockroom/tests/shop-profile-format.test.js`: each reads the platform example, refuses one missing any required field, and its own profile passes the platform's check | done |

### 1B. Members and roles instead of one email (riskiest, most tested)

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.6 | shop | `members` list and `functions/roles.js`, which copies each member's role onto their sign-in pass; the owner address stays owner | function tests | done |
| 1.7 | shop | Rules check the role on the pass (owner, staff); the Team and secret keys are owner-only | rules emulator tests: owner, staff, stranger (CI job `shop-rules`) | done |
| 1.8 | shop | Admin sign-in checks the role, not one address (`src/app/admin/api.ts`), and Settings › Team manages the list | admin tests | done |
| 1.9 | stockroom | The three rule files and the sign-in screen check the role: the owner address or the `owner` role, always with a verified email. Staff stay out of the stockroom (its settings hold secret keys and the books' money) | rules emulator tests: owner address, owner role, staff, unverified, author, stranger (CI job `stockroom-rules`) | done |
| 1.9b | shop, stockroom | Per-book author access becomes an `author` role: Settings › Team gains the role, and the stockroom rules accept it (verified) where they now read the author list (`isAnyAuthor`, the Database `authorEmails` check). The book-to-author list stays, since a role can't say which book. The role never opens the shop admin (`roles.js` `ADMIN_ROLES`) or a stockroom book; a smaller role signs the person out | rules emulator tests (`shop-rules`, `stockroom-rules`): author role reads author settings, no book alone, no admin; static rule tests | done |
| 1.10 | shop, stockroom | Remove the email fallback after one week on the live shop with no lock-outs | rules tests | |

### 1C. Money and email behind one door

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.11 | shop | `functions/payments/`: one module that makes Stripe clients and does refunds, payment lookups and reversal checks with the shop's own key; callers move to it one file at a time | payment tests with a fake Stripe (`functions/payments/payments.test.js`); index.js and orderRequests.js moved | done |
| 1.12 | shop | Checkout (`checkoutPayment.js`) and webhook setup (`checkoutAdmin.js`) go through the module | checkout tests; `functions/payments/payments.test.js` (checkout and admin calls with a fake Stripe, and no file but the module makes a Stripe client) | done |
| 1.13 | shop | `functions/email/`: one module for every send, same pattern | email tests (`functions/email/email.test.js` with a fake Gmail and Resend; existing send, outbox and Gmail-check handler tests) | done |

### 1D. Your shop becomes a folder

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.14 | shop, stockroom | Take Lyricalmyrical out of both copies: redirects to its site, its address, email, starter words, update history and project ids go (neutral "Your Press" placeholders) | `apps-isolation.test.js` finds no "lyricalmyrical" | done |
| 1.14b | shop | `firebase.json` built from a template at deploy: `scripts/deployConfig.mjs --project <id>` writes `firebase.deploy.json` (the shop's own Hosting site) and `.deploy/` rules with the owner address filled in from `SHOP_OWNER_EMAIL` (same value as the Cloud Functions); the deploy workflow uses `--config firebase.deploy.json`. The Firestore and Storage rules no longer name `owner@example.com`: they hold the slot `"__SHOP_OWNER_EMAIL__"`, which matches nobody if deployed unfilled (fails closed), and the step refuses to write anything without a valid address. The admin's own owner check (`ownerDevice.ts`) no longer holds an address (1.15), and the workflow's project id is an input (1.19) | template test (`scripts/deployConfig.test.ts`), rules emulator with the slot filled | done (both leftovers closed: the admin's owner check by 1.15, the workflow's project id by 1.19) |
| 1.15 | shop | Site address and email links come from the profile (build scripts, server emails, `index.html`). Build scripts and `vite.config.ts` read `siteUrl` from `public/shop-profile.js` (SITE_URL still wins), the deploy workflows fall back to it and write it for the server. The functions region is a shop setting: `SHOP_FUNCTIONS_REGION` (written at deploy from the profile's `functionsRegion`, us-central1 when unset) sets every function's region and the Stripe webhook and e-book download links (`shopConfig.js` `functionLink`). The admin's owner check no longer has a built-in address: `refreshMyRole` tells it to the owner and staff after sign-in (not public: the profile format has no owner field). Admin help links name the shop's own project. Setup step 8 writes `SHOP_FUNCTIONS_REGION` into the functions env file it deploys with (`setup/later-steps.js`, PR #26) | email link tests, region and link tests, admin owner tests | done |
| 1.16 | shop | Shop name, wordmark and default words become theme and Text & labels defaults | Studio coverage checks | |
| 1.17 | shop | Your one-offs become switches: legacy admin sign-in, Gmail receipt finder, GitHub Pages forwarding. Both apps read an optional `switches` object in the shop profile (`legacyStockroomSignIn`, `githubPagesForwarding`, `gmailReceiptFinder`); only `true` turns one on, so every new shop and the test shop have all three off. Off: the admin sign-in never loads or signs into the separate stockroom project (`admin/legacySignIn.ts`); `deploy-pages.yml` skips `redirect-old-address` (`node scripts/shopProfile.mjs switch githubPagesForwarding`) and the shop ignores `#lm-move=` hand-overs; the stockroom's Email Receipt Import hides Gmail Finder, Gmail Import and the Gmail pill, opens on Paste & Upload and never restores the finder at sign-in. The format (`profile/shop-profile.schema.json` `switches`, three optional booleans) and setup step 6 (writes all three as `false`, keeps saved values on a re-run, records them in the audit entry) followed in the switches PR | tests (`apps/shop/src/lib/shopSwitches.test.ts`, `apps/stockroom/tests/shop-switches.test.js`) | done |
| 1.18 | shop, stockroom | A check fails the build when a project id, email or "lyricalmyrical" is written in code outside `shops/`. `apps-isolation.test.js` (root `npm test`, CI job `test`) now reads every file git tracks or would add outside `shops/` (apps, setup, services, profile, waitlist, docs) and fails on: a live Lyricalmyrical id or key anywhere; "lyricalmyrical" in code outside `apps/` (Markdown prose may name it, its code blocks may not; the repository's own GitHub address is allowed); an email address unless it is on a placeholder domain (`example.*`, `*.example`, `.test`, `.invalid`, `yourpress.*`), a one-letter made-up domain, a company sender the code recognises (receipt finders, Resend) or a stock form placeholder; a Firebase project in a host name, `projectId`, `--project` or `GCLOUD_PROJECT` that isn't `lmb-test-shop`, `lmb-test-stockroom`, the platform's `lmb-platform-prod`, `demo-*`, a template slot or one of the made-up test presses. It found four real addresses (an open-call artist, two bookshops, a customer sample) in the copies; they are now placeholders | the check itself, plus a probe that each rule fails | done |
| 1.19 | shop | Deploy workflow takes the project id as an input. Both `deploy-firebase.yml` and `deploy-pages.yml` have a `project` input (`workflow_dispatch`); a **Firebase project** step takes it, else the repository variable `FIREBASE_PROJECT_ID`, else the shop profile's `firebase.projectId`, and `scripts/deployProject.mjs` refuses a malformed id or any project other than the profile's (the pages built here call that one) before a key is used. Every `--project`, `functions/.env.<project>` and `GCLOUD_PROJECT` then uses `$FIREBASE_PROJECT`; neither workflow names `lmb-test-shop`. The input reaches the shell through `env`, never pasted into the script | workflow dry run (`scripts/deployProject.test.ts` runs each workflow's step script in bash with no input, the profile's project, another project and shell-breaking input) | done |

### 1E. Stockroom inside each shop's project

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.20 | stockroom | Its own Hosting site in `firebase.json`; rules deploy with the release; GitHub Pages kept until the move. Inside a shop's project the stockroom has its own named Firestore database `stockroom`, its own bucket and site (`<shop id>-stockroom`) and the project's Realtime Database; the profile format gains an optional `stockroom` block naming the database and bucket, and the stockroom opens them (`src/firebase.js`). `scripts/deployConfig.mjs --project <id>` writes `firebase.deploy.json` and `.deploy/` rules with the owner filled in (the three rule files now hold the `__SHOP_OWNER_EMAIL__` slot; Storage reads the author list from the stockroom database); `deploy-firebase.yml` (by hand) deploys rules, then pages. Setup step 5 creates the named database, bucket and Realtime Database when the plan has the stockroom; step 6 writes the `stockroom` block. Still to check on the test shop: Storage rules reading a named database (the emulator can't show it) | build test (`tests/deploy-config.test.js`, `npm run check:hosting` on the CI build), rules emulator with the slot filled (`stockroom-rules`), setup step tests | done |
| 1.20b | stockroom, platform | The owner of a **stockroom-only** shop gets in. In a shop's project the stockroom knows the owner by the `owner` role the shop's server puts on the sign-in pass; a stockroom-only plan has no shop server, and the stockroom's sign-in screen compares against a placeholder address (`src/lib/publisher-access.js`). Either setup gives the owner the role another way, or the stockroom learns the owner's address safely (not from the public profile). Also check on the test shop that Storage rules can read the named `stockroom` database | rules emulator, sign-in tests | |
| 1.21 | shop | Shop-to-stockroom link works inside one project; the second-project grant goes away (`inventoryLinkStore.js`) | link tests | |

### 1F. One designer for every theme

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.22 | shop | Hidden layout switches become named options on shared parts, with Studio controls (classic and modern headers first). Header & announcement bar › Header layout (`headerLayout`: classic, modern; empty follows the shop page layout as before) | Studio checks; `referenceHeader.test.ts` | done |
| 1.23 | shop | A theme preset can hold section lists and starter pages, not only colours and fonts. Offered after the look, never applied with it; pages are added as drafts only when missing (`studio/presetContent.ts`) | preset tests (`presetContent.test.ts`); Studio check | done |
| 1.24 | shop | Check: a theme file only uses settings that have a Studio control (`studio/themeCheck.ts`, run on every theme-library entry; found and fixed the hero's Height) | the check (`themeCheck.test.ts`) | done |
| 1.25 | shop | Check: every section and book page block draws under every theme and stays readable | the check | |
| 1.26 | shop | Theme wave 1: Riso, Broadsheet, Imprint; admin themes Riso Press and Paper (all admin colours in one file) | theme checks | |
| 1.27 | shop | Studio opens in Essentials; everything else under All settings; five-item admin menu | Studio checks | |

### 1G. The setup script and the test shop

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.28 | platform | `setup/` step runner: numbered steps, check-before-act, logged, resumes after a failure, dry-run mode | runner tests with fake steps | done |
| 1.29 | platform | Steps 1–6 (registry, project, Firebase, services, database, web app and profile) using Google's APIs | dry run against the test shop | done |
| 1.30 | platform | Steps 7–15 (rules, functions, pages, backup, private storage check, starter content, payments, email, shop check). The payments step takes the press's provider: Stripe built, Square planned (2.2b). A per-shop lock stops two runs overlapping. Open point: the shop copy's functions don't set a region yet (Firebase's default `us-central1`, and `us-central1` in its webhook and download links), so the step's `northamerica-northeast1` only takes effect once `apps/shop` reads it | dry run of all 15 steps; step and lock tests with fakes | done |
| 1.31 | shop | Sandbox checkouts hold stock on shops the platform marks as test shops (`SHOP_TEST_SHOP="true"` in the shop's functions env, written by setup step 8 for the test shop only). There, a sandbox payment also takes stock and its refund puts it back, like a live one (1.31b); discount use and revenue stay untouched | checkout, payment and refund tests | done |
| 1.32 | platform | Create `platform-test` with the script; the release check (test card purchase, stock drop, email, refund). Starter catalogue done: step 12 gives the test shop three stocked books, a pre-order, an e-book and a shipping zone, creates the three stocked books in its stockroom and links each through the shop's link (`setup/test-catalogue.js`). The release check is built (`release-check/`): eight checks in order, stop at the first failure, logged; the stockroom opened in Playwright as the test owner; proven with a pretend shop and in a real Chromium against stand-in pages. Waits for Julian to create `platform-test` and run it once (`docs/test-shop.md`, "Running it for real") | the check passes | open (code done; real run needs Julian) |

## Phase 2: the platform

Gate: a press nobody has spoken to signs up, pays and takes an order with no help.

| # | Repo | Pull request |
| --- | --- | --- |
| 2.1 | platform | `services/payments/`: Connect checkout, refunds, the one Stripe events address; shop identity checked against the registry. **Status: done.** Built: `createPaymentService` (Stripe over REST with an injected `fetch`, platform keys only from its environment), the shop door (service key checked by hash like the email service, a fixed list of calls on the registry's account only, money-routing parameters refused, idempotency keys scoped to the shop, live calls refused for test accounts), the one Connect events address (signature, shop found by account, event passed on; the shop re-fetches it), account state kept in the registry, step 13's account client, and the platform fee (a percentage, 0% by default, per shop or platform-wide, refunded in proportion unless turned off). Proven by `services/payments/payments.test.js` with a pretend Stripe. Still to do: hosting, the shop side (2.2), each shop's service key setup step |
| 2.2 | shop | `functions/payments/` gains the platform mode, chosen by the profile |
| 2.2b | shop, platform | Square as a second way to take payments (Julian, 27 October 2026): a Connect Square button, then checkout, refunds and payment lookups through the same `functions/payments/` module, with the provider chosen per shop. 1.11–1.13 build that module with Stripe as its first provider |
| 2.3 | platform | `services/email/`: sends for every shop from the platform address with the press's name and reply-to. **Status: done.** Built: `createEmailService` (Resend over REST with an injected `fetch`, key only from `RESEND_API_KEY`, idempotency key on every send and a sent log so a retry never sends twice), templates, the shop door (`http.js`, per-shop service key checked by hash, daily limit) and `services/settings.js` (Colophon, $29/$19/$39 CAD, 14-day trial, notifications@/support@ a placeholder domain). Proven by `services/email/email.test.js` with a pretend Resend. **2.3b (done):** the shop copy keeps the press's own Gmail first; when Gmail isn't connected or refuses, a shop with `PLATFORM_EMAIL_URL` (setup step 8 writes it once the platform has one) falls back to this service, never to a Resend key in the shop (`apps/shop/functions/email/platformSender.js`; tests prove a shop with Gmail working never reaches it); Settings › Email sender opens with "Send from your own Gmail", showing the real address. A retry after a partial send to several people never doubles an email (queued: the queue id; not queued: a key from the email and the hour). Still to do: hosting; the per-shop service key setup step belongs to 2.2 |
| 2.4 | platform | `services/billing/`: plans (shop, stockroom, both), card, cancel, failed-payment emails. **Status: open.** Built on the platform's own Stripe account (key read only by `services/payments`, `platformBillingStripe`): prices from the settings ($29/$19/$39 CAD, made once under a lookup key), one customer per account and one subscription per shop, a 14-day trial with no card that pauses (never deletes) when it ends without one, a setup-mode card page, cancel/keep at period end, prorated plan changes (the registry's `plan` follows), and the platform account's signed events handled once, with the trial-ending, card-needed, payment-failed, cancelled, ended and plan-changed emails. Proven by `services/billing/billing.test.js` with a pretend Stripe. Still to do: hosting, the real stores, pausing a shop's pages by `billing.access` (2.11) |
| 2.5 | platform | Sign-up: email link or Google, one skippable question, plan choice, no card for the trial. **Status: open.** `signup/`: a plain HTML and browser JavaScript page (no framework) that signs in with Google or a platform-sent email link, asks the press name, plan (prices from the settings), country and one skippable question, and starts the free trial with no card through `services/billing`; `api.js` is the platform's one web door (`/api/plans`, `/api/signin-link` rate-limited, `/api/signup`). Confirmed emails only; repeat sign-ups give the same shop and trial; shop ids are the press name plus five random characters. Proven by `signup/signup.test.js`. Still to do: hosting and the real stores |
| 2.6 | platform | Shop maker runs from sign-up, with retry and a plain-words "try again". **Status: open.** `signup/shopMaker.js`: `sweep()` runs the setup steps for queued shops and shops due another try (the runner resumes at the failed step); a failure a retry can fix shows what the step was doing in the press's words, a Try again button (`POST /api/signup/retry`, owner only, not twice within 30 s) and automatic tries after 1, 5 and 15 minutes; a stop for a person shows no button and goes to the repair queue. Proven by `signup/shopMaker.test.js` against the real steps and runner with pretend Google and services. Still to do: the scheduled function that calls `sweep` |
| 2.7 | platform | One account, many shops: platform account and shop switcher; invites with a role |
| 2.8 | platform | Control room: every shop, plan, version, health; "act as this shop", every use logged |
| 2.9 | platform, shop | Custom domains from the shop's settings; Stripe payment domain registered by the platform |
| 2.10 | shop | Go-live checklist; tax and shipping presets; Connect Stripe button |
| 2.11 | platform | Self-checks after every change and a repair queue |
| 2.12 | shop | Theme wave 2; show which edits carried over after a theme switch |

## Phase 3: easy switching

Gate: a press moves over in an afternoon without a call.

| # | Repo | Pull request |
| --- | --- | --- |
| 3.1 | shop | Import books, photos, editions and customers from common shop exports and spreadsheets |
| 3.2 | shop | Old product links keep working (redirects from the import) |
| 3.3 | shop | First-week checklist shaped by the sign-up answer |
| 3.4 | platform | Help articles for the top 20 questions |
| 3.5 | shop | Theme wave 3; a press's edits stored apart from the theme they started from |
| 3.6 | platform | The five-person first-hour test, and fixes for the top three stalls |

## Phase 4: running many shops

Gate: a month where every update reaches every shop with no checkout outage.

| # | Repo | Pull request |
| --- | --- | --- |
| 4.1 | platform | `services/release-runner/`: build once, deploy ring by ring (the test shop, then every other platform shop; the owner's own original shop is not on the platform and is never a ring), stop at the first failed check, roll back. **Status: open (code done; a real release needs Julian).** Built: rings from the registry only (exactly one live test shop first, then live shops by id; every shop's project must be in the shops folder), one build per release (`release-<version>` git tag, reused for a rollback), rules then server code then pages per shop with its own files, a check after each (release stamps and pages for every shop, the full release check for the test shop), rollback of the failed shop to its previous release, a release lock and each shop's own lock, a dry run, and every run recorded in the registry and each shop's audit log. Proven by `services/release-runner/release.test.js` with pretend deploys. Still to do: the platform project and shops folder (Julian, `docs/test-shop.md` steps 1–2) and the first tagged release |
| 4.2 | shop | `functions/migrations/`: numbered data changes, each recorded in the shop so a re-run does nothing |
| 4.3 | platform | `services/health/`: 5-minute checks, nightly backups, alerts on checkout, webhook and backup failures |
| 4.4 | platform | Status page and support inbox |
| 4.5 | platform | New-device alerts and the account recovery review queue |

## Rules for every pull request

- Tests never touch real money or a paying press's project. Use fakes or the test shop.
- Customer-facing words never name a rival.
- Never change `LyricalmyricalWebsite` or `lyrical-inventory` for the product. Only Julian's own requests change them.
- Each app repo keeps its own rules: release notes in the shop, "What's new" lines in the stockroom.
- Update the Status column here in the same pull request that finishes an item.

## Open decisions

- The product name ("Colophon" is a working name; blocks 0.4 and the repo renames).
- ~~Stockroom data in the shop project~~: its own named database (Julian, 28 October 2026; 1.20).
- ~~Move your stockroom ledger~~: new shops link inside one project; Julian's own ledger is never moved or touched (Julian, 28 October 2026; 1.21).
