# Admin dashboard

The admin (route `/admin`): Riso Press design system, Orders/fulfilment, Overview analytics, inventory app link, settings. Studio (the theme editor) has its own guide in `studio/CLAUDE.md`. The repo-wide rules are in the root `CLAUDE.md`.

**No import loop through `api.ts` (27 October 2026).** Most screens import `adminApi` from `api.ts`, so nothing `api.ts`
imports may import it back: a loop makes one of the two run half set up. `themeStore.ts` did, for the audit log, which
now lives in `auditLog.ts` (`adminApi.recordAuditLog` / `getAuditLog` hand on to it). A helper `api.ts` uses that needs
another admin call takes it from its own small file the same way. `adminApiImports.test.ts` fails on any new loop.

## Inventory app link (11 October 2026)

The shop and the inventory app (`lyricalmyricalbooks/LMB-PLATFORM (apps/stockroom)`, Firebase project `lmb-test-stockroom`) share sales
and stock; the contract is `docs/INVENTORY_LINK.md` (same file as the inventory repo's `docs/website-link.md` — change both).
**The inventory app is the master count** for every linked edition; nothing here is a payment path.
- **Transport (plan 1.21):** the inventory app lives in this shop's project, in its own named Firestore database
  (`stockroom`, `SHOP_STOCKROOM_DATABASE` in `functions/shopConfig.js`). Functions open it on the project's own Admin app
  (`functions/inventoryLinkStore.js`, the only code that touches it; never `(default)`), so nothing is granted. The Connect
  card shows the grant steps only for `not-granted` (access removed); `no-stockroom` means the shop has no stockroom yet.
  `IAM_URL` and `INVENTORY_APP_URL` (`<project>-stockroom.web.app`) come from the shop profile.
- **Sales → app:** `onOrderInventoryPush` (any write to `orders/{id}`) and the 5-minute `inventoryLinkSweep` write
  `websiteOrders/{orderId}` in the inventory project. `functions/inventoryLink.js` `orderFootprint` counts physical copies of
  linked editions per order (box sets as their parts, minus `restockedItems`/`partialRestockedItems`), never what `writeStock`
  happened to do. The website's own record `inventoryPushes/{orderId}` (server-only, deny-all rule) is written first; links are
  frozen per order line. Orders count from the owner's start day (`startDay`, then a backfill). Section 3 › **Send older orders too**
  moves it earlier only (`startSales` again): `markPastOrders` stamps `websiteLink/website.pastFromAt` first (informational), then the
  backfill restarts. A later day is refused. The app brings every order in by itself (no "Bring them in" step): sales typed in
  by hand are linked, unclear ones wait under Needs you; its Storage check proves each book moved to Firestore intact.
- **Stock → website:** the app publishes `websiteStockFeed/{book}`; for each linked edition the sweep sets
  `max(0, min(feed.base − Σ inventoryPushes.net[book], feed.onHand))` (`stockPlanFor`), per book in one transaction that skips a
  book changed after the run started, with an `inventoryLog` row (reason "Inventory app"). Automatic runs (owner switch, every
  15 min) hold big changes, untracked books and books with no print run; the owner's confirmed preview applies them.
- **Postage from the app:** `app.shipment` on the inbox doc → `applyAppShipment` attaches tracking (`trackingSource:
  "inventory-app"`, `order-operations.externalLabel`) or dispatches with `externalDispatchProblem` (`functions/fulfillmentGuard.js`,
  parity with admin `dispatchProblem` in `dispatchGuard.parity.test.ts`; stricter on open cancel requests). `labelProblem` refuses a
  second website label. Refusals reach the app (`shipmentReply`) and the admin alerts (`shipmentIssues`).
- **Shared piles:** editions of one book linked to the same inventory book (signed/unsigned) share their copies
  (`functions/stockPools.js`): `readBooks`/`stockChanges` move every edition of the pile, `reserveStock` holds against it.
- **Counting on / no count:** a confirmed Apply turns `trackInventory` on for an `untracked` row even when `to === from`.
  A matched book with no count (`no-feed`, drop-down shows no "(N on hand)") is one the inventory app hasn't published;
  the app moves books left in its old storage over by itself on open (`_fbAdoptBook`).
- **Linked stock is read-only on the website:** `inventoryApi.adjustStock` refuses (`reason: "linked"`), `adminApi.updateBook` keeps live
  stock (`lockLinkedStock`), the editor/catalog/edition dialog show "Counted in the inventory app", CSV import skips it.
- **Admin:** Inventory › **Inventory app link** (`InventoryLinkPanel.tsx`, pure helpers `inventoryLink.ts`): connect → match books →
  send sales → preview/apply stock → automatic. Server ops are `createStripeCheckoutSession` `action: "inventoryLink"`
  (`functions/inventoryLinkAdmin.js`). Link state is admin-read `systemStatus/inventoryLink`; alerts in `adminAlerts.ts` `inventoryLinkAlerts`.
- **Safety rules from the first review (follow-up PR):** stock is applied only when the catch-up recorded every order that may
  have changed (`catchUp` `complete`; a full page resumes from `catchUpResumeAt`) and any re-send after new matches finished
  (`relinkBatch`, cursor `relinkCursor`). App labels are refused while `operations.labelPurchasePending`. Confirmed Apply turns
  `trackInventory` on only when every edition is a matched printed one (`untracked-mixed` hold otherwise); a `_` link on a book now
  sold in editions holds (`now-has-editions`). Removing matches never needs the inventory app (Unmatch all). Order detail ›
  **Remove the inventory app label** (`fulfillmentAction("clear_app_label")`). Waiting orders age by `pendingSince`.
- **Switching apps (23 October 2026):** the rail opens with **Website · Inventory** (`admin/AppSwitcher.tsx`, pure rules
  `admin/appSwitch.ts`, shared with the inventory app's `src/lib/app-switch.js`; docs/INVENTORY_LINK.md › Switching between the
  apps); phones/tablets also get an **Inventory ↗** pill in the top bar (owner's ask: one tap on the phone). Each app names its
  tab (`lm-website-admin` / `lm-inventory-app`); a click goes to the tab this page opened before, else `window.open("", name)`
  (which also finds the tab that opened this one), else a new one — never `opener.focus()`, which browsers ignore (opener
  kept on purpose for the name lookup), and a deep link changes only the
  `#fragment` (`#orders/<id>` here, `#website-order=<id>` there) so neither app reloads. Installed apps (standalone/TWA) use the
  plain link so the phone hands it over. The count is `pendingImport.count` (null = link not connected, no badge), set with `startDay` by
  Dashboard's alert check (`setInventoryLink`). Order detail's toolbar has **See it in the inventory app** only for orders the
  link sent (`orderInInventoryApp` = the server's `countsForInventory`) with printed books.
- **One to-do list and new books (25 October 2026):** docs/INVENTORY_LINK.md › One to-do list and new books. The sweep reads
  `websiteLink/app` every run (`todo` → `state.app.todo` via `cleanAppTodo`; `linkRequests` = the app's "Add to the app", applied by
  `linkRequestPlan` in a transaction with Match these' guards, answers in `state.appLinkReplies` → `websiteLink/website.linkReplies`),
  writes `websiteLink/website.todo` (`websiteTodo`: owner holds, open matches, app-only books; only when its `stable` signature
  changes) and, hourly with the match check, `websiteLink/catalog` (`shopBooksForApp`) and `state.appOnlyBooks` (`appBooksForShop`).
  A link added there sets `status.relinkPending` too so the run's own relink can't clear it. Admin: alerts `inventory-app-<id>` (action
  `inventoryApp`, button opens `INVENTORY_APP_URL + appHash` through the switch) and `inventory-link-app-books`; Inventory app link ›
  **In the inventory app, not in the shop** › **Add to the shop** (BookEditor `prefill` + `onCreated` → op `linkNewBook`, draft only) /
  **Not for the shop** (`ignoreAppBooks`, Undo = `unignoreAppBooks`). The app's list price reaches the website (`projectInventoryCatalog`
  `price`); a draft gets it only in CAD (`shopDraftFrom`).
- **Book details in step + one search (27 October 2026):** docs/INVENTORY_LINK.md › Book details in step, and one search. The hourly
  match check also writes `websiteLink/catalog.linked` (`linkedForApp`), `state.detailDiffs` (`detailDifferences`, the rule both apps
  share, pinned by `docs/link-details-fixture.json` in both repos) and `state.appBookIndex` (`appBookIndex`). Inventory app link ›
  **Details that differ from the app**: **Use the app's** (op `applyDetail`: re-reads both sides, refuses a changed signature, writes one
  field via `detailPatch`, stamps `detailsChangedAt` so the next sweep refreshes the app's copy) / **Leave as is** (op `keepDetail`,
  `keptDetails { id: signature }`); opening the page runs op `checkDetails`. Alert `inventory-link-details`. Admin search
  (`GlobalSearch` `appBooks`/`appConnected`) adds **In the inventory app** rows (`matchAppBooks`, `inventoryBookUrl`) and **Search the
  inventory app for “…”** (`inventorySearchUrl`); deep links into the admin: `#search=<text>` (`searchFromHash`, opens the search and puts
  the page's address back) and `#catalog/book/<id>` (route `bookId`, opens the book editor, address becomes `#catalog`).
- **Deploy** Firestore rules + Functions with the frontend. Local tests use in-memory fakes (`functions/inventoryLink.fakes.mjs`);
  they don't prove the IAM grant, the deployed trigger or the inventory app's import.

## Riso Press admin design system

`src/app/admin/riso/` implements the published **Riso Press design system**
(artifact https://claude.ai/artifact/MvJwSgL7vE4vExRKaC9Gph): newsprint/ink palette, flare
`gold` primary fill with **ink** text (never lighten it), `gold-text` for flare words,
square corners, 2px ink outlines on objects and hairlines inside lists, flat offset
shadows by day, warm-grey night mode, Anton / Archivo / DM Mono, status = glyph + word.
If tokens change there, update `riso.css` to match.

**One admin look (10 November 2026, Julian):** the admin has a single look, **Colophon** (warm cream page, white tiles with
22px corners, ink pill buttons, a light `#e6e3dc` rail whose open item is a white pill, Archivo + DM Mono). There is no
look choice: no avatar-menu switch, no picker in Choose your look or setup mode, nothing in `localStorage`. Every admin
colour is a `--rp-*` token in `riso/adminThemes.css`: the base block, then `:root[data-admin-look="colophon"]` by day and
night (set by `riso/adminLook.ts` `applyAdminLook`, by `setup.html` and by the stockroom's `index.html`, so dialogs outside the shell follow
it). Chrome rules are the last layer of `pressroom.css` (`:root[data-admin-look="colophon"]`); the stockroom uses the same shared copies. Old
`adminLook` values on press records are kept in the data and ignored. `riso.css`, `adminCompat.css`, `studio.css` and
every other admin stylesheet name no colour: `riso/adminThemes.test.ts` fails on one and checks words against their
backgrounds (4.5:1) by day and night. A new colour is a new token with a day and a night value. `--rp-legacy-*` are the
old day-only utility remaps in `adminCompat.css`; inline colours in admin TSX (email previews, photo crop) are not covered yet.
Shop website templates are separate and stay customizable in Studio.

**Five-item menu (28 October 2026, plan 1.27):** the rail shows `MENU` from `riso/nav.ts`: Home, Orders (orders,
customers, discounts, gift cards, messages), Books (books, inventory, reviews), Design, Settings (the Settings pages).
`sidebarItems` turns it into five `NavEntry`s whose id is their first page; the item holding the current page
(`menuItemFor`) lists its pages under it with their own counts, and its badge is their sum. NAV still lists every page
for titles, search and routes; `nav.test.ts` checks every page sits in exactly one item.

**Pressroom (22 October 2026, the owner's concept A, https://claude.ai/artifact/AR9vcvX5mR5JNCDHeBpFte):** the last layer of
`riso.css` ("Pressroom") restyles the whole admin: cream page, 232px ink rail (`--rp-rail*`; "Website admin" under the wordmark, 16px line icons in one column (faint, label colour on hover/current), active item
cream, `data-nav` on each item, Orders badge red), 64px top bar with a hairline (search, "Shop open" as glyph + word, round
ink avatar), 72px Anton titles, 40px underlined page tabs, figures as a ledger (2px ink rule over mono labels/36px mono
values), cards as flat sheets (1px border + 2px ink top rule, no shadow; every `--rp-shadow*` is `none` except
`--rp-shadow-float` for dialogs/menus/toasts), 36px flat sentence-case buttons, 28px chips (ink when chosen), mono table
heads with 56px rows, rounded tinted badges, alerts as tinted lines with an underlined text action. Restyle through these
classes; don't bring back shadows, offset boxes or uppercase buttons. The top bar holds only search, shop status and the
avatar menu (View site, Help, appearance, Log out live in that menu; Add book is on Books), plus the Inventory app pill below 1024px; the rail has no account card.
Every Pressroom selector is scoped `.rp:not(.studio-editor)` so Studio keeps its own look; keep new layer rules scoped the same way. Overview draws its own
masthead: `Dashboard` skips `PageHeader` there and passes the alerts through `PageAlertsSlot` (`riso/components.tsx`), so
`OverviewBoard` renders title + period chips → alerts → tabs → figures with the updated line and board actions under them.

- `riso.css` — semantic `--rp-*` tokens (light + night) and every `rp-*` component
  class; reduced motion, 44px coarse-pointer targets, visible focus, print.
- `components.tsx` — AppShell, Sidebar, Topbar, PageHeader, Breadcrumbs, SectionCard,
  SectionHead, MetricCard, buttons, IconButton, TextField/TextArea/SelectField/
  SearchField, Toggle, Checkbox, StatusBadge, DataTable (row states, sticky head),
  FilterBar, Pagination, Tabs, TabBar, Dialog/Drawer/ConfirmDialog (focus trap, Escape,
  focus restore), `useConfirm()`, ActionMenu, Toast, SyncChip, Empty/Loading/ErrorState,
  SaveBar. `shellParts.tsx` — GlobalSearch, ActivityLogDialog. `nav.ts` — nav config.
- `src/app/lib/useFocusTrap.ts` — shared by admin dialogs and the storefront cart drawer.
- **Sidebar:** `sidebarItems(NAV)` (`riso/nav.ts`) shows each Settings child as its own top-level item (`settings/<page>`,
  own icon, `section: "Settings"` heading); `NAV` keeps the nested shape for page titles and admin search. What's new
  (`admin/WhatsNew.tsx`) is a one-line sidebar button (latest title, unread dot via localStorage `lm:whats-new-seen`)
  that opens every note in a Dialog.
  Settings › **Email sender** is the one email page (`settingsTab: "notifications"`, `NotificationEditor`); the old
  `communications` id/route (`#settings/communications`) opens the same page and is no longer a separate menu item.

**Admin address bar:** the page on screen lives in the hash (`admin/adminRoute.ts`, pure + tested): `#orders/<id>`,
`#settings/payments`, `#customers`, `#gift-cards/<id>`, `#designer?…` (Studio). `Dashboard.tsx` reads it at boot and on
Back/Forward, writes it on every page change (switching orders replaces, new pages push) and names the browser tab.
Back/Forward never close the book editor or Studio (the address is put back). Add a new admin page to `ADMIN_TABS`.

**Migrated (built from these components):** shell, Login, Reviews, Activity Logs,
Orders list + detail, Overview, Books catalog, Discounts, Settings › General,
Payments, Shipping (profiles/zones/rates + dialogs), Notifications (+ Inventory sync). `Dashboard.tsx` renders migrated pages
outside the legacy wrapper via its `migrated` flag — add new ones there.

**Home (11 November 2026, admin clean-up):** the menu's first page (`overview`) is `overview/HomePage.tsx`: Get started (`SetupStart`), the Connect Google prompt and `HomeToday`. It reads only settings (launch checks), every order, every book and `getAdminBadgeCounts`; the To do counts are `homeTodoCounts` (pure). The old widget board (`AnalyticsDashboard.tsx`, `OverviewBoard.tsx`, `overviewBoard.ts` and its 84 widgets) had no way in once Analytics got its own page, and was removed with the panels only it drew; Home's download went from about 720 KB to about 60 KB. Saved boards in `adminPrefs/overviewBoard` are left in the data, unread. Analytics lives in `analytics/AnalyticsPage.tsx`. The notes below about periods, traffic and signals still describe the pure rules (`overviewRange`, `overviewTraffic`, `overviewInsights`…).
Everything sales-related (revenue net of partial refunds, orders, AOV, **conversion = paid orders ÷ visits**, chart revenue)
comes from real paid non-test orders (`overviewInsights.ts`); the webhook-bumped `analytics.orders/revenue` are not read.
Orders and traffic share calendar-day windows (`periodKeys`, UTC day keys like the `analytics/<date>` docs); all orders/books are
loaded (`getAllOrders`, `getAllBooks`), traffic via `getDailyAnalytics` (400 days). Traffic maths is in `overviewTraffic.ts` (pure, tested).
Marketing/Customers/Stock load carts and back-in-stock sign-ups only when opened.
**Storefront signals** (`funnelApi` in `lib/commerce.ts`, guarded by `lib/trackingGuard.ts`: analytics consent, not Studio preview, not a signed-in
admin): daily `analytics/<date>` docs get `increment()` merges for `visits`, `funnel`, `categoryViews` plus `sources`, `devices`
(from `trackSession`), `bookViews` (`trackProductView`) and `searches`/`noResults` (`trackSearch`, personal-looking terms dropped via
`cleanSearchTerm`). `firestore.rules` caps those maps and lets only the admin read `analytics`. **Deploy rules before the frontend.**
New panels say "Not recorded yet" until data exists — never a made-up zero.

**Not yet rebuilt** (still legacy markup, styled by the scoped compatibility layer in
`theme.css` under `.admin-reso[data-admin-theme="reso"]`, which maps old dark utilities
and violet/blue accents onto Riso tokens): the theme editor's panels. (Taxes is Riso now.)
The order page's return panel opens with a four-step tracker (`returnStepsDone`, `.fw-return-steps`). The Book editor and catalog are Riso components plus `admin/books.css`.
**Admin UX pass (19 October 2026):** top bar `ShopStatusMenu` (`riso/shellParts.tsx`: Shop open/closed/Checkout paused, Close/Open
the shop through the existing confirm, Store status settings); Help and appearance are also in the avatar menu; search opens from a
magnifier on phones. `AdminAlerts` sorts urgent first and folds after two. `DataTable` `stackOnPhone` turns rows into cards at ≤767px;
Riso buttons take `busy`. Settings pages group cards with `admin/settingsLayout.tsx` (`SettingsTabs` sub tabs, one `SettingsGroup` panel per topic,
`HowTo`, `friendlyError`); Email/Reviews/Messages errors go through
`admin/plainError.ts`, sign-in errors through `admin/loginError.ts` — never show raw `err.message` in admin. The order page lays itself
out by its own width (container query on `.fw-detail` in `fulfillment.css`).
**Sub tabs (owner's preference, 20 October 2026):** split a long admin page into sub tabs (Riso `Tabs` + `TabPanel`) rather than
one long scroll: Settings › General / Payments (`SettingsTabs`), Email sender (Emails · Sending setup · Deliveries), Inventory
(Stock · Inventory app link). Panels stay mounted (`hidden`), so unsaved edits survive a switch and one SaveBar covers every tab;
mark a tab with edits with `unsaved`. Tab ids must be unique on the page (`rp-tab-<id>`). Overview and Design are out of scope.
The open sub tab is in the address bar (`#settings/general/visitors`, `#inventory/link`; the first tab has no slug): add a page's
tabs to `SUB_TABS` in `adminRoute.ts` and take `subTab` / `onSubTabChange` through `useSubTab` (`settingsLayout.tsx`); switching
replaces the history entry, and an alert's button opens the tab holding its fix (`alertRoute` in `adminAlerts.ts`).
**Settings look (22 October 2026, owner):** every Settings page renders inside `.rp-settings` (ShopSettings root): cards are flat ruled rows (no box/shadow), the fold chevron sits at the row's right end, buttons are flat and sentence case, `HowTo` is one underlined toggle (`.rp-howto`), `SettingsGroup` has no line under the tab. A card `description` is one short line (≤70 characters, `settingsWording.test.ts`); no explanatory paragraphs, no `rp-kicker`.
Never wrap `rp-*` chrome in `.admin-light` — its `aside button` / `input` rules override
it. Don't add new compat rules for new work; compose the components instead.

## Publisher fulfillment desk (2 October 2026)

Orders reads the full paginated catalog of orders and private `order-operations` records.
Queues: Needs attention, Ready to pack, Ready to ship, In transit, Completed, Unpaid and All orders; oldest first.
Address review, country/province diagnostics, customer-confirmed corrections, item packing checklists, holds,
parcel presets (browser-local), batch packing with individual results, combined pick lists and separate packing slips
prepare orders for explicit tracked dispatch. Labels never dispatch an order. Terminal/refunded orders cannot be prepared.
Payment remains webhook-controlled; the order detail no longer offers Mark as paid. New internal notes and operational
history live in admin-only `order-operations`, never the guest-readable order. Older public activity is not migrated.
Private document ID reads and collection listing need no composite indexes. Deploy Firestore rules before the frontend.
Deploy updated Functions with the frontend: label requests recheck preparation and claim money-spending purchases
transactionally; uncertain purchase failures stay locked for Shippo reconciliation to prevent duplicate charges.
Address correction is disabled after label purchase. Stripe totals, inventory and refund authority are unchanged.
**Labels from Stockroom › Shipping (11 November 2026):** the label step's state lives in `useLabelPurchase.ts`, used by
OrderDetail and by `stockroom/ShipLabelDialog.tsx` (LabelBuyer without "Ship without a label", plus a confirm before
`buyCanadaPostLabel`). A waiting row whose number is a website order (`shopOrderId`, `getOrderById`) gets **Buy label**;
`joinShopOrders` drops rows whose order has a label or left, since the stockroom hears of it later. No new server path,
rule or stockroom write. Fixture: `admin-fixture.html?page=stockroom/shipping` (WEB-1041 ready, WEB-1042 not packed).

## Fulfillment workspace UX repair (2 October 2026)

Order detail uses one sequential FulfillmentWorkbench: shipping address, books to pack, shipping/dispatch.
Only the current step exposes its primary action; completed address details expand in place. Parcel setup
and tracked dispatch use focused Riso dialogs; preset naming is collapsed. Holds and refunds are under
More order actions, with refund details and explicit final confirmation. Customer/payment summaries are
secondary; activity and internal notes are collapsed. Phones render order cards and a Work queue selector,
with Filter & sort in a dialog. Batch packing asks for confirmation and retains per-order outcomes.
The private operations, label purchase safeguards, payment authority and server data contracts are unchanged.

## Admin improvement pass (10 October 2026)

- **Inventory:** every stock edit goes through `inventoryApi.adjustStock` — a transaction over pure `planStockChange`
  (`inventoryInsights.ts`): −/+/receive/undo apply a delta to the live count; a typed count refuses if the live count moved
  unless confirmed. Writes only `stockLevel` / that edition's stock + an append-only admin `inventoryLog` row (reason).
  Rows are per edition; box sets, gift cards, digital and untracked are read-only. 0 → >0 warns how many `stockAlerts`
  will be emailed. Cost prices live in admin-only `inventoryCosts/{bookId}` (never on public books). Low-stock line:
  `lowStockThreshold(settings)` (`settings/website.inventory.lowStockThreshold`, default 5). The old-shop stock copy was
  removed; Inventory › **Inventory app link** replaced it. "Can it run out" rules for Overview: `admin/stockRules.ts`
  (tracked only when `trackInventory === true`).
- **Orders:** desk refreshes only while visible and merges `onChanged(order)` (fired only on real changes) instead of
  reloading; J/K, `/`, Esc. One search matcher `admin/orderSearch.ts`. Deletion only for unpaid/cancelled/test orders
  (`deleteRefusal`, mirrored in the `orders` delete rule). `reconciliationPending` shows "Paid in Stripe — awaiting webhook".
  Manual orders: More order actions › Payment received — mark paid (`canMarkManualPaid` → server `markOrderPaid`).
  **Partial refunds:** `refundOrder` takes `amountMinor` + `restockLines` (`functions/partialRefund.js`); the order stays paid
  with `partiallyRefunded`/`refundedAmountMinor`, restocks only ticked lines/inspected copies; a later full refund refunds the
  rest without double restock. Partial refunds email the customer (from main's order-email fixes); not yet: rollback of a bank-failed partial refund.
  Partial returns allowed (`functions/returns.js`). Resend confirmation stamps `confirmationEmailRequestedAt`; `emailLog`
  rows carry `orderId` and Order detail lists them. Parcel presets in `settings/parcelPresets`.
- **Books:** list rules in `admin/catalogList.ts`, editor rules in `admin/bookEditorState.ts` (`editorDirty` ignores
  recalculated fields, `needsPublishReview` only on becoming published/new issues, ISBN lookup Open Library → Google Books
  fills empty fields only, weights stored "N unit"). `BookEditor` `onSave({ stayOpen })`. Import leaves stock unchanged unless
  "Set stock to the file's numbers". `bulkPricing.planPriceChange` skips gift cards / sales not below the new price.
- **Shell/Overview/Customers:** read-only order screens share `admin/ordersCache.ts` (call `invalidateOrders()` after
  changes). Nav badges: `adminApi.getAdminBadgeCounts()`. Heavy admin pages are `React.lazy`. `?debug=true` is dev-only.
  Customers: LTV net of refunds, "VIP · lapsed", marketing consent = `newsletter` minus `marketing-optout`, private notes/tags
  in admin-only `customerNotes/{sha256(email)}`. Overview › Download sales report (`salesReport.ts`).
- **Messages:** replies via `sendTestEmail` `action: "replyToMessage"` (`functions/messageReply.js`), stored in
  `contactMessages.replies`, status `replied`; paged 100 at a time with server counts.
- **Discounts/Gift cards/Reviews:** category discounts follow storefront membership (one shared copy,
  `src/shared/discountCategories.ts`; the parity test runs on the generated server copy). `/?discount=CODE` share links (`features/site/sharedDiscount.ts`,
  from `main.tsx`) pre-fill checkout; server stays authoritative. Summaries `admin/discountDescribe.ts`. Gift-card expiry:
  `giftCardAdmin` `op: "setExpiry"`. Reviews: admin-set `verified` and `featured` (Studio-editable badge/label); deleting a
  review deletes its `reviewContacts`. Review-request email `functions/reviewRequests.js` inside `unpaidPaymentSweep`
  (`review_request.enabled` default off — the editor treats missing as off — and `delayDays` default 14).
- **Settings:** `admin/settingsDirty.ts` guards leaving unsaved settings (+ beforeunload). Maintenance
  (`maintenance.enabled`) closes checkout server-side in `priceOrder` (`store_closed` → Text & labels › Checkout ›
  `coStoreClosed`); General › Store status sets it and the construction wall. Shippo origin from General › Location
  (`functions/shopSettings.js`). `nightlyFirestoreBackup` → admin-only `systemStatus/backup`. Taxes in the menu
  (`TaxesSettings.tsx`, shape unchanged). Shop alerts (Notifications › Shop alerts) = `shopAlerts.newOrder` / `.shipped` / `.dailyOrderDigest` (older `new_order_admin.enabled` is the newOrder fallback).
  `{{items_table}}` placement via mirrored `placeItemsTable`. `adminSecrets/*.migratedFromPublic` gates "rotate key" warnings.
- **Deploy** Firestore rules + indexes + Functions with this frontend. A second admin email was not added (owner must name it).

## Reports, analytics and performance (10 October 2026)

- **Days:** Overview periods, the chart, the sales report and the Orders CSV put each order on its **Toronto** day (`lib/shopDay.ts`
  `orderDay` / `shopDayKey`; `periodKeys`). Daily traffic stays on the **UTC** days `analytics/<date>` is keyed by
  (`trafficPeriodKeys`, `dailyWindow`) because `firestore.rules` fix those ids to today ±1 — a day's visitors can differ from its orders
  by the evening hours; don't change the write keying without the rules. The CSV keeps raw `Date`/`PaidAt` and adds `ShopDate`/`PaidShopDate`.
- **Shopper bundle:** `lib/analyticsKeys.ts` (`analyticsKey`, `deviceOf`, `cleanSearchTerm`) and `lib/shopDay.ts` are pure and shared; `lib/commerce.ts`
  must not import `admin/*` (`lib/shopperBundle.test.ts`). `/track` reads orders with `publicApi.getPublicOrder` (Lite SDK; `adminApi` re-exports it).
  The catalog is read `CATALOG_PAGE_SIZE` (300) books per request, published books only.
- **Sources:** an order's `referralSource` is normalised with `analyticsKey` so it joins the visit stored under the same key. Funnel `purchase` is counted once
  per real order (`funnelApi.trackPurchase`, never `isTest`/`sandboxPayment`) and `checkout_start` once per session; `publicApi.recordVisit` uses `trackingAllowed()`.
- **Overview figures:** "waiting to ship" (`toFulfil`) excludes Awaiting release and Ready for pickup and ages from payment/release; Where the money goes shows gift cards
  used/sold and a net without sales tax; automatic offers show `appliedDiscount.title`; reviews average/approved use server aggregates; the Overview loads `dailyDocsNeeded(days)` traffic docs.
- **Admin reads:** the Orders desk and nav badge refresh the newest 100 orders incrementally (`getRecentFulfillmentOrders`, `mergeNewestPage`) and fully every
  `FULL_REFRESH_MS` (10 min); an order page patches the shared copy (`patchCachedOrder`). Alert refresh failures show **Couldn't finish checking for problems → Try again**
  (`checkFailedAlert`); a failed/overdue nightly backup shows an alert (`backupAlert`, `systemStatus/backup`).
  The shell's alert/badge check runs every `ALERT_CHECK_MS` (5 min) only while the tab is visible (catches up on return), reuses an
  orders copy under `ALERT_ORDERS_MAX_AGE_MS` (`getOrdersCached({ maxAgeMs })`; the desk's refresh feeds it through `noteLoadedOrders`),
  and returning from an order re-counts from `peekOrders()` plus the last check's webhook/email-log/status reads. Discounts and Reviews
  read orders through `getOrdersCached()` too.
- **Storefront load errors:** `useSiteData` returns `loadError` + `retry`; product, custom pages and Home show Text & labels › Header › `catalogLoadError` / `catalogRetry`
  with a button, and a failed read is never `fresh` (so no "not found"/noindex).
- **Background jobs (`functions/sweepLimits.js`):** `runInBatches` runs work a few at a time and stops at a deadline. `onBookRestocked` (300 s) marks alerts `restockPending`
  and sends in batches; `backInStockSweep` (every 15 min, new) finishes leftovers while the book is still in stock. `unpaidPaymentSweep` alerts the owner before its slow checks.
  `dailyOrderDigest` reads the last 180 days (≤1500 orders) and `order-operations` only for open orders; `abandonedCartSweep` reads only the 7-day window (≤500) and
  `pruneOldCarts` deletes carts older than 30 days. `nightlyFirestoreBackup` deletes `backups/<day>/` folders older than 30 days (needs Storage delete on the bucket;
  a failure is recorded as `pruneError`). No new Firestore rules or indexes. Deploy Functions with the frontend.

## Overview analytics 2.0 + Google Analytics (13 October 2026)

- **Ranges:** `admin/overview/overviewRange.ts` `resolveRange(preset, { custom, compare })` — Today / 7 / 30 / 90 days, This month,
  Last month, This year, 12 months, Custom (clamped to today, ≤ 731 days); compare = the equally long block before or
  `lastYear` (`yearEarlier`). Toronto day keys; `trafficShift` moves a range ending today onto the UTC-keyed traffic docs
  (same as the old rolling windows); `trafficWindow` gives the UTC days `adminApi.getDailyAnalyticsBetween` reads (the
  whole comparison window, however long ago; days that can't be written any more are kept for the admin session,
  `admin/dailyTrafficCache.ts`, cleared by Start traffic counts again). Orders split with `splitRange`
  (`overviewInsights.ts`); `splitPeriods` stays for older callers. The choice is remembered per browser (`lm:overview-view`).
- **Chart:** `overviewSeries.ts` — `buildRangeSeries` (day points + the matching comparison day), `bucketSeries`
  (day/week/month, `autoGrain`), `metricValue` (revenue, orders, units, aov, visitors, conversion), `seriesSummary`,
  `monthPace` (labelled projection, shown under the headline). "Today" charts the last 7 days.
- **What changed:** `overviewChanges.ts` `whatChanged` (revenue + driver, title riser/faller/new, country, visitors,
  conversion, discount share, refunds; max 6, biggest first). **Profit/Titles:** `overviewProfit.ts` — line revenue after
  the order's discount and partial-refund share; cost = `inventoryCosts/{bookId}` (`inventoryApi.costs`) else
  `book.costPrice`; digital lines cost 0; unknown cost is left out and reported as coverage, never guessed; gift cards
  skipped. `titlePerformance` + `OverviewTitles.tsx` (Dig deeper › **Titles**, CSV). **Customers:** `overviewCohorts.ts`
  `cohortRetention`, `repeatTiming`, `newVsReturningRevenue`; **Sales:** `operations` (median paid→shipped, payment/currency
  mix) and `hourHeatmap` (Toronto weekday × hour).
- **Connect Google (platform plan 6.17):** on a shop with `PLATFORM_GOOGLE_URL`, `ConnectGoogleCard.tsx` (`googleConnect.ts`,
  `functions/googleConnect.js`) replaces the Google Analytics and Search Console cards in Visitors & Google and shows a
  prompt on the Overview and in Marketing & traffic until connected. The platform writes the same
  `settings/website.analytics.ga4MeasurementId` and `adminSecrets/googleAnalytics` fields the older cards do, so the tag
  and reports below work unchanged. `useGoogleConnect().mode === "own"` (no link) keeps the older cards. On those shops
  Email sender shows `PlatformSenderCard` instead of the Gmail app-password panel (`senderStatus.backup === "platform"`).
- **Settings › Google (4 November 2026):** `GoogleSettings.tsx` (+ `google.css`, pure card states in `googleHub.ts`) is
  the one page for every Google service: hero (headline, account, "n of m working" meter, chips that scroll to parts
  needing a look), **Included with your sign-in** cards (analytics, search, Shopping, email, web address: badge, two
  "what you get" lines, Google's own line, Try again or Open in Google), **Extras** as switches saved together through
  `connectLink(extras)`, then Disconnect. Listed only when `runsOnColophon()` or the platform answers (Dashboard
  `googleOn`); Visitors & Google keeps a pointer card. Switching extras off saves at once (`googleConnectApi.turnOff`, no Google trip); switching one on opens Google's page
  on the shop's one account, and another account comes back as `?google=other_account` with nothing changed.
  Fixture: `admin-fixture.html?gstate=coming|ready|connected|trouble&page=settings/google`.
- **Google Analytics 4:** Settings › General › **Google Analytics** (`GoogleAnalyticsCard.tsx`, `admin/googleAnalytics.ts`).
  Measurement ID (public) = `settings/website.analytics.ga4MeasurementId`, written only by that card (`updateSettings` drops
  `analytics` so a stale settings form can't put an old ID back); property ID = admin-only `adminSecrets/googleAnalytics`.
  Storefront: `lib/ga4.ts` loads gtag only after `googleTrackingAllowed()` (analytics consent, not Studio preview/share link,
  not the shop owner signed in — signed-in customers do count), never on `/admin`; declining later sets `ga-disable-<id>`.
  **Google only ever gets `cleanLocation()`** (origin + path + `ref`/`utm_*`/click ids): emailed links carry addresses,
  signed tokens, order keys, sign-in codes and cart ids in the query string. It is set in `config` and before every event.
  A missing ID (settings not loaded yet) keeps the queue. GA `purchase` is sent only for `paymentStatus === "paid"`. Events: router `page_view` (`Ga4PageViews` in
  App.tsx, `send_page_view: false`), `view_item` (BookDetail, once per session), `add_to_cart` (CartContext.addToCart),
  `begin_checkout` (Checkout), `purchase` (`funnelApi.trackPurchase`, CAD order totals, never test/sandbox). Reports: action
  `ga4Report` on `createStripeCheckoutSession` (`functions/googleAnalytics.js`, admin, `LIMITS.ga4`): the Functions' own
  service account token from the metadata server (scope analytics.readonly) — no key stored. Owner setup: add that service
  account (shown by **Check connection**) as a Viewer on the GA4 property and enable the Analytics Data API in the project.
  `overviewSources.ts` gives one `TrafficFigures` shape: `googleTraffic(report)` when connected, else `shopTraffic(daily…)`.
- **Reset:** Marketing & traffic › The shop's own counter › **Start traffic counts again** → action `resetTraffic`
  (`functions/trafficReset.js`, admin, typed `RESET`) deletes every `analytics/<date>` doc and records
  `systemStatus/trafficReset` (`at`, `removedDays`). Never touches orders, revenue or Google Analytics.
- Deploy Functions with the frontend. No Firestore rule or index change.

## Overview analytics 3.0 + your own visits (18 October 2026)

- **Where the files live (27 October 2026):** the Overview's files (`AnalyticsDashboard.tsx`, `Overview*`, `overview*`,
  `salesReport.ts`) are in `admin/overview/`. Helpers the Overview shares with Settings cards (`googleAnalytics.ts`,
  `bigQueryJourneys.ts`, `clarityAdmin.ts`, `dailyTrafficCache.ts`) stay in `admin/`. Four files in the folder are used
  outside the Overview too, so check those screens when changing them: `overview/overviewInsights.ts` (paid-order and
  refund rules behind Inventory, Customers, Discounts and launch readiness) and `overviewShared.ts`, `overviewRange.ts`,
  `overviewVisitors.ts` (used by `googleAnalytics.ts` and `bigQueryJourneys.ts`).
- **Owner never counted:** `lib/ownerDevice.ts` (pure). A browser is the owner's (`localStorage lm:owner-device` = on) after the
  first admin sign-in there (`markOwnerDeviceOnSignIn` in `Dashboard.tsx`, unless the owner chose "off"), via Settings › General ›
  **Your own visits** (`OwnVisitsCard.tsx`), or by opening any page with `?owner-device=on|off` (`takeOwnerDeviceLink`, first in
  `main.tsx`, strips it). `trackingGuard.neverCounted()` also refuses `looksAutomated()` (webdriver, bots, headless, speed testers);
  both the shop counter and GA4 use it. The device flag is for visits only (the owner may ring up a customer's order on it); orders
  by `SHOP_OWNER_EMAIL` are `isOwnOrder`: kept in Orders, to-dos and readiness, left out of every Overview figure (`shopOrders` in
  `AnalyticsDashboard`) and the Monday email; the owner's own carts are left out of cart stats.
- **New counters** (`lib/commerce.ts` funnelApi, all behind `trackingAllowed()`): `bookAdds`, `wishlistAdds`, `unbuyableViews` (free
  maps per book id; the bag and wishlist only emit `lib/shopSignals.ts` window events, listened to from `main.tsx`), `checkout`
  (fixed keys `CHECKOUT_STEPS`, once per step per visit/day) and `vitals` (`lib/pageSpeed.ts`: one key per visit
  `<phone|computer>_<lcp><inp><cls>`, g/o/p/n, Google's limits, PerformanceObserver only; sent at 45 s or when hidden, so visits
  closed sooner are often lost). `firestore.rules` checks only the maps a write changes (`ch`), because a merge write carries the
  whole day doc and checking every map overran the 1,000-expression budget; the emulator script's "busy day" checks guard it.
  Add a step to both `CHECKOUT_STEPS` and `checkoutStepOk`. The "delivery" step counts only once the address is complete.
- **Panels** (pure maths in `admin/overview/overviewSignals.ts`, UI in `OverviewMarketingExtras.tsx`): Titles › Into bag + flags (`titleFlag`);
  Marketing › Where checkout loses people, Campaigns and links that sell (order `acquisition`, GA4 batch 3 `campaigns`), Pages that
  start sales, Page speed for real shoppers, Found on Google; Customers › Did the reminder emails work? + Newsletter sign-ups by week
  (`getAudienceSnapshot().pendingSubscribers`); Stock › Wanted but can't be bought. Never draw a zero for a signal never recorded.
- **Search Console:** `functions/searchConsole.js` (`action: "searchConsole"`, admin, `LIMITS.ga4` bucket `search-console`), the
  Functions' metadata token with scope `webmasters.readonly` (`metadataCredentials(fetch, scope)`); property in admin-only
  `adminSecrets/googleAnalytics.searchConsoleSite` (else the shop's domain, else the only one). Owner setup: add the service account
  as a Restricted user in Search Console and enable the Search Console API. Settings › General › **Google Search Console**.
- **Visitor widgets (19 October 2026):** traffic band `livePages`, `pageTime`, `visitHours`, `actions`, `outbound`, `newReturning`
  (`OverviewVisitors.tsx`, maths `overviewVisitors.ts`) read GA4 batch 4 (`pageTime`, `when`, `actions`, `pageActions`, `outbound`) and the
  realtime `realtimePages`/`realtimeMinutes` in `functions/googleAnalytics.js`; batch 4 fails soft (keys undefined → "Needs the latest server
  update"; a 400 retries its reports one at a time). `dropOff` (traffic) and `lookNoBuy` (titles) use the shop counters
  (`OverviewVisitorPath.tsx`, `overviewVisitorPath.ts`). Starter board `visitors`. No new storefront tracking or rules.
- **Monday summary:** `exports.weeklySummary` (Mondays 08:00 Toronto) → `functions/weeklySummary.js` (pure): last Mon–Sun vs the week
  before, real paid non-owner orders, visits from `analytics/<UTC day>`. Switch `settings/notifications.shopAlerts.weeklySummary`
  (missing = on), Settings › Email sender › Shop alerts, with **Send me last week's summary now** (`sendTestEmail` `weeklySummaryNow`).
  It attaches a two-page PDF (`functions/weeklyPdf.js`, hand-written PDF with built-in Helvetica, no package) drawn from
  `weeklyHighlights` (same sales rules; `analytics` maps for sources/devices/bookViews/searches/funnel; unrecorded = empty, never 0).
  `sendEmail` takes `attachments` (Gmail and Resend; never queued). If the PDF fails the email goes without it.
- **Fair day summary (combined admin, 3 November 2026):** `exports.fairDaySummary` (every day 21:00 Toronto, via the tick)
  → `functions/fairDayEmail.js` (pure; same rules as the till's end of day, a test checks it against the stockroom's
  `fair-mode.js`). It reads, read-only, the `hist` of books whose stockroom record was uploaded in the last 36 hours
  (`inventoryLinkStore.readBooksSoldSince`: `ts` first, then only the changed books). It sends only when the till sold
  something that day, once per day (`systemStatus/fairDayEmail.lastDay`); a shop without the stockroom sends nothing.
  The switch is `shopAlerts.fairDaySummary` (missing = on), shown under Shop alerts in the combined admin only, with
  **Send me today's fair summary now** (`sendTestEmail` `fairDaySummaryNow`, sends again).
- Deploy Firestore rules + Functions with the frontend.

## Round-2 catalog and settings (10 October 2026)

- **Book saves (`adminApi.updateBook(id, form, loaded, { removeMissing })`):** still diff-only (`changedBookFields`). Three additions in
  `admin/bookStockMerge.ts`: (1) `WRITE_ONCE_DEFAULTS` (status, trackInventory, chargeTax, allowBackorder) are written when the stored book
  has none, so a legacy book matches what the editor showed; (2) a book with editions never gets the editor's own stock total — its count
  is the sum of the merged live editions, computed inside the transaction; (3) `removedBookFields` lists keys that were on the loaded book
  and are gone from the form, and `updateBook` deletes them (`deleteField()`, also in the private document) **only when the caller passes
  `removeMissing: true` — the book editor, which sends the whole form**. Bulk edits and the CSV import send partial objects and must not.
- **Pre-order sync lives in `updateBook`:** when `preorder` or `publishDate` is in the write and differs from `loaded`, it calls
  `syncPreorderOrders` itself and returns `preorderSync { updated, failed }` (the editor toasts it; the CSV import gets it too).
- **Web address freeze:** a published book with an address keeps it (`slugLocked`, `slugFollowsTitle` in `bookEditorState.ts`); Books › edit
  › Details › **Change web address** asks first, then unlocks until the next save. Old links are not redirected (Firebase Hosting could, through `firebase.json` `redirects`; none are generated yet).
- **Old-shop stock copy:** removed (it read the inventory app's frozen Realtime Database). See *Inventory app link*.
- **PayPal:** `functions/paypalCredentials.js` picks the credentials per request mode. Live = Settings › Payments › PayPal Live client ID +
  private Live client secret (`adminSecrets/paypal`) when both exist, else the `PAYPAL_CLIENT_*` Functions secrets. Test = Test client ID +
  Test client secret only, never the live pair (PayPal refuses live credentials on the sandbox). Secrets use `SecretField` and
  `adminApi.removePaypalSecret`. The webhook still verifies with the one `PAYPAL_WEBHOOK_ID` secret (a sandbox webhook id is not separate yet).
- **Resend key:** `resendKeyProblem` (`privateKeys.ts`) is enforced in `writePrivateKeys`; Notifications › Advanced has **Remove stored key**
  (`adminApi.removeResendKey`), after which sending uses the `RESEND_API_KEY` Functions secret again.
- **Email sender:** Settings › **Email sender** (`#settings/communications`) is a card at the top of the Notifications page
  (`admin/senderSettings.ts`): sender name, reply-to, Resend backup address, saved into `settings/website.communications` (whole map kept).
- **Notifications load failure:** the editor shows an error with Try again and refuses to save; it never treats defaults as the saved copy.
- Items 16, 37, 38, 64, 66 and 138 of the round-2 list were already fixed on this branch (`inventoryApi.adjustStock`, `taxRatesEdit`,
  `checkoutClosed`, `planPriceChange`/`eachBook`, the Location postal code/country) and are pinned by `settingsRound2.test.ts`.
- **Deploy:** Functions with the frontend. No Firestore rule or index changes (`adminSecrets/{doc}` already admin-only).

## AI writing assistant (13 October 2026)

Settings › General › **AI writing assistant** (`admin/AiWriterCard.tsx`) stores a free Google AI Studio (Gemini) key, an
OpenRouter key + optional model, which one writes, and an optional house style in admin-only `adminSecrets/ai` (`geminiKey`,
`openrouterKey`, `openrouterModel`, `provider`, `voice`); never in public settings. `pickProvider` (`functions/aiWriter.js`) uses
`provider` when that key is saved, else OpenRouter, else Gemini. OpenRouter calls chat completions with the task's schema
(`toJsonSchema`) and reads the answer through the same `parseResponse`; an owner-named model is never swapped, the default list
(`OPENROUTER_MODELS`, first = `DEFAULT_OPENROUTER_MODEL` in `admin/aiWriter.ts`) moves on when one is retired. Key and model
rules are mirrored client-side (`aiWriter.parity.test.ts`). **Backup AI (20 October 2026):** with both keys saved, a used-up / out-of-credits / busy answer (`worthBackup`: 429, 402, 408, 5xx; never a refusal) from the chosen AI is retried on the other (`runWithBackup`, `backupProvider`); the chosen one then rests for 60 s on that instance (`restingUntil`). Gemini 429 tries the next model first (allowances are per model). Results carry `provider` and `fellBack`. Books › edit › Images › Describe all runs `DESCRIBE_AT_ONCE` (3) photos at once through `runPool` (`admin/aiWriter.ts`) and stops starting new ones on a 429 or missing key. `LIMITS.aiWrite` is 120 per 10 min. **Write with AI** buttons:
Books › edit › Search (SEO) (`bookSeo` → metaTitle/metaDescription), Books › edit › Details description toolbar (`bookDescription`,
plain paragraphs, **Undo AI draft**) and Studio › Pages › Search listing (`pageSeo`; the server is told the shop-title suffix length).
Books › edit › Images › **Describe with AI** (per photo, or every photo without a real description; task `photoAlt`: the server
fetches the photo itself, only from the shop's own Storage bucket (`photoImageUrl`, ≤7 MB, `photoAiUrl` picks the ~960px copy) and sends
it to Gemini as inline data; the photos are public already). Alt text that is really a file name ("01", "IMG_9564") counts as none:
`features/site/photoAlt.ts` `describedAlt` (BookDetail falls back to Text & labels `bookPhotoAlt`, the SEO pane's check flags it).
All go through `admin/aiWriter.ts` `askAi` → `createStripeCheckoutSession` `action: "aiWrite"` (admin only, `LIMITS.aiWrite`) →
`functions/aiWriter.js` (pure, tested): JSON-schema output, honesty rules (no invented facts), retired models fall through
`MODELS` on 404, plain-English errors (`aiErrorMessage`). `bookAiInput` sends public catalog facts only — never cost, stock,
shelf, files, customers or orders (free-tier prompts may be used by Google). Drafts land in the editor; nothing is saved by
the AI path. Written fields are replaced only after a Riso confirm. Deploy Functions with the frontend; no rule or index change.
**Studio (3.0 phase 8):** **Rewrite with AI** under section/block text fields (`ConnectableField`) and Text & labels
(`StudioCopyField`) — `studio/StudioAiRewrite.tsx`, task `rewrite` (keeps `{placeholders}` and links or changes nothing;
rich text sanitised on both sides); **Draft a section with AI** in Add section (`studio/StudioAiDraft.tsx`, task
`sectionDraft`, kinds in `DRAFT_TYPES` of `studio/aiStudio.ts` = `functions/aiWriter.js`, parity-tested; no quote/review
sections). Both land as one undoable Studio change; nothing is saved by the AI path. A new AI task needs a `TASKS` entry and
a `needs` branch in `handleAiWrite`. The fixture fakes the server with `setAiTransport` (`__studioFixture.aiAnswer`).
Rich text with pictures/videos/dividers/alignment is rewritten words-only: `protectRichText` / `restoreRichText` hold them out as
`[[keep-N]]` / `[[line-N]]` markers (server `TOKEN_RE` requires them back; each once, in order); links keep target/rel by address; coloured words are still refused. Studio › Pages
bodies have the button too, with a local Undo (`localUndo`). Pictures (incl. pasted `data:` ones) never go to Google.

## URL redirects (11 October 2026)

Settings › General › **URL redirects** (`admin/RedirectsCard.tsx`) maps an old shop address to a new path or `https://` link,
stored in the public, admin-written `settings/redirects` doc (`{ items: [{from, to}] }`; no new rules). Pure rules in
`features/site/redirects.ts` (`cleanRedirects`, `redirectProblem` refuses home, shop routes, duplicates, self and loops,
`findRedirect`, `parseRedirectLines` for pasted lists). The storefront follows a redirect only from a "missing" view —
`NotFoundPage`, `BookDetail` with no book, `PageView` with no page — through `useMissingRedirect` (reads
`publicApi.getRedirects`, never in the Studio preview, keeps the shopper's query, stops after `MAX_REDIRECT_HOPS`), so a real
page is never hijacked. These are browser redirects, not HTTP 301s. No shopper-visible words, so no Text & labels entry.
**Pages of 500 (plan 5.6):** up to `MAX_REDIRECTS` 5,000, saved as `redirects/1` … `redirects/10` (`{ items, page }`,
public read, admin write of ids 1–10 only in `firestore.rules`). `saveRedirects` writes every page or clears it in one
batch (`redirectsToPages`, filled in order) and marks the old `settings/redirects` doc `paged: true` with no items; every
reader goes through `redirectsFromStore` (`publicApi.getRedirects`, which the admin, the storefront and the prerendered
pages all use): pages by number, else the old doc's list while it was never moved, so older shops keep working until their
first save. Checks use a `RedirectIndex` map so a 5,000 list stays quick. The import says "Your shop is full" when it runs
out of room (`importRedirects` `full`, `oldLinksMessage`); the card shows "N of 5,000 used" and a find box past 100 rows.
Tests: `redirects.test.ts`, `redirectPagesApi.test.ts` (499/500/501/5,000, migration), `scripts/firestore-rules-emulator.mjs`.

## Bring your shop with you (28 October 2026)

Plan 3.1. `shopMove.ts` (pure) reads another shop system's export. **The words a press sees never name another shop
system** (`shopMove.test.ts` checks `SHAPE_WORDS` and `ShopMoveDialogs.tsx`); code names shapes by row layout:
`handle-rows`, `product-id-rows`, `parent-rows`, `listing-rows`, recognised by headings only (`recognizeExport`).
- **Books:** `BookImportDialog` calls `planShopMove`, which translates a recognised export into Import CSV's own columns
  (`movedBooksCsv`) and runs `planImport`, so every catalogImport safety rule holds. Row lines are the old file's.
  A new book with two or more priced editions gets `variants` (`editionsFor`; price = cheapest, stock = sum); an existing
  book's editions are never changed (warning). Listings whose choices have no price per choice get a note, not
  made-up editions. `htmlToDescription` writes the description toolbar's formatting (`features/site/descriptionLinks.ts`).
  `oldPaths` (per old line) holds the old shop's product addresses. After the import saves, `importRedirects` (plan 3.2)
  adds them to URL redirects as `/books/<id>` (ids survive renames), for created, updated and unchanged books; it never
  replaces an existing redirect, skips the shop's own routes and stops at `MAX_REDIRECTS` with a reason.
  **Plan 7.2:** `handle-rows` is read under the older headings (Handle, Variant Price, Image Src…) and today's (URL
  handle, Price, Compare-at price, SKU, Barcodes, Inventory quantity, Product image URL, Image position, Weight value
  (grams), Variant image URL); each field takes either (the `HANDLE`/`PRICE`/… lists). A file with both Barcode and
  Barcodes reads Barcodes. SEO title / SEO description go to `metaTitle`/`metaDescription` (also plain Import CSV
  columns). `shopMove.test.ts` proves one three-edition book gives the same plan in both layouts.
- **Customers:** Customers › **Bring customers over** (`ShopMoveDialogs.tsx`, lazy) → `readCustomerExport` →
  `planCustomerNotes` (merges into `customerNotes`; `MOVED_MARK` makes a re-run unchanged; tags capped by `parseTags`)
  and `newsletterJoiners` (said yes in the file, not subscribed, not in `marketing-optout`). Joiners are written only
  after the owner ticks the permission box, through `adminApi.addImportedSubscriber` (transaction; never touches an
  existing row; `status: "imported"`, `source: "import"`, `IMPORTED_CONSENT_TEXT`). The note also keeps `name` and
  `place` (plan 23.10), and `withMovedCustomers` lists a brought-over customer with no order here under **Not ordered
  here yet** (segment `moved`, counted in no figure). `saveCustomerNote` merges so a note save keeps them.
- **Photos** stay on the old shop's addresses until plan 3.1b copies them into the shop's own storage.
- **Past orders (plan 23.7, 3 November 2026):** Orders › **Bring past orders over** (`PastOrdersDialog.tsx`) reads the
  order file in the browser (`pastOrders.ts`, headings matched loosely, rows grouped by order number; cancelled, unpaid
  and non-CAD orders left out with a reason) and sends batches of 500 to the `importPastOrders` admin action
  (`functions/orderImport.js`). Only the server writes them: id `PAST-` + a hash of the old reference (`tx.create`, so a
  re-run adds none), `source: "import"`, paid (or refunded) and delivered, `reviewRequestedAt` set, no `shippedAt`,
  `stripePaymentIntentId` or `cartId`. **History only:** `onOrderCreated`, `handleOrderUpdated`, the stockroom link's
  `pushKind` and return requests all skip `source: "import"`, so a past order moves no stock and sends no email. The
  owner (not the bookkeeper) may delete one (`firestore.rules`, `deleteRefusal`). A new order hook must skip it too.
  Other currencies (plan 23.11): `readyToSend` converts every amount at the owner's typed rate and keeps what the old
  shop charged in `paidIn` (the server checks its shape); orders without a rate wait and count in no preview figure.
  Suggested rate (23.14): the `exchangeRates` admin action (`functions/pastOrderRates.js`) averages the Bank of Canada's
  Valet series over the orders' dates; the owner's typed rate wins. Take back (23.15): every run sends one `importBatch`
  (`run-<uuid>`); `removePastOrders` deletes only that run's `source: "import"` orders (400 a call, `more` to continue),
  offered on the result screen and on each imported order (`PastImportUndo`).
- **Your move so far (plan 23.17):** an Overview card under the setup guide (`overview/MoveProgressCard.tsx`,
  `moveProgress.ts`) for a press whose `firstWeek.bring` says it brought its shop. Each bring-over window calls
  `recordMoveStep` after it saves something; ticks live in `firstWeek.done` as `move-*` (the rules cap `done` at 20 keys:
  11 guide steps + 6 here). `recordMoveStep` never creates the doc, so a shop without one never shows the guide.
  Hidden with parts left, the card leaves a "Show it again" line (`adminApi.untickFirstWeek`, 23.19). The server's
  `onMoveFinished` (`functions/moveDone.js`, 23.20) emails the owner once on the change to all done; its rules mirror
  `moveProgress.ts` and `moveDone.test.js` checks the two agree. The email's counts (`moveCounts`, 23.24) are read only
  for that one change. With every part done the card says "You're all moved in" until Closed (ticks `move-list`, 23.25).
  `moveReminder` (daily 10:00 Toronto, 23.26) sends one email per stall of 7+ days, within 60 days of Get started,
  marked in `systemStatus/moveReminder` before sending. The links step opens `#settings/general/visitors` and scrolls
  to `gs-redirects`: the Overview's page switch can't reach a Settings sub tab.
- **A new rate for orders already here (23.23):** `importPastOrders(…, { rerate: true })` re-rates only orders the server
  made (`source: "import"`) with the same `paidIn` currency and amount; only the CA$ fields and `paidIn` change.
- **Several order files (23.27):** `PastOrdersDialog` keeps a list of chosen files merged by `mergePastOrderFiles`
  (one batch for all, so one take-back). "You're all moved in" shows `adminApi.movedCounts` (23.28), the client twin of
  `moveCounts` in functions/moveDone.js.
- **Discount codes (23.30):** Discounts › Bring codes over (`DiscountMoveDialog.tsx`, reader `discountMove.ts`) saves
  each code through `adminApi.saveDiscount` (same shape check as the editor). Not one of Your move so far's five parts,
  so finished moves stay finished.
- **Next file, file name, one order's rate (23.32-23.34):** the result screen's "Bring another file" resets to the
  chooser (choosing starts a new batch). Each order carries `file`, kept as `importedFile` and shown on its page.
  `ratePastOrder` (action in adminReports.js, `ratePastOrder` in orderImport.js) re-rates one `source: "import"` order
  from `paidIn.total` (total exact, other CA$ fields scaled); `PastOrderRate` on OrderDetail calls it. In move mode the
  admin fixture has one brought-over order, `past-1004`, and `getOrderById`.
- **Spreadsheets (23.35):** every file picker uses `SPREADSHEET_ACCEPT` and reads through `spreadsheetText()` in
  `spreadsheetFile.ts` (CSV/TSV text in any common encoding, .xlsx, .ods, and .xls via `xlsFile.ts` since 23.40 → CSV text); show errors with `readProblem(err)`.
  A new bring-a-file window must do the same. Test files made by real programs live in `testdata/spreadsheets/`.
- **Google Sheets (23.42):** put `<GoogleSheetLink onFile={(f) => choose(f)} />` beside a window's file button. It renders
  nothing unless the shop's Google account is linked, and hands over a stand-in `File` that `readSpreadsheet` reads
  through `readThrough` (another tab asks Google again), so the window needs no other change.
- **Match columns (23.36):** Books import keeps the owner's matches for unknown headings in `columns` state and passes
  them to `planImport({ columns })`; `mapHeadings` ignores a match for `id`, for a field a known heading already fills,
  or for a field matched twice. Choosing a new file starts from the matches remembered by `columnMemory.ts` (23.41, this
  browser only, saved when the import runs) for its unknown headings.
- **Sheets (23.37):** a window that reads one file uses `readSpreadsheet(file, sheet)` and shows `<SheetChoice>` beside the
  file name (renders nothing for one sheet or a text file); changing it calls the window's `choose(file, sheet)` again.
- **Excel downloads (23.38):** `xlsxWriter.ts` `toXlsx(rows, sheet)` / `saveTable(base, csv, format, sheet)`; a new table
  download should offer Excel first and CSV second the same way (Books › Export… is the pattern).
- **First rows (23.39):** keep the `readSpreadsheet` result (`{ file, ...read }`) in state and render `<FirstRows text>`
  under the file row; it stays folded so the window keeps its lean look.
- **Whole move on screen (23.22, in CI since 23.29 as `pnpm run test:move` in the `shop-admin-phone` job):** `node scripts/move-check.mjs` (`CHROMIUM_PATH`, `MOVE_SHOTS=dir`) drives
  `admin-fixture.html?move=1` with the demo's sample files and answers the old-shop server actions in the script.
  Extend it when a bring-over window changes. The fixture's dev-only `__fixtureIdToken` lets `oldShopApi.ask` run
  without Firebase sign-in.

## Set up your shop (28 October 2026, code plan 6.3 and 6.9; was Your first week, 3.3)

Both read the admin-only `firstWeek/start` (`adminApi.getFirstWeek`) that the platform's setup step 12 writes once
(`sellingToday`, `publishes`, `country`, `plan`). No document, nothing shown: shops made before this, or by hand, never
see either. `overview/SetupStart.tsx` (rendered at the top of the Overview by `AnalyticsDashboard`) picks which:
- **Choose your look** (`overview/ChooseLookWelcome.tsx`, pure parts in `lookGallery.ts` (re-exported by `chooseLook.ts`, which also saves the look), lazy-loaded): while
  `welcome` is unset and the plan has a shop. A gallery of every `THEME_LIBRARY` theme (name, mood, three swatches,
  `LookPicture`: a small drawing in the theme's own colours and type with the press's name in the header; Preview opens
  it at phone or desktop width), two or three suggested per `publishes` (`SUGGESTED`). Use this look runs
  `applyChosenLook`: `openWorkspace` → Studio's `applyLook` (so `themeBase` is stored, as Studio › Themes does) →
  `saveDraft`, retried once on a conflict; then `updateFirstWeek({ welcome: { theme, at, skipped? } })`. Skip takes the
  first suggestion. The look goes into the **draft**; the guide's look step ticks once the published design has a
  `themeBase`. The preview is drawn, not a screenshot, so every theme has one by construction (`chooseLook.test.ts`).
  **Theme store (4 November 2026):** cards show a whole shop page (`overview/LookStage.tsx`: announcement, header,
  the template's own opening band and cards, chips, footer, drawn at 1200px or 390px and scaled by `ScaledStage`),
  filters All / Full templates / Light / Dark (`filterLooks`, `isTemplate` = own `themeStyle`, `isDarkLook`), and Try it
  on opens a full-size `Dialog` (`size="full"`): Previous/Next look (and arrow keys), Computer/Phone, Home/Product page,
  Your products/Samples (`sampleProducts(publishes)` when the press has none). Each look's faces load from Google Fonts
  once (`useLookFonts`). Drawn, not the real storefront, because setup mode has no shop to render.
- **Set up your shop** (`overview/SetupGuideCard.tsx`, pure `firstWeek.ts`; regrouped 4 November 2026, plan 28): one
  order for every answer, in three parts (`GROUPS`), Shopify-style: **Your shop** (the first-book step, `bring-books`,
  `import-spreadsheet` or `add-books` per answer; logo; look), **Ready to sell** (shipping, starter words per country,
  `shippingStarterWords`; taxes, Ready to sell's `tax` ok: rates set or collection off; Get paid, `card-account` ok on
  platform shops, plan 7.9, the payment checks on own keys; store policies, Ready to sell's `policies` ok), **Launch**
  (web address, optional: custom domain, or the owner ticks "Keep the free address"; practice order, an `isTest` paid or
  refunded order, plan 7.6, done once the shop is open; Open your shop, no wall, no maintenance). Rule: every Ready to
  sell `block` row has a step before Open your shop (firstWeek.test.ts). Rows are the setup-mode guide's accordion:
  `nextStep` (first open non-optional) opens by itself, any other row on a click, each part shows done/total (every row
  counted). Then **Reach more shoppers**, optional: Google (`#settings/google`, ticks on `firstWeek.google.connected`)
  and social media (ticked by hand). Optional steps never keep the guide on Home. A step with `hash` + `anchor` opens a
  sub tab and scrolls to a card (`jumpWhenShown`): policies and web address → `#settings/general/details`. Taxes is
  tickable ("I don't collect tax yet": with no rate no tax is charged). Gmail is
  never a step. **Open your shop** runs `openBlockers` (Ready to sell's `block` rows) and, when none, Dashboard's `toggleUnderConstruction(false)`
  (passed down as `onSetWall`). The `online` answer has a ninth step after it, **Move over from your old shop**
  (`switch`, ticked by hand, plan 23.8), opening Settings › General where **Check your old links** sits under URL
  redirects (`OldLinksCheck.tsx`, pure `oldLinks.ts`; the server's `readOldLinks` action reads the old shop's site map
  with `functions/moving/oldLinks.mjs`, a generated copy of `services/moving/oldLinks.js`). Its **Bring your own pages
  over** (plan 23.6) asks `readOldPages`, which rebuilds each old page with the allow-list in `services/moving/oldPages.js`
  (copied as `functions/moving/oldPages.mjs`); `pagesToSave` makes the drafts and redirects and never reuses a page's address. Pictures on public https addresses stay as `<img src alt>` and the hourly photo import copies them and rewrites `pages/*.body` (plan 23.13, `swapPagePictures`). The guide saves `progress { steps, done, at }` whenever it changes (`progressToSave`)
  for the platform's trial emails (plan 6.10, `services/trial-tips`). Steps missing from the saved `progress.steps`
  are new to that press (`addedSince`, fixed when the card mounts, since saving progress makes them old): they get a
  New tag and one "N new steps" line, and a hidden guide comes back for a needed one (`showFirstWeek`'s `added`).
  A done row opens on a click (to Change it); a row that gets done while open gives way to the next step.
- **Board look (10 November 2026, design handoff "Shop setup (bento)"):** the guide, `ShopOpenedCard` and setup mode's
  Home draw with `overview/setupBoard.css` (`.rp-sb-*`, tokens only, so every admin look keeps its own corners and type):
  the next step on the ink tile (`rp-sb-next`), an **Open your shop** tile listing `openBlockers` (Open my shop stays off
  while any remain), one tile per part. Rows here no longer open by themselves (the Next tile carries the action);
  setup mode's rows still do. Shop-open card says "<name> is open." and, for `sellingToday: "online"`, Check your old links.
- **Next step + progress (10 November 2026, design handoff "Colophon platform"):** the guide (Overview) and setup mode's Home lead with the Next step tile and `overview/ProgressTile.tsx` (ring, steps to go, Private now / Live), and keep the grouped list behind **See all N steps** (collapsed). Setup mode's Home no longer has the "Selling somewhere already?", "Once your shop is made" or "Need a hand?" tiles; the sign-up answer picks the next step (`nextGuideStep`). The store is made at sign-up (join/: three questions, terms, **Start my free trial** with plan `both`, then the "Setting up your store…" overlay from `signup/making.js` until the way in is ready); the plan is changed later in Billing. Not built yet from that handoff: the store switcher, a Launch checklist page, empty states, the trial banner, "brand/products" wording.
- `SELLING_TODAY` must list the sign-up form's answers and `StepId` must match `help/articles.js` `CHECKLIST_ANSWERS`
  (root tests check both). Firestore rule `firstWeek`: admin only, `hasOnly([... "publishes", "country", "welcome",
  "progress" ...])`, the four sign-up fields never change from the admin, `welcome`/`progress` shapes checked. The
  Overview's "designer" link opens Settings › Design (Dashboard maps it like general/notifications/taxes).

- **What you sell** (plan 10.1, `sells.ts`): sign-up's "What do you sell?" (`firstWeek/start` › `publishes`). Book
  answers (books, zines, comics, mix), a skipped or unknown one change nothing. Any other answer: Choose your look's
  suggestions for it (`lookGallery.ts` SUGGESTED, keys in the form's order, checked by `setup/later-steps.test.js`),
  starter Text & labels words put in the draft by `applyChosenLook` under the owner's own (`withStarterWords`), new
  products start as `startingKind` (BookEditor, also in `initialData` so it isn't an unsaved edit) and the guide's
  first-product step. A new shopper word with "book" in it needs a starter word in `sells.ts` (or `BOOK_ONLY_COPY`
  when it only shows for books); `sells.test.ts` fails otherwise.
- **Admin words** (plan 10.23, started): `adminWordsFor(answer)` is identity for a books shop and `goodsWords` (book →
  product, author → maker; e-book, bookkeeping left alone) otherwise. Dashboard provides it as `ShopWordsContext`
  (`shopWords.tsx`, `useShopWords()`); the menu, page titles, the product list and the product editor use it (the
  editor follows the product's own kind). Wrap new admin words with `w(...)` on those pages.

## Get started: your press first (29 October 2026, code plan 17.1 to 17.4, 17.8, 17.10, 17.11 and 17.13; redesigned 11 November 2026)

The first-visit run at the top of a new shop's Overview (`overview/SetupStart.tsx`) is **Get started**. **The order lives
in one place**, `startRun.ts`: `nextRunStep` picks the step, `runSteps(platform)` lists the steps this press walks (five,
or six with Get paid) and `RUN_LABELS` names them. `overview/RunProgress.tsx` draws the mint progress strip above the
step's card (every step as a pill on desktop; "Step N of M · name" and a bar on phones; CSS `.rp-run*` in
`shared/admin-look/pressroom.css`). Step cards carry a plain title only; the number lives in the strip.

- **Your brand** (`PressDetailsStage.tsx`, `pressDetails.ts`, 17.2): name, email, ship-from address, written through
  `adminApi.updateSettings` (`info`, `location` only). Records `details: { at }`.
- **Your products** (`BringShopStage.tsx`, `bringShop.ts`, 17.3/17.4): "Where do you sell now?", the plain steps, then
  the Books importer. Records `bring: { at, from?, skipped? }`.
- **Your look** (`ChooseLookWelcome.tsx` or `SignupDesignStage`, 17.8). Records `welcome`.
- **Get paid** (`PaymentsStage.tsx`, `paymentsStage.ts`, 17.10): only when cards go through the platform. Records
  `payments: { at, ready? | skipped? }`; the final check keeps the card blocker.
- **Shipping** (`ShippingStage.tsx`, `shippingStage.ts`, 17.11): "Ships from" on one line with Change, then the country's
  starter. A shop that already has a profile **and** a full address passes the step by itself (records `skipped: true`
  once; a failed save shows the card with Continue), so the press never reads a "nothing new is added" screen.
- **Open your shop** (`FinalCheckStage.tsx`, `finalCheckStage.ts`, 17.13): the `openBlockers` as a hairline list with a
  fix each, the web address (`publicAddress`) with Change, the practice order (recommended), Open my shop / Finish later.

**Google left the run (11 November 2026):** it is optional and the Overview's own Connect Google card
(`ConnectGoogleCard variant="prompt"`) asks for it, so the step that mostly said "coming soon" is gone (GoogleStage.tsx
removed; `help/articles.js` `RUN_ANSWERS` and `services/trial-tips/startNudges.js` follow). Older documents keep their
`google` marker; the setup guide still reads it. Your stockroom is the stockroom's own one-screen check, not part of this run.
Fixture: `admin-fixture.html?start=details|bring|look|shipping|final&page=overview`.

A shop with a `welcome` already, or no `firstWeek` document, never sees the run.

**Phase 18 rule (planned on main):** a press gets its own backend only at launch. Every write above goes to
`firstWeek/start` and `settings/website` of the shop that already exists. Phase 18's setup mode (18.6 and 18.7) moves
these writes to the press's record in the platform project before the shop opens, through one adapter; the stages
themselves don't change.

## Going live on Colophon (28 October 2026, code plan 2.10)

- `launchReadiness` takes `platformCards` (default `platformCardsProvider()` from the shop profile) and `platformAccount`
  (the platform's `account.status`, loaded by the Overview with `adminApi.platformPayments("status")`; null when it
  couldn't be read). A platform shop gets a `card-account` row (block until the press's Square or Stripe account is
  connected and can take cards) and none of the key, deployment or Hosting rows: Colophon deploys its shops.
- Settings › Taxes › Start from a preset (`taxPresets.ts`): `applyTaxPreset` adds a rate only for a province with none
  (country and region compared without case), in the draft. Rates are as of October 2026 and the card says "Not tax
  advice". Shipping presets are the new-profile starters (`shippingProfileStarters.ts`). Plan 5.10: four Canadian presets
  (printed books, e-books, other goods, other goods with provincial sales tax). One rate per place covers the whole order, so
  each is for one kind of goods and a provincial rate is GST plus PST/RST/QST in one (book names `GST + PST BC`,
  `GST + PST SK`, `GST + RST MB`, `GST + QST` from `shared/taxBooks.ts`). How each tax treats printed books and e-books,
  with the official sources, is in the header of `taxPresets.ts`. No US states.
- Settings › General › Store policies › Start from our wording (`starterPolicies.ts`, plan 7.5): shown only under an
  empty policy; fills it with the shop name, Location address, contact email and the returns window book pages already
  give search engines (Text & labels › `seoReturnDays`, 0 = no returns after shipping). `withStarter` re-reads the draft
  and keeps any saved words. The card says "A starting point, not legal advice"; the four texts await a lawyer's read.
- Settings › General › Your web address (`CustomDomainCard.tsx`, plan 2.9) shows the older "Domain & visibility" field
  when the server answers `not_available` (no `PLATFORM_DOMAINS_URL`). Plan 5.9: "Your main address" line, **Make main** on
  a live address and **Remove** on any address but the main one, each behind a confirm (`domainActions` in
  `customDomains.ts`; `CustomDomainCard.test.tsx`). Going back to the shop's own address is a button under the main line.
- Settings › Payments › Card payments (`PlatformPaymentsCard.tsx`, plan 2.2b) replaces the Stripe keys card on platform
  shops.
- **What Stripe still needs (plan 7.9):** `account.status` carries `needs: [{ words, pastDue }]` (plain words made by
  the platform, `services/payments/requirements.js`), `deadline` and `pastDue`. `needsLine` (platformPayments.ts) says it
  ("Stripe needs your bank details by 12 November."); the card shows it above one **Continue with Stripe** button that
  asks for a fresh Stripe page on every press (Stripe's links work once and are never emailed). The `card-account`
  readiness row ticks only once `paymentsReady` (cards and payouts). While something is past due, `cardAccountAlert`
  (adminAlerts.ts, action `cardAccount` → Settings › Payments › Ways to pay) puts a banner on every admin page; the
  Dashboard's 5-minute alert check reads the status for Stripe platform shops. The platform emails the owner once.
- QuickBooks (`BookkeepingSettings.tsx`, pure `quickbooksLink.ts`, plan 7.16): Connect to QuickBooks in three
  steps (sign in with Intuit, one line per day or every order, match taxes and five accounts), then last day sent, Send
  again and Disconnect. **It lives in the app store (Julian, 12 November 2026):** Settings › Apps shows a built-in
  QuickBooks card (Open, or Coming soon until `adminApi.bookkeeping("status")` says `enabled`) and, once connected, a row
  under Installed with Manage. Open shows the steps on the Apps page at `#settings/apps/quickbooks` (sub tab `quickbooks`);
  the old `#settings/bookkeeping` is an alias for it, and Intuit sends the press back there. No menu lists it elsewhere.
  Fixture: `admin-fixture.html?page=settings/apps` (`&qb=off` or `&qb=connected`). The button is text only ("Connect to QuickBooks"), as
  Intuit asks; the admin has no French yet, so there is no French label. Tax names are each rate's `bookName` (plan 7.11)
  or "Tax <place>" until then.


## Bookkeeper role (28 October 2026, code plan 7.17)

Team role `bookkeeper` (Settings › Team, or the platform's account page): reads the money and changes nothing.
- **Rules:** `isBookkeeper()` in `firestore.rules` (verified pass, `role == "bookkeeper"`) appears only in three read
  rules: `orders` (get, list), `giftCards`, `analytics`. Never books, customers, newsletter, settings, keys, the Team or
  any write (`securityRules.test.ts` and the emulator script check). `isAdmin()` never names it.
- **Server:** `adminRole` ignores it, so every `requireAdmin` action refuses it. `requireBooksReader` (`roles.js`
  `booksReader`) lets it in only to `platformPayments` step `status` (payouts on or paused, the fee); `connect` stays
  admin-only.
- **Admin:** `Dashboard` asks `adminApi.bookkeeperSignIn()` before setting `user`; a bookkeeper gets
  `BookkeeperDesk.tsx` (period sales, tax and shipping collected, payouts, Orders and Sales report CSVs) and never the
  admin shell, so none of the admin's reads run. `bookkeeping.ts` (pure) blanks shoppers' and gift card recipients'
  email addresses in its downloads. A first sign-in learns the role after `login()` refreshes the pass (`onLogin`).
- **Stockroom:** the same role reads the tax centre's key-free copy (`apps/stockroom/src/lib/bookkeeper-copy.js`).

## Download for another shop system (28 October 2026, code plan 7.18)

Settings › General › Backups & export › **Download for another shop system** (`BackupsExportCard.tsx`, pure builders in
`shopExport.ts`). Books: one line per edition, extra photos on their own lines, in the older handle-rows headings
because those are what `shopMove.ts` reads (`shopExport.test.ts` round-trips the file through `planShopMove`); move to
the newer headings only together with shopMove. Gift cards stay out. Customers: buyers from orders plus newsletter
sign-ups; "Accepts Email Marketing" is yes only for a current subscriber who has not opted out. Words on screen never
name another system. The stockroom's matching stock file is `apps/stockroom/src/lib/stock-locations.js` (7.19).

## Download your shop (10 November 2026)

Settings › General › Tools › **Download your shop** (`DownloadShopCard.tsx`; also in the cancel step and on the paused/closed
`PlanDesk`). One click builds a zip in the browser from this shop's own admin reads (`takeoutRun.ts`, nothing leaves the
page): `products/` in four layouts (Shopify = `shopExport.ts`, WooCommerce, Squarespace, Big Cartel = `shopTakeout.ts`, each
read back by `shopMove.ts`; `shopTakeout.test.ts` round-trips them), `customers/`, `orders/`, `pages/`, `settings/` (private
keys stripped), `backup/books.json` and `images/` (`takeoutPhotos.ts`, best effort, 400 MB cap; `images.csv` lists any left at
their web address). The browser can read the photos only because the shared bucket answers reads from any address (readying step 8, `setup/sharedProject.js`, `photoAccess` in `clients/google.js`); a project readied before that needs the readying run again. Screen words say "another shop system"; only the files inside the zip name a system. It writes one
`export` audit-log line ("Downloaded the whole shop…") that the control room reads. The emailed server copy
(`services/export`) stays for closed shops' 90 days and privacy requests. A new layout = a writer in `shopTakeout.ts`, an entry
in `takeoutFiles`, a round-trip test.

**Back up to a folder (10 November 2026):** `LocalBackupCard.tsx` (Settings › General, under Download your shop) and
`localBackup.ts`. The press picks a folder once (File System Access, Chrome and Edge only; the handle lives in this browser's
IndexedDB, the plain facts in localStorage `lm:local-backup`); `backUpNow` builds the same files as the zip (`buildTakeout` in
`takeoutRun.ts`) into a dated sub-folder, replaces a same-day one and keeps the newest 7 of our own `shop-backup-…` folders only.
`LocalBackupAuto` (mounted in Dashboard) runs it quietly once a day when the toggle is on and the browser still allows the folder;
otherwise the card asks for a click. Copy always says the shop is also backed up in the cloud. One `export` audit-log line
("Backed up to a folder on the computer: …") feeds the control room's Took their data.

## Import keeps sizes and colours (plan 10.6, 29 October 2026)
`shopMove.ts` reads each version's choices by the old shop's option names (`picksOf`) and gives the product
`options` only when every version picks one value of the same options and no two versions match (`optionsOf`).
`planShopMove(…, { keepOptions })` writes them (`options` + `variants[].options`) only for a shop that doesn't sell
books: `BookImportDialog` reads the sign-up answer from `ShopSellsContext` (Dashboard). A books shop keeps today's
editions list, so an old shop's "Format: Hardcover" never turns into option buttons. `productsForAnotherShop` writes a
product's own Option1–3 Name/Value (names on its first line), so the export and import round-trip.

## Messages from Colophon (plan 19.14, 2 November 2026)

The platform's control room writes the admin-only `platform/messages` document (`{ messages: [{ id, words, level,
startsAt, endsAt }] }`, rules: admins read, no browser writes). `PlatformMessagesBar` (`PlatformMessagesBar.tsx`, under
`PlanBannerBar` in `Dashboard.tsx`) shows each message between its dates as an `rp-alert` banner over every admin page
(important ones in the warning tone), at most three, with Close kept in `localStorage` (`platformMessages.ts`
`pickPlatformMessages`, tested in `platformMessages.test.ts`, which also checks nothing outside `app/admin` reads it). The
storefront never imports it. Admin-only words, Studio-free.

## Setup mode (code plan 18.6, 3 November 2026)

The admin a press meets before its shop exists, served by the platform at `/app/` (`setup.html`, `src/setupMode/`,
built by `pnpm run build:setup` with `vite.setup.config.ts` into `dist-setup/`; the walkthrough serves it at `/app/`).
- **No shop database.** `main.tsx` signs in with the platform's own account (it loads `/signup/config.js` and the
  Firebase SDK the front door uses, so the front door's sign-in carries over) and never imports `../main`,
  `lib/firebase` or `adminApi`. Every answer goes to the press's setup record through `door.ts` (`GET /api/press`,
  `POST /api/press/setup`); the shop maker (18.9) carries it into the new shop.
- **Same shell and menu** (`pages.ts` `setupMenu` is `sidebarItems(NAV)`, nothing added): Plan stays under Settings, as in
  the open shop, and Help is a sidebar-footer button (`#help`). Home is the
  setup guide; Design (the Choose your look gallery), Settings › General, Settings › Plan and Help work; every other
  page is `OpensWithShop` and writes nothing. Pages live in the address (`#settings/general`); an address that names no
  page (the skip link's `#rp-main`) leaves the page alone, so nothing typed is lost. General saves only the fields that
  changed, so an answer saved meanwhile at the front door isn't written over.
- **Look gallery without the database:** `lookGallery.ts` holds the pure gallery parts; `ChooseLookWelcome` takes
  `apply` (setup mode passes one that does nothing) and loads `chooseLook.applyChosenLook` only when it isn't given.
- **Open my shop (18.8):** Settings › Plan ends with `OpenShopCard`: a terms tick (version from `/api/plans`
  `termsVersion`) and one button calling `door.openShop` (`POST /api/press/open`). The press then reads "Your shop is
  being made" and the top-bar button goes away. A refusal shows in plain words and the press stays in setup.
- **Books (18.7):** `setupMode/ImportPage.tsx` reads a product file in the browser (`planShopMove` with no books), shows
  the first 150 rows, problems first, with `importPreview.tsx` `ImportPreviewRows` (also used by `BookImportDialog`), then
  keeps it through `door.keepImport` (upload link from `POST /api/press/import`, a PUT straight to storage, then
  `/import/kept`). Each upload has its own path (`pendingImportPath`) and becomes the kept file only on `/import/kept`. The guide's
  Bring your books step is optional: counted only once a file is kept. The shop maker (18.9) brings it in.
- **First landing (4 November 2026):** Home's guide is an accordion (the next step open with its why, button and "How this
  works" help link from `pages.ts` `STEP_HELP`; any step opens on a click), then "Once your shop is made" (trial days
  only from `/api/plans`) and "Need a hand?" (`SETUP_QUESTIONS`, ask a person via `accountUrl`, default `/account/`).
  A "You're ready" card tops Home once only Create is left; the opened step is remembered per press for the visit
  (sessionStorage). On a phone the welcome title is smaller (`.rp-setup-home`, `setupMode/setup.css`). Locked pages say what they will do (`lockedPageLine`; pages.test.ts fails a locked menu page without a line) and lead
  back to the guide. Help ids are checked against `help/articles.js`.
- **Help in place (4 November 2026):** `main.tsx` loads the platform's `/help/articles.js` (one copy) into
  `SetupHelp.tsx` `helpAnswersFrom`; step help, Need a hand? and Help open answers in place, falling back to help-centre
  links when they didn't load. Help's **Ask a person** (`AskForm`, `id="ask"`) sends `door.askForHelp` →
  `POST /api/support/open` (no shopId: a press in setup has no shop; the body notes the press name), one request id per
  try so a retry makes one request.
- **Plan words:** free days are promised only when `/api/plans` gives a trial, and as "your first shop"
  (billing gives one trial per account). Prices that fail to load say so with Try again.
- **Hand-over and the making (code plan 18.9, 4 November 2026):** setup step 20 writes `firstWeek/handover` (look,
  admin look, kept file as `parts/<n>` pieces; rules: admin read, never written from a browser). `setupHandover.ts`
  reads it; Get started's bring step offers the kept file to `BookImportDialog` (`initialFile`), the look step passes
  `chosen` to `ChooseLookWelcome` (the setup look alone, See every look for the rest). A shop without a hand-over, or
  one that can't be read, runs Get started as before. A file that arrives after the bring step shows on `KeptFileCard`
  until `done.setupFile` (the bring step sets it too when it offered the file). In setup mode an `opening` press stays on Settings › Plan, where
  `CreateShopCard` asks `door.presses()` every 5 s (`making`: done of total, now) until the record is `open`, then
  shows Open my shop's admin (`openUrl`); `making.canRetry` adds Try again (`door.retryShop`). Every page but Help shows
  the timeline once the press isn't in setup.

## One admin for shop + stockroom (3 November 2026)

A shop whose profile has both apps gets the combined admin: `combined.ts` (`combinedAdmin`, `STOCKROOM_PAGES`),
`riso/nav.ts` `COMBINED_MENU`, `StockroomFrame.tsx` (the stockroom's pages, framed from `/stockroom/app` on the shop's
own address, kept open once opened), route `#stockroom/<page>`, and no Website · Inventory switcher. Shop-only shops keep
`MENU`. Full notes and the next steps: LMB-PLATFORM `docs/combined-admin.md`. A new stockroom page in the menu goes in
`STOCKROOM_PAGES` and `COMBINED_MENU` (combined.test.ts checks every page is listed once and exists in the stockroom).
Other pages ask the stockroom through `stockroomBridge.ts` (`ask`, `openBook`; the frame opens hidden on first need):
the book editor's **Stock and sales** tab (`StockroomBookPanel.tsx`, combined admin only) reads one book's figures from
the stockroom's own `bookSummary`, never from a copy here, and matches an unmatched book with `linkNewBook`.

## Sales channels and Social posts (plan 27.5-27.7, 4 November 2026)

Design and rules: `docs/social.md` (platform root). `SalesChannels.tsx` (tab `channels`, under Books in both menus) and
`SocialPosts.tsx` (tab `socialPosts`, under Orders; Marketing in the combined admin) share `socialChannels.ts` (pure,
tested). They call `adminApi.social(step, args)` → `functions/socialLink.js`. `#social-posts/book/<id>` opens the
composer on a product (Books › row › Post to social). Keep words lean (Julian, 4 November 2026): one short line per
card, no explanations the badge or button already gives. Screens: fixture `?page=channels` / `social-posts`.
Round two (4 November 2026, plan 27.10-27.12): Overview widget `social` ("Social media that sells", `socialPerformance`
in `overview/overviewTraffic.ts`, on the Marketing board), the composer's Square picture toggle (`square`, on by
default; `functions/socialPicture.js`) and the Shop alerts switch `socialPostFailed`.

## Partner company logos (4 November 2026)

A card or dialog about one outside company passes `logo` (`SectionCard logo="quickbooks"`, `Dialog logo={["instagram", "facebook"]}`); the logo sits on a white tile before the title in every look, day and night. Google sign-in uses `GoogleSignInButton` (Google's own style and words). Logos come only from `shared/brand-logos` (README there: sources, owners, rules); never redraw or recolour one, and never show a rival shop builder's.

## Design before the store (10 November 2026)

Sign-up's **Design my shop first** (join/) saves the answers (no terms, no store) and opens `/design/studio?press=<id>`:
the real Studio (`StudioEditor beforeShop`) with sample products, built by `vite.design.config.ts` into `dist-design/`
(site/build.js copies it to `/design/`; `/design/**` is the storefront the preview frames). `src/designFirst/beforeShop.ts`
is its draft store: every save goes to the press record's `design` (signup/pressRecord.js, ≤400 KB) through
`POST /api/press/setup`; parts that need a real store say `WITH_YOUR_STORE`. Studio autosaves there, hides Publish,
Save draft, Discard, Schedule and View website, and Done saves then goes back to join/. Setup step 20 hands `design` over
in `firstWeek/handover`; Get started's look step (`SignupDesignStage`) publishes it (the shop is still private) and
records `welcome { theme: themeBase id or "custom" }`, with Try again or **Pick a look instead** on a failure.

## Every combination (11 November 2026)
A product sold in options (`usesOptionPicker`) gets **Every combination** on the Editions tab (`VariantGrid.tsx`, pure
`variantGridRules.ts`): figures (combinations, in stock, sold out/low, price range), Set price / Set stock for every row
(stockroom-counted stock left alone, `fillEvery`) and one row per combination with price, SKU and stock. Edits go into the
editor's form and save with it (`updateBook` still keeps live stock). The long card per combination opens on request.
The Editions tab sits under `ShopWordsContext` with the editor's own `w`, and `goodsWords` turns edition(s) into
variant(s), so a non-book product reads Variants. Inventory rows carry `sku` (shown, searchable). Server stock and holds
per combination: `functions/productVariantsStock.test.js`. Fixture: `admin-fixture.html?variants=1&page=catalog/book/tee`.

## Design page (redesign, 11 November 2026)
The menu's Design / Online store item opens `design` (`DesignHome.tsx`, pure words in `designPageWords.ts`, `#design`), not
Studio: a mint tile with the live look (`design.themeBase.name`, `designPublishedAt`), an apricot tile with the changes
waiting (`diffDesigns` of the live design against `openWorkspace`'s draft, both through `normalizeDesign`), and Pages
(Home, then `getPages` with Live or Draft; a row opens Studio at `heroPage` / `page:<slug>`). Open Studio and View site
sit by the title. Studio (`settings/designer`, `#designer…`) is on no menu item; its links still open it directly, and
leaving it returns to `design`. Fixture: `admin-fixture.html?page=design`.

**Setup mode in the v4 shell (12 November 2026):** `src/setupMode/SetupAdmin.tsx` wears the open admin's v4 shell: the
flat rail with the Website · Stockroom switch (`setupMenu(side)` = `sidebarItems(NAV, sideMenu(side))`, `setupSide`),
one page header above the page, the item's pages as pills (Settings: the grouped column, `itemSections`), and General,
Payments and Plan as form kit pages (`SetupForm`: `FormPage` + `CardsAsSections`). Pages don't draw their own header
(Home keeps its welcome). Stockroom pages are locked and say what they hold (`lockedPageLine` falls back to the page's
description in `combined.ts`).

**Order detail as a page (12 November 2026, v4 mockup 1b):** an open order is its own page on every width
(`OrdersDesk` shows only the detail when an order is selected; Back returns to the table). `OrderDetail` sets the
shell's header with `PageHead` (order number, customer · date, ← Orders) and puts prev/next, Print packing slip and ⋯ in
`PageActions`. The workbench's step bar is Paid → Packed → Shipped → Delivered. A `StatusBar` says the next step
(`orderNextStep.ts`, pure and tested) and its button runs the same action as that step's own button (address review,
pack, dispatch, delivered); a label or a wrong address takes you to its step. The desktop Ship station side-by-side
view is gone; phones keep their list.

**v4 form kit (12 November 2026, Julian's mockups v4):** form pages use `riso/FormKit.tsx` (FormPage, FormSection, FormField,
SummaryRail, StatusBar). A page built from many SectionCards takes the kit look by wrapping them in
`<CardsAsSections.Provider value>` (`riso/components.tsx`): each card then draws as a kit section, and the older
TextField/SelectField inside take the kit's field look (`pressroom.css`). The product editor is its own page now (Dashboard renders
it in the content slot, not an overlay): tabs Details (every former tab as a section, one scroll; `goTo` scrolls to a field or
`[data-be-section]`) and Stock and sales (combined admin), a mint You keep rail and one StatusBar. Sub-pages with a back link use
`PageHead`; the shell hides the group's page list for them (`data-sub`).

**Settings form card (redesign, 11 November 2026):** `SectionCard bodyClassName="rp-formrows"` lays its TextField /
TextArea / SelectField children out as rows (label and hint left, control right, hairlines; stacked on phones; CSS in
`shared/admin-look/pressroom.css`). General opens on **Your press** (`gs-details`, first in `SUB_TABS`, so
`#settings/general` opens it and the store status tab is `#settings/general/store`): name, email, about, then the
ship-from address (anchor `gs-location`), then web address, What you sell, policies.

**Order page in Colophon (redesign, 11 November 2026):** restyle only (the mockups have no order page). Colophon-scoped
rules at the end of `fulfillment.css` (workbench clips to its rounded card, the active step is no longer a sunken band,
strip steps are rounded `--rp-surface-2` tiles with the current one ringed in `--rp-primary`, desktop only: phones keep
the tab strip) and in `OrdersDesk.tsx`'s inline CSS (queue `.od-list` is a borderless rounded card, the open row a
rounded tint with no edge bar, list headings in body type).

**Till payment sheet (12 November 2026, v4 mockup 1j):** the Till (`stockroom/TillPage.tsx`) has one **Charge <total>**
button; it opens `PaySheet` ("Take payment"): How they pay (`SHEET_PAYS`: Cash, Card reader, QR, Other = e-transfer or
free copy), and for a one-currency cart Exact / 20 / 50 / 100, Cash given and a Change due / Still to pay tile
(`cashChange`, `till.ts`). Charge runs the till's own `charge(method)` (queue, Undo, upload unchanged) and waits while the
cash typed is short. The stockroom app's own till has the same sheet (`apps/stockroom/CLAUDE.md`).

**Home in v4 (12 November 2026):** To do tiles (`RunTiles`, `OverviewParts.tsx`) take their tone from the job's kind
(`todoTone`: Orders mint, Sales apricot, Payments white, Stock sky, the rest lilac) and have **Mark done**, which hides a
tile in this browser while its count stays the same (`lm:home-done`, `{ "<kind>|<label>": count }`); nothing left shows
the mint All clear. Shop + stockroom: **Both sides at a glance** (`GlanceTile` in `HomePage.tsx`): orders to pack, items
low or out of stock (`stockroomGlance`: the Stock page's `needAttention`, opens Reorder) and owed by stockists
(`buildStockists().owed`, opens Stockists), read from the same records load as the stockroom to-dos. Home's header has no
buttons (the till is in the rail foot and the Selling today tile).

**Bulk bars on the lists (12 November 2026, v4):** Orders (`OrdersDesk.tsx` list) and Products (`BookCatalog.tsx`) have a
tick box per row and a header box (the rows shown; indeterminate when some are ticked). Ticking shows a bar inside the
table card: Orders "N selected · Mark packed · Clear" packs only `packableOf` orders (queue "Ready to pack") one by one
through `fulfillmentAction(id, "pack", { packingKey })`, toast "Nothing to pack in the selection" when none are; Products
"N selected · Set as draft · Clear" writes only `status: "draft"` through `updateBook(id, patch, loaded)` (the editor's
transactional save, `draftableOf` skips drafts). Failed rows stay ticked. The mockup's **Mark sold out** is not built:
the shop has no sold-out switch and stock counts belong to the stockroom (`lockLinkedStock`).

**Stockists in v4 (12 November 2026):** `stockroom/StockistsPage.tsx` opens with three tiles from `stockistsSummary`
(`stockists.ts`, pure): copies out (sky), sold not paid yet (apricot: `view.owed` and the pending, non-voided ledger
sales' copies) and settled this year (mint: invoices marked paid, by `paidAt`). The table adds Last settled (newest paid
invoice) and one action: **Settle** (one payable invoice → its Mark paid dialog; several → the stockist's drawer),
**Bill them** (owed but nothing billed → Invoices with that stockist) or Up to date. **Recent movements** lists
`recentMovements` (newest 8, voided left out). The mockup's shared Terms form is not built: commission is per stockist
(Edit details) and nothing stores a settle-every setting.

**Invoices in v4 (12 November 2026):** `stockroom/InvoicesCard` (InvoiceDialogs.tsx) opens with three tiles from
`invoicesSummary` (`invoiceMake.ts`, pure): Outstanding (sent, sky), Overdue (apricot when any) and Paid, last 30 days
(mint, by `paidAt`, now on `InvoiceRow`), then filter pills with counts (`INVOICE_FILTERS`, `inFilter`: Sent = owed, not
yet overdue). The table has Customer, Issued, Due, Amount, Status and one action: **Mark sent** for drafts
(`markSentChange`) and **Mark paid** for sent/overdue (confirm, then `markInvoicePaid` from `stockists.ts`, the same
settle Stockists uses). Create invoice and the details, reminders and letterhead buttons sit in the page header. The
mockup's "Download statements" is not built (no such feature) and its "Send" is labelled Mark sent (nothing is emailed).

**Tax centre pages in v4 (12 November 2026):** the Tax centre item (`riso/nav.ts`) has eight pages in three sections:
Your books (`taxcenter` "Money in and out", `taxledger`, `taxcosts`), Sales tax (`taxsales`, `taxrates`, `taxfilings`)
and Check and close (`reconcile`, `taxyear`). Each is `TaxCenterView` with a `part` (`TaxCenterPage.tsx`, `taxPage(part)`);
TaxTop takes a matching `part`. Year parts (money, ledger, year end) pick the year with their own pills; sales tax parts
use the quarter pills. `part="all"` still draws everything (moneyReports tests). Missing-cost and recurring-cost fixes
on the to-do list open `taxcosts` (`todo.ts` fixTarget). Tile figures size to their tile (container units, no wrapping).
Costs to log has **Log an expense** in the header: it (and Confirm on a pending cost) opens the New expense kit page
(`LogExpenseCard page`, Back returns); `part="all"` keeps the card inline.

**Bookkeeping Payments in v4 (12 November 2026):** Bookkeeping's first page is `payouts` "Payments" (`stockroom/PaymentsPage.tsx`,
pure `paymentsModel.ts`): three tiles (paid out in the last 30 days, Pending = payouts with no date yet plus paid sales
not in a payout, Payment links open = sent invoices with a card pay link, `cardLinkOf`), the payouts from
`reconcileModel` (a row opens Reconcile payouts) and Pay by QR and links (items with `paymentLinkOf`, invoice card
links). Read-only. The mockup's "Create payment link" is not built: card links are made on an invoice. QuickBooks is
moving to the app store (Julian, 12 November 2026), so this page leaves it alone.
