# Bookings plan 4, step 4.1: Front desk and service provider roles (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Roles `frontDesk` and `provider` (`functions/roles.js` `DESK_ROLES`, `deskRole`; rules `memberFieldsOk`; admin
      `adminAccess.ts` `deskRoleOf`). Offered in Settings › Team only while Bookings is on.
- [x] Server: `bookingsDesk` action (`bookings.js` `handleDesk`): op `desk` returns one shop day trimmed (no key hashes,
      pay keys or card details beyond brand and last four; holds dropped). `DESK_OPS` limits each role; a provider
      only touches bookings they take, and can't use a check-in code.
- [x] Page: `TeamDesk.tsx` (day bar, counts, Check in / Undo, Didn't turn up, Cancel, New booking for the front desk),
      `teamDeskApi.ts`, signed in from `Dashboard.tsx` like the accountant's desk.
- [x] Tests (`bookings.test.js` team desk, `roles.test.js`, `teamDesk.test.ts`), help lines, release note, CLAUDE.md
      notes, fixture `?desk=frontDesk|provider`, screenshots at 1440 and 390.

## Review
Fixture: the front desk sees 7 bookings with who takes each; Ben as provider sees his 3. Server tests prove a front desk
can't change settings (`desk_only`), a provider can't check in someone else's client (`not_yours`) and secrets never
leave the server.
