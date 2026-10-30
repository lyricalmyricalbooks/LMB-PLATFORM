# Plan 1 of 3: the front door (rewritten 30 October 2026)

This is the part a stranger sees and the road from there to the press's own shop admin. It covers the home page, pricing,
sign-up, log-in, the first questions, the setup guide, opening the shop, plan and billing, help, terms and status, all at
lmb-platform-prod.web.app until the domain is bought. Plan 2 is the engine behind it. Plan 3 is each press's own shop.
Numbers in brackets are rows in `docs/code-plan.md`. The new rows are Phase 18.

The design to click through: the front door prototype, https://claude.ai/artifact/KTirgdvCTD2AWaJQscTVX9. It copies the
flow of the big store builders (an email box on the home page, email or Google sign-in, a short code, three skippable
questions, a welcome screen, a setup guide) with Colophon's own name, words and look. It uses none of their logos or text.

## The one rule that shapes everything

**A press gets its own Firebase backend only after it has subscribed.** (Julian, 30 October 2026.) Before that, nothing
is made for it except one small record in the platform's own project. This keeps the cost of a stranger signing up at
close to nothing, and it means there is no half-made shop to clean up when someone walks away.

"Subscribed" means one of two things:
- a plan is chosen and a card is on file (the 14 free days start at that moment, and the first charge comes on day 15), or
- Pay as you sell is chosen, which needs no card.

This overturns two earlier answers, so please check them: "a trial shop can take real orders" (there is no unsubscribed
shop any more) and "the 14 days start at sign-up" (they now start when the shop opens). Setup itself stays free and needs
no card.

## The journey, in order

| # | Screen | What happens | Backend made? |
| --- | --- | --- | --- |
| 1 | Home | Big headline, an email box, a picture of a shop, pricing, questions. The waitlist form shows instead when sign-up is closed | No |
| 2 | Pricing | Shop $29, stockroom $19, both $39, Canadian dollars plus tax; the founding offer; Pay as you sell | No |
| 3 | Create account | Continue with Google, or an email. One account can own several presses | An account only |
| 4 | Code | A six-digit code sent to the email (replaces the sign-in link) | No |
| 5 | Three questions | Press name, what you sell (any merchandise), country. Each can be skipped | No |
| 6 | Setting up | A short wait while the account and the setup record are saved | No |
| 7 | Welcome | "Welcome to Colophon. Let's set up Moth Press." Inside the shop admin's own look | No |
| 8 | Setup guide, before opening | Your press, your look, bring your shop (a preview only). The other steps show "Opens with your shop" | No |
| 9 | Open my shop | Pick a plan, add a card (or choose Pay as you sell), see the price and the 14 free days | **Yes, starts here** |
| 10 | Making your shop | Plain progress while the shop maker runs. Setup answers, look and any import are carried across | Being made |
| 11 | Your shop admin | The press lands in its real admin, signed in already. Setup guide continues: get paid, Google, shipping, stockroom, final check | Yes |

Log-in is email first or Google, a code if the email is new on that device, then straight to wherever the press left off.

## What a press has before and after it subscribes

| | Before (setup mode) | After (open shop) |
| --- | --- | --- |
| Where it lives | One record in the platform's project, owner only | Its own Firebase project, its own stockroom database |
| Admin pages that work | Home with the setup guide, Design (pick a look), Books (import preview), Plan and billing, Help, Settings for press details | Every page |
| Pages that say "Opens with your shop" | Orders, Customers, Discounts, Gift cards, Messages, Inventory, the rest of Settings | None |
| Can sell | No | Once payments are connected |
| Public shop address | None yet | Yes |
| Google connections, email, domain | None | Made at opening (Phase 6.17, 6.20) |
| Leaving | Record kept 60 days after the last visit, warnings at 30 and 7 days, then deleted with any staged file | The existing pause, close, download and delete timeline (6.8) |

## Decision for Julian

**Where does the setup live before the press pays?** Three ways, with the cost of each.
1. **Setup mode in the real admin (recommended).** The admin's own shell and look, served from the platform site, with
   the pages above working and the rest locked. One small record per press. Smallest change, and it keeps the rule that a
   shop's data never shares a database with another press.
2. **A full practice database in the platform's project.** Every admin page works before paying, but two presses' data
   would live in one project, which the platform rule forbids, and it needs far more code. Not recommended.
3. **In the browser only.** No record on our side. It works on one device and the work is lost if the browser is cleared.

Rows 18.6 to 18.9 assume option 1. If you pick another, those rows change and the rest stay.

## What already exists, and what changes

