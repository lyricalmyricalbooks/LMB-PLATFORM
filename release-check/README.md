# Release check

The full purchase every update must pass on the platform's test shop before any press gets it (`docs/test-shop.md`,
plan 1.32). Plain Node 22 ES modules; Playwright drives the browser.

| File | What it does |
| --- | --- |
| `checks.js` | The eight checks, in order: pages load, test-card purchase, payment arrives, stock drops in the shop and the stockroom, order email, admin sign-in, refund, clean-up. |
| `runner.js` | Runs them on one shop, stops at the first failure, and records every run in the registry (`recordReleaseCheck`) and the shop's audit log. Refuses any shop not marked `testShop` and `testMode` in the registry, or not live. |
| `browser.js` | Playwright driving the real pages: buys with Stripe's test card, opens the stockroom and the admin signed in as the test owner (the sign-in is put where Firebase keeps a signed-in user), and keeps the stockroom open so it brings the order in. |
| `shop-clients.js` | The reads the checks make on the test shop's database and the stockroom's named database, and the refund through the shop's own `refundOrder`. |
| `run.js` | Builds the real clients and runs the check on the real test shop. Needs Julian (below). |
| `local-proof.js` | The whole check with a real Chromium against stand-in pages on this machine (CI job `release-check-browser`). |
| `fakes.js` | A pretend test shop for the unit tests (`runner.test.js`). |

## How the stockroom part works

The stockroom brings website orders in by itself, but only while it is open, online and signed in. So the check opens
it as the test owner (before the purchase when it hasn't published a count yet, to read the count before), keeps it
open, waits for the order to be brought in (`websiteOrders/<order>` imported) and for its published count
(`websiteStockFeed/<book>`) to drop by one, then after the refund to come back.

## What it proves and what it doesn't

- `npm test` proves the order of the checks, every failure stopping the run with plain words, the refusal for any other
  shop, the logging and the clean-up rule.
- `node release-check/local-proof.js` proves the browser driver and the sign-in hand-over in a real Chromium, against
  stand-in pages that use the shop's class names and field ids. It doesn't prove the real shop's pages, Stripe's real
  card form or Firebase's real sign-in. Only a run on the real test shop proves those (`docs/test-shop.md`).

Run it for real: `node release-check/run.js platform-test`, with the settings in `docs/test-shop.md`.
