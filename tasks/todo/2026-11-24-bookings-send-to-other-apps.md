# Bookings plan 4, step 5.8: Send bookings to other apps (Beta)

Plan: https://claude.ai/artifact/N7j2zKU7D4gH8uvNrMtqS5

- [x] Server (`functions/bookingHooks.js`): which change is which event, what the other app gets (no keys or history),
      signed posts, safe addresses only (https names, private addresses refused after lookup, no redirects, timeout).
- [x] Trigger `bookingHooksOut` on every booking write; failed deliveries queued and tried again by `bookingSweep`
      5 more times over about a day; a hook that fails 20 times in a row is paused.
- [x] Owner op `bookingHooks`: list, add (up to 5, choose events), switch, test, remove.
- [x] Admin: Send bookings to other apps tile in Hours & rules with add, test, signing key, on/off and Remove.
- [x] Tests (`bookingHooks.test.js`), help line, release note, CLAUDE.md notes, screenshots at 1440 and 390.

## Review
Delivery happens in a Firestore trigger, so a slow outside app never holds up a booking. The DNS check runs just before
each post; Cloud Functions has no private network of its own, and the metadata address is refused. Payment events and
a delivery log per booking could follow if owners ask.
