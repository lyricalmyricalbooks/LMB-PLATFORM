# Next build plan: Phase 7 and after

Researched and written 28 October 2026 for Julian. Builds on `LMB-PLATFORM/docs/code-plan.md` (Phases 0 to 5), the gaps note (`ideation/2026-10-27-build-plan-gaps.md`) and the earlier research (`research/2026-10-27-shopify-quickbooks-onboarding.md`). This time every claim about Shopify, QuickBooks, Stripe and Square was checked on the company's own help or developer pages.

Labels used below:

- **Fact** (with a source number): read on the owner's own page on 28 October 2026.
- **Inference**: my reading of facts or code; could be wrong.
- **Recommendation**: what I suggest building.

This is a plan, not legal or tax advice. Tax and legal rows need your accountant or lawyer.

---

## 1. Short version

- Both big companies open a **private, working shop or file at once**, then show a **short list of next steps**. Colophon already has most pieces, and the code plan's Phase 6 (approved) adds the private "opening soon" start, the setup guide and the **Open your shop** button. This plan starts after it, as Phase 7 and 8.
- ~~The current "Ready to sell" list shows two technical rows to every press.~~ Checked after writing: `launchReadiness.ts` line 140 already returns before those rows on a platform shop, so this is done. Row 7.1 is kept only as a test to prove it.
- The **practice order** steps ask platform shops for a secret key they never have. Platform shops need a one-button practice checkout instead.
- **Bringing a shop over** reads the *older* column names of the most common shop export. That export now uses new names. Fix it so the "magic moment" works with today's files.
- **Trial emails** that follow the checklist are already in the code plan (6.10), so they are not repeated here.
- **Bookkeeping, step one:** a monthly file with one line per day, taxes split by GST/HST/PST/QST, card fees and payouts. QuickBooks imports spreadsheets of under 1,000 rows, so one line per day fits. To do this, orders must first record the real card fee and which payout they were paid in. Today they don't.
- **Bookkeeping, step two:** a direct "Connect QuickBooks" button. Intuit's free developer level allows it. Sending sales in costs nothing. Only reading data out is metered.
- **A bookkeeper role** in Team: sees orders, payouts and exports, nothing else. QuickBooks treats accountants the same way.
- **Leaving is easy too:** export books and customers in the column layout most shop systems read. The shutdown promise depends on this.
- The open gaps from the gaps note (terms, backup person, email reputation, sign-up screening, privacy law, spending caps) are listed as rows. Most of them wait on you.

---

## 2. What Shopify does (facts, cited)

### Sign-up and trial

- **Fact [S1]:** Sign-up is: Start for free, create an account (email or Google, Apple, Facebook), add billing (optional, skippable), answer a questionnaire (optional, "Skip customized setup"). Then the admin opens.
- **Fact [S2]:** The Canadian trial page offers "Try Shopify free for 3 days, no credit card required", then "$1/month". It doesn't say for how long.
- **Fact [S3]:** Trial length "can vary based on different factors". The trial starts at sign-up. The store starts "in private mode, or its checkout is inactive". To take orders during the trial you need a payment provider. If the trial ends with no plan, "your store is paused until you choose one", and the work is kept. "Shopify doesn't extend or reset free trials."
- **Inference:** Colophon's 14 days, no card, pause instead of delete (`services/billing`) already matches the important parts and is kinder.

### Private mode and launch

- **Fact [S4]:** Private mode hides "all of your online store's pages ... from visitors and search engines" behind a password page with an optional message and an email sign-up box. On trial stores, the app asks the owner to finish a required step (for example a business address) before the password can be removed.
- **Exists:** Colophon has a maintenance page (`apps/shop/src/app/components/MainSite.tsx`, `MaintenancePage`) and Settings › General › Store status. Nothing in setup turns it on for a new shop (inference: `setup/later-steps.js` writes starter content from the release, and no step sets `maintenance`).

### The setup checklist

- **Fact [S5]:** Shopify's general checklist runs in this order: before you start (tax advice, migrate, channels, plan); set up (password page, store and legal name, address, billing, currency, weight unit, email sender, shipping, markets, pickup, taxes, payment providers, policies, customer accounts, checkout, staff, domain, apps); organize (theme, products, collections, menus, blog); test (successful and failed test payments, refunds, cancellations, fulfillment, fraud settings); launch (preview, remove password); channels; promote.
- **Fact [S6]:** Shopify's own design pattern for an app setup guide has steps with a heading, description, picture and one action button, a progress bar, and marks steps done "to reinforce progress". Its examples use three steps, can be collapsed and have a close button. The page sets no step limit.
- **Inference:** Shopify's full list is about 40 items. Colophon's ease standard (three steps or fewer per task) argues for three must-do steps, with the rest under "Later".

### Test orders

- **Fact [S7]:** Three ways: Shopify's test payment gateway, Shopify Payments test mode, or a real payment then cancel and refund (processor fees may apply). "Test orders and simulated transactions don't display in your payouts or reports." "Customers can't place live orders during the time that your payment providers are in test mode."

### Payments activation (Canada)

