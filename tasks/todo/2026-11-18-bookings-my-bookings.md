# Bookings plan 4, step 2.10: My bookings in the customer account

- [x] Server: public `bookingMine` (verified sign-in only; this email's bookings, coming then the last 20 past) and
      `bookingOpen` (a fresh link key for the customer's own booking, kept as `accountKeyHash`, accepted by `keyFits`).
- [x] `identify` passed from index.js (verified email from the ID token); privacy erase blanks `accountKeyHash`.
- [x] Account page: Your bookings card (region `accountBookings`), shown while bookings are on or at `/account/bookings`;
      Open, Book again, states (waiting for a yes, cancelled, not accepted, missed); loading, error and empty states.
- [x] Words in Text & labels › Customer account › Your bookings (English and French), Studio preview sample, help line,
      release note, tests.
- [x] Verify: typecheck, lint, vitest, help test; screenshots at 1440 and 390.

## Review
Open mints a new key rather than storing the booking's own link key, so the account never holds a key the server
would have to keep in clear. A card with nothing booked and the page switched off hides itself.
