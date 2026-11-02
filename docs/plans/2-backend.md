# Plan 2 of 3: the platform backend

Written 30 October 2026, updated 2 November 2026 (Phase 19). The page: https://claude.ai/artifact/FHnXpGuqLxb7Be1FNaFXe7. This is the engine nobody outside sees: your control room and the platform's server program
(sign-in, billing, emails, the shop maker, the scheduler, the release runner). Plan 1 is the front door. Plan 3 is each
press's own shop. Numbers in brackets are rows in `docs/code-plan.md`.

Key: **Done** is built and checked, mostly against pretend accounts. **Being built** has a thread on it now. **Not started** has no one on it yet.

## Next step

**Make it real.** Today the shop maker, payments and billing run against pretend Google and Stripe. The server program
for the real platform project is written (15.6) and waits for your steps in `server/README.md`. The next code step is the real shop maker (15.5) and the
real test shop (15.7). Thread: *Research paths*. All of it waits on your Google Cloud setup.

**Your next step:** by **7 November**, set up the Google organization on your new domain (free Cloud Identity is enough),
one "shops" folder, one billing account, and ask Google for room for 50 projects. The shop maker can only create
projects inside an organization.

## Hosting the platform (15.6, built 2 November 2026)

The server program is written and tested on pretend Google and Stripe: `server/`. It is not online yet. It runs as two
servers in Montréal: the web door behind the waitlist site's `/api` addresses, and a private jobs server that only the
scheduler can call. Every scheduled job now has a schedule, including the trial tips and the monthly check-up. Stripe
stays in test mode. Shop making, deploys, web addresses, QuickBooks and exports say "not connected yet" until their own
steps land.

**Your steps:** the checklist in `server/README.md`: six secrets in Secret Manager, `env.yaml`, then deploy,
schedules and the smoke check, each printed first and done with `--apply`; then the two Stripe event addresses.

## Phase 19: a stronger backend (2 November 2026)

Research: what Shopify's partner tools, Stripe Billing and subscription-metrics tools give the people who run a
platform, checked against our code. We have the shop list, alerts and duplicate checks. We lack income over time, why
presses leave, failed-payment recovery beyond one email, a per-shop timeline, a jobs page, and asking a press before
"Make changes". Rows 19.1 to 19.16 in `docs/code-plan.md`.

**Fixed (PR #216):** other companies' error words never reach presses, and crashes are logged with a code (19.1); late,
older Stripe messages can't reopen a cancelled plan or turn a press's cards back on (19.2); the shop list and Today read
eight shops at a time instead of one after another (19.3).

**Built (2 November, PR #223 and the batch 2-4 PR):** each payment message handled exactly once (19.4); fair-use
limits (19.5); the press says yes before "Make changes" (19.6); income over time (19.7); why presses leave (19.8);
failed-payment recovery (19.9); one timeline per shop (19.10); the jobs page (19.11); payment and email delivery per
shop (19.12); notes and tags (19.13); messages to presses (19.14); what each shop costs us (19.15); a press's data on
request (19.16). All run on pretend accounts in tests and go live with the server program (15.6).

**Steps for you:** with the Stripe platform profile (13 November), switch on Smart Retries (if all retries fail, mark
the plan unpaid rather than cancel it), the card account updater, and the "card automatically updated" webhook message.
After the Google organization, turn on Google's billing export to BigQuery (feeds 19.15). Scheduling the jobs and the
health-alert address are done with 15.6, nothing for you.

## Your steps for this chunk

| By | You do | What it unblocks |
| --- | --- | --- |
| 5 Nov | Buy the domain | The Google organization |
| 7 Nov | Google organization, "shops" folder, billing account, ask for 50 projects | Real shop maker (15.5), real test shop (15.7) |
| 13 Nov | Stripe platform profile | Billing and payments for real |
| Before the first paying press | Make the platform repo private (it is public today) | Safety of the platform code |
| 20 Nov | Lawyer's answer in writing: does Colophon need to register to handle press payments? (15.22) | Taking a per-order fee |
| 27 Nov | Company and business bank account (check with the accountant) | Stripe and Google bill the business |
| 1 Dec | Submit Google's sign-in review. It needs the live privacy page from Plan 1 | One-sign-in Google connection (6.17) |
| When ready | Switch on two-step sign-in for the control room (9.1), the budgets (8.9), the release schedule (4.3, 4.1) | The safety checks run for real |
| Jan | Register the domain-connect template with GoDaddy, IONOS, Cloudflare (15.19) | One-click domain setup |

## Being built

Nothing is under way today. Rows 15.4 to 15.7 are Research paths' next work, in that order.

## Not started

- Google "is it ready" self-check in the control room (15.4).
- The real Google client for the shop maker, with a waiting state when Google's project limit is hit (15.5).
- The real test shop, and the practice purchase that runs after every change (15.7; also finishes 1.32).
- First press by hand: a run-book and checklist (15.10). First press is planned for 4 December.
- "Google needs you to reconnect" handling (15.15).
- Cut an idle shop's bill: ten scheduled jobs become one (15.16).
- Spend guards per shop and for the platform (15.17).
- Keep the bot check inside its free amount (15.18).
- Domain template for GoDaddy and Cloudflare (15.19).
- A daily count of Gmail sends per press (15.24).
- Per-shop feature switches: new things ship off, then test shop, then willing presses (14.6). Thread: Plan tonight's platform improvements.
- Real release (4.1) and the scheduled health checks (4.3): code done, need the real project.

## Done

- **Hosting the platform**: the server program, its schedules, deploy and smoke check, waiting for you to put it online (15.6).
- **Payments service**: Stripe, and Square as a second choice, with the press's own account, refunds, fee refunded with the order (2.1, 2.2, 2.2b).
- **Email service**: sends for every shop in the press's name (2.3).
- **Billing service**: plans, trial, card, cancel, failed-payment emails, on a pretend Stripe (2.4).
- **Shop maker**: setup script and steps, retry in plain words (1.28 to 1.31, 2.6), self-checks (2.11), test shop catalogue.
- **Control room**: every shop, today's numbers, search, platform settings, sign-ups, per-order fee, switches, view-as-owner, activity log, tax threshold watch (9.1 to 9.11, 15.20, 2.8).
- **Running many shops**: release runner, numbered data changes, health checks and backups (4.1 to 4.3), emergency payments switch, privacy records, backup person, email reputation, sign-up screening, spending limits on the platform side (8.3 to 8.9).
- **Google**: one connect and one teardown (6.17, 6.20), email from the press's domain (6.18), domain connect (6.15), up to date with Google's current rules (15.1 to 15.3, 15.12 to 15.14), one-click Sheet (16.1), Shopping problems (16.2).
- **Tonight's safety batch**: secret scan, restore drill, no Friday releases, error reports, keep-times (13.1 to 13.8). Stripe version pinned (15.2).
- **One test of the whole road** with fakes (6.14).
