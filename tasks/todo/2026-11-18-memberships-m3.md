# Memberships M3: boxes, book clubs and monthly giving (Beta)

Plan: https://claude.ai/artifact/AJtw9ihHaKAg4B7EtBva9N (M3, approved 17 November 2026).
"On the cut-off day, each paid member gets a normal order that ships like any other. Members can skip a month or
pause. The owner sees a warning when stock is short. Monthly giving for Donations is added here."

Rules kept throughout: the server makes every box order, prices it at nothing (the membership paid for it) and never
twice for one member and month; records stay in the shop's folder; words in Text & labels; one PR per sub-phase.

## M3a: box plans and the member's address
- [x] A plan can ship a box: up to 10 products (with edition and quantity) and a cut-off day of the month (1 to 28),
      in `cleanPlan` (`box: { items, cutoffDay }`), shown on the plan card and the Membership page as a perk line.
- [x] Joining a box plan asks for a shipping address on the card page (the provider's own address step, Canada and the
      US); the membership keeps it as `address`. The account card shows it, with Change address (server-checked).
- [x] Admin plan form: "Ships a box" switch, product picker rows, cut-off day; the member list shows the address.

## M3b: box orders on the cut-off day
- [x] The sweep, on or after the cut-off day (shop time), makes one order per paid member (active or ending; not a
      trial, not a failed payment) for that month: `boxes/{membershipId}_{YYYY-MM}` claimed in a transaction, then a
      normal order (lines at 0, `paymentMethod: "Membership"`, `membershipBox`) completed through
      `completeOrderWithoutCard` (stock comes off, the usual emails, oversold flagged).
- [x] Shipping: the order uses the member's address and the plan's shipping is included (no charge).
- [x] Short stock: three days before the cut-off, the owner's Members page shows "Not enough stock for this month's
      boxes" with what is short (members × quantity against stock), and the 8 a.m. email says so.

## M3c: skip a month and pause
- [ ] Skip next box: the member's account offers it until the cut-off; the provider pauses that period's charge
      (`pause_collection` void until the next period) and no box is made.
- [ ] Pause: stops charges and boxes until the member resumes (perks stop while paused); Resume restarts both.
- [ ] Both are server actions with rate limits, shown to the owner on the member row.

## M3d: monthly giving
- [ ] The Support page offers Give monthly beside one-off gifts: an amount (the same $5 lowest), charged every month on
      the shop's card account as a subscription with no tax; each payment is recorded as a gift (Bookkeeping, Tax
      centre, charity receipts when on), and the donor can end it from the email link or their account.

## Checks
- [ ] Shop tests, typecheck, lint, root `npm test`; Studio checks for the new boxes; desktop and phone screenshots.

## Review
