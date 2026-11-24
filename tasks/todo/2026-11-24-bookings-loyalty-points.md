# Bookings plan 4, step 5.5: Loyalty points (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Shared rules (`shared/loyalty.ts`): settings, points for visits and orders, bonus weeks, rewards due, reward codes.
- [x] Server: `sweepLoyalty` reads only what is new, earns once per visit or order, makes reward codes in the same
      transaction and emails them. Admin ops `points` and `pointsAdjust`; the booking page gets the balance.
- [x] Rewards are ordinary one-use discount codes for that client, so they work on bookings and the shop with no new way to pay.
- [x] Admin: Loyalty points tile in Hours & rules; points on the client card with Add or take points.
- [x] Booking page: "You have N points" line (Studio region, English and French words).
- [x] Tests, help line, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
Points are matched by email, like the other client records. Spending happens through the reward code rather than at the
till; a "use points now" button on the booking form could follow if owners ask.
