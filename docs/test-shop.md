# The permanent test shop

A real shop copy, owned by the platform, that gets every update first and must pass a full purchase before any press
gets the update.

## Two test shops (12 November 2026)

There are two test shops in the shared test project (`setup/testShopPlace.js`), so every update is tried on a shop
that sells books and on one that doesn't before any press gets it:

| | Book test shop | General test shop |
| --- | --- | --- |
| Shop id | `test-press` | `test-goods` |
| Name | Test Press | Test Goods |
| Address | lmb-test-shop.web.app (the project's own site) | lmb-test-goods.web.app (a second Hosting site of the project) |
| Sells | books: authors, royalties and ISBN show | "Something else": general words, book-only parts hidden |
| Release check buys | Test Book One | Test Tote Bag |

- "Make the test shop" makes both (safe to run again). The general shop's site first gets a copy of the project's site
  (`deploy.copySite`, Hosting's version clone), then the shop maker's steps run as for the book shop.
- Every release copies the project's site to the general shop's site too (`extraSites` in
  `services/release-runner/shared.js`), checks that both shops answer, and runs the release check on both. Real shops
  only get a version that passed on both; a failure names the shop.
- Each has its own starter catalogue (`setup/test-catalogue.js`, by what the shop sells).

### Sample records

Each test shop also gets sample records (`setup/test-sample-data.js`), so every admin page has something to show:

- Eight past orders from the last two months, brought over as history only (`source: "import"`): they move no stock
  and send no email. One buyer bought twice.
- The code `TESTSHOP10` (10% off) and two approved reviews.
- In the stockroom, on the second and third stocked items only (the release check buys the first, so its count stays
  5): sales at a fair, a review copy, two copies sent to the stockist "Test Corner Shop" with one sold, and that sale on
  an invoice due in 20 days. The stockist has no email address, so no reminder can be sent. Also the invoice details.
- In the book shop only, a 50% author royalty on those two items (royalties are a book-shop feature).

Setup step 12 adds whatever is missing, and "Make the test shop" looks at it on every run, so a test shop made before a sample existed gets it next run. The control room's **Reset sample data** writes the products and every sample
record again with today's dates; the stockroom part only when the control room can reach the stockroom.

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
- **Linked books.** Only books linked to a stockroom book are counted. Setup step 12 gives the test shop its starter
  catalogue (`setup/test-catalogue.js`): the three stocked books are created in the stockroom too (5 printed, none
  sold) and each is linked to its shop book through the shop's own link. A re-run adds only what is missing.
- **Shipping** a test order from the stockroom stays a dry run: the shop reports what it would do and changes nothing.

## Where it runs

The runner is `release-check/` (see its README): the eight checks above, in order, stopping at the first failure, with
every run recorded in the registry and the test shop's audit log. It refuses any shop not marked as the test shop and in
test mode. Later it runs as a scheduled job in the platform project, after each release reaches the test shop (plan 4.1)
and every 15 minutes between releases (plan 4.3).

What is proven so far, without Julian: the checks and the runner with a pretend shop (`npm test`), and the whole check
in a real Chromium against stand-in pages on the CI machine (`release-check/local-proof.js`, CI job
`release-check-browser`). The stand-in pages use the shop's own class names and field ids, but they are not the real
shop, Stripe's real card form or Firebase's real sign-in.

## Running it for real: what Julian does

These steps need Julian's Google account. Nothing here touches his own shop, stockroom or Stripe account.

1. **Make the platform project and the shops folder** in Google Cloud under the platform's organisation, with a
   billing account for shops. Send the folder number and billing account id; they go in the shop maker's settings,
   never in code.
2. **Nothing to make for the test owner's sign-in.** Firebase only takes a sign-in pass signed by an account of the
   shop's own project, so it is signed by the test project's Firebase admin account
   (`firebase-adminsdk-fbsvc@<test project>`). "Make the test shop" lets the deploy account sign as it (Service Account
   Token Creator; the deploy account owns the project, so it gives this itself). `PLATFORM_SERVICE_ACCOUNT` can still
   name another signer.
3. **Choose the test inbox**, a mailbox the platform owns that receives the test shop's order emails (it is
   `RELEASE_INBOX`). The test shop's owner address is the one the shop maker is given for `platform-test`.
4. **Create the test shop** with the shop maker once the real setup clients are in (plan item for the real clients):
   shop id `platform-test`, plan "shop and stockroom", Stripe in test mode, marked as the test shop. Step 12 adds the
   starter catalogue and links its books; step 16 turns the stockroom link on.
5. **Connect Stripe's test mode** for the test shop's connected account (the payment service, plan 2.1). The release
   check only ever uses Stripe's test card.
6. **Run the check once by hand** on a machine signed in to gcloud as an account allowed on both projects, with Node 22
   and Playwright:

   ```bash
   RELEASE_INBOX=<the test inbox> node release-check/run.js platform-test
   ```

   It prints each check as it passes. If one fails, it says which and why, and stops. Send the output either way.

Until step 6 passes once, plan 1.32 stays open.