- **Fact [S8]:** Shopify Payments in Canada needs: a business type (individual, sole proprietor, partnership, corporation, non-profit, charity), the representative's legal name, date of birth, email, phone and home address, identity check by selfie with photo ID or document upload, and a Canadian chequing account (CAD for CAD payouts). Bank account changes hold new payouts 3 to 5 business days.

### Taxes (Canada)

- **Fact [S9]:** Steps: check the threshold, register with the tax agencies, enter each registration number under Settings › Taxes and duties › Canada, add regions, add product tax overrides where the default rate doesn't apply. "Basic Tax is available in Canada only if your store was set up to collect tax there before May 13, 2026." The page tells owners to consult a tax professional.
- **Inference:** New Shopify stores in Canada are now on its paid tax engine. Colophon's presets (`admin/taxPresets.ts`, plan 2.10, PST/QST in 5.10) are a real selling point if kept simple and correct.

### Policies

- **Fact [S10]:** Shopify offers automatic return, terms, shipping and contact policies, and an "Insert template" button for others. They "are for informational purposes only, aren't legal advice". Policies are linked in the checkout footer automatically.
- **Exists:** Colophon has four policies (`features/site/policyPages.ts`) and the launch check warns when one is missing. There is no starter text.

### Staff

- **Fact [S11]:** Staff are invited from Settings › Users; "Invitations to create a staff login expire in 7 days"; permissions are set by roles; the number of users depends on the plan, and Basic/Starter can't add users.
- **Exists:** Colophon invites also last 7 days (`accounts/`, decision of 28 October), with owner, staff and author roles.

### Moving in (import order and file formats)

- **Fact [S12]:** Migration order: import data, check products, theme, shipping, taxes, payments, test orders, staff, domain and redirects, then optional SEO. "Import your products first, then your customers, and then any historical orders" so they link up. Turn off staff new-order emails before importing orders.
- **Fact [S13]:** The product file now uses these headings: Title, URL handle, Description, Vendor, Product category, Type, Tags, Published on online store, Status, SKU, Barcodes, Option1 name, Option1 value, Price, Compare-at price, Cost per item, Charge tax, Inventory tracker, Inventory quantity, Continue selling when out of stock, Weight value (grams), Weight unit for display, Requires shipping, Product image URL, Image position, Image alt text, Variant image URL, Gift card, SEO title, SEO description, and more. Only Title is required for new products; URL handle too when there are variants. Older templates "may use different column names" and Shopify still accepts them. "Barcode" became "Barcodes" on the next export, and a file with both fails.
- **Fact [S14]:** The customer file headings: First Name, Last Name, Email, Accepts Email Marketing, Default Address Company, Default Address Address1, Default Address Address2, Default Address City, Default Address Province Code, Default Address Country Code, Default Address Zip, Default Address Phone, Phone, Accepts SMS Marketing, Accepts WhatsApp Marketing, Total Spent, Total Orders, Note, Tax Exempt, Tags. Consent is `yes` or `no` per channel; people who unsubscribed, bounced or never agreed get `no`. Files up to 15 MB.
- **Fact [S15]:** The inventory file: Handle, Title, Option 1 to 3 Name and Value, SKU, HS Code, COO, Location, Bin name, Incoming, Unavailable, Committed, Available (read only), On hand (current), On hand (new), packed size columns. "On hand (new)" sets stock; a row whose stock changed since export is skipped. Up to 15 MB.
- **Code check (fact, local):** `apps/shop/src/app/admin/shopMove.ts` `recognizeExport` only knows the old headings: `has("Handle", "Title", "Variant Price")`, and reads `Variant SKU`, `Body (HTML)`, `Variant Compare At Price`. A file with today's headings (URL handle, Price, SKU, Product image URL) is not recognised and falls to the plain import, which loses editions, old links and photos per edition. **This is a gap.**

---

## 3. What QuickBooks does (facts, cited)

### Setup interview (Canada)

- **Fact [Q1]:** Intuit's 2025 Canadian lesson lists the questions in order: legal business name; "How have you been managing your finances?"; "What's your industry?"; "What kind of business is this?" (with "I'm not sure"); your main role; who works there; apps you use ("Skip for now"); "Does a bookkeeper help with your books?"; "What do you want to do in QuickBooks?"; "What should we do first?" (for example "Get ready to invoice").
- **Fact [Q1]:** Canadian sales tax setup asks: province, start of the current tax period, filing frequency (monthly, quarterly, half-yearly, yearly), reporting method, GST/HST number, then "Start tracking in a new province" for PST or QST.
- **Fact [Q1]:** Invite an accountant from Manage users › My Accountant; "up to two free accountant users".

### Trial and practice company (Canada)

- **Fact [Q2]:** The Canadian page offers a "Free 30-day trial", plus a separate "90% OFF ... for 6 months" offer that can't be combined with the trial. After the trial the plan is charged monthly until cancelled.
- **Fact [Q3]:** A Canadian demo company, "Long for Success -- Event Planning". "The demo doesn't save any changes you make, so go ahead and experiment."

### Accountants

