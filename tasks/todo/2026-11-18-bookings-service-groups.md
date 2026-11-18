# Bookings plan 4, 2.3: service groups, photos and "from" prices

- [x] Shared: `group` (one line, 40 characters) and `photo` (https only) on a service; `groupServices` keeps the owner's order, ungrouped last.
- [x] Server: `bookingInfo` sends both; `saveService` cleans them through `cleanService`.
- [x] Booking page: group headings (only when a group exists), a photo on the card, "From" when lengths or people's prices differ (`cardPrice`).
- [x] Price list and Book a time sections: same groups, photo and "From" price.
- [x] Admin: Group with suggestions and a square Picture in the service window; Services tab grouped with a photo on each card.
- [x] PhotoField shared by Events and Bookings.
- [x] Words: `bookTimeGroupOther` in Text & labels (English and French); region "Service group heading".
- [x] Tests: shared, page rules, server.
- [x] Screens at 1440 and 390.

## Review
Display only: prices are still worked out by the server. Groups are names typed on each service, so renaming a group
means editing its services (suggestions keep spelling the same).
