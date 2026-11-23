# Bookings plan 4, step 3.4: Reply by text

Clients answer a reminder text with Y (they'll be there), C (cancel) or M (move); the calendar follows and they get a text back.
Off until the platform's texts are on and Twilio posts incoming texts to the platform.

## Plan
- [x] Platform `services/texts`: `replyRef` on a send records the number's route (keyed hash, shop, booking, time); signed Twilio webhook `POST /api/texts/inbound` (answered as XML in `server/world.js`); answers kept per shop for 7 days; shop door ops `texts.replies` and `texts.repliesTaken` (a shop takes only its own); `status.replies`.
- [x] Stores `textRoutes` / `textReplies` (`clients/stores.js`), XML answers in `server/http.js`, Julian's step in `server/README.md`.
- [x] Shop: setting `textReplies`; reminder text asks for Y, C or M and passes the booking id; `sweepTextReplies` in `bookingSweep`; cancel shared with the booking page (`cancelByCustomer`); M link key `textKeyHash`.
- [x] Admin: "Let clients answer by text" (Beta) in the Text reminders tile, Opening soon until the platform allows it.
- [x] Help line, release note, admin guide note.

## Verify
- [x] `services/texts/texts.test.js`: signature, other account, other shop, unknown words, old answers, the route keeps no number.
- [x] `functions/bookings.test.js` › answers by text; `functions/textSender.test.js`.
- [x] Typecheck, lint, admin + shared + site + functions tests, help test, platform tests.
- [x] Screenshots 1440 and 390 of the setting.

## Review
The shop never gets a new public address: it pulls answers through the door it already uses for texts, with its own key.
The platform never keeps a whole number. "CANCEL" is Twilio's opt-out word, so cancelling is the letter C.