- **Fact [Q4]:** Accountants are invited from Settings › Manage users › Accounting Firms › Invite firm, by email or firm ID. "Accountant users invited this way don't count toward your user limit." They get tools to check the books, fix problems and prepare taxes.

### Imports

- **Fact [Q5]:** QuickBooks Online imports bank data, customers, suppliers, chart of accounts, products and services, invoices, credit notes, sales receipts, journal entries and bills, from CSV, Google Sheets or Excel. "You can only import spreadsheets with less than 1,000 rows." The exact columns come from sample files inside the product, not the help page.

### How shop sales reach QuickBooks today (Intuit's own connector)

- **Fact [Q6, Canada page, published 22 September 2026] and [Q7, US page, updated 3 August 2026]:**
  - Each retail sale arrives as a "Payment Received" item. Once confirmed, QuickBooks makes **one Sales Receipt per sale and one Expense for its fees**, both sitting in Undeposited Funds (Payments to deposit).
  - **Each payout becomes a Deposit** that moves the net amount to the bank account. Payouts typically cover one day.
  - Refunds come in one by one, with taxes and products.
  - Merchant-collected taxes sit in the sales receipt's tax section, charged to the agency account for the location.
  - Products match by SKU and name; unmatched products are not created.
  - Setup choices: start date, deposit account, payments account, auto-add, track products, track customers. History goes back up to 12 months. The first import takes 10 minutes to 3 hours.
  - Reconciling: confirm sales, then the payout, then "Always use Match" in the bank feed. Don't add the deposit by hand.
- **Inference:** Intuit's own connector posts **per order**, and uses the payout as the bridge to the bank. A per-day summary is the other common approach. It keeps small presses' books short, but you can't see single orders in QuickBooks. Offer both, with daily summary as the default for small volume (recommendation, section 6).

### The developer side (QuickBooks Online Accounting API)

- **Fact [Q8, Intuit App Partner Program Guide v1.2, March 2026]:**

  | Tier | Fee a month | Included "CorePlus" (read) calls | "Core" (write) calls |
  | --- | --- | --- | --- |
  | Builder | free | 500,000, hard cap (over it, calls are blocked) | not capped |
  | Silver | US$300 | 1 million | not capped |
  | Gold | US$1,700 | 10 million | not capped |
  | Platinum | US$4,500 | 75 million | not capped |

  "Core" covers "most data-in operations such as creating or updating invoices, bills, customers" and is "unmetered and uncharged". "CorePlus" covers "most data-out operations such as reading accounts". Only successful calls are counted. **Builder can't list on the app marketplace**; listing needs a security, technical and marketing review. To publish an app you first fill in a "self-attested assessment questionnaire".
- **Fact [Q9, Intuit developer blog]:** Refresh tokens now last at most **five years** (accounting tokens from October 2023 start expiring October 2028). Since January 2026 a "Reconnect URL" field is mandatory in app settings. QuickBooks warns customers in the product 30 days before a connection expires and by email 7 days before.
- **Fact [Q10, Intuit SDK reference]:** For non-US QuickBooks, a transaction's tax detail ("TxnTaxDetail") "should provide the details of all taxes" from the tax codes it references; QuickBooks can work them out or the app can supply them. The transaction-level tax code applies to US editions only.
- **Fact [Q11, Intuit developer blog]:** Intuit's separate Sales Tax API (tax calculation) is "Available to Silver, Gold and Platinum partners", and its behaviour differs outside the US.
- **Fact [Q12]:** "Connect to QuickBooks" buttons are text only (no logos inside), in PNG and SVG, also in French.

---

## 4. Stripe and Square onboarding (facts, cited)

### Stripe Connect

- **Fact [T1]:** Stripe marks the Standard, Express and Custom **account types as "Deprecated feature"** for new platforms. It now recommends describing accounts by "controller properties" (or the newer Accounts v2 API).
- **Fact [T2]:** Moving to controller properties "is optional". Existing accounts keep working. A Standard account equals: losses `stripe`, fees paid by the `account`, requirements collected by `stripe`, full Stripe Dashboard. Creating an account with no controller settings gives exactly that.
- **Code check (fact, local):** `services/payments/service.js` line 448 creates accounts with `type: "standard"`.
- **Fact [T1]:** Hosted onboarding: create the account (prefill what you know), create an Account Link (`refresh_url`, `return_url`), redirect. A link is single use and expires in a few minutes; "Don't email, text, or otherwise send account link URLs". Coming back to `return_url` "doesn't mean that all information has been collected"; check `details_submitted` and `charges_enabled`. Prefill KYC before the first link, because afterwards the platform can't read or write it on Standard accounts.
- **Fact [T3]:** Embedded onboarding puts Stripe's form inside the platform's own page (an Account Session plus Connect.js). Up-front onboarding collects `eventually_due`; incremental collects only `currently_due`. When `currently_due` items reach `current_deadline` they move to `past_due` and the matching function is switched off. Prefill `business_profile.url` with the shop's address.
- **Fact [T4]:** Embedded components also include **Notifications banner** (lists required actions), Account management, Payments, Payouts, Payout reconciliation report, Documents, and Tax registrations / Tax settings.
- **Fact [T5]:** Capabilities must be "active". `card_payments` needs `transfers` too; if either is inactive both stop. Full-dashboard (Standard) accounts get their capabilities requested automatically by country. In sandboxes some capabilities aren't enforced, so a sandbox test can pass while live would fail.
- **Fact [T1]:** Stripe Tax "obligation monitoring" can be added to Standard onboarding; it warns accounts when they pass a tax threshold.

