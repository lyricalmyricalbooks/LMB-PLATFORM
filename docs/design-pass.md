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

## Round 2: the shop admin and the shop website

Next, in its own pull request, after screenshots of the demo shop.
