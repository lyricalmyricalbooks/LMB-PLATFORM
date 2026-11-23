# Bookings plan 4, step 2.8: visits at the client's place

- [x] Shared: service `atClient` + `areas` (one-to-one only), `cleanAreas`, `inArea`, `cleanVisitAddress`, `addressLine`; server copy rebuilt.
- [x] Server: `bookingStart` needs a full address (400 `address`) inside the areas (400 `area`); the booking's place is the address; `bookingInfo` sends the switch and areas.
- [x] Privacy erase blanks the address of an at-client booking.
- [x] Booking page: an address box (street, city, postal code) with plain errors; the place shows "At your place".
- [x] Admin: Visit them at their place switch with postal codes; a tag on the service card. Travel time is the existing Time before.
- [x] Words in Text & labels (English and French), region `bookingsAddress`, help line, release note, tests.
- [x] Verify: typecheck, lint, vitest, help test; screenshots at 1440 and 390.

## Review
Travel time reuses Time before rather than a new setting, so the calendar, team days and room rules already keep it
free. Areas match the start of a postal code, which works for Canadian FSAs and US ZIP prefixes alike.
