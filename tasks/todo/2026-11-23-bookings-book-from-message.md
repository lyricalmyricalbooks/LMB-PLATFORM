# Bookings plan 4, step 3.6: Book from a message

The owner makes a booking straight from a client's message in Messages.

## Plan
- [x] `bookFromMessage.ts` (pure): `serviceFromText` (the longest service name the message says), `noteFromMessage`, `canBookFrom`.
- [x] Messages: **Make a booking** (Beta, while Bookings is on, only with a real address) opens `BookAgainDialog` filled in: name, email, phone, note, title "Book <first name> in", the named service.
- [x] `BookAgain` takes `note`, `title`, `serviceHint`; `BookAgainDialog` finds the service once the services are read.
- [x] `messagesApi.ts` (`messagesData`): Messages' Firestore reads and writes in one object, so the fixture shows sample messages.
- [x] Help line, release note, admin guide note.

## Verify
- [x] `bookFromMessage.test.ts`, `messages.test.ts`.
- [x] Typecheck, lint, admin tests.
- [x] Screenshots 1440 and 390: the message and the filled-in window (`admin-fixture.html?page=messages`).

## Review
No server change: the booking is the owner's existing `create`, so times, places and emails follow the usual rules.
