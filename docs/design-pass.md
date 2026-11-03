# Design and UX pass (3 November 2026)

A Shopify-level polish pass over the platform's own pages, keeping the one shared look (`shared/admin-look/`).
Screens owned by threads in flight (front door, switching, control room, combined admin, gaps) are left alone.

## Round 1: the pages around the shop

- [x] **Your shops** (`accounts/`): each shop shows Open and Plan & billing; Team, Check my shop and Download all your
      data move into one More menu (closes on a choice, Escape or a press outside). What needs the press (a paused
      shop) shows above the counts. The trial bar shows the days left, so a new trial is a full bar that runs down.
      On a phone the help links are one quiet row of text links (Get help included) instead of two big buttons.
- [x] **Help** (`help/`): each topic sheet's questions open their own answer (no more link-in-a-link card); a search
      says how many answers it found; on a phone the six topics are a compact two-column grid of names.
- [x] **Trust** (`trust/`): the seven promises are numbered sheets, two to a row.
- [x] **Short pages** (status, terms): the footer sits at the bottom of the window.

Proof: `npm test`, `node walkthrough/phone-check.js`, a Playwright run that opens the More menu, closes it with
Escape and opens Team from it, and desktop + phone screenshots.

## Round 2: the shop admin

- [x] **Page buttons by the title**: a page's main buttons render through `<PageActions>` (riso/components.tsx) into
      a spot the shell keeps in its PageHeader, top right of the title. With no header (Overview, a fixture) they stay
      in place. Used by Books (Add book and its menu), Customers (Export CSV, Bring customers over), Discounts (New
      discount) and Gift cards (Bring gift cards over, Issue gift card).
- [x] **Books table fits a laptop**: in shop order the tick box shares the Order column; Format and ISBN (SKU for a
      shop that doesn't sell books) share one column.
- [x] **No row of zeros**: Discounts and Gift cards hide their counts until there is something to count; the empty
      state's button is the one way in.
- [x] Release note `2026-11-03-90-page-buttons-by-title.ts`.

Proof: shop `pnpm test` (incl. a PageActions test), typecheck, lint, `scripts/admin-phone-check.mjs`, screenshots.

Left alone on purpose: Orders and Home (combined admin thread), the big page titles (the look's masthead), and the
shop website (Studio owns every shopper-facing style; a pass there needs the demo shop and its own plan).
