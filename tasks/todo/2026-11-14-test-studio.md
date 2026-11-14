# Test Studio: a services test shop (14 November 2026)

Services plan, phase 1, part 2 (https://claude.ai/artifact/3BeTQE5ZMfyRnowrVxCNh8): a test shop Julian can open to try
the services admin before any real studio signs up.

## Plan
- [x] `test-studio` ("Test Studio", hair and beauty) in `setup/testShopPlace.js`, at its own Hosting site
      `lmb-test-studio`, made by "Make the test shop" with the other three.
- [x] Sample services and opening hours (`setup/test-studio-data.js`), checked against the shop's own
      `cleanService` / `cleanBookingSettings`; written by setup step 12 where missing and by Reset sample data.
- [x] It keeps the general starter products (out of its menu) so the release check buys from it like the others.
- [x] Control room: "Services test shop", "takes bookings".
- [x] Tests and docs (`docs/test-shop.md`).
- [ ] After merge: run "Make the test shop" on GitHub, then open the shop and its admin.

## Review
- Root `npm test` passes (2,060). The release runner finds test shops from the registry, so releases are unaffected
  until the workflow has made the shop; from then on every release is copied to it and checked on it.
- No sample appointments: a booking also takes its time in `bookingDays`, which only the shop's server writes.
