# Events E3d: discount codes on tickets (Beta)

From the approved ways-to-sell plan (Events, phase E3). A shop's existing discount codes can be allowed on tickets.

## Plan
- [x] Read how codes work at checkout and on bookings; reuse the same checks (`findDiscount`, `codeAmountMinor`).
- [x] Server: `eventDiscount.js`, public action `eventCode`, `code` on `eventStart`, use counted with the places in one
      transaction, use returned once on unpaid or fully refunded orders.
- [x] Shared rule `refundMinorFor` gives back the share really paid (+ generated copy, test).
- [x] Events page: code box, discount row, words in Text & labels (English and French), region `eventsCode`.
- [x] Admin: "Works on event tickets too" on a discount; code shown on Who's coming; fixture.
- [x] Tests (server: five new), guides, release note, screenshots (desktop and phone).

## Verification
- `npx vitest run` in apps/shop, root `npm test`, typecheck, lint, build.
- Screenshots: `/mnt/project-files/ways-to-sell/events-code-*.png` (Studio preview and admin fixture).

## Review
- No new money path: the amount sent to the payment provider is the same server-worked total as before, now after the
  code. The code comes off before tax, as at the shop's checkout.
- A code works on tickets only when the owner ticks it, so no existing code changes behaviour.
- No rule, index or scheduled job changed: `discounts` stays admin-write, public checks go through the server.
- A part refund does not return the code's use; only an unpaid or fully refunded order does.
- Not yet tried on a real test shop: Events is still off there.
