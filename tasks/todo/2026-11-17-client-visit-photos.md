# Visit notes and before/after photos on the client card (Services plan 2, extras)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (Part B extras). Approved by Julian 2026-11-17 19:46Z.

## Goal
A salon or studio keeps, per visit, the colour formula or session note and before and after photos on the client card,
private to the shop's team.

## Plan
- [x] Pure rules `clientVisits.ts`: shape, `cleanVisit` (owner's words for problems), own-folder photo paths, sort, dropped photos, file names.
- [x] Reads and writes `clientVisitsApi.ts` (one swappable object for the fixture); photos shrunk (`prepareProductImage`), read with the signed-in SDK (`getBlob`), never a download link.
- [x] `ClientVisits.tsx` on the client card (services shops), Beta tag, add / edit / delete, photo view, cancel removes photos added in that window.
- [x] `firestore.rules` `clientVisits`: `isAdmin()` only (no read-only visit, no accountant), bounded shape. `storage.rules` `client-photos/{client}/{file}`: admin only, images under 12 MB.
- [x] The public cache sweep skips `client-photos/` (`imageCopies.js`).
- [x] Privacy: owner's export lists `clientVisitNotes`; erase deletes the notes and their photos (own-folder paths only); the shopper's self-export leaves them out.
- [x] Emulator checks incl. another shop, accountant and look-only support refused.
- [x] Fixture sample visits for Ben (`?page=customers&sells=hair`).

## Verification
- [x] vitest: `clientVisits.test.ts`, `customerNotesRules.test.ts`, `imageCopies.test.js`, `privacyBookings.test.js`.
- [x] Rules emulator script: every check ok, 12 new ones.
- [x] Browser: fixture on desktop and phone, add a visit with a photo, then delete it; no page errors.
- [x] typecheck, lint, full test run.

## Review
Works on the fixture end to end. Not tried on a live shop: Storage rules and the photo upload need the next deploy.
