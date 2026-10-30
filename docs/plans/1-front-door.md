# Plan 1 of 3: the front door

Written 30 October 2026. This is the part strangers see: the waitlist, sign-up, plans and billing, help, terms and status
pages, all at lmb-platform-prod.web.app. Plan 2 is the engine behind it. Plan 3 is each press's own shop. The numbers in
brackets are rows in `docs/code-plan.md`, so a thread can find the detail.

Key: **Done** is built and checked. **Being built** has a thread on it now. **Not started** has no one on it yet.

## Next step

**Put the finished pages online for real**, with no pretend data: sign-up, account, plans and billing, help, terms and
status. Pull request #212 has the two deploy steps, with a preview link. Nothing goes live until you say go. Until they
are online, only the waitlist can be used by a stranger.

**Your next step:** pick and buy the domain by **5 November**. The pages work on the web.app address until then, so this
doesn't hold up the build. It does hold up the email address presses see.

## Your steps for this chunk

| By | You do | What it unblocks |
| --- | --- | --- |
| 5 Nov | Buy the domain (two: one for the front door, one only for shop addresses) | Email from our own address; the shop addresses |
| 13 Nov | Give Colophon a mailing address | Every platform email must carry one by law (15.8) |
| 13 Nov | Fill in the Stripe platform profile. Ask the accountant when to register for GST/HST | Taking money for plans; "plus tax" on prices (15.9) |
| 20 Nov | Send the terms and privacy pages to a lawyer | Terms must be public before sign-up opens (8.1) |
| November | Talk to five to ten waitlist presses. Decide if Quebec presses join at launch (French terms first) | Who gets invited first |
| 29 Jan | Goal: a stranger signs up, pays and takes a real order alone | The go-live gate for this chunk |
| 8 Mar | Public sign-up opens to everyone | Launch |

## Being built

| What | Who |
| --- | --- |
| Sign-up, account, plans and billing, help, terms and status pages put online, real and not pretend | Put the walkthrough online |

## Not started

- "Plus GST/HST" on Colophon's own plan prices and invoices (15.9). Needs your accountant's answer first.
- A person named for privacy, and a breach record, on the terms page (15.11).
- One trust page, plus a public list of the companies that handle data (14.2). Thread to own it: Plan tonight's platform improvements.
- The control room's Invite button for waitlist emails (rest of 6.13). It belongs to Plan 2 but decides who gets in.

## Done

- **Waitlist** live, with the name Colophon (0.1 to 0.4).
- **Pricing page** with the three plans ($29 shop, $19 stockroom, $39 both), a 14-day trial with no card, and the founding offer (6.1).
- **Sign-up** screens, the daily cap on new shops and the "you're next in line" wait (2.5, 6.2, 6.13 without the Invite button). One account for many shops (2.7).
- **Plans and billing** page, the billing behind it, pause and close with a download of everything, downgrading, invoices and card-expiring emails (6.4 to 6.8, 6.11, 6.12), trial emails (6.10), and "pay as you sell" (6.19).
- **Terms, privacy, data agreement** written, and what support does and doesn't cover (8.1, 8.2). **Help**: the top 20 answers (3.4).
- **Status page** and support inbox built; hosting waits for you (4.4). **New-device alerts** and account recovery built (4.5).
- **Sample press** anyone can try before signing up (7.7), built; you switch it on.
- **Checks**: no technical words reach a press (6.16), phone-width check of every platform page (13.12), safety headers (13.2), anti-spam basics (part of 15.8), Canada first, other countries on a "later" list (15.23).
