# Admin dashboard

The admin (route `/admin`): Riso Press design system, Orders/fulfilment, Overview analytics, the stockroom link's server side, settings. Studio (the theme editor) has its own guide in `studio/CLAUDE.md`. The repo-wide rules are in the root `CLAUDE.md`.

**No import loop through `api.ts` (27 October 2026).** Most screens import `adminApi` from `api.ts`, so nothing `api.ts`
imports may import it back: a loop makes one of the two run half set up. `themeStore.ts` did, for the audit log, which
now lives in `auditLog.ts` (`adminApi.recordAuditLog` / `getAuditLog` hand on to it). A helper `api.ts` uses that needs
another admin call takes it from its own small file the same way. `adminApiImports.test.ts` fails on any new loop.

## Standing rules

### Look and components
- One admin look (Colophon). Every admin colour is a `--rp-*` token with a day and a night value in `riso/adminThemes.css`; no other admin stylesheet names a colour (`riso/adminThemes.test.ts` also checks contrast). No look switch, nothing in `localStorage`.
- Compose `riso/components.tsx` and `riso/FormKit.tsx` (form pages, `CardsAsSections`); don't add a second kit or new `.admin-reso` compat rules, and never wrap `rp-*` chrome in `.admin-light`. Studio keeps its own look (`.rp:not(.studio-editor)`).
- Never show raw `err.message` (`plainError.ts`, `friendlyError`, `loginError.ts`). Settings card descriptions stay one line of 70 characters at most (`settingsWording.test.ts`). Keep words lean: one short line per card.
- Partner logos come only from `shared/brand-logos`; never redraw or recolour one, never show a rival shop builder's. Words a press sees never name another shop system (`shopMove.test.ts`, `SHAPE_WORDS`); only files inside a download may.
- Shop words: wrap new admin words in `w(...)` (`useShopWords`) so non-book and services shops read their own nouns. A new shopper word containing "book" needs a starter word in `sells.ts` or `BOOK_ONLY_COPY` (`sells.test.ts`).

### Menu and routing
- Every page sits in exactly one menu item (`riso/nav.ts` `MENU`/`COMBINED_MENU`/services menus; `nav.test.ts`). A new admin page goes in `ADMIN_TABS`, sub tabs in `SUB_TABS` via `useSubTab`; keep old ids and slugs working (aliases in `MOVED`).
- A new stockroom page in the combined admin goes in `STOCKROOM_PAGES` and `COMBINED_MENU` (`combined.test.ts`). Book figures come from the stockroom (`stockroomBridge.ts`), never a copy here.
- A beta page goes in `BETA_PAGES`. An owner's missed Help question goes into `helpQuestions.test.ts`; a question with no answer needs an article in `help/articles.js`. A new menu page that matters gets a walkthrough stop (`walkthrough/tourSteps.ts`). Release notes use ids from `riso/nav.ts`.
- `platform/messages` is read only inside `app/admin` (`platformMessages.test.ts`); the storefront never imports it.

### Orders, payment and stock
- The admin never marks card/PayPal orders paid; labels never dispatch or email. Notes and history live in admin-only `order-operations`.
- Every stock edit goes through `inventoryApi.adjustStock`; `updateBook` keeps live and stockroom-counted stock (`keepLiveStock`, `lockLinkedStock`). Only the book editor passes `removeMissing: true`.
- Past orders (`source: "import"`) are history only: only the server writes them, and every order hook (emails, stock, stockroom push, returns) must skip them.
- Bookings, events, rentals, giving, memberships and ticket records are server-only: read and change them only through their admin action (`bookingsAdmin`, `eventsAdmin`, `rentalsAdmin`, `givingAdmin`…), never Firestore. The page follows the server's answer; money rules come from the shared helpers (`moneyKept`, `refundMinorFor`, `teamPay`), never re-derived.
- The `*Live` website hints (`bookingsLive`, `eventsLive`, `classesLive`, `rentalsLive`, `givingTips`) are the server's; `adminApi.updateSettings` never writes them. Flipping a way in Ways to sell sends op `hint`.
- Stockroom link: only `functions/inventoryLinkStore.js` touches the `stockroom` database (never `(default)`); sales counts come from `orderFootprint`; editions of one product may share a stockroom book, other products may not (`validateLinks`). The contract doc changes together with the stockroom's copy.
- Shipping zones save ISO codes only; profile edits are drafts turned into writes by `savePlan`.
- Money pages read due items through `moneyDue.ts` and service sales through `stockroom/moneyRecords.ts`; never save bookings into the stockroom.

### Roles and access
- The bookkeeper/accountant role reads money only: `isBookkeeper()` appears only in the `orders`, `giftCards`, `analytics` read rules, `isAdmin()` never names it, `requireAdmin` refuses it (`securityRules.test.ts`, emulator). Its desk never mounts the admin shell and never writes.
- Front-desk and provider roles get `TeamDesk.tsx`, which reads nothing itself (all through `bookingsDesk`).
- Client visit notes, photos and files are admin-only (no support, no accountant), opened through `getBlob`, never a download link.
- Setup mode never imports `../main`, `lib/firebase` or `adminApi`; every answer goes through `door.ts`.

