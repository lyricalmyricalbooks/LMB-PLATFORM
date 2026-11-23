# Bookings plan 4, step 3.5: Edit every message

The owner changes the words of each booking email and text, in English and French. Clients who booked on the French page get French emails.

## Plan
- [x] Shared `bookingMessages.ts`: the list of messages, standard words in both languages, `cleanMessages`, `messageLanguage`, `emailWords`, `textWords`, `fillMessage`, `placeholdersFor`.
- [x] Setting `messages` in `cleanBookingSettings`.
- [x] Server: `tellCustomer` takes each email's subject, heading and lead from the owner's words in the client's language; dates, money and labels in French; reminder texts the same. The booking keeps the page's `locale`.
- [x] Admin tile "Emails and texts to clients" (Beta) in Hours & rules: language tabs, a message picker, fields with the standard words as placeholders, Use the standard words.
- [x] Help line, release note, admin guide note.

## Verify
- [x] `src/shared/bookingMessages.test.ts` (shop and server copies), `functions/bookings.test.js` › the shop's own words.
- [x] Typecheck, lint, admin + shared + site + functions tests, help test.
- [x] Screenshots 1440 and 390.

## Review
One copy of the words serves the admin and the server. The details block, buttons and refund lines stay automatic, so an owner can't drop a pay or manage link by editing.