### Square

- **Fact [R1]:** Sellers sign in to Square and grant permissions. Access tokens last 30 days and are renewed with the refresh token; code-flow refresh tokens don't expire, but the seller can revoke access (`oauth.authorization.revoked`). Sandbox and production are separate.
- **Fact [R2]:** Canada is a supported country for payments, the Sandbox and application fees. Square says to test with a sandbox account per country.
- **Exists:** `services/payments/square.js`, sealed tokens (`tokenSeal.js`), one shop per Square account.

---

## 5. Gaps in the old plan

What exists, with paths, and what is missing against the two companies.

| Step in the journey | Exists (extend) | Missing |
| --- | --- | --- |
| Questions at sign-up | One skippable question, "How do you sell today?" (`signup/form.js`); plan, country | "What do you publish?" (QuickBooks asks industry, Shopify asks what you sell); "Does a bookkeeper help you?" |
| Private working shop | Shop maker (`signup/shopMaker.js`, `setup/`); maintenance page (`components/MainSite.tsx`) | New shops don't start private; no "Open my shop" moment |
| Short checklist | Your first week (`admin/firstWeek.ts`, 7 or 8 steps); Ready to sell (`admin/launchReadiness.ts`); Studio setup list (`admin/studio/setupChecklist.ts`) | Three lists overlap. Ready to sell shows two technical rows to every press: "Production deployment is unverified" (link to GitHub) and "Hosting release needs verification" (link to the **test shop's** Firebase console), `launchReadiness.ts` lines 141 and 142 |
| Magic import | `admin/shopMove.ts`, `catalogImport.ts`, photo copy (`functions/photoImport.js`), redirects | Today's export headings not recognised (section 2); no past-orders import; no "start here" drop zone for presses who said "another online shop" |
| Practice | Local demo (`demo/`, your computer only); test shop (`docs/test-shop.md`) | No hosted sample press for people to try before signing up |
| Test order | Test sale walkthrough (`admin/testSaleWalkthrough.ts`) | Its steps ask for a "Stripe test secret key", which platform shops never have. No practice checkout for platform shops |
| Payments activation | Card account row (`launchReadiness.ts` `card-account`); `platformPayments.ts` | Shows only connected / not connected. Not what Stripe still needs, or the deadline. Accounts made with the deprecated `type: "standard"` |
| Launch | Store status switch | No launch step with a final check |
| Trial emails | Billing emails: trial ending, card needed, payment failed, cancelled, ended, plan changed (`services/billing/billing.js`); welcome (`services/email`) | None tied to checklist progress; the platform can't see a shop's checklist |
| Accounting | Orders CSV (`admin/orderCsv.ts`), Backups & export (`admin/BackupsExportCard.tsx`); stockroom tax centre exports (`apps/stockroom/src/features/taxcentre.js`) | Orders don't record the real card fee or the payout they were paid in (no fee or payout field in `apps/shop/functions`). No daily summary. No QuickBooks link. Tax rates have no "name in your books" |
| Bookkeeper | Roles owner, staff, author (`accounts/roles.js`, `apps/shop/functions/roles.js`) | No bookkeeper role |
| Leaving | Catalog, customers, orders downloads in Colophon's own columns | No export in the layout other shop systems read |
| Leftover press name | Plan 1.14, 5.0 | Stockroom file names still start "Lyrical_" (`taxcentre.js:372`, `tax-entries.js:1173`, `shipping.js:11571`, `inventory-valuation.js:392`); "Lyrical Inventory" in `lib/notification-log.js:38` and `lib/openrouter-chat.js:57`; shop loading wordmark default "Lyrical" (`features/site/storeCopy.ts:387`). The copy check looks only for the full name |

Gaps from the gaps note that no plan row covers yet: terms and shutdown promise; backup person and sealed emergency access; "what support doesn't include"; email reputation; sign-up screening; Stripe pause fallback; founding discount maths; tax on Colophon's own fee; Quebec Law 25 and PIPEDA breach records; Canada Post partner check; accessibility as a release rule; spending caps. Separate shop domain: **inference**, today's shop addresses are on Firebase's own `web.app`, which is a separate domain from yours, so this matters only when shops get addresses under Colophon's domain.

---

## 6. Proposed Phase 7 and after

Same rules as `docs/code-plan.md`: one small pull request per row, no live money, no rival named, never touch `LyricalmyricalWebsite` or `lyrical-inventory`. Ranked by importance inside each group, and the groups are in build order. *Waits on Julian* = needs your account, approval, money or a lawyer or accountant.

Ease standard for every row: any task a press does takes three steps or fewer, and the words they see have no technical terms.

> **Fits after the code plan's Phase 6 (checked 28 October 2026, after PR #88 and #89).** The code plan's Phase 6 (rows 6.1 to 6.14, approved by Julian) already covers sign-up and "What do you publish?" (6.2), the theme picker (6.3), Plan & billing (6.4 to 6.8, 6.11), the founding price (6.1: 25% off for as long as they stay, first 25 paying presses), plan tax (6.12), the daily sign-up cap (6.13), the 9-step "Set up your shop" guide with a private coming-soon start and an **Open your shop** button (6.9), and trial emails tied to that guide (6.10). So this proposal is now Phase 7 and Phase 8, and these rows were dropped as duplicates: private start, one home checklist, Open your shop button (all in 6.9), the extra sign-up question (6.2; the bookkeeper question moves into 7.17), checklist state and trial emails (6.10), founding price (6.1) and tax on our own plans (6.12). One idea worth folding into 6.9 when it is built: show three steps at a time, with the rest under "Later". References written "main 6.x" mean the code plan's rows.

## Phase 7: open like the big shops do (renumbered 28 Oct to follow the code plan's Phase 6)

Gate: a press nobody has spoken to signs up, brings their books from a current export, places a practice order, opens their shop and downloads a bookkeeping file, all without help.

### 7A. First fixes (quick, found in this review)

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.1 | shop | Already true (checked 28 Oct after writing): `launchReadiness.ts` line 140 returns before the "Production deployment" and "Hosting release" rows on a platform shop. Only a test is missing: a platform shop has no deployment, hosting or console-link row | readiness test | |
| 7.2 | shop | Today's product export is recognised. `recognizeExport` also knows the current headings (URL handle, Title, Price, Compare-at price, SKU, Barcodes, Inventory quantity, Product image URL, Image position, Option1 name/value, Weight value (grams), SEO title, SEO description); the old headings keep working; a file with both Barcode and Barcodes reads Barcodes | `shopMove.test.ts`: the same three-edition book in the old and new layouts gives the same import plan | |
| 7.3 | stockroom, shop | Last of one press's name out of file names and labels: stockroom downloads start with the shop's name from the profile; "Lyrical Inventory" becomes "Stockroom"; the loading wordmark default becomes the shop name. `apps-isolation.test.js` also fails on the short form "Lyrical" outside `shops/` | the check, plus a probe that a "Lyrical_" file name fails it | |
| 7.4 | shop | The test sale walkthrough knows platform shops: no secret-key step; steps are "Start a practice order", "Pay with the practice card", "See the confirmation email", "Refund it" (needs 7.6) | `testSaleWalkthrough.test.ts` for platform and own-key shops | |

### 7B. Starter policy words

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.5 | shop | Starter policy words. Each empty policy offers "Start from our wording" for shipping, returns, privacy and terms, filled with the shop's name, address and return days, marked "a starting point, not legal advice" ([S10] does the same) | policy tests: starter text has the shop's name and no placeholder; never overwrites saved text | *waits on Julian* (lawyer reads the four starter texts) |

### 7C. Practice before it's real

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.6 | platform, shop | Practice checkout for platform shops. While the shop is private, the owner presses "Try a practice order": for one hour the owner's own checkout uses the press's test account through `services/payments` (test mode exists there), with a banner and the test card shown. The flag is set only by the server, never by the browser; practice orders are marked, take and give back stock as on the test shop (1.31), and never count in reports ([S7] keeps test orders out of reports too). Visitors can't reach practice checkout | payment tests with a fake Stripe and fake Square: practice refused when the shop is open or for a visitor; practice order marked and left out of totals | |
| 7.7 | platform | A sample press anyone can try before signing up: the demo seed (`demo/seed.js`) on a hosted copy, read-only for visitors, reset every night, "Nothing you do here is saved" ([Q3] works the same way). Linked from the waitlist and sign-up pages | demo test: a change disappears after reset; no real email or payment is possible | *waits on Julian* (hosting for the sample press) |

### 7D. Payments setup inside the checklist

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.8 | platform | New Stripe accounts are made without the deprecated account type: the same Standard behaviour, written as Stripe's controller settings ([T2]); prefilled with the shop's address, "Books and printed matter" and the country from sign-up, so Stripe asks less. Existing accounts are untouched | `services/payments` tests: the create call has no `type`, has the four Standard settings and the prefill | |
| 7.9 | platform, shop | The payments step shows what Stripe or Square still needs, in plain words: "Stripe needs your bank details by 12 November", from the account's `currently_due`, `past_due` and `current_deadline` ([T3]); one "Continue with Stripe" button makes a fresh link each press (never emailed, [T1]); the step ticks itself once cards and payouts work. A requirement that turns past due puts a banner on the admin and emails the owner once | `platformPayments.test.ts`, readiness tests with fake account states: due, past due, done; email sent once | |
| 7.10 | platform, shop | Every paid order records its real card fee and the payout it arrived in: the payment service reads Stripe's balance transaction (Square: the payment's processing fee and payout entry) after payment and when the payout lands; the order keeps `fee`, `net`, `payoutId`, `payoutDate`. Needed by 7.11 to 7.15 | payment tests with fakes: fee and payout stored once, re-run changes nothing, refund fee handled | |