### Imports and downloads
- Every file picker uses `SPREADSHEET_ACCEPT` + `spreadsheetText()`/`readSpreadsheet`; show errors with `readProblem`. Extend `scripts/move-check.mjs` when a bring-over window changes; add real export layouts to `testdata/moves/` (`realExports.test.ts`: a second run must be all unchanged).
- Imports go through `planImport`'s safety rules; take-backs never touch stock.
- Export layouts must round-trip through `shopMove.ts` (`shopExport.test.ts`, `shopTakeout.test.ts`); move to newer headings only together with shopMove. Strip private keys from settings in downloads.
- Imported newsletter joiners are written only after the owner ticks the permission box.

### Setup guide
- Every Ready to sell `block` row has a step before Open your shop (`firstWeek.test.ts`). `SELLING_TODAY` must list the sign-up answers and `StepId` must match `help/articles.js` (root tests). `firstWeek` rule: sign-up fields never change from the admin.
- The run's order lives only in `startRun.ts`. Server mirrors (`moveDone.js` ↔ `moveProgress.ts`) stay in step.

### Analytics and data
- Sales figures come only from real paid, non-test, non-owner orders (`overviewInsights.ts`). Never draw a zero for a signal never recorded.
- Orders sit on Toronto days, traffic on UTC `analytics/<date>` keys pinned by the rules. New counters change only the maps a write touches (emulator "busy day" checks).
- Every new rule gets a two-shop check in `scripts/firestore-rules-emulator.mjs`.
- `lib/commerce.ts` must not import `admin/*` (`shopperBundle.test.ts`). Google only gets `cleanLocation()`.

### Secrets and AI
- Keys live only in admin-only `adminSecrets/*` or the platform; `updateSettings` drops `analytics`.
- AI: a new task needs a `TASKS` entry and a `needs` branch in `handleAiWrite`; send only public catalog facts; the AI path saves nothing.

### Deploy
- Rules deploy before the frontend; Functions with it.

### Product editor
- On a new product's page the price must stay inside the first desktop screen (1440×900); words that follow the product type live in `productPageWords.ts` (its test fails if a non-book group mentions books).
- Autosave only for a product made in this editor while it is a named draft; the first autosave holds `loading` so Publish can't create a second copy.

## Feature notes

Details of each feature live in [`docs/agent-notes/admin.md`](../../../docs/agent-notes/admin.md) (read the section before changing that feature; Grep its heading). Sections:
- Inventory app link (11 October 2026)
- Riso Press admin design system
- Publisher fulfillment desk (2 October 2026)
- Fulfillment workspace UX repair (2 October 2026)
- Admin improvement pass (10 October 2026)
- Reports, analytics and performance (10 October 2026)
- Overview analytics 2.0 + Google Analytics (13 October 2026)
- Overview analytics 3.0 + your own visits (18 October 2026)
- Round-2 catalog and settings (10 October 2026)
- AI writing assistant (13 October 2026)
- URL redirects (11 October 2026)
- Bring your shop with you (28 October 2026)
- Set up your shop (28 October 2026, code plan 6.3 and 6.9; was Your first week, 3.3)
- Get started: your press first (29 October 2026, code plan 17.1 to 17.4, 17.8, 17.10, 17.11 and 17.13; redesigned 11 November 2026)
- Going live on Colophon (28 October 2026, code plan 2.10)
- Bookkeeper role (28 October 2026, code plan 7.17)
- Download for another shop system (28 October 2026, code plan 7.18)
- Download your shop (10 November 2026)
- Import keeps sizes and colours (plan 10.6, 29 October 2026)
- Messages from Colophon (plan 19.14, 2 November 2026)
- Setup mode (code plan 18.6, 3 November 2026)
- One admin for shop + stockroom (3 November 2026)
- Sales channels and Social posts (plan 27.5-27.7, 4 November 2026)
- Partner company logos (4 November 2026)
- Design before the store (10 November 2026)
- Every combination (11 November 2026)
- Design page (redesign, 11 November 2026)
- Bank feed (beta, a paid add-on, 13 November 2026)
- Live visitors (13 November 2026, gap list 34)
- Admin walkthrough and Help page (14 November 2026)
- Running costs tracker (14 November 2026)
- Bookings (beta, 14 November 2026)
- Services shops (14 November 2026, phase 1)
- Bookings: who's coming and adding to a class (16 November 2026)
- Bookings: team and rooms (17 November 2026)
- Client records (17 November 2026, services plan phase 5)
- Shipping zones as a page (16 November 2026)
- Shipping profiles workspace (17 November 2026)
- Donations (beta, 18 November 2026)
- Email sender redesign (18 November 2026, Julian's mockups)
- Rentals (beta, R1, 18 November 2026)
- Close shop (18 November 2026, Julian: "where do i even close the shop? … make it easy with a button")
- Adding products, round 3 (24 November 2026, plan https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL)
