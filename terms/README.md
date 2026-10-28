# Terms

Colophon's terms of service, privacy policy, data agreement and shutdown promise, on one page (code plan 8.1):
`index.html`, a static page with no build step, like the help and status pages.

- **The words** live in `terms.js`, in four sections. **DRAFT**: no lawyer has read them yet (switched on by Julian).
  While `DRAFT` is true the page says so at the top.
- **The version.** `TERMS_VERSION` names these exact words. Changing any of them means a new version, so a press's
  record always points at what they agreed to. `terms.test.js` holds a fingerprint of the words and fails when they
  change without a new version.
- **The shutdown promise**: 90 days' notice by email and on the account page, the shop keeps working meanwhile, every
  book, order and customer can be downloaded, and the press can take over its own copy of the shop at no charge.

## For sign-up

`currentTermsVersion()` is the version a new press agrees to. `acceptanceRecord(version, at)` gives what sign-up
stores with the shop, `{ termsVersion, termsAcceptedAt }`, and refuses any other version (the page was open while the
words changed). `acceptedCurrent(record)` says whether a stored record is for today's words. Sign-up's tick box (plan 6.2) stores the
record on the sign-up row once; `GET /api/plans` gives the page the version to send back.

## Not yet

- A lawyer reads the words (Julian). Then set `DRAFT` to false and give a new version.
- A Hosting address, next to `help/` and `accounts/` (Julian).
