# One look for the admin, the emails and every document

Written 28 October 2026 at Julian's request: "I want the admin section of the inventory and the admin of the website to
be the same. Use the website admin theme for everything." Extended the same day: "This should include redesigning the
emails, the invoices, etc. We want to make everything consistent."

Work happens only in `apps/shop` and `apps/stockroom` (and a new shared folder). Julian's own `LyricalmyricalWebsite` and
`lyrical-inventory` are never touched.

## Where things are today

| | Website admin (`apps/shop`) | Stockroom (`apps/stockroom`) |
| --- | --- | --- |
| Built with | React, shared pieces in `admin/riso/` | Plain JavaScript, one 21,500-line stylesheet, works offline as an app |
| Look | **Pressroom**: dark ink side rail, 64px top bar, big Anton page titles, flat cards with a thin ink top line, 36px flat buttons | The older Riso Press look: tab bar, offset-shadow boxes, uppercase buttons |
| Colours | Every colour is a named token in one file (`adminThemes.css`), checked by tests | Its own token names (`--gold`, `--ink`, `--cream`…) plus about 140 loose colour values still in the stylesheet |
| Looks to choose | **Riso Press** and **Paper**, each in day and night | Riso Press only, day and night |
| Menu | Five items: Home, Orders, Books, Design, Settings | Its own tab list |

So both already come from the same family (Riso Press), but the website admin has moved on to Pressroom and Paper, and the
stockroom has not.

## What "the same" means (the rules)

1. **One set of colour, type, spacing and shape rules.** The stockroom uses the website admin's tokens and Pressroom
   components. Same rail, same top bar, same page titles, same cards, buttons, tables, badges, dialogs, toasts and empty
   states.
2. **Both looks, in both apps.** Riso Press and Paper, day and night, in the stockroom too.
3. **One choice for both.** Pick Paper in one app and the other follows (saved with the person's account, not just one
   browser, because the two apps live at different web addresses).
4. **The two apps feel like one product.** The same menu words, the same "Website · Inventory" switch in the same place,
   the same sign-in screen and the same help and What's new boxes.
5. **The stockroom keeps what makes it the stockroom.** It stays plain JavaScript, works offline, keeps its phone screens,
   and money stays whole cents. Nothing about a number changes, only how it is drawn.

## How: share the look, not the code

Rewriting the stockroom in React would put a 20,000-line offline app at risk for no gain a user can see. Instead:

