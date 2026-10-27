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
| 1.9b | shop, stockroom | Per-book author access becomes an `author` role: Settings › Team gains the role, and the stockroom rules accept it where they now read the author list. The book-to-author list stays, since a role can't say which book | rules emulator tests | |
| 1.10 | shop, stockroom | Remove the email fallback after one week on the live shop with no lock-outs | rules tests | |

### 1C. Money and email behind one door

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.11 | shop | `functions/payments/`: one module that makes Stripe clients and does refunds, payment lookups and reversal checks with the shop's own key; callers move to it one file at a time | payment tests with a fake Stripe (`functions/payments/payments.test.js`); index.js and orderRequests.js moved | done |
| 1.12 | shop | Checkout (`checkoutPayment.js`) and webhook setup (`checkoutAdmin.js`) go through the module | checkout tests | |
| 1.13 | shop | `functions/email/`: one module for every send, same pattern | email tests | |

### 1D. Your shop becomes a folder

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.14 | shop, stockroom | Take Lyricalmyrical out of both copies: redirects to its site, its address, email, starter words, update history and project ids go (neutral "Your Press" placeholders) | `apps-isolation.test.js` finds no "lyricalmyrical" | done |
| 1.14b | shop | `firebase.json` built from a template at deploy | template test | |
| 1.15 | shop | Site address and email links come from the profile (build scripts, server emails, `index.html`) | email link tests | |
| 1.16 | shop | Shop name, wordmark and default words become theme and Text & labels defaults | Studio coverage checks | |
| 1.17 | shop | Your one-offs become switches: legacy admin sign-in, Gmail receipt finder, GitHub Pages forwarding | tests | |
| 1.18 | shop, stockroom | A check fails the build when a project id, email or "lyricalmyrical" is written in code outside `shops/` | the check itself | |
| 1.19 | shop | Deploy workflow takes the project id as an input | workflow dry run | |

### 1E. Stockroom inside each shop's project

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.20 | stockroom | Its own Hosting site in `firebase.json`; rules deploy with the release; GitHub Pages kept until the move | build test | |
| 1.21 | shop | Shop-to-stockroom link works inside one project; the second-project grant goes away (`inventoryLinkStore.js`) | link tests | |

### 1F. One designer for every theme

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.22 | shop | Hidden layout switches become named options on shared parts, with Studio controls (classic and modern headers first) | Studio checks | |
| 1.23 | shop | A theme preset can hold section lists and starter pages, not only colours and fonts | preset tests | |
| 1.24 | shop | Check: a theme file only uses settings that have a Studio control | the check | |
| 1.25 | shop | Check: every section and book page block draws under every theme and stays readable | the check | |
| 1.26 | shop | Theme wave 1: Riso, Broadsheet, Imprint; admin themes Riso Press and Paper (all admin colours in one file) | theme checks | |
| 1.27 | shop | Studio opens in Essentials; everything else under All settings; five-item admin menu | Studio checks | |

### 1G. The setup script and the test shop

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 1.28 | platform | `setup/` step runner: numbered steps, check-before-act, logged, resumes after a failure, dry-run mode | runner tests with fake steps | done |
| 1.29 | platform | Steps 1–6 (registry, project, Firebase, services, database, web app and profile) using Google's APIs | dry run against the test shop | |
| 1.30 | platform | Steps 7–15 (rules, functions, pages, backup, private storage check, starter content, Stripe, email, shop check) | dry run | |
| 1.31 | shop | Sandbox checkouts hold stock on shops the platform marks as test shops | checkout tests | |
| 1.32 | platform | Create `platform-test` with the script; the release check (test card purchase, stock drop, email, refund) | the check passes | |

## Phase 2: the platform

Gate: a press nobody has spoken to signs up, pays and takes an order with no help.

| # | Repo | Pull request |
| --- | --- | --- |
| 2.1 | platform | `services/payments/`: Connect checkout, refunds, the one Stripe events address; shop identity checked against the registry |
| 2.2 | shop | `functions/payments/` gains the platform mode, chosen by the profile |
| 2.3 | platform | `services/email/`: sends for every shop from the platform address with the press's name and reply-to |
| 2.4 | platform | `services/billing/`: plans (shop, stockroom, both), card, cancel, failed-payment emails |
| 2.5 | platform | Sign-up: email link or Google, one skippable question, plan choice, no card for the trial |
| 2.6 | platform | Shop maker runs from sign-up, with retry and a plain-words "try again" |
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
| 4.1 | platform | `services/release-runner/`: build once, deploy ring by ring (test shop, your shop, everyone), stop at the first failed check, roll back |
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
- Stockroom data in the shop project: its own named database, or rules merged with the shop's (before 1.20).
- Move your stockroom ledger into the shop project now, or keep the link to the old project until Phase 4 (before 1.21).
