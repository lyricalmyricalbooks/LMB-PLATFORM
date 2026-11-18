# Bookings plan 4, step 2.7: social links, QR poster, where bookings came from

- [x] Shared `bookingChannel` / `BOOKING_CHANNELS` / `CHANNEL_NAMES` (instagram, facebook, google, qr, button), server copy rebuilt.
- [x] Booking page keeps `from` for the visit (`bookingFrom`, framed = button) and sends it with the booking.
- [x] Server stores `cameFrom` on website bookings, only a known channel (test in bookings.test.js).
- [x] Share: a link per place with where to paste it; QR and button links tagged; Print a poster with the owner's words.
- [x] Booking details say how it was made (`bookedThrough`); Figures › Where bookings came from.
- [x] Help line, release note, tests.
- [x] Verify: typecheck, lint, vitest, help test; screenshots of Share and Figures at 1440 and 390.

## Review
Links stay plain addresses with one extra word, so nothing breaks if a site strips it: the booking simply counts as
"Your website". Only known channel names are kept, so a typed address can't put text on a booking.
