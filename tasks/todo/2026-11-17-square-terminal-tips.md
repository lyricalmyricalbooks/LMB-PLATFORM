# Square Terminal and tips on the card reader (Services plan 2, A4)

Plan: https://claude.ai/artifact/6sRmV2odCiXaCX5usnux2w (Part A, item 4). Approved by Julian 17 November 2026.

- [x] Platform payment service: `square.terminal.*` ops (pair, readers, checkout create/retrieve/cancel), scope
      `DEVICE_CREDENTIAL_MANAGEMENT`, `reconnect` answer for older connections, fakes and tests.
- [x] Platform payment service: Stripe tip ops (`terminal.configurations.create/update`, `terminal.locations.update`,
      `process_config.tipping`), checked params, tests.
- [x] Shop: Square `terminalReader` (pair by code, hide on remove, test reader in test mode, tips per checkout).
- [x] Shop: Stripe `setTips` and tips on `charge`; `payment()` answers `tipMinor`.
- [x] Bookings server: `readerTips`, tips asked when Hours & rules asks for tips, tip saved beside the rest.
- [x] Admin: Take a payment pairs a Square Terminal with a code; list re-read after add/remove (old bug: the server
      answers `{ok}`, not the list).
- [x] Fixture `&readers=square`, screenshots, CLAUDE notes, release note.
- [x] Checks: shop vitest, typecheck, lint, build; root `npm test`.

## Review

Built and tested with fakes on both providers; the fixture shows the pairing dialog and the list without page errors.
Not tried with a real Stripe or Square reader. Square shops connected before this must connect Square again once, so the
new permission is granted (the screen says so when a reader call is refused).
