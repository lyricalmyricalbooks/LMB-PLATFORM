# One admin for shop + stockroom

Decided 3 November 2026 (Julian): a press on the shop + stockroom plan gets one admin, not two apps it switches between.
Shop-only and stockroom-only presses keep their own designs. Design page: https://claude.ai/artifact/6nCbJjmqSMfEE41W7L4CFd

## What it is (step 1, built)

- **When:** the shop profile has `apps.shop` and `apps.stockroom` both `true` (`combinedAdmin()` in
  `apps/shop/src/app/admin/combined.ts`; the stockroom's `combinedPlan()` in `apps/stockroom/src/lib/inside-admin.js`).
- **One menu** (`COMBINED_MENU` in `apps/shop/src/app/admin/riso/nav.ts`), grouped by the job, as Shopify does:
  Home · Orders · Books · Sell in person · Marketing · Money · Online store · Settings ("Products" for a shop that
  doesn't sell books, through the same `adminWordsFor` as the rest of the admin). Settings reads NAV's Settings pages,
  so a new one (Plan, Billing) appears in both menus. It holds every page of the
  website admin's own menu and the stockroom pages listed in `STOCKROOM_PAGES` (tests check both). The stockroom's
  Website orders, Web Analytics and Help are left out: the admin already has one of each. Its Shipping page stays
  as Orders › Parcels and labels (labels for parcels that aren't website orders).
- **One address and sign-in:** the shop's Hosting serves a copy of the stockroom's built pages at `/stockroom/`
  (`clients/deploy.js` copies `apps/stockroom/dist` into the shop's `dist/stockroom` for both-app shops only, and
  removes it for every other shop, since the build is shared). `/stockroom/app` is rewritten to its `index.html`
  (`apps/shop/firebase.json`). Same address, same Firebase project and web key, so the admin's sign-in is the
  stockroom's too. The stockroom's own `<project>-stockroom` site still deploys, for authors and old links.
  Every deploy into the shared build folder (rules, data changes, server code, pages) holds a lock file there
  (`clients/build-lock.js`), so two shops' deploys take turns and never send one shop's files with another's.
- **Stockroom pages inside the admin:** `StockroomFrame.tsx` opens one frame the first time a stockroom page is picked
  and keeps it (hidden on other pages), so the fair till and the offline copy survive moving around. Address:
  `#stockroom/<page>`, each page a Back step.
- **Messages** (same address only, both sides check sender and origin): admin → stockroom `{ source: "lm-admin",
  type: "open", tab }` and `{ type: "look", look, appearance }`; stockroom → admin `{ source: "lm-stockroom",
  type: "ready" }` and `{ type: "page", tab }`. A `#tab=<page>` link opens the first page.
- **Inside the admin the stockroom hides** its own menu, switcher, phone bar, search, notifications, account and theme
  buttons (`apps/stockroom/src/styles/inside-admin.css`); it keeps the book picker, figures and sync mark.
- **Every page change is reported:** the stockroom's `switchTab` fires `lm-stockroom-page`, so a link inside a page
  or the book picker moves the admin's menu and address too; a second `ready` (the stockroom reloaded itself) resends
  the page and the look.
- **Offline:** the admin itself needs a connection to open (the shop has no offline copy). The Fair till page links to
  the stockroom app on its own (`<project>-stockroom.web.app`), which works with no signal once opened on the device.
  An offline copy of the admin is a later step.
- **No switcher:** the "Website · Inventory" switcher and phone pill are not shown on the combined admin.
- The Hosting `Permissions-Policy` now allows the camera on the shop's own pages (`camera=(self)`), as the stockroom's
  site already did, for barcode scanning in the admin and the fair till.

## Step 2, built: each book on one page

- The book editor has a **Stock and sales** tab on the combined admin only (`StockroomBookPanel.tsx`): on hand (with
  you, with the author), at stockists, sold on every channel with takings, where the copies are (your places, the
  author, each stockist) and the last sale.
- **The stockroom stays the master count.** The admin asks the stockroom frame (`stockroomBridge.ts`), which answers
  from its own records with `bookSummary` (`apps/stockroom/src/lib/book-summary.js`), so nothing is counted twice and
  the figures work from the stockroom's offline copy. The frame opens hidden when a book page first needs it. Messages:
  admin → stockroom `{ type: "ask", id, what: "book", book }` / `{ what: "find", isbn, title }` and
  `{ type: "open", tab, book }`; stockroom → admin `{ type: "answer", id, result }`. The result is null until the
  stockroom's catalog and that book have loaded (the admin asks again up to five times), `{ missing: true }` for a book
  no longer there, `{ match }` for a find, and `{ refused: true }` when an author is signed in to the stockroom.
- Takings follow the stockroom's own totals: a sale paid straight to the artist counts once the transfer comes in.
- A book with editions is matched edition by edition on Inventory › Inventory app link (the tab says so).
- **Matching:** the existing Inventory app link matches (`systemStatus/inventoryLink.links`). An unmatched book shows
  the stockroom's guess (one book with the same ISBN, else exactly the same title) and **Match them**, which uses the
  link's own `linkNewBook` with all its checks. Nothing is matched without that click.
- **Change stock in the stockroom** opens the stockroom's dashboard for that book inside the admin (asking first when
  the book has unsaved changes).

## Next steps (planned)

3. **One orders list and one Home:** fair, stockist, invoice and hand-entered sales join website orders in one list with a
   filter per channel; the two to-do lists become one "Needs you now".
4. **Native pages:** rebuild the stockroom pages inside the admin one by one (Fair till, Stockists, Expenses first),
   keeping the offline rules of the stockroom.
