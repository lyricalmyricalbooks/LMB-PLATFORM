# Bookings plan 4, 2.2: one service in several lengths and prices

- [x] Shared rules: `cleanLengths`, `lengthName`, `withLength`, `MAX_LENGTHS`; `cleanService` keeps lengths for one-to-one services only
- [x] Server: every times/start/code/gift/run path books the chosen length (`askedFor`), stores `lengthId`, a move keeps it
- [x] Booking page: "How long" picker, "From" price on cards, Studio words in English and French
- [x] Admin: Lengths and prices editor in the service dialog, length pick in New booking, lengths on the service card
- [x] Tests: shared rules and server (save, times, booking, move, unknown length, owner's booking)
- [x] Help sentence, release note, fixture service
- [x] Screens at desktop and phone

## Review
Lengths sit on the service; the booking keeps `lengthId` and its name says the length. A person's own rates don't
apply to a service sold in lengths (forPerson skips it), which keeps one price list per service.
