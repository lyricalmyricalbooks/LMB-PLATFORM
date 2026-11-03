# One admin for shop + stockroom

Decided 3 November 2026 (Julian): a press on the shop + stockroom plan gets one admin, not two apps it switches between.
Shop-only and stockroom-only presses keep their own designs. Design page: https://claude.ai/artifact/6nCbJjmqSMfEE41W7L4CFd

## What it is (step 1, built)

- **When:** the shop profile has `apps.shop` and `apps.stockroom` both `true` (`combinedAdmin()` in
  `apps/shop/src/app/admin/combined.ts`; the stockroom's `combinedPlan()` in `apps/stockroom/src/lib/inside-admin.js`).
- **One menu** (`COMBINED_MENU` in `apps/shop/src/app/admin/riso/nav.ts`), grouped by the job, as Shopify does:
  Home · Orders · Books · Sell in person · Marketing · Money · Online store · Settings. It holds every page of the
  website admin's own menu and the stockroom pages listed in `STOCKROOM_PAGES` (tests check both). The stockroom's
  Website orders, Web Analytics, Shipping and Help are left out: the admin already has one of each.
- **One address and sign-in:** the shop's Hosting serves a copy of the stockroom's built pages at `/stockroom/`
  (`clients/deploy.js` copies `apps/stockroom/dist` into the shop's `dist/stockroom` for both-app shops only, and
  removes it for every other shop, since the build is shared). `/stockroom/app` is rewritten to its `index.html`
  (`apps/shop/firebase.json`). Same address, same Firebase project and web key, so the admin's sign-in is the
  stockroom's too. The stockroom's own `<project>-stockroom` site still deploys, for authors and old links.
- **Stockroom pages inside the admin:** `StockroomFrame.tsx` opens one frame the first time a stockroom page is picked
  and keeps it (hidden on other pages), so the fair till and the offline copy survive moving around. Address:
  `#stockroom/<page>`, each page a Back step.
- **Messages** (same address only, both sides check sender and origin): admin → stockroom `{ source: "lm-admin",
  type: "open", tab }` and `{ type: "look", look, appearance }`; stockroom → admin `{ source: "lm-stockroom",
  type: "ready" }` and `{ type: "page", tab }`. A `#tab=<page>` link opens the first page.
- **Inside the admin the stockroom hides** its own menu, switcher, phone bar, search, notifications, account and theme
  buttons (`apps/stockroom/src/styles/inside-admin.css`); it keeps the book picker, figures and sync mark.
- **No switcher:** the "Website · Inventory" switcher and phone pill are not shown on the combined admin.
- The Hosting `Permissions-Policy` now allows the camera on the shop's own pages (`camera=(self)`), as the stockroom's
  site already did, for barcode scanning in the admin and the fair till.

## Next steps (planned)

2. **One book record:** the book editor gets Stock, Sales and "Where it sells" panels reading and writing the stockroom's
   count (the stockroom stays the master count); books are matched automatically, so the link page goes for these presses.
3. **One orders list and one Home:** fair, stockist, invoice and hand-entered sales join website orders in one list with a
   filter per channel; the two to-do lists become one "Needs you now".
4. **Native pages:** rebuild the stockroom pages inside the admin one by one (Fair till, Stockists, Expenses first),
   keeping the offline rules of the stockroom.
