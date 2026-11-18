# Bookings plan 4, 2.1: several services in one visit (Beta)

Cut and colour in one booking, even with different people; one checkout; money and tips shared out by part.

## Shape
- One booking record. The client's first service is the booking's own service; `parts` lists the services after it
  (at most `MAX_VISIT_PARTS` 3): `{ serviceId, serviceName, minutes, gapAfter, priceMinor, staffId, staffName, roomId, roomName, start, end }`.
- Back to back: each part starts when the one before ends. Only the last service keeps its tidy-up time (`gapAfter`);
  only the first its time before.
- Day items: the first under `<id>`, part n under `<id>~p<n>` (own person and room). `spansOf` adds them, so hold,
  confirm, cancel and the sweep free or confirm every part with the booking.
- Money: `priceMinor` is the whole visit. The way to pay comes from the parts (`visitPayment`): what the card takes now
  is the sum of each part's ask (full price, its deposit, or nothing at the visit). Taxed parts' share is taxed. No
  first-visit price, pack, standing run, course or class in a visit.

## Steps
- [ ] Shared: `MAX_VISIT_PARTS`, `visitService` (combined price, way to pay, deposit), `partAt` free check at any minute
      (window containment), `visitStaff` (people for each part or null), `visitFreeTimes`, `partsOf` timeline.
- [ ] Server: `bookingInfo` unchanged; `bookingTimes` and `bookingStart` take `also: [{ serviceId, staffId }]`;
      `takeTime` writes part items and `record.parts`; `spansOf` reads parts; online move refused for a visit
      ("contact the shop"); owner move shifts every part (checked unless booked over); emails list the parts.
- [ ] Admin: the calendar shows each part as its own card (`expandParts`), the drawer lists the visit, team pay
      shares money and tips by part price.
- [ ] Booking page: "Add another service" after picking the first (people per part), times that fit the whole visit,
      summary with each part and the total.
- [ ] Tests (shared, server, view), help, release note, screenshots desktop + phone, Studio words.
