# How shop builders get a new seller started (and what Colophon needs)

Researched 29 October 2026 for Julian's request: a guided start for a new press before it is handed the website admin and
the stockroom. Covers entering their details, moving a shop over, viewing and picking a look, and every Google and other
sign-up. Shopify and QuickBooks are summarised from `research/2026-10-27-shopify-quickbooks-onboarding.md` in the project
files. Public help pages change often; treat the details as a snapshot.

## What the others do

**Big Cartel** (help article "Getting Started: Your first steps to online selling"). Four steps: add your location (it
drives tax, shipping and in-person sales; customers never see it), add your first product (name, images, price, shipping,
variants), choose and customise a look, then connect checkout. Before selling it needs a checkout, at least one product and
shipping costs on file. The article mentions no import, so a press moving in has to add products by hand.
Source: https://bigcartel.com/resources/help/article/set-up-your-store

**Squarespace** (help article "Importing products from a .csv"). Products come in by a CSV template, one time only: later
edits in the file don't sync back. Variants are extra rows under a product. Photos must be web links ending in an image
extension; files on the press's computer can't be uploaded through the file. Limits and common failures are listed by
name: a product page address that doesn't exist, categories that don't match, prices with more than two decimals, and
links to a web page instead of an image file. Source: https://support.squarespace.com/hc/articles/115000378108

**Wix** (help article "Importing products to Wix Stores"). Export from the old place, fill in a fixed CSV template, keep the
column layout exactly, save as CSV, upload, then read the per-row results. Rows with errors are skipped and the rest import,
or the press fixes and re-uploads. Variants share the product's identifier and use option columns; images are links
separated by semicolons. Limit of 5,000 rows per file. Source: https://support.wix.com/en/article/importing-products-to-wix-stores

**Shopify** (summarised in the project-files note). A short signup, then a private store within minutes and a long
progress checklist in the admin home. Moving in: a store migration tool plus CSV imports, in the order products, customers,
then past orders, so the links between them hold. Trial of three days with no card.

**QuickBooks Online** (same note). Asks 3 to 8 setup questions, all skippable, and the answers choose what the screen
shows. Its first big moment is connecting the bank so the books fill in. Free setup calls are a big part of its pitch.

## What this tells us

1. **One guided start beats a checklist.** Big Cartel's four steps and QuickBooks's questions both come before the
   working screens. Shopify's long checklist is the part its own users complain about most.
2. **Import is where presses stall.** All three importers need a fixed column layout, and fail on photos that are links
   which no longer load or on a product page address that doesn't exist. Colophon's preview already shows every row before
   anything saves, and copies photos into the press's own storage (plan 3.1b, 5.5), so a link that dies later doesn't
   leave an empty book. Say that plainly in the import step.
3. **Import once, then re-import safely.** Squarespace says later edits don't sync; Colophon's import matches on ISBN, then
   SKU, then title and can run again. Worth saying to presses so they don't fear a second try.
4. **Pick the look after the books arrive.** Big Cartel asks for a look after the first product; the gallery preview is
   better when it shows the press's own book photo, so Colophon puts the look after the import step.
5. **Name no rival to a press.** The platform's rule (and the waitlist, sign-up and terms tests) keeps rival names out of
   press-facing words. The export guidance therefore speaks of "your old shop", and the importer still recognises each
   layout by its column headings, as it does now.

## What Colophon already has

| Need | Exists | Gap for a guided start |
| --- | --- | --- |
| Sign-up questions | Name, plan, country, "How do you sell today?", "What do you sell?", terms (`signup/`, 6.2) | Details like contact email and the ship-from address are asked again later, in Settings |
| Bring your shop | Books › Import CSV with four layouts (3.1), redirects for old links (3.2, 5.6), photo copy (3.1b, 5.5) | Not part of a first run; only reachable from Books; no past orders; no import preview counts for old links |
| Choose your look | Welcome gallery, first admin visit, previews at phone and desktop width (6.3) | Sits inside the admin after the Overview opens, not in a run |
| Setup guide | Eight-step "Set up your shop" on the Overview (6.9) | A list the press can ignore; the admin opens before anything is ready |
| Google | One connect job and a Connect Google button, off until approved (6.17, 6.20) | Not a stage; not in a run |
| Get paid | Stripe hosted onboarding and what Stripe still needs in plain words (7.8, 7.9) | Not blocking anything; real accounts wait on Julian (Stripe profile, 13 November) |
| Domain | One-step connect with Domain Connect or a plain guide (6.15) | Optional, not in a run |
| Stockroom | Shop-to-stockroom link (1.21); five-step guide for stockroom-only presses (`stockroom/src/lib/setup-guide.js`) | Link is only on for the test shop today (setup step 16) |
| Help and words | Twenty help answers (3.4), plain-words test (6.16), phone-width check (13.9) | No answers for the run's stages yet (8.2 checks only the checklist) |
| Trial nudges | Trial tips by checklist progress (6.10) | None for an unfinished start |
| Proof | `road.test.js` walks sign-up to open (6.14); first-hour test with five presses (3.6, still open) | Road test doesn't walk the stages |

## Sources

- Big Cartel setup article: https://bigcartel.com/resources/help/article/set-up-your-store
- Squarespace product CSV import: https://support.squarespace.com/hc/articles/115000378108
- Wix product import: https://support.wix.com/en/article/importing-products-to-wix-stores
- Shopify and QuickBooks onboarding: project files, `research/2026-10-27-shopify-quickbooks-onboarding.md` (which lists its own sources)

Limits: Big Cartel's article was read once in full; the Squarespace and Wix pages were read once each, the Squarespace page
in its first 100,000 characters only. Their import rules change; re-check before the importer work (16.5).
