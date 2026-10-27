# The permanent test shop

A real shop copy, owned by the platform, that gets every update first and must pass a full purchase before any press
gets the update.

## Why

Today's checks never pay. The shop's click-through check stops before payment, and the admin check only looks for the
sign-in button. A sandbox checkout also skips holding stock. So an update that breaks checkout would pass every check,
and the first warning would come from a press's buyer.

## Setup

- Created by the shop maker like any shop (`docs/shop-setup.md`), shop ID `platform-test`, plan "shop and stockroom".
- Stripe in test mode on a test connected account. Test mode for this shop is set by a flag only the platform can
  change, stored in the registry. The shop owner can't switch it.
- Starter catalogue: three books with stock 5, one pre-order, one digital download, one shipping zone.
- Not listed in search engines; a banner says it's a test shop.

## The release check

Runs automatically after each update reaches the test shop. Any failure stops the release.

| # | Check | Pass when |
| --- | --- | --- |
| 1 | Home page, book page, collection page load | no page errors, prices show |
| 2 | Add a book to the bag and check out with Stripe's test card | Stripe returns paid |
| 3 | Payment event arrives | order shows as paid within 60 seconds |
| 4 | Stock drops | the book's stock and the stockroom count both go down by one |
| 5 | Order email sent | the email service logs a sent order email to the test inbox |
| 6 | Admin sign-in with the test owner account | dashboard loads, the new order is listed |
| 7 | Refund the order | Stripe shows the refund; stock goes back up |
| 8 | Clean-up | test orders older than 7 days are deleted |

Checks 4 and 7 rely on the shop's test-shop mark (`SHOP_TEST_SHOP="true"`, written by setup step 8 for this shop only,
plan 1.31): here a sandbox checkout holds stock, a sandbox payment takes it and a refund puts it back, like a live
sale. Every other shop's sandbox payments still leave stock alone. The stockroom count in check 4 comes from the
inventory app link, which pushes sandbox orders only while its rehearsal setting is on.

## Where it runs

A scheduled job in the platform project, written with Playwright (already used by the shop's checks). It also runs
every 15 minutes between releases, to catch outages.
