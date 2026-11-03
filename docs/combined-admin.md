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
- **Offline (step 4 of the five next moves, built):** the combined admin keeps an offline copy of itself
  (`public/admin-sw.js`, registered by `adminOffline.ts` on built sites, scope `/admin` only, so the shop's own pages
  never change). The admin page is network first (4 seconds, then the last copy); built files (`/assets/…`) are kept
  once fetched (the newest 400); plain files it loads (the shop profile, icons) are network first. Nothing else is kept:
  no sign-in, no shop data, no server answers, nothing but GET. The stockroom inside keeps its own copy
  (`/stockroom/sw.js`, scope `/stockroom/`), so once the admin and the Fair till have opened on a device with a
  signal, both open with none, and sales catch up later. A shop-only press gets no worker; one that drops the stockroom
  has it removed on its next visit. `/admin-sw.js` is sent with `no-cache`. The Fair till page says so, and still links
  to the stockroom app on its own.
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

## Step 3, built: one sales list and one Home

- **Orders › All sales** (`#sales`, `AllSales.tsx`, pure rules in `salesList.ts`) lists paid website orders (refunds
  marked, test orders and unpaid attempts left out) beside the stockroom's own sales, asked as `{ what: "sales", since }`
  (`salesRows` in the stockroom's `lib/book-summary.js`). The stockroom leaves out the rows the website link wrote or
  adopted (`webOrderId`), so no sale is counted twice; its other "Website" sales (payment links, older imported and
  recovered orders) exist only there and show as **Other online sales**. Website rows count the books only (after
  discounts and refunds, no shipping or tax), like a stockroom sale. One filter button per channel, a period (30 days, 90 days, 12 months, every sale) and totals per
  currency. A website order opens on Orders; a stockroom sale opens its book on the stockroom's **Sales records** page
  (its history page, renamed in the combined menu), where sales are changed or voided. If one side can't answer, the
  other side still shows, with a line saying what is missing.
- **Home › Needs you** adds one line per kind of stockroom to-do (`overview/StockroomTodos.tsx`), asked as
  `{ what: "todo" }` a moment after Home opens and every five minutes: sales to sort out, payments, stock alerts,
  book details, things to check. Only to-dos that need doing count (blocked or warning). The stockroom's website items
  and its low-stock alerts are left out (Home already lists the website's to-dos, books to reprint and sold out); its
  orders still to post stay, since those are orders the website doesn't hold. The stockroom answers only once every
  book's records are in, so a half-loaded stockroom never reads as "all clear"; a short sales list is asked again. One to-do opens on that
  item; several open the stockroom's To-do page.
- **Download spreadsheet** on All sales saves the rows on screen (period and channel picked, all of them, not only the
  first hundred) as CSV (`salesCsv` in `salesList.ts`): one row per sale in its own currency, formula-safe.
- **Fair days side by side** on the Fairs and markets tab (`fairDays` in `salesList.ts`): one line per day and fair,
  with checkouts (rows sharing a till number are one customer), copies, takings per currency and the best seller. The
  stockroom's `salesRows` gives each till row its checkout number and fair, read from the note the Fair till writes
  ("Cash · Harbour Fair", `fairNameOf`); the Who column names the fair. A sale from the desktop till's own checkout
  carries no fair, so it shows as "Not named".
- **Fair day email:** at 9pm on a day the Fair till sold something, the shop gets the day's takings, ways of paying and
  books (`functions/fairDayEmail.js`, read-only from the stockroom's uploaded records; switch and "send now" under
  Settings › Email sender › Shop alerts, combined admin only). Notes in `apps/shop/src/app/admin/CLAUDE.md`.
- A page that asks before the admin listens for "open the frame" (a child page's first effect) is remembered and the
  frame opens as soon as the admin listens (`stockroomBridge.ts`).

- With no connection, the admin's "You're offline" card stays off stockroom pages (`onStockroomPage` in
  Dashboard.tsx): the stockroom says it in its own words and the card would cover the Fair till's buttons on a phone.

## First-time tour

- `CombinedTour.tsx`: six short steps (what one admin means, Home, All sales, a book's Stock and sales, the Fair till,
  Money and Settings). Each stop has a "Show me" button that opens that page (an admin page, or a stockroom page).
- Home invites the press once, in a notice above its figures; never a window over the setup guide. "Take the tour" or
  "No thanks" marks it seen on that device (`lm:combined-tour` in local storage); the account menu's "Take the tour"
  brings it back. Words go through the shop's words, so a general shop reads "products". Only for the combined admin.
- Seen is also kept on the shop's account (`adminPrefs/combinedTour`, admin-only like the Overview boards;
  `combinedTourStore.ts`), so a press who took it on one device isn't invited on the next. The device's own mark
  answers first; the account's is read once signed in.

## Next steps (planned)

4. **Native pages:** rebuild the stockroom pages inside the admin one by one (Fair till, Stockists, Expenses first),
   keeping the offline rules of the stockroom.

### Step 4 plan: the Fair till (3 November 2026)

The till today is about 4,500 lines of the stockroom (`features/pos.js`, `fair-kit.js`, `sales-ledger.js` and helpers).
A sale writes one `hist` row per book into the book's split state in the stockroom's named database, lowers stock in
`metadata`, queues the change on the device (localStorage, spilling to IndexedDB), and on upload merges three ways with
the server copy (`_fbSave`, `sync-conflicts.js`), then updates the Google Sheet and the website's stock feed. Writing
that from the admin directly would mean a second writer to the same records with its own merge: the way sales get
lost. So the stockroom stays the only writer, and the native till asks it.

- [x] **4a. Today at the fair, native (read-only), built.** The ask `{ what: "fair" }` is answered by the stockroom's
  `fairForAdmin` (`lib/fair-mode.js`) from the till's own end-of-day summary and upload pill: the fair's name, sales,
  books, takings per currency, by book (best ten) and by way of paying. `FairToday.tsx` shows it on Home on a day with
  a sale or a fair named, with "Open the Fair till". Not above the till itself: there, Fair mode already shows the same
  line and pill, and on a phone the strip pushed the till down. Nothing is written. It also names "Running low": every
  book sold today with three or fewer left (the till's own `POS_LOW_STOCK_AT`), fewest first, even outside the best ten.
- [ ] **4b. A native till that sells through the stockroom.** The admin draws the till (search, cart, quantity,
  price change, currency, payment method, charge). Charging sends `{ what: "sell", saleId, lines, method, currency,
  fair }`; the stockroom records it through its own `posPreparePendingSale` / `posConfirmSale` path, so the queue,
  merge, Sheet and website feed are unchanged. Rules:
  - `saleId` is made by the admin and kept by the stockroom: the same id twice is one sale (a retried ask, a double
    tap), never two.
  - The answer says "saved on this device"; uploading is the stockroom's sync state, shown as it is ("waiting to
    upload" while offline). Never "done" before the stockroom has the sale.
  - Only the owner sells (authors are refused, as today); stock never goes below what the stockroom allows.
  - Undo the last sale and void go through a matching `{ what: "void", saleId }` ask.
  - Offline: the frame is already loaded (the admin keeps it), so selling works with no signal; if the frame isn't
    ready, the till says so and offers the stockroom's own till, never a silent failure.
- [ ] **4c. The Fair kit, printing, card QR** stay in the stockroom page until 4b has run at a real fair.
- Direct writes from the admin to the stockroom's database: not planned.

Checks for each: stockroom tests for the new asks (a repeated `saleId` records once; an author is refused; an
offline sale is queued), shop tests for the till's arithmetic, and a browser run with the real stockroom on a phone
with the connection cut (sell, undo, reconnect, the sale appears once in All sales).
