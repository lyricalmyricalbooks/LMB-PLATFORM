# Events E3c: move an order to another event (Beta)

From the approved ways-to-sell plan (Events, phase E3). A guest who can't make one date is put on another instead of
being refunded.

## Plan
- [x] Shared rules: `withArrived`, `moveKinds`, `movedLines` in `apps/shop/src/shared/eventTickets.ts` (+ generated copy, tests on both).
- [x] Server op `moveOrder`: one transaction over the order and both events' places; refuses full, closed, same or unknown events and unpicked kinds.
- [x] Email the buyer the tickets again with moved wording (English and French), same codes, fresh link.
- [x] Admin: **Move** on each paid order, `MoveDialog`, fixture op.
- [x] Tests: server (happy path, refusals, kinds, two presses at once), shared rules.
- [x] Guides, release note, screenshots (desktop and phone).

## Verification
- `npx vitest run` in apps/shop, root `npm test`, typecheck, lint, build.
- Screenshots from the admin fixture: `/mnt/project-files/ways-to-sell/events-move-*.png`.

## Review
- No money moves and no payment provider is called, so there is no new money path. What was paid per ticket stays on
  the order, so a later refund from the new event gives back what the guest really paid.
- No rule, index or scheduled job changed; records stay server-only.
- Price differences between events are not charged or refunded: the owner is told "no money changes hands".
- Not yet tried on a real test shop: Events is still off there.
