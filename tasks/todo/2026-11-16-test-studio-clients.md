# Sample clients on Test Studio (Services plan, phase 2 gap)

Test Studio had services and hours but an empty Clients page.

## Plan
- [x] Five made-up example.com clients as brought-over customer notes (`testStudioClients`), written with the services.
- [x] Test: id is the hash Clients reads by, only the fields the rules allow, the mark matches the admin's `MOVED_MARK`.
- [x] docs/test-shop.md, release note.
- Staff: left for phase 4 (staff calendars); there is no staff record to fill yet.

## Verify
- Root `npm test` (setup tests), apps-isolation (example.com only).

## Review
- Built as planned; root tests pass (2073). Existing Test Studio gets them on the next "Make the test shop" run, which
  writes only what is missing.