Built and kept: the waitlist and daily cap (6.13), pricing (6.1), the shop maker and its sixteen steps (2.6, Phase 1),
Choose your look (6.3), the import (3.1, 5.5 to 5.7), billing, pause, close and invoices (6.4 to 6.8), pay as you sell
(6.19), the Google connect and teardown (6.17, 6.20), the guided start (Phase 17), help, terms and status.

Changed by the rule:
- Sign-up (2.5, 6.2) makes an account and a setup record only. It no longer starts billing or the shop maker.
- The shop maker (2.6) is queued when the press opens its shop, not at sign-up.
- Billing (6.4, 6.5) starts the 14 days at opening. Plan and billing shows "Open my shop" for a press with no shop yet.
- The guided start (Phase 17) splits in two: stages 1 to 3 before opening, stages 4 to 8 after.
- Trial emails (6.10) become setup tips before opening and trial tips after.
- The control room (Phase 9) lists presses not yet open apart from shops.
- Google connect (6.20) runs at opening, never at sign-up. Nothing is connected for a press that never opens.

New: the email-first front door pages, the code sign-in, the setup-mode admin, the open-my-shop step, carrying setup
across, a handoff with no second sign-in, and the unsubscribed clock.

## Build order (Phase 18)

1. **Decide and record** the rule and the three-way decision above (18.1).
2. **The record and the account** (18.2, 18.3): the setup record, sign-up that makes only an account, the code sign-in.
3. **The front door pages** (18.4, 18.5): home, pricing, sign-up, log-in, questions, in the new flow. They can ship before
   the rest because they only make an account. Pull request #212's pages should wait for this, since the old sign-up
   would still start a shop.
4. **Setup mode** (18.6, 18.7): the real admin served from the platform site, locked pages, setup data saved through the
   platform's own door.
5. **Open my shop** (18.8, 18.9, 18.10): plan and card, the shop maker, carrying setup across, the handoff.
6. **The unsubscribed clock and emails** (18.11) and the control room view (18.12).
7. **Guards, the road test and the checks** (18.13 to 18.16).
8. **Retire the old pages** and deploy in order (18.17).

## Things that can go wrong, and what the plan does about each

- **The same email signs up twice, or with Google and with a code.** One account per verified email; the second way in
  signs into the first. Tested.
- **Someone starts a shop and never returns.** Nothing was made, so nothing is billed or left running. The record
  expires on its clock.
- **The card fails when opening.** No shop is made. The press sees a plain message and stays in setup mode with its work.
- **The shop maker fails halfway after a card is added.** The press sees "Making your shop", the maker retries by itself
  (2.6), and the control room shows it. The 14 days start only when the shop is ready.
- **Opening twice** (double click, two tabs). One subscription and one shop, found again by the press record. Tested.
- **A big import file before paying.** Size and count limits; only the preview is read in the browser, and the file is kept
  only until the shop exists.
- **Bots creating accounts.** The email code, a limit per address and per network, App Check on the door, and the
  daily cap staying on sign-ups at launch.
- **A press wants its data deleted.** One button on the account page removes the setup record and any staged file.
- **A press's look or name changes between setup and opening.** The record is copied at the moment of opening, then the
  shop's own settings take over.
- **Pay as you sell with no card.** Allowed only for the Shop and Both plans. The shop opens at once. Fees come from the
  per-order fee, as in 6.19.

## Your steps for this chunk

| By | You do | What it unblocks |
| --- | --- | --- |
| Now | Pick one of the three ways for setup before paying | Rows 18.6 to 18.9 |
| Now | Confirm the two overturned answers: no unsubscribed shop, and the 14 days start when the shop opens | Rows 18.8, 18.11 |
| 5 Nov | Buy the domain (two: one for the front door, one for shop addresses) | Email from our own address; shop addresses |
| 13 Nov | Mailing address for platform email; the Stripe platform profile; ask the accountant about GST/HST | Taking money for plans; "plus tax" (15.8, 15.9) |
| 20 Nov | Send the terms and privacy pages to a lawyer | Terms must be public before sign-up opens (8.1) |
| November | Talk to five to ten waitlist presses; decide if Quebec presses join at launch | Who gets invited first |
| 29 Jan | Goal: a stranger signs up, subscribes and takes a real order alone | The go-live gate |
| 8 Mar | Public sign-up opens to everyone | Launch |

## Still open from before

- "Plus GST/HST" on Colophon's own prices and invoices (15.9), waiting for the accountant.
- A named person for privacy and a breach record on the terms page (15.11).
- One trust page and a public list of the companies that handle data (14.2).
- The control room's Invite button for waitlist emails (rest of 6.13).
- Pay as you sell numbers, still marked "to confirm".