### 7F. Bookkeeping: file first, then QuickBooks

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.11 | shop | Each tax rate gets a "name in your books" (GST, HST ON, PST BC, QST, Exempt…), filled from the presets and editable in Settings › Taxes. Orders keep the tax split by that name | tax tests: each preset fills names; an order's tax lines add up to its tax total | |
| 7.12 | shop | Bookkeeping file. Settings › Backups & export gains "Download for your bookkeeper" (pick a month): sheet 1, **one line per day** (sales before tax, shipping, discounts, gift cards sold and used, refunds, each tax by its book name, card fees, net); sheet 2, one line per order; sheet 3, one line per payout with its orders' total. A month of daily lines stays far under QuickBooks's 1,000-row limit ([Q5]). Plain CSV, money to the cent, the shop's currency, practice orders left out | export tests: a month of fake orders, refunds and two payouts; daily totals equal the order sheet; payouts equal the net of their orders | |
| 7.13 | stockroom | The stockroom's tax season export uses the same tax names and the same daily lines for fair and in-person sales, so a press with both apps gives the bookkeeper one set of numbers | stockroom export test against the shop's format | |
| 7.14 | platform | Write `docs/accounting.md`: how a QuickBooks link would work and what it costs. Intuit's free Builder level, sales written in (free, not metered), the few reads metered, no app listing without the US$300 a month level, the assessment questionnaire, five-year connections and the required reconnect page ([Q8], [Q9]). Choice offered to presses: one summary per day (default) or one sale per order (what Intuit's own connector does, [Q6]); payouts as deposits; fees as an expense | the doc; doc test: every QuickBooks word in it is in the glossary | |
| 7.15 | platform | `services/accounting/`: the QuickBooks link, behind the shop's service key. Connect over OAuth 2.0, tokens sealed like Square's (`tokenSeal.js`); the press matches each tax name to one of their QuickBooks tax codes once; a nightly run writes the day's summary (or each order) as a sales receipt, its fees as an expense and each payout as a deposit, never twice (its own record of what was sent); refunds as refund receipts; the reconnect page and the 30-day expiry warning. Tested against a pretend QuickBooks only | accounting tests with a pretend QuickBooks: re-run writes nothing new; a refund after the day is posted; a disconnected company stops and tells the owner | *waits on Julian* (Intuit developer account, app assessment) |
| 7.16 | shop | Settings › Bookkeeping: **Connect QuickBooks** (sign in with Intuit, choose "one line per day" or "every order", match taxes: three steps), last sent, "Send again" for a day, Disconnect. Button text follows Intuit's rule: text only, also in French ([Q12]) | admin tests with a fake service: the three steps, error words, disconnect | *waits on Julian* (after 7.15) |

