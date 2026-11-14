# Make bringing your own domain work (14 November 2026)

Julian: "Make sure it's possible to bring over a new website domain... make sure the domain function works."

## Plan
- [x] Audit the path: admin card, shop server, platform door, domain service, Hosting client, sweep, removal.
- [x] Own domains on for every shared shop, in the shared project it lives in (was off live: waited on the free-address setting).
- [x] Old website's lines listed for removal (Google's `discovered` list was never read).
- [x] Owner can sign in at the new address (sign-in list), removed again on removal.
- [x] Check again repairs a half-done add; re-adding a removed address works (undelete).
- [x] Removing an address takes its www partner too.
- [x] Admin card: tracker, checks itself, compact copyable lines, plain words. Fixture mode for it.
- [x] Tests (root + shop), screenshots desktop and phone.

## Review
Root `npm test` and the shop's admin tests pass; type check and lint clean; screenshots in
/mnt/project-files/web-address/2026-11-14-*. Not proved here: a real domain against Google (needs the server's account
to have Hosting and Authentication rights on each shared project, and Julian to try one domain on a test shop).
