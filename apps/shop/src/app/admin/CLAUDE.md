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

**Admin themes and colours (28 October 2026, plan 1.26):** every admin colour is a `--rp-*` token in
`riso/adminThemes.css`, once per admin look × appearance: **Riso Press** (default, the values above) and **Paper** (white
paper, graphite ink, calm blue primary, 4–8px corners, soft shadows only in Studio). The look is a per-browser choice in
the avatar menu ("Paper look" / "Riso Press look", `riso/adminLook.ts`, `localStorage.adminLook`) and sits on
`<html data-admin-look="paper">`, so portalled dialogs follow it; appearance stays on each `.rp` root. `riso.css`,
`adminCompat.css`, `studio.css` and every other admin stylesheet name no colour: `riso/adminThemes.test.ts` fails on one
and checks words against their backgrounds (4.5:1) in all four combinations. A new colour is a new token with a value
for every look. `--rp-legacy-*` are the old day-only utility remaps in `adminCompat.css`; inline colours in admin TSX
(email previews, photo crop) are not covered yet.

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

**Overview layout = widget board (18 October 2026)** (`AnalyticsDashboard.tsx` loads the data and owns the masthead/period
control; `OverviewBoard.tsx` draws the board; pure model `overviewBoard.ts`, tested): seven fixed topic bands (`BANDS`: today, sales,
titles, traffic, search, customers, stock) of widgets (`WIDGETS`, 84) on a 12-column grid (S/M/L/XL = 4/6/8/12, height auto/short/tall).
A widget always lives in its own topic's band (`normalizeBoard` moves it back), so analytics stay grouped. Bands and widgets fold
(a folded widget mounts nothing, so it loads nothing); *Fold everything*, per-band *Fold widgets*, Edit board (grip drag within the
band, ← →, sizes, ⋯ menu, band ↑ ↓ / Hide topic, Undo/Redo), Add widgets tray, full view (`Open full view`, Esc) and *Explore all N*
per topic. Panels show one card each through their `only` prop (`OverviewSales/Marketing/Customers/Stock`; ids are the widget type,
`kpis` for custKpis/stockKpis); `CardInWidget` hides a SectionCard's own title/fold inside a widget. Chart and figure widgets are `multi`
(own `config`: metric/grain/compare, figures). Carts, back-in-stock sign-ups and Search Console are read once per board through
`overviewShared.ts` `sharedLoad` (Refresh clears it). Boards (templates `TEMPLATES`, max 12) are saved in localStorage `lm:overview-board`
and admin-only `adminPrefs/overviewBoard` (`overviewBoardStore.ts`, `{ data: JSON string, updatedAt }`, newer copy wins; deploy the
`adminPrefs` rule). A new analytics panel = a `WIDGETS` entry in the right band + its `only` id (`overviewBoard.test.ts` checks both).
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
  existing row; `status: "imported"`, `source: "import"`, `IMPORTED_CONSENT_TEXT`). Imported customers appear in the
  list once they order (the list is built from orders).
- **Photos** stay on the old shop's addresses until plan 3.1b copies them into the shop's own storage.

## Set up your shop (28 October 2026, code plan 6.3 and 6.9; was Your first week, 3.3)

Both read the admin-only `firstWeek/start` (`adminApi.getFirstWeek`) that the platform's setup step 12 writes once
(`sellingToday`, `publishes`, `country`, `plan`). No document, nothing shown: shops made before this, or by hand, never
see either. `overview/SetupStart.tsx` (rendered at the top of the Overview by `AnalyticsDashboard`) picks which:
- **Choose your look** (`overview/ChooseLookWelcome.tsx`, pure parts in `chooseLook.ts`, lazy-loaded): while
  `welcome` is unset and the plan has a shop. A gallery of every `THEME_LIBRARY` theme (name, mood, three swatches,
  `LookPicture`: a small drawing in the theme's own colours and type with the press's name in the header; Preview opens
  it at phone or desktop width), two or three suggested per `publishes` (`SUGGESTED`). Use this look runs
  `applyChosenLook`: `openWorkspace` → Studio's `applyLook` (so `themeBase` is stored, as Studio › Themes does) →
  `saveDraft`, retried once on a conflict; then `updateFirstWeek({ welcome: { theme, at, skipped? } })`. Skip takes the
  first suggestion. The look goes into the **draft**; the guide's look step ticks once the published design has a
  `themeBase`. The preview is drawn, not a screenshot, so every theme has one by construction (`chooseLook.test.ts`).
