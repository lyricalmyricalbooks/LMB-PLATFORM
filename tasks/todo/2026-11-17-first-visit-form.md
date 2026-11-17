# A form before the first visit (Services plan 2, B4)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (part B4, approved 17 November 2026). Beta.

## Decisions
- One form per shop (`intakeForm` in booking settings): a name, its words (up to 6000 characters), up to five
  questions, and which services ask for it (none picked = every service).
- Signed with a typed name and a tick; the date and the words signed are kept with the answers.
- Once per client email; changing the name, words or questions asks everyone again.
- Filled in on the booking page after booking (the booking's key protects it), so a page never learns whether an
  email has signed before. The confirmation and the reminder ask until it is signed.
- Server-only storage (`bookingForms`): health answers never reach a browser rule. Included in privacy export/erase.

## Build
- [x] Shared rules: `IntakeForm`, `cleanIntakeForm`, `formFor`, `formVersion`.
- [x] Server: `bookingForm` action, `form`/`formSigned` on the booking page, email note, admin op `clientForm`.
- [x] Booking page: `FirstVisitForm` (region `bookingsForm`), words `bookTimeForm*` with French twins.
- [x] Admin: Hours & rules › Form before the first visit (Beta); Form row on the booking drawer and client card.
- [x] Studio preview sample form; admin fixture answer.

## Verify
- [x] bookings.test.js › a form before the first visit (settings, asks, email note, signing, once per client, new words, services, off).
- [x] privacyBookings.test.js covers export and erase.
- [x] Studio check signs the sample form (screenshot), admin fixture screenshot of the tile.
- [ ] Live on Test Studio (needs Julian's Chrome sign-in).
