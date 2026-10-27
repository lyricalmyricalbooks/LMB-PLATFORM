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
sale. Every other shop's sandbox payments still leave stock alone.

The stockroom count in check 4 comes from the stockroom link. On this shop only, paid sandbox orders go over the link
as real orders (other shops send them only as rehearsals, which the stockroom never counts), and setup step 16 turns
the link on with sales sent from the day it runs. What the release check must still do for check 4:

- **Open the stockroom.** The stockroom brings website orders in by itself, but only while the stockroom app is open,
  online and signed in (`runWebsiteImport` in `apps/stockroom/src/features/website-link.js`). There is no button to
  press, and nothing is brought in while no one has it open. So the check signs in to the stockroom page as the test
  owner and waits for the order to come in before reading the count.
- **Linked books.** Only books linked to a stockroom book are counted. The starter catalogue (plan 1.32) must link
  its three stocked books, or the check links them once through the shop's admin.
- **Shipping** a test order from the stockroom stays a dry run: the shop reports what it would do and changes nothing.

## Where it runs

A scheduled job in the platform project, written with Playwright (already used by the shop's checks). It also runs
every 15 minutes between releases, to catch outages.