### 7G. Bookkeeper and leaving

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 7.17 | shop, stockroom, platform | A **bookkeeper** role: sees orders, payouts, taxes, reports and the bookkeeping downloads, and the stockroom's tax centre read only; no books editing, no customers list beyond order names, no settings, no team. Invited from Team and the account page like any role ([Q4] keeps accountants apart from staff in the same way) | rules emulator tests (`shop-rules`, `stockroom-rules`): bookkeeper reads exports, can't write anything; accounts tests | |
| 7.18 | shop | Take your shop with you. Backups & export gains "Download for another shop system": books in the product layout most systems read ([S13] headings: one line per edition, photos on their own lines), and customers in the customer layout ([S14]), with "yes" for email marketing only for people on the newsletter now. Customer-facing words never name another system | export tests; a round trip: the export, read back by `shopMove.ts`, gives the same books and editions | |
| 7.19 | stockroom | Stock export in the location layout ([S15]: Handle, Title, Option, SKU, Location, On hand) so stock counts can move too | stockroom export test | |

## Phase 8: the open gaps (mostly yours to decide)

Gate: the first paying press has a signed agreement, and one bad shop can't harm the others' email or checkout.

| # | Repo | Pull request | Proven by | Status |
| --- | --- | --- | --- | --- |
| 8.1 | platform | Terms, privacy policy, data agreement and the shutdown promise (for example 90 days' notice, a full export with 7.18, and the right to take over their own copy) on one page; sign-up records which version the press accepted and when | sign-up test: no shop without an accepted version; version stored | *waits on Julian* (lawyer) |
| 8.2 | platform | What support includes and doesn't (no setup calls, no data entry, no design work) on the pricing and help pages; help articles for each new checklist step | `help/help.test.js`: every checklist step has an answer | |
| 8.3 | platform | Email reputation: each shop sends from its own sub-address of the platform domain; order emails and newsletters on separate streams; a shop's newsletter sending pauses itself when complaints or bounces pass a limit, with a plain note to the owner and a control-room item | email tests with fake complaint events: pause at the limit, receipts still go | *waits on Julian* (sending domain) |
| 8.4 | platform | Sign-up screening and a "Close abusive shop" button: new trials can't take live payments until the payment provider has checked them (7.9 already waits for it); the control room can close a shop's checkout and pages with a reason, logged | control-room tests: admin only, reason required, logged, reversible | |
| 8.5 | platform, shop | Emergency payments switch: if the platform's Stripe account is paused, a platform admin can move one shop, or all, to the press's own keys or to Square, from the control room. The shop's own-key path already exists | control-room and shop payment tests with fakes | *waits on Julian* (question 3) |
| 8.6 | platform | Privacy records: a breach register in the control room (kept two years), a named privacy contact on every policy page, and the backup's 30-day keep stated in the privacy policy | control-room tests; policy text test | *waits on Julian* (who is the privacy contact; lawyer) |
| 8.7 | platform | Backup person: sealed emergency access for one named person, limited to the run book's actions (pause releases, roll back a shop, post a status note), every use logged | control-room tests | *waits on Julian* (who) |
| 8.8 | shop | Accessibility as a release rule: every theme and the checkout pass an automatic accessibility check in CI; a failure blocks the release | the check over every theme in `themeLibrary.ts` | |
| 8.9 | platform | Spending limits per shop: past its budget a shop's costly jobs slow down (photo copies, AI writing, imports) before anything stops; checkout is never slowed | health tests with a fake budget alert | *waits on Julian* (billing account budgets) |
| 8.10 | platform, shop | Later, if wanted: Stripe's embedded form and "things to do" banner inside the admin ([T3], [T4]) instead of sending presses to Stripe's page | admin tests with a fake account session | |

Not a code row: check with Canada Post whether buying labels for other presses needs a partner agreement (gaps note 9). Offer founding presses a January move, with December as practice.

---

## 7. What the evidence can't establish, and where sources disagree

- **Shopify's trial length in Canada.** The trial help page says length "can vary" and gives none [S3]; the Canadian offer page says 3 days, then $1 a month, without saying for how long [S2]. Treat 3 days as today's offer only.
- **Shopify's sign-up questions.** The help page says only that a questionnaire exists and can be skipped [S1]. The question wording in the earlier research came from outside write-ups, not Shopify.
- **Whether Shopify test orders take stock or send emails.** The test-order page doesn't say [S7].
- **Shopify's verification deadline after a first sale.** The Canadian requirements page doesn't state one [S8].
- **QuickBooks's Canadian trial and card.** The page says "Free 30-day trial" and that you are charged automatically when it ends, but doesn't say a card is needed to start [Q2]. The earlier research's "free tier with no card" was not found on the Canadian page.
- **QuickBooks chart of accounts from the industry answer.** Intuit's lesson doesn't say the industry answer builds the accounts [Q1]; the earlier research said it did. Not confirmed.
- **QuickBooks's Canadian tax codes through the API.** Intuit's developer pages for non-US sales tax load only in a browser and couldn't be read here. Only the SDK reference [Q10] was read. Before 7.15, read "Manage sales tax for non-US locales" and the automated sales tax page in a browser. Check: how tax codes are referenced on each line, whether the app may send its own tax amounts, and how QST is handled.
- **Whether a Builder-tier app may connect any number of real companies without being listed.** The guide says Builder can't list [Q8], but the FAQ page couldn't be read. Confirm with Intuit before 7.15.
- **A request key against double posting in QuickBooks.** Not verified. 7.15 keeps its own record of what was sent, so it doesn't depend on one.
- **Xero and Wave import formats.** Their help pages couldn't be read or don't list columns (Wave points to a template [W1]). 7.12 is a plain CSV with dates, descriptions and amounts that a bookkeeper can map. A ready-made Xero layout is not proposed until its template is checked.
- **Bank feeds** in QuickBooks were not researched on a primary page. Colophon has no bank link, so it doesn't change the plan.
- **Stripe's account types.** Stripe calls them deprecated on the Standard page [T1] but says moving off them "is optional" [T2]. Both are true: nothing breaks today; 7.8 is cheap tidying, not an emergency.

---

## 8. Questions for Julian

Already decided and not asked again: founding price (25% off for as long as they stay, first 25 presses) and trial emails (code plan 6.10).

1. **Bookkeeping order:** build the monthly file first (7.12) and the QuickBooks button later (7.15, 7.16), or both before the first paying press? I suggest the file first.
2. **Practice orders:** allow them only while the shop is private (7.6), or also after opening for the owner only? I suggest private only, because it is simplest to keep safe.
3. **Emergency payments switch:** may a platform admin move a shop to its own keys or to Square without asking the press first, if Stripe pauses the platform?
4. **Who is the backup person**, and who is named as the privacy contact?

---

## 9. Sources (all accessed 28 October 2026)

Shopify

- [S1] Getting set up to start selling: https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/setup-steps
- [S2] Free trial offer, Canada: https://www.shopify.com/ca/free-trial
- [S3] Free trial: https://help.shopify.com/en/manual/intro-to-shopify/pricing-plans/free-trial
- [S4] Restrict access to your online store: https://help.shopify.com/en/manual/using-themes/password-page
- [S5] General checklist: https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/new-to-shopify-checklists/general-checklist
- [S6] Setup guide pattern (app design): https://shopify.dev/docs/api/app-home/patterns/compositions/setup-guide.md
- [S7] Placing a test order: https://help.shopify.com/manual/checkout-settings/test-orders
- [S8] Shopify Payments requirements for Canada: https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries/canada/requirements
- [S9] Setting up Canadian taxes: https://help.shopify.com/en/manual/taxes/canada/canada-tax-setup
- [S10] Adding store policies: https://help.shopify.com/en/manual/checkout-settings/refund-privacy-tos
- [S11] Managing staff: https://help.shopify.com/en/manual/your-account/staff-accounts/create-staff-accounts
- [S12] Migrating to Shopify: https://help.shopify.com/en/manual/migrating-to-shopify
- [S13] Using CSV files to import and export products: https://help.shopify.com/manual/products/import-export/using-csv
- [S14] Importing and exporting customers: https://help.shopify.com/en/manual/customers/import-export-customers
- [S15] Exporting or importing inventory with a CSV file: https://help.shopify.com/en/manual/products/inventory/inventory-csv

QuickBooks and Intuit

- [Q1] Intuit Education Program, Canada, QuickBooks Online lesson 1 (2025, PDF): https://digitalasset.intuit.com/render/content/dam/intuit/ic/en_ca/content/Intuit-education-program-ca-qbo-lesson-1-2025.pdf
- [Q2] QuickBooks Canada free trial: https://quickbooks.intuit.com/ca/free-trial/
- [Q3] Test drive QuickBooks Online (Canada): https://quickbooks.intuit.com/learn-support/en-ca/help-article/small-business-processes/test-drive-quickbooks-online/L9C12ODlA_CA_en_CA
- [Q4] Invite accountant users (Canada): https://quickbooks.intuit.com/learn-support/en-ca/help-article/account-management/managing-accountant-users-quickbooks-online/L2AcdYvHw_CA_en_CA
- [Q5] Common questions about importing data: https://quickbooks.intuit.com/learn-support/global/importing-and-exporting-data/common-questions-about-importing-data-to-quickbooks-online/00/385658
- [Q6] Connect Shopify to QuickBooks Online (Canada, published 22 September 2026): https://quickbooks.intuit.com/learn-support/en-ca/help-article/manage-integrations/shopify-quickbooks-online-integration-guide/L8bw6PiWJ_CA_en_CA
- [Q7] Connect Shopify to QuickBooks Online (US, updated 3 August 2026): https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-integrations/connect-shopify-quickbooks-online/L1Xv7ZCFB_US_en_US
- [Q8] Intuit App Partner Program Guide v1.2 (March 2026, PDF): https://static.developer.intuit.com/resources/Intuit_App_Partner_Program_Guide.pdf
- [Q9] Intuit developer blog, refresh token policy: https://blogs.intuit.com/?p=35349
- [Q10] Intuit .NET SDK reference, TxnTaxDetail: https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/7328bab2-a9ed-621e-41fa-188e45aaac65.htm
- [Q11] Intuit developer blog, Sales Tax API: https://blogs.a.intuit.com/?p=35408
- [Q12] Intuit and QuickBooks buttons update: https://blogs.a.intuit.com/2021/04/01/intuit-and-quickbooks-buttons-update
- Tried, could not be read (pages load only in a browser): https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-sales-tax-for-non-us-locales, https://developer.intuit.com/app/developer/qbo/docs/workflows/calculate-sales-tax/automated-sales-tax-for-non-us-locales, https://developer.intuit.com/app/developer/qbo/docs/get-started/partner-faq

Stripe

- [T1] Using Standard connected accounts: https://docs.stripe.com/connect/standard-accounts
- [T2] Migrate to controller properties: https://docs.stripe.com/connect/migrate-to-controller-properties
- [T3] Embedded onboarding: https://docs.stripe.com/connect/embedded-onboarding
- [T4] Supported embedded components (web): https://docs.stripe.com/connect/supported-embedded-components.md?platform=web
- [T5] Account capabilities: https://docs.stripe.com/connect/account-capabilities
- Also read: Testing Connect: https://docs.stripe.com/connect/testing

Square

- [R1] OAuth API overview: https://developer.squareup.com/docs/oauth-api/overview.md
- [R2] OAuth and testing (international): https://developer.squareup.com/docs/international-development/oauth-testing

Other

- [W1] Wave, upload a bank or credit card statement in CSV: https://support.waveapps.com/hc/en-us/articles/208621626-Upload-a-bank-or-credit-card-statement-in-csv-format

Local files read (no network): `LMB-PLATFORM/docs/code-plan.md`, `docs/decisions.md`, `docs/shop-setup.md`, `docs/payments.md`, `docs/demo-shop.md`, `signup/form.js`, `accounts/roles.js`, `services/billing/billing.js`, `services/payments/service.js`, `apps/shop/src/app/admin/launchReadiness.ts`, `firstWeek.ts`, `testSaleWalkthrough.ts`, `shopMove.ts`, `catalogImport.ts`, `orderCsv.ts`, `BackupsExportCard.tsx`, `features/site/policyPages.ts`, `apps/stockroom/src/features/taxcentre.js`.
