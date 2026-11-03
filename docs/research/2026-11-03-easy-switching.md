# Easy switching: what the big builders do, and what's left here (3 November 2026)

Julian: "make it easy for customers to transition to my platform from other platforms." Then: "make this step
noticeable and really easy to do for the customer, figure out the best spot to put this step."

This is an internal note, so it names other shop systems. Press-facing words never do (`shopMove.test.ts` checks).

## What Shopify's own moving tools do

- **Store Migration app** (apps.shopify.com/store-migration): moves products and customers from Square, WooCommerce,
  Etsy, Wix, Amazon, eBay, Clover and Lightspeed, either from the old system's export files or by connecting the old
  account. Everything lands for review before it is published. Its reviews name the usual gaps: photos missing once the
  old shop closes, vague errors on a customer file, platforms that don't export everything.
- **Onboarding** asks whether the merchant already sells (online, in person, which platform) and, for movers, puts
  "import your store" at the top of the setup guide on Home.
- The migration checklist around it: URL redirects for old product links, gift cards (an app), blog posts and pages
  (copied by hand or by an app), past orders (an order importer), then moving the domain on switch day.

## What this platform already does (Phases 3, 7, 17, 18)

| Thing | State |
| --- | --- |
| Product files: one line per edition by Handle (Shopify), product line then options (Squarespace), parent and variation lines (WooCommerce), listings with numbered photos (Etsy) | done, 3.1 |
| Customers, with consent, into private notes and the newsletter only on the owner's tick | done, 3.1 |
| Old product links kept as redirects | done, 3.2 |
| Photos copied into the shop's own storage | done, 3.1b |
| Get started step 2 "Bring your shop with you", export help per answer | done, 17.3, 17.4 |
| Setup mode's Books page: read, preview and keep the file before the shop exists | done, 18.7 |
| Export for moving away (round trip) | done, 7.18, 7.19 |

## Gaps, and the plan rows that close them (code plan Phase 23)

1. Wix's per-row template (`handleId`, `fieldType` Product/Variant, `productOptionName1…`, surcharge, semicolon
   photos; support.wix.com "Importing products to Wix Stores") and Square's item library (`Token`, `Item Name`,
   `Variation Name`, `Price`, `Current Quantity <location>`, `Option Name n`; squareup.com item import glossary): 23.1.
2. Big Cartel has no rich product CSV, but it, Shopify and WooCommerce publish a public product list: read from the
   old shop's address instead of a file (23.2).
3. Photo links that already fail (23.3), a mailing list from an email tool (23.4), gift card balances (23.5), pages and
   page redirects (23.6), past orders (23.7, decision 4), switch day and an old-link check (23.8), stock as opening
   counts in the stockroom (23.9).

## The best spot for the step (Julian's second message)

Today the step is the fourth of five lines in setup mode's guide, marked optional, with a small button. A mover can
miss it, and picks a look before its products are in.

Chosen: **the top of Home in setup mode**, the first page every new press lands on after the four front-door
questions. One card, above the setup guide: "Selling somewhere already? Bring your shop with you", a main button that
opens the Books page, and "I'm starting fresh", which puts the card away for good. For a mover, the guide's step moves
up to right after the press details, before the look, so the look previews can show their own products. No fifth
question at the front door: the card asks the same thing in one click, at the moment the press can act on it.
Once the shop is open, Get started step 2 and Your first week already carry it.