- **Set up your shop** (`overview/SetupGuideCard.tsx`, pure `firstWeek.ts`): eight steps per answer (`ORDER`; the first-
  book step is `bring-books`, `import-spreadsheet` or `add-books`): logo, look, books, shipping (starter words per
  country, `shippingStarterWords`), Get paid (`card-account` ok on platform shops, plan 7.9; the payment checks on own
  keys), web address (custom domain, or the owner ticks "Keep the free address"), practice order (an `isTest` paid or
  refunded order, plan 7.6; done once the shop is open), Open your shop (no wall, no maintenance). Gmail is never a
  step. Three open steps show (`guideParts`), the rest under **Later**, done ones under **Done**. **Open your shop**
  runs `openBlockers` (Ready to sell's `block` rows) and, when none, Dashboard's `toggleUnderConstruction(false)`
  (passed down as `onSetWall`). The guide saves `progress { steps, done, at }` whenever it changes (`progressToSave`)
  for the platform's trial emails (plan 6.10, `services/trial-tips`).
- `SELLING_TODAY` must list the sign-up form's answers and `StepId` must match `help/articles.js` `CHECKLIST_ANSWERS`
  (root tests check both). Firestore rule `firstWeek`: admin only, `hasOnly([... "publishes", "country", "welcome",
  "progress" ...])`, the four sign-up fields never change from the admin, `welcome`/`progress` shapes checked. The
  Overview's "designer" link opens Settings › Design (Dashboard maps it like general/notifications/taxes).

## Going live on Colophon (28 October 2026, code plan 2.10)

- `launchReadiness` takes `platformCards` (default `platformCardsProvider()` from the shop profile) and `platformAccount`
  (the platform's `account.status`, loaded by the Overview with `adminApi.platformPayments("status")`; null when it
  couldn't be read). A platform shop gets a `card-account` row (block until the press's Square or Stripe account is
  connected and can take cards) and none of the key, deployment or Hosting rows: Colophon deploys its shops.
- Settings › Taxes › Start from a preset (`taxPresets.ts`): `applyTaxPreset` adds a rate only for a province with none
  (country and region compared without case), in the draft. Rates are as of October 2026 and the card says "Not tax
  advice". Shipping presets are the new-profile starters (`shippingProfileStarters.ts`).
- Settings › General › Store policies › Start from our wording (`starterPolicies.ts`, plan 7.5): shown only under an
  empty policy; fills it with the shop name, Location address, contact email and the returns window book pages already
  give search engines (Text & labels › `seoReturnDays`, 0 = no returns after shipping). `withStarter` re-reads the draft
  and keeps any saved words. The card says "A starting point, not legal advice"; the four texts await a lawyer's read.
- Settings › General › Your web address (`CustomDomainCard.tsx`, plan 2.9) shows the older "Domain & visibility" field
  when the server answers `not_available` (no `PLATFORM_DOMAINS_URL`).
- Settings › Payments › Card payments (`PlatformPaymentsCard.tsx`, plan 2.2b) replaces the Stripe keys card on platform
  shops.
- **What Stripe still needs (plan 7.9):** `account.status` carries `needs: [{ words, pastDue }]` (plain words made by
  the platform, `services/payments/requirements.js`), `deadline` and `pastDue`. `needsLine` (platformPayments.ts) says it
  ("Stripe needs your bank details by 12 November."); the card shows it above one **Continue with Stripe** button that
  asks for a fresh Stripe page on every press (Stripe's links work once and are never emailed). The `card-account`
  readiness row ticks only once `paymentsReady` (cards and payouts). While something is past due, `cardAccountAlert`
  (adminAlerts.ts, action `cardAccount` → Settings › Payments › Ways to pay) puts a banner on every admin page; the
  Dashboard's 5-minute alert check reads the status for Stripe platform shops. The platform emails the owner once.
- Settings › Bookkeeping (`BookkeepingSettings.tsx`, pure `quickbooksLink.ts`, plan 7.16): Connect to QuickBooks in three
  steps (sign in with Intuit, one line per day or every order, match taxes and five accounts), then last day sent, Send
  again and Disconnect. Hidden unless `adminApi.bookkeeping("status")` says `enabled` (Dashboard asks once when
  Settings opens and drops the menu entry with `withoutPages`). The button is text only ("Connect to QuickBooks"), as
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
