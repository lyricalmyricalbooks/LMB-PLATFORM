# Stockroom Google Sheet on the one Google sign-in

4 November 2026. On a Colophon shop, the stockroom's Google Sheet comes from the shop's one Google sign-in
(Settings › Google, with the Drive extra on). The press never pastes a script or a web address.

## Where things stand

- The stockroom's older sheet link is an Apps Script the press deploys (`sheetsUrl`, Settings › Sheets Connection).
  About 150 places use it: the sheet's row log, emails to the publisher and to artists, the Gmail scan, the old-shop
  sync and the carrier proxies.
- On a Colophon shop that panel is already hidden (`data-own-accounts`), so `sheetsUrl` stays empty and every one of
  those places skips itself. The combined admin's menu has a "Google Sheet" page that opens stockroom Settings, but
  that page shows no sheet at all.
- The platform already writes a one-tab stock list into a sheet in the press's Drive (`google.sheetSync`).

## Decision

On a Colophon shop, the sheet is a **copy that gets replaced**, not a row log. Each send rewrites the tabs from what
the stockroom holds now. A second send changes nothing, and no rows need tidying after an edit or a void. The Apps
Script route stays exactly as it is for shops that run their own accounts. Nothing on a Colophon shop sets
`sheetsUrl`, so the features that depend on it behave as they do today.

## Steps

- [x] 1. Platform (`google/`): `google.sheetSync` takes `{ tabs: { Stock, Sales } }` (fixed tab names, cells are text
      or numbers, Stock up to 2,000 lines, Sales up to 5,000). An old one-tab sheet gets its missing tab added. The
      older `{ rows }` call still works. Fakes and tests cover both.
- [x] 2. Shop server (`apps/shop/functions/googleConnect.js`): the Stock tab is still read on the server. The admin may
      add Sales lines, which are checked for shape and size, and anyone but an admin is still refused.
- [x] 3. Stockroom: a pure `lib/google-sheet.js` builds the Sales lines (date, book, order, where sold, copies, price,
      total, currency, notes). Voided sales, stockist movements and the practice book are left out.
- [x] 4. Stockroom: a "Google Sheet" settings tab, shown only on a Colophon shop with both apps
      (hidden until main.js shows it). It shows one of three states:
      - Google not connected: one line and "Open Google settings".
      - Drive off: one line and the same button.
      - Ready: "Send now", "Open sheet", and when it was last sent. The combined admin's "Google Sheet" menu entry
        opens this tab. When the page opens and the last send is over 6 hours old, it sends again by itself.
- [x] 5. Guard test: on a Colophon profile, nothing writes `lm-sheets-url`, and the older panel stays hidden.

## Proof

- [x] Unit tests: `npm test` at the root (google), and the stockroom, shop and functions tests.
- [x] Screenshots of the new tab in each state, on desktop and phone, saved to the project files
      (`google-connections/stock-sheet-*`).
- [ ] Real-account check (owed): on the test shop with Drive on, send the sheet, check both tabs in Drive, void a
      sale, send again and check that it is gone.

## Review

- The platform writes named tabs (`writeSheetTab`) and adds a missing one to an older sheet; the press's own tabs stay.
  The status answer now names the sheet (`sheet: { url, writtenAt, rows, sales }`).
- The shop's server still reads Stock itself; Sales come from the admin's browser, under the server's own headings.
- The stockroom tab is a lazy feature module (`features/google-sheet.js`) with a pure core (`lib/google-sheet.js`).
  The admin menu's "Google Sheet" opens it, and start-up resends quietly when the sheet is over 6 hours old.
- Nothing in the new code stores anything in the browser (tested), and the older Sheets Connection panel is unchanged.
- Known limit: the call goes to the shop's checkout function like the fair till's card payments, with no App Check
  token. That is fine in the default "monitor" mode, but a shop switched to "enforce" would refuse both.
- Checks: root `npm test` 1,509 passed; stockroom `vitest` 7,196 passed, and lint, typecheck, tokens, contrast, build
  and size checks passed; the shop's `googleConnect` tests passed. Screenshots are in `google-connections/stock-sheet-*`.