- A new folder `shared/admin-look/` holds the look as plain files: the colour tokens (today's `adminThemes.css`), the
  Pressroom component styles (today's `riso.css`, written in terms of the tokens) and the icon set. Both apps build from
  it. Nobody edits a copy inside an app. A test fails if the two apps' copies differ from the source.
- The website admin keeps its React pieces. The stockroom gets small plain-JavaScript helpers that draw the same markup
  (rail, top bar, page header, card, table) using the same class names. Same look, two ways of drawing it.
- The stockroom's old token names become aliases of the shared ones (`--gold` points at the primary, `--cream` at the
  canvas), so the 21,500 lines keep working while screens move over one at a time.

## Steps

Each step is its own pull request that merges once checks pass, and the stockroom works after every one.

| # | Step | What changes for Julian | Proven by |
| --- | --- | --- | --- |
| 11.1 | **List and decide.** Walk every stockroom screen and every website admin screen. Decide the one menu (names and order), the page-title rule and which stockroom-only screens (Point of sale, Receipts, Tax centre, Open call, Fair kit…) go where | A one-page list of every screen with its new home. Nothing visible yet | The list, reviewed by Julian |
| 11.2 | **The shared folder.** Move the tokens, Pressroom styles and icons into `shared/admin-look/`; both apps build from it; the website admin looks exactly as it does now | Nothing visible | Website admin tests unchanged; a copy-matches-source test; screenshots identical |
| 11.3 | **Stockroom colours onto the shared tokens.** Alias the old names, move the loose colour values onto tokens, add Paper and its night values | The stockroom can show Paper. Looks the same by default | The stockroom's colour tests plus a new one that fails on any colour outside the tokens; contrast checked in all four combinations |
| 11.4 | **The shell.** Replace the tab bar with the Pressroom rail and top bar (search, status, avatar menu), same widths and menu words as the website admin; the phone keeps a bottom bar drawn in the same style | The first big visible change: the stockroom frame matches the website admin | Navigation tests for every screen; phone and desktop screenshots; the offline test still passes |
| 11.5 | **Core pieces.** Page titles, cards, buttons, form fields, tables, badges, dialogs, toasts, empty and loading states, alerts | Every stockroom screen now uses the same pieces | Component tests; the modal and touch-target rules the stockroom already tests |
| 11.6 | **Screens, busiest first.** Dashboard, Books/Items, Sales ledger, Orders and fulfilment, Inventory, then the rest (Customers, Shipping, Receipts, Tax centre, Invoices, Point of sale, Open call, Fair kit). One or two screens per pull request | Each screen matches its website-admin counterpart as it lands | Per-screen tests; figures unchanged (same data in, same numbers out) |
| 11.7 | **One look choice for both apps.** Saved with the person's account in the shop's project, read by both apps; falls back to the browser when offline | Choose Paper once, both apps follow | Rules tests for the saved choice; a test that both apps read it |
| 11.8 | **One product.** Same sign-in screen, same help, What's new and app switch; the switch shows which app you are in | Moving between apps feels like moving between two rooms of one shop | App switch tests (already exist) extended; screenshot of both rails side by side |
| 11.9 | **Finish.** Delete the old stockroom styles and the old token names; the token check gets a limit of zero; update both apps' guides and the Riso Press design system page | Nothing visible. No leftover old look | The checks at zero; both guides updated |

## Emails and documents: the same system, not a second one

Everything a person receives or prints from Colophon should look like it came from the same place as the admin. What
exists today (found by searching the code; step 11.1 makes the list complete):

| Piece | Where it is made | Look today |
| --- | --- | --- |
| Order, shipping, return, gift card and other shop emails | `apps/shop/functions/email/` and `emailTheme.js` (mirrored for the admin preview in `admin/emailTheme.ts`) | Riso Press, newsprint or black, one accent colour the press can set |
| Platform emails: sign-up, trial tips, billing, closing notices | `services/email/templates.js` (`layout`) | Its own layout, separate from the shop's |
| Invoices (create, print, save as PDF, payment reminders) | stockroom `features/invoices.js`, `lib/payment-reminders.js` | Its own invoice template and settings |
| Receipts and expense receipts | stockroom `features/receipts.js`, `lib/expense-receipts.js` | Its own layout |
| Point-of-sale receipts, fair kit sheets, stock valuation report, packing and shipping printouts, customs forms, tax centre reports | stockroom `pos.js`, `fair-kit.js`, `inventory-valuation.js`, `shipping.js`, `taxcentre.js`; website admin order pages | Each opens its own print window with its own styles |
| Weekly summary PDF and other server-made PDFs | `apps/shop/functions` | Its own styles |
| Checkout order slip and order tracking page | shop storefront | Follows the storefront theme (a shopper-facing look, not the admin look) |

**What "consistent" means here**

1. **One document kit** in the shared folder: a page frame (logo and press name at top, title, reference number, date), a
   details block, a table for lines, a totals block, a notes and terms footer, and one set of print rules (paper size,
   margins, page breaks, black-and-white safe). Every printed or saved document is built from it.
2. **One email kit** in the shared folder: one layout, one button, one table, one set of heading and footer rules, written
   once and used by the shop's emails and the platform's emails. Each press still sets its own logo and accent colour. The
   dark and light email themes stay.
3. **The press's identity comes from one place.** Name, logo, address, tax number and accent colour are read from the same
   shop settings for admin, emails, invoices and receipts, so changing the logo changes all of them.
4. **Words and numbers.** Same date format, same money format, same wording for the same thing (an "order" is never an
   "invoice" in one place and a "sale" in another).
5. **Numbers never change.** Restyling a document must not change a total, tax line or rounding. Every document test
   compares the figures before and after.
6. **Works in the real world.** Emails render in Gmail, Apple Mail and Outlook (inline styles, no web-only tricks); fonts
   fall back to safe ones; every email has a plain-text version; documents print cleanly in black and white.

**Steps** (after 11.5, since they reuse the shared pieces)

| # | Step | What changes for Julian | Proven by |
| --- | --- | --- | --- |
| 11.10 | **Press identity in one place.** One function reads name, logo, address, tax number and accent for every email and document, in both apps | Change the logo once, it changes everywhere | Tests: each output reads the same identity |
| 11.11 | **The email kit.** Shared layout, button, table, footer; the shop's emails and the platform's emails both use it; the admin email preview draws from it | Every email looks like one family, from sign-up to a shipping notice | Parity test between the admin preview and the sent email (exists today, extended); Gmail, Apple Mail and Outlook sample checks; plain-text version present |
| 11.12 | **Redesign each email** in one pass, in a sensible order: order confirmation, shipped, refund, gift card, back in stock, then sign-up, trial and billing. Same facts, clearer layout, the same words as the admin | Each email redrawn and checked | A figures test per email (same totals as before); every email shown in a preview page for review |
| 11.13 | **The document kit.** Shared page frame, details block, line table, totals block, footer and print rules | Nothing visible yet | Print-to-PDF snapshots of a sample document; black-and-white check |
| 11.14 | **Invoices and receipts** first (they carry money): the invoice, payment reminder, receipt and point-of-sale receipt move onto the kit; the invoice settings page uses the shared pieces | Invoices and receipts match the emails and the admin | Totals, tax and rounding tests unchanged; golden-file test per document |
| 11.15 | **The rest of the documents:** packing and shipping printouts, customs forms, fair kit sheets, valuation and tax reports, the weekly summary PDF | Every printout is one family | Per-document figure tests; a list in step 11.1 with each one ticked off |
| 11.16 | **A document and email gallery** in each admin (Settings › Design): every email and document with sample data, light and dark, so a press (and Julian) can see them all in one place | One page to review everything | A test that every template is listed and renders without errors |
| 11.17 | **Finish.** Remove the old per-document styles; a check fails the build if an email or document has a colour or font outside the kit | No stray old look | The check at zero |

**Extra risks**

- **Customs forms and tax reports are official layouts.** They keep the fields and order the authorities expect; only
  fonts, colours and spacing change. 11.1 marks which documents have a fixed layout.
- **Email clients differ.** The kit is tested in the three biggest clients; anything that breaks in one is fixed in the kit,
  not in one email.
- **A press with a custom invoice template.** Their saved invoice settings (wording, terms, numbering, logo) keep working;
  only the look underneath changes.

## Risks and how they are handled

- **A 21,500-line stylesheet.** Never a big-bang rewrite: aliases first, then screen by screen, with the old rules deleted
  only when nothing uses them (11.9).
- **Money screens.** The stockroom's rules for ledger precision and role-based security stay in force. A styling step never
  touches the code that builds a number, only how it is drawn.
- **Offline.** The shared files are bundled into the app, so nothing new is fetched at run time. The offline test runs on
  every step.
- **Phones.** The stockroom's phone layout (about 2,900 lines) is the part most likely to need care. 11.4 and 11.5 include
  phone screenshots as a pass condition.
- **Two choices at once.** If the person has chosen different looks in each app before 11.7, the website admin's choice
  wins and the stockroom follows.

## Questions for Julian

1. **Order against the storefront templates.** Recommended: do 11.1 to 11.5 first (they are the shared look, and the new
   storefront templates do not depend on them), then continue both. The storefront templates plan (Phase 10B) stays as it
   is.
2. **Phone bottom bar.** Recommended: keep a bottom bar on phones (it is how the stockroom is used at a table or fair), drawn
   in the Pressroom style, rather than the website admin's slide-out rail.
3. **Stockroom-only screens.** Recommended: they keep their own place under the shared menu (for example under a
   "Stockroom" item for stock-only presses) rather than being renamed to match website screens.
