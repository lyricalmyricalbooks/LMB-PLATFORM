# Plan 1, version 2: a smarter front door (2 November 2026)

This builds on the one-flow plan (`docs/plans/1-front-door.md`, Phase 18, merged in PR #215) and the clickable prototype
(https://claude.ai/artifact/KTirgdvCTD2AWaJQscTVX9, version 6). The rule stays: **a press gets its own Firebase backend
only when it finishes the setup guide, pays, and launches its shop live.** Nothing below changes that rule. Everything
here is about making the path from the first visit to a live shop shorter, clearer and harder to get stuck in.

Julian's ask (2 November): more sophisticated, better functionality, in the style of the big store builders' front door.
We copy the flow and the feel, never another company's logo, words or layout details.

## What version 1 gets wrong, that version 2 fixes

| Problem in version 1 | What a press would feel | Fix in version 2 |
| --- | --- | --- |
| A press sees its shop only at the very end | "What am I paying for?" | A live preview of its own shop, with its name and look, from the second question on |
| Stopping halfway loses the thread | Coming back means starting over | Every step saves; a "continue where you left off" email; the return trip lands on the exact step |
| All setup steps look equally important | Unclear what must be done before launch | A launch checklist that names only what blocks launch, with plain reasons |
| Pricing appears after the work is done | A press invests time, then meets the price | Price and the 14 free days shown on the home page, and a price preview on the launch step |
| One press per account, and a switch is hidden | Presses with two shops get confused | Several presses per account with a clear switcher; a press can be handed to a partner later |
| Import is one big step | Big files fail with no clear reason | Import in small, checked pieces (books, then photos, then customers), each with a preview |
| Errors say what went wrong technically | Panic, support emails | Every error says what happened, what is safe, and what to do next, in plain words |

## The front door, screen by screen

1. **Home.** A large headline, one email box, an example shop, pricing in Canadian dollars plus tax, questions, footer.
   The address box is the main action; it also shows the press-name suggestion as the person types.
2. **Create account.** Google or email. The email box keeps what was typed on the home page.
3. **Six-digit code.** Also offers "Send a link instead" for people who prefer a link. Five tries, ten minutes.
4. **Name your press.** The press name, with a check that a matching shop address is free (checked, never promised).
   Skipping is allowed; the name can be set later.
5. **Three questions, each skippable.** What you sell (any merchandise), country (sets the default tax and shipping
   presets), and how many items you have to start with (sets the import prompt). The shop preview updates after each.
6. **Welcome, inside the real admin.** "Welcome, Moth Press. Here is your shop so far." The admin opens on the setup guide
   with the preview of the shop beside it. Nothing is paid yet.
7. **The setup guide.** Eight steps, each saving as it goes: press details, look, bring your shop (optional), Google
   (optional), get paid, shipping, stockroom, launch. The guide shows how long each step usually takes.
8. **Launch.** A readiness check runs first and lists only what blocks launch. Then: plan, card (or Pay as you sell), see
   the first charge date, and launch. The 14 free days start the moment the shop is live.
9. **Making your shop.** Plain progress, with the step names the press chose. A failure says "we are retrying" or
   "this needs one answer from you", never a technical error.
10. **Your shop admin.** The press lands in its own admin, signed in already, with a short "what to do this week" card.

## New functions (in order of value to a press)

**A. Live preview while setting up.** From the look step on, a private preview of the press's own shop, with its name,
its look and sample books, is one click away. It is private to the press; nothing is public until launch. Why it
matters: a press decides in seconds whether the shop looks like its shop, and this is the moment it would otherwise leave.

**B. Continue anywhere.** Each press has a short private link that opens its setup at the exact step, sent by email on
request. The email goes out once a day at most, and only while the press is still in setup. Why it matters: most people
set up a shop over several evenings, not in one sitting.

**C. The launch checklist.** One list, with each item saying what it needs (for example "a card" or "a shipping address").
A press can see a blocker before it pays, not after. Why it matters: a failed launch with an unclear reason is the most
likely reason a press walks away.

**D. Price in view from the start.** The home page shows the plans and the 14 free days from the first screen. The
launch step repeats the first charge date and amount in plain words. Pay as you sell shows an example: "on a $200 month
of website sales, you would pay about $X, never more than the monthly price." Why it matters: no surprise on the card.
(The pay-as-you-sell figures are still marked "to confirm" in Julian's list.)

**E. Import in pieces.** Books first, with a preview of every row and a clear count of what will move. Then photos, then
customers. Each piece can be skipped. A file that is too big says so and suggests splitting it. Why it matters: a single
failed import used to stop everything.

**F. Several presses, one login.** One account can own several presses, with a switcher at the top of the admin. Each
press keeps its own data and its own subscription. Why it matters: publishers with an imprint and a shop, or a maker with
two brands, should not need two accounts.

**G. Plain-words errors everywhere.** Every error on the front door and in setup names what happened, whether anything was
lost (nothing, usually), and the next safe step. Technical detail goes to the control room, not to the press. Why it
matters: a press that gets a clear message emails support less, and support gets clear reports when it does.

**H. A safe test before launch.** A press can place one practice order with a test card before launch. It goes through
the real checkout in test mode, shows in its admin, and can be undone. Nothing is charged and no real customer sees it.
Why it matters: the first real order is the moment a press trusts the shop, and a practice order lets it find problems
before a customer does.

**I. A "what to do this week" card after launch.** Three suggestions, chosen from what is missing (no photos, no
shipping rule, no first book). Why it matters: a new shop with no books and no shipping rule makes no sales.

## What we will not do in this version

- No public shop before launch, even as a preview. The preview is private to the press.
- No copying of any other company's logo, layout details or words.
- No new payment provider. Stripe stays the card path; the platform's Stripe key stays in the payments service.
- No backend for a press before launch. The setup record is the only thing made before then.
- No free-form chat assistant on the front door in this version. It can come later, after the plain path is proven.

## Build order (Phase 19, after Phase 18 rows 18.1 to 18.9)

Phase 18 is the one-flow rebuild. Phase 19 adds the functions above. Each row ships on its own, behind the same
sign-up gate, and each has a test that proves it.

| # | Row | Proven by | Effort |
| --- | --- | --- | --- |
| 19.1 | Private live preview of the press's own shop during setup (A) | the preview shows the press name and look; nothing is public; a stranger cannot open another press's preview | medium |
| 19.2 | Continue-anywhere link and the once-a-day email (B) | the link opens the exact step; the email stops once the press is open; no email after launch | medium |
| 19.3 | Launch checklist with plain blockers (C) | each blocker names what it needs; launch is refused until every blocker is clear; refusal writes nothing | medium |
| 19.4 | Price and first-charge date on the home page and the launch step (D) | the amount matches the billing service in tests; pay as you sell example matches the cap | quick |
| 19.5 | Import in pieces with a preview per piece (E) | a file over the limit is refused with the reason; a skipped piece leaves no trace | larger |
| 19.6 | Several presses per login and a switcher (F) | a person sees only their presses; each press keeps its own subscription | medium |
| 19.7 | Plain-words errors on the front door and in setup (G) | a scan of every error text for technical words finds none; detail goes to the control room | quick |
| 19.8 | Practice order in test mode before launch (H) | the practice order uses test mode only; it is removed on request; no live key is ever used | larger |
| 19.9 | "What to do this week" card after launch (I) | suggestions match what is missing; each one disappears once done | quick |

## Risks, and what the plan does about each

- **A private preview leaks.** The preview link is unguessable, expires when the press launches, and is refused to anyone
  else. Tested.
- **Continue emails become spam.** One a day at most, only while in setup, with a one-click stop. Tested.
- **Several presses confuse billing.** Each press has its own subscription and its own record; the switcher says which
  one is open. Tested.
- **A practice order reaches a real card.** Test mode only, with a separate key that the live key can never reach. Checked
  before every release.
- **Preview or import costs too much to host.** Limits on size and count, and previews are generated only on request.

## Julian's steps

| By | You do | What it unblocks |
| --- | --- | --- |
| Now | Say yes or no to the nine functions, or name which to drop | Rows 19.1 to 19.9 |
| Now | Confirm the setup-mode choice from version 1 (setup mode in the real admin) | Rows 18.6 to 18.9 |
| 20 Nov | Send the terms and privacy pages to a lawyer | Terms public before sign-up opens |
| 8 Mar | Public sign-up opens to everyone | Launch |

## Open questions for Julian

1. Keep the private preview from the look step, or from the first question on?
2. Should the continue-anywhere email be on by default, or only when a press asks for it?
3. Is one practice order before launch required, or offered and skippable?
