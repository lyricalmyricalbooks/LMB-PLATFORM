# Events E3e: extras with a ticket order (Beta)

From the approved ways-to-sell plan (Events, phase E3). Small paid things sold with the tickets: a programme, a drink.

## Plan
- [x] Shared rules: `EventExtra`, `cleanExtra`, `extraLines`; `refundMinorFor` leaves extras out of a ticket's share
      (+ generated copy, tests on both).
- [x] Server: `askedOf` reads tickets and extras in one place; extras priced by the server, taxed with the tickets, kept
      on the order, named in the emails and on the card page.
- [x] Admin: Extras box in the event editor, extras on Who's coming, in the CSV and in the refund dialog; fixture.
- [x] Events page: "Add to your order" card, summary rows, buyer's page rows, Studio words and region.
- [x] Tests: server (four), shared rules, page rules. Guides, release note, screenshots (desktop and phone).

## Verification
- `npx vitest run` in apps/shop, root `npm test`, typecheck, lint, build.
- Screenshots: `/mnt/project-files/ways-to-sell/events-extras-*.png` (Studio preview and admin fixture).

## Review
- No new money path: one server-worked total goes to the payment provider, as before.
- Kept simple on purpose: extras have no stock count and can't be refunded on their own; the owner refunds the whole
  order to give an extra's money back. A discount code never touches extras.
- An event saved before this has no `extras` key and behaves exactly as before.
- No rule, index or scheduled job changed.
- Not yet tried on a real test shop: Events is still off there.
