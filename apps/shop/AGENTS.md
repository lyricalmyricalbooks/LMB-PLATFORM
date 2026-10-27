# AGENTS.md

Operating guide for AI coding agents working in this repository. (Companion to
`CLAUDE.md`. This file is the cross-tool convention; keep the two consistent.)

## Your role

You are an **expert e-commerce engineer** working on the storefront and admin
for **Lyricalmyrical Books**, a publisher's online bookstore. You think like
someone who owns a shop's revenue and reputation, not just its code. Optimize in
this priority order:

1. **Checkout & payment integrity** — money must never be wrong, double-charged,
   or marked paid when it isn't.
2. **Conversion & storefront UX** — a faster, clearer, lower-friction path to
   purchase is the goal of most changes.
3. **Catalog & SEO quality** — accurate product data, discoverable pages.
4. **Accessibility & trust** — usable by everyone; honest, compliant, private.
5. **Maintainability** — clean, consistent code that the next agent can extend.

When a change trades one of these against another, say so explicitly and default
to protecting #1.

## Where the repo facts live

See **`CLAUDE.md`** for the stack, full directory layout, commands, Firestore
collections, and deployment. Don't duplicate that here. Quick orientation:

- `src/app/features/site/` — storefront pages (book detail, collections, cart,
  checkout, account, reviews, search).
- `src/app/admin/` — admin dashboard (catalog, orders, discounts, reviews,
  pages, theme editor, analytics). `admin/api.ts` holds Firestore calls.
  The shared `admin-reso` shell in `Dashboard.tsx` and `theme.css` is the
  default visual system for every admin route; keep new admin surfaces inside
  that shell and build them from the Riso Press components in
  `src/app/admin/riso/` (see CLAUDE.md) rather than legacy dark utility classes so they inherit its light canvas, panels, forms, tables and dialogs.
  Discounts use status tabs with live counts; Shipping uses Overview, Profiles,
  and Carrier & labels tabs, with checkout-readiness diagnostics driven by
  `shippingHealth.ts`. Carrier & labels also owns the country allowlist for
  Shippo live rates; countries outside it keep using regular profile/zone rates.
- `functions/index.js` — Cloud Functions: Stripe checkout/webhook, digital
  downloads, order emails, abandoned-cart sweep. Shipping zones and quotes come from
  `src/shared/` (generated copies in `functions/shared/`).
- `firestore.rules` / `firestore.indexes.json` / `storage.rules` — server-side
  security and indexes.

## Project guardrails (do not violate)

- **The Stripe webhook is the single source of truth for Stripe-paid orders.** Only
  `stripeWebhook` (in `functions/index.js`) marks a Stripe order paid, decrements
  stock, counts discount redemptions, and records revenue. Orders are created
  `unpaid`. Never mark a Stripe order paid, adjust its inventory, or count its discount from
  client code or another Stripe recovery path. Preserve existing PayPal, manual/offline and free-order contracts.
- **Tracked inventory reservations:** acquire expiring server-only holds transactionally before creating a payment and revalidate them at settlement; reservation-store failures fail closed. Release on payment/cancel and surface any already-captured payment that can no longer reserve stock for admin reconciliation.
- **The inventory app link is never a payment path.** It may set a linked edition's stock to the inventory app's count
  (`functions/inventoryLinkJobs.js`, per-book transactions that skip anything changed during the run) and dispatch an order
  whose label was bought in the inventory app (same checks as Orders › Dispatch). It never marks orders paid, refunds them or
  touches Stripe/PayPal. Only `functions/inventoryLinkStore.js` reaches the inventory app's project (CLAUDE.md › Inventory app link).
- **Gift-card balances move only with a confirmed payment.** `priceOrder` (functions/index.js) prices every
  checkout path; gift cards are held with stock (`reserveCheckout`) and debited only inside the paid transaction
  (`settleGiftCards`), credited back once by a full refund. Never write `giftCards/*` from the browser
  (CLAUDE.md › Gift cards, box sets, automatic discounts, add-ons and scheduled sales).
- **Never trust client-computed totals** for the authoritative charge. Prices,
  shipping, tax, and discounts that determine what a customer is charged must be
  computed/validated server-side via the Stripe session. The client may *display*
  totals but must not *decide* them.
- **Admin access is hard-restricted** to `lyricalmyricalbooks@gmail.com` via
  Google sign-in plus the `ADMIN_EMAILS` allowlist and `requireAdmin` in
  `functions/index.js` (and the email check in `admin/api.ts`). Do not loosen,
  bypass, or add emails without an explicit instruction.
- **Respect Firestore security rules.** When you change the shape of any
  read/write, update `firestore.rules` and `firestore.indexes.json` to match —
  rules are enforced server-side and a mismatch breaks the app in production.
- **Unpublished design work stays private.** The Studio draft and My themes live in admin-only
  `themes/workspace` and `savedThemes/*` (`admin/themeStore.ts`); shoppers read `getPublicSettings()`.
- **Secrets stay out of client-readable data too.** `settings/*` is publicly readable; never add UI that stores API secrets there (see CLAUDE.md › Security notes).
- **Secrets stay out of the repo.** `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `SHIPPO_API_TOKEN` are Firebase
  Functions secrets. Never hardcode, log, or commit them.
- **Mind the base path.** The shop is served from the root of Firebase Hosting
  (`https://lmb-test-shop.web.app`), but builds can use a sub-path (`SITE_BASE`). Use router-relative
  navigation and `import.meta.env.BASE_URL` for asset/links — never hardcode absolute root paths. The old
  GitHub Pages address only forwards (CLAUDE.md › Deployment); never point `SITE_URL` back at it.
- **CORS:** every address the storefront is built for must be in `ALLOWED_ORIGINS` in
  `functions/index.js` (`scripts/siteAddress.test.ts` checks the defaults; at deploy time
  `scripts/siteAddressCheck.mjs` refuses a `SITE_URL` that isn't allowed there or isn't serving the shop yet).
  See CLAUDE.md › Deployment. Never add a catch-all rewrite to `firebase.json` (unknown URLs must stay 404s).
- **SEO:** use the helpers in `src/app/lib/seo.ts`, and refresh the sitemap with
  `npm run build:sitemap` (it also runs as part of `npm run build`) when routes
  or products change.

## E-commerce expertise to apply

Bring general best-practices, grounded in what this repo already does:

- **Checkout & conversion:** minimize steps and surprises; surface shipping/tax
  before the final step; keep the cart persistent; preserve abandoned-cart
  recovery (`abandonedCartSweep`). Treat every added field or redirect as
  conversion risk.
- **Payments & fulfillment:** verify webhook signatures; make order-mutating
  operations idempotent (a webhook can fire twice); respect the order state
  machine (`unpaid → paid → shipped`); use Shippo for address verification
  before generating labels (unverified addresses are intentionally flagged).
- **Catalog integrity:** keep inventory accurate, product fields complete
  (ISBN/SKU/format/pricing), and images fast and resilient (use
  `ImageWithFallback`). Add structured data / good metadata for discoverability.
- **Trust & compliance:** keep shipping/returns/privacy/terms policies and tax
  rules intact (required by Stripe/card networks); honor cookie consent and
  privacy; the repo has an active accessibility effort — preserve and extend
  `aria-label`s, keyboard navigation, and focus handling in any UI you touch.
- **Analytics:** referral-source capture lives in `src/app/App.tsx` — don't
  break it, and think about how a change affects the funnel you can measure.

## Theme editor — go all the way to Shopify parity

Studio › Menus › Shop categories provides searchable Edit/Delete, descriptions,
optional images, direct book counts, visibility, parent placement and order.
Category details use Studio's draft/publish workflow. Book assignments save live
through explicit actions, using published names so Discard Draft cannot orphan
books; publish new categories before assigning books. Category deletion preserves
books and promotes children, with keep/remove/move assignment choices. Cleanup
refreshes catalog membership; transactions update only categories/genres/updatedAt
and support up to 400 books per save. For larger categories, use Edit › Assigned
here in groups of up to 400 before deleting. The picker includes the full catalog
(drafts too), and counts exclude parent roll-ups and PUBLICATIONS' automatic view.

> The **Studio editor** (`src/app/admin/studio/StudioEditor.tsx`) is the default Design editor users see; it is the only designer (the old `ThemeEditor.tsx` / `ThemeEditorPro.tsx` / `ThemeEditorBuilder.tsx` and `?editor=legacy` are gone). Put every design feature there. See CLAUDE.md › Theme editor and the Studio 2.0 roadmap in `docs/THEME_EDITOR.md`.
>
> **A Studio control is done only when it changes the preview:** add it to `scripts/studio-control-baseline/ (one file per control)` (`AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs`) and keep CI's `studio-controls` and `studio-browser` jobs green. Rules: CLAUDE.md › *Studio controls must reach the shop*.

The `/admin` theme editor is the most-requested area to "make as good as
Shopify." It is **already large and capable** (sections/blocks,
drag-and-drop, color schemes, fonts, draft/publish, live preview). The failure
mode here is **stopping after one small increment**. Don't. When asked to
enhance it:

The default Settings → Design experience is `studio/StudioEditor.tsx`: its
section/block outline, inspector, Edit/Browse preview and draft workflow are
the primary editing surfaces. Custom pages created
in Studio join the storefront header by default, and their public routes render
the themed storefront header. There is one header (`features/site/StoreHeader.tsx`: shop mode in MainSite, page
mode everywhere else) and one footer (`features/site/StoreFooter.tsx`); wishlist, account, tracking and 404 get them
through `StoreChrome` (Style › Header › `showStoreChromeOnUtilityPages`). Build header/footer features there only —
`storeChrome.parity.test.tsx` guards every Studio hook. Checkout keeps its own minimal header. The iframe preview receives the unsaved design,
settings, catalog and published-page collection as one live snapshot; preserve
that full-state contract when adding Studio-editable storefront data. Snapshot
delivery uses `postMessage` plus a same-origin message-event fallback so iframe
load timing cannot strand the preview on the published design; keep the snapshot
structured-clone safe (`toCloneable`) and mirror it to the **Preview in new tab**
window over `BroadcastChannel("studio_preview")` (`features/site/previewTab.ts`).

Shop categories are shared catalog structure. Admins can manage them in Studio ›
Menus › Shop categories or create-and-assign one in a book's Categories & tags
tab; the book workflow must update the live storefront and Studio draft together
without replacing unrelated design fields.
New book cards must carry the `fm-card-*` classes (`cardClasses.test.tsx`).
**Section groups (2.2):** three every-page section lists, all root-only: `headerSections` (under the header),
`globalSections` (above the footer) and `overlaySections` (pop-up) — rules in `features/site/sectionGroups.ts`, rendered by
`GroupSections` in `sectionRender.tsx` (`StoreHeader` renders the header group and `PopupSections`). Write any section list
with `writeSections` (`studio/studioWorkflow.ts`); a group is a plain array. The pop-up waits for the cookie answer, then
Style › **Pop-up** (delay, how often, position, width, shading, colours, hide on phones); in the preview it opens only on
request. Announcement bar messages (`announcements`, link + show-from/until Toronto days) are edited in Theme settings ›
Header & announcement bar › **Announcement messages**; without a list the single `announcementText` is unchanged. Header
links with sub-links have **Show sub-links as a mega menu (columns)** + featured card in Navigation › Header menu.

**Section library (2.6):** Add section is a panel in Page layout (`studio/StudioSectionLibrary.tsx`); pointing at a card
shows it on the page through a preview-only `__studio-candidate` section (`studio/sectionLibrary.ts` `withCandidate` —
never saved). The canvas toolbar's **+ Section above / below** sends `INSERT_AT`. A registry entry's `bestIn`
(`{ group | template, note }`) powers **Add it there instead**. Thumbnails are code-drawn (`studio/sectionThumbs.tsx`; map
new types in `KIND`). Saved sections and shared blocks are renamed/deleted there (`deleteSharedBlock` bakes content into
placements). Product-page sections can read the current book with `useSectionPage()` (`components/sectionCopy.ts`).
Newsletter forms sign up through `features/site/newsletterSignup.ts` and never write from the preview.

**Custom book fields + dynamic sources (2.7):** field definitions are in public `settings/bookFields` (Books › edit ›
**More details** edits them and each book's answers in `book.custom`; `features/site/bookFields.ts`). A section/block field
can be connected to a page detail — saved as `{ "$dyn": "book.custom.series" }` or `{{book.title}}` tokens — and
`SectionList` resolves it with `resolveDynamicSettings` (`features/site/dynamicSources.ts`) from `SectionPageContext`
(book: `BookDetail`, category: `MainSite`, page: `PageView`), so renderers only ever see plain values. Never render a raw
setting value in Studio UI without `displayValue()`; code reading setting values as text must tolerate `$dyn` objects.
Section › Visibility › **Hide when a connected detail is empty** (`hideWhenEmpty`). Studio's Content tab offers
**Connect to a detail…** (`studio/StudioConnect.tsx`).

**Alternate templates (2.8):** extra book/collection page layouts — list in root-only `design.alternateTemplates`, each on
surface `productPage~<id>` / `collectionPage~<id>` (`features/site/templateAlternates.ts`; layered storefront → default →
alternate by `designModel`). Books pick one with `book.templateId` (Books › edit › Categories & tags › **Book page
template**), categories with `category.templateId` (Navigation › Shop categories › Edit). Studio: Page layout › template
card (New template from this one / Rename / Delete); the preview URL carries `?template=<id>`. Collection alternates carry
sections only. Use `bookTemplateSurface` / `categoryTemplateSurface` / `sectionsSurface` — never read `design.productPage`
directly for a book's sections.

**Product information as blocks (2.9):** the buy card is the ordered list `productInfoBlocks` (on `productPage` or an
alternate template) — rules in `features/site/productBlocks.ts`, rendered by `renderBlock` in `BookDetail.tsx`, edited in
Page layout › **Buy box blocks** (`studio/StudioProductBlocks.tsx`). No list = the hand-written card exactly
(`productCard.parity.test.tsx` + `__fixtures__/productCardDom.json`); a new buy-card piece needs a built-in block type and a
parity fixture refresh. `heading` and `buy` are required. Buy-card visibility reads `regionDesign` (the shown template).

**Version history 2.0 (3.1):** Theme actions › **Version history** (`studio/StudioHistory.tsx`) keeps each Publish (last 30
unpinned), `draft-latest` and named, pinned **checkpoints** (`adminApi.saveThemeCheckpoint` / `updateThemeVersion` /
`deleteThemeVersion`; pinned rows are never pruned, max `THEME_PINNED_LIMIT` 20; `draft-latest` can't be renamed or pinned).
**Compare** uses `studio/designDiff.ts` `diffDesigns` (labels from `STYLE_GROUPS`, `COPY_SCHEMA`, the registry and templates;
sections matched by id) and **Use this version's** applies `restoreItem` as one named `change`. Publish/Discard dialogs list
`summariseDiff` lines. New structured design keys with their own editor belong in `designDiff.ts` `STRUCTURAL` so they get
a readable name. Studio's `confirmNode`/`promptNode` render last so questions asked from inside a dialog open on top.

**Live sync (3.2):** while Studio is open, `useStudioPersistence` follows the private working copy (`watchWorkspace`;
the fixture fakes it with `__studioFixture.remoteSave(draft, { publish })`). `decideRemoteChange` (pure, `studioWorkflow.ts`)
ignores revisions not newer than this tab's, takes another tab's save when nothing is unsaved here, and otherwise shows the
**This design was saved in another tab or device** banner (Bring in / Use their version / Later). Remote drafts go through
`normalize` before any comparison. Never auto-overwrite unsaved edits.

**Studio Health (3.3):** Theme actions › **Studio Health** runs `studio/healthAudit.ts` `auditDocument` on the preview
iframe's own document (contrast, picture descriptions/size/weight, link names and targets, tap targets, headings, fonts,
page size, title/description) and lists findings with **Show me** / **Edit this part** (owner = the bridge's node key,
`ownerOf`). New storefront parts are covered automatically when they carry the usual `data-fm-section` /
`data-studio-target` hooks. The audit only reads the DOM; never change the preview from it except the brief Show me outline.

**Themes workspace + share previews (3.4):** Studio › **Themes** (`studio/StudioThemes.tsx`) lists the live theme, the draft,
My themes and presets with `ThemeThumb` drawings; Preview uses the canvas only (`themePreview` state, like History's
preview). Share links are `previewTokens/{token}` (admin writes; public `get` by exact token while unexpired — never list);
the storefront reads them only through `features/site/themePreview.ts` + `publicApi.getThemePreview`, never caches the
shared design, keeps it noindex and out of analytics (`trackingGuard`, `useSiteData`), and always shows
`ThemePreviewBanner`. Deploy `firestore.rules` with the frontend for share links to work.

**Scheduling & campaigns (3.5):** Studio › Theme actions › **Schedule publishing…** (`studio/StudioSchedule.tsx`,
`studio/themeSchedule.ts`) writes admin-only `themeSchedule/{id}`; `functions/themeSchedule.js` (run inside
`unpaidPaymentSweep`, every 15 minutes) publishes due entries into `settings/website.design` and switches campaigns back
at their end unless a later Publish happened. Never put scheduled designs in the public settings document, and never
apply schedules in the browser. Times are entered in Toronto time and stored as UTC ISO.

**Performance (Phase 4):** compare designs with `designEqual` (`features/site/designEqual.ts`), never `JSON.stringify`, and
keep normalisers identity-preserving (return the same object when nothing changes) so edits share structure. Heavy Studio
derivations (Find index, "changed" counts) are computed only while their panel is open. Storefront sections from the third
on use `content-visibility: auto` (`lazySections`, default on; not in preview, groups or fixed bars) — a new section with
a fixed-position bar belongs in `LAZY_EXCLUDED_TYPES`. `components/sectionPerformance.test.tsx` caps section DOM size.

**Media library (2.4).** Studio › **Media** (`studio/StudioMedia.tsx`) lists admin-only `media/{id}` records; library
uploads (`uploadMediaImage`) store WebP copies at 480/960/1600 px under `assets/media/<id>/`. Picking a picture for a
section/block field writes its URL plus a public `${field}__media` record (Theme settings images get the URL only, but
their uploads still land in the library); render section images with `components/ResponsiveImage.tsx`
(srcset only when the record's `src` matches; plain URLs unchanged). Replace/where-used/filters live in the pure
`studio/mediaLibrary.ts`; Delete refuses a picture still in use, including in My themes or Version history. Deploy Firestore (`media`) and Storage rules with the
frontend; until then Media explains the library is off and image fields keep URL + plain upload.

Studio's **Find anything** (Ctrl/Cmd+K, `studioSearch.ts`) indexes `STYLE_GROUPS`/`COPY_SCHEMA` automatically — a new control needs a
plain-English label so shop owners can find it. Selection commands come from `contextCommands` (add one there plus a case in
`runContext` in `StudioEditor.tsx`); `>` searches commands only. Studio drafts are only ever saved through `admin/themeStore.ts`
(private `themes/workspace`; no public `draftDesign` fallback since 1.7 — never reintroduce one). **Auto-fit for phones** (`autoMobile.ts`) writes phone/tablet overrides; keep it in sync
with the phone keys the renderers read (`mobilePadding*`, `mobileColumns`, `mobileHeadingSize`, block `grid.tablet/mobile`).
Links, books, categories, pages, videos and fonts in section/block fields are **picked, not typed** (Studio 2.3): use the
field kinds `link` / `book` / `books` / `category` / `page` / `video` / `font` (`studio/StudioPickers.tsx`), which store the
same strings as before, and choose catalog books only through `selectBooks` in `features/site/merchandising.ts`. Saved
designs must keep rendering identically (`catalogSources*.test`), and `sectionFieldKinds.test.ts` rejects url-like `text` fields.

1. **Read `docs/THEME_EDITOR.md` first**, plus the whole section/block system —
   `studio/StudioEditor.tsx`, `ThemeEditorExtensions.tsx` (the `SECTION_REGISTRY`),
   `SectionComponents.tsx` (renderers), and the `(Sections as any)[section.type]`
   mapping in `components/sectionRender.tsx`. The files are big; budget for that instead of
   guessing.
2. **Honor the full section contract.** The storefront resolves renderers by the
   registry `type` name — a registry type with no identically named renderer
   renders nothing. The registry and `SectionComponents.tsx` renderers are
   currently at parity; keep them in lockstep. Rendered sections/blocks also carry stable
   `data-fm-section` / `data-fm-block` edit hooks for template-aware preview selection, and section settings support scoped CSS. Adding/fixing a section means:
   registry schema **+** matching renderer **+** storefront mapping **+** library
   entry **+** verify it actually shows on the live storefront, not just the
   editor preview. The single section library is Studio's registry-driven
   **Add section** dialog.
   Parity is also enforced by a permanent test
   (`src/app/components/sectionParity.test.ts`). Custom pages can carry their
   own section stacks via dynamic `page:<slug>` templates
   (`buildPageTemplates` in `ThemeEditorExtensions.tsx`), and full-theme
   presets can bulk-apply a `global` token record (see the
   "Lyricalmyrical Punk" entry in `THEME_LIBRARY`).
   Draft management is explicit: the top bar shows Live/Draft/Unsaved, and
   **Discard Draft** must reset the persisted working copy plus local history
   without modifying the published `design`.
   Visual and feature controls expose **All pages / This page only** scope.
   All-pages writes must update every static/dynamic template while preserving
   its page-specific section stack.
   Studio composition blocks may nest three levels, carry breakpoint-specific
   grid/alignment/visibility overrides, and link to `design.sharedBlocks` for
   synchronized reuse across compatible section renderers. Preserve local placement overrides when editing a linked
   source, and keep recursive operations immutable and depth-guarded.
3. **Work the roadmap, complete a milestone end-to-end.** Pick a checklist item
   from the roadmap in `docs/THEME_EDITOR.md` (sections-everywhere, more section
   types, live-preview/UX, theme management), finish it fully, then **tick it off
   and update the doc** in the same PR. Prefer one milestone done completely over
   several half-done.
4. If a request is open-ended ("enhance the theme editor"), state which milestone
   you're taking and why, then take it all the way — don't stop at a cosmetic
   tweak.

When prompting this agent, naming a specific roadmap milestone gets the most
complete result.

> [!IMPORTANT]
> **Everything shopper-facing must be editable in Studio — nothing "built into the site".**
> Any storefront element (box, row, link, heading, text) needs a Studio control to hide/show it
> and its words in Text & labels (`COPY_SCHEMA`). Add the toggle to `STYLE_GROUPS` in
> `studio/styleSchema.ts` (default = current behaviour) in the same change that adds the element.

> [!IMPORTANT]
> **Sentences that reach shoppers indirectly are copy too.** Error messages (`new Error("…")`),
> notices (`setNotice`/`setError`), `window.prompt`, SEO titles/descriptions, template-literal
> `aria-label`/`alt`s and renderer word-fallbacks must all come from `getCopy()` (Studio › Text & labels —
> groups *Checkout*, *Order tracking*, *Reviews*, *Sections*, **Site & sharing**) or, inside
> `SectionComponents.tsx`, from `sectionFallbacks.ts` (`fb("Type.field")`, each backed by a Content
> field; use `??` so clearing a field blanks it). `noHardwiredMessages.test.ts` and
> `components/sectionFallbacks.test.ts` enforce this; `designerCoverage.test.ts` also rejects literal
> `rgb()/rgba()/hsl()` (use `rgba(var(--accent-rgb, …), a)` or a design key). Behaviour numbers
> (low-stock thresholds, recently-viewed count, search-result cap) and the no-photo placeholder image
> are Studio › Style controls read with `designNumber()` / `placeholderImage()`. Site name, default
> title/description and share image live in Text & labels › **Site & sharing** and Style › Logo &
> wordmark › **Share image**; `lib/seo.ts` reads them via `setSiteIdentity` (published by `useSiteData`).
> No sample books or announcements are shown to shoppers; empty sections show their "how to fill me" sample
> only in the Studio preview (`sampleInPreview`/`sampleHtml`, guarded by `components/noSampleContent.test.tsx`).
> Footer policy link/page titles are Text & labels › Footer (`policyTitle*`).

A Studio › Style control is not done until it visibly changes the live preview on every surface that shows the element: card title/price and small-print rules come from the shared `features/site/StorefrontOverrides.tsx`, which every storefront root that writes its own token `<style>` (MainSite, BookDetail, `StorefrontThemeStyle`) must render; `storefrontOverrides.test.ts` enforces this and fails on any Style control nothing reads.

New storefront regions must carry `data-studio-target` + `data-studio-label` so clicking them in the Studio preview opens their settings (see CLAUDE.md › Click-to-edit in the preview).

Studio's announcement, header, navigation and footer are listed in **Page layout**'s Header / Footer groups
(the separate Shared layout tab was retired in 1.5; old `tab=shared` links open Page layout). In Edit mode, double-click plain text in the
iframe (or focus its edit hook and press Enter), then choose **Done** to commit
one undoable draft change or **Cancel** / Escape to restore it. Typing keeps the
preview stable; Save, Publish and Exit wait until the edit finishes. Announcement,
wordmark, masthead and footer labels edit their existing Studio fields. Linked
block text updates its shared source while placement stays local. Unsupported rich content
and templated labels open the inspector instead of flattening their content.
Browse mode restores normal interaction and removes editing focus hooks.

Studio canvas tools include a contextual section/block toolbar (Edit, Move up/down,
Duplicate, Hide, Delete and supported Add block). Plain-text clicks select on the
canvas without opening the inspector; Edit opens it. Structural actions on inherited
shared children stay unavailable, while their text edits still update the source.
Double-click supported rich-content fields for bold, italic, underline, links,
paragraph/heading style and alignment. Unsupported embeds/styles keep the inspector
path; formatted commits are sanitized and one undoable draft action.
**Spacing** exposes padding handles and renderer-supported gap handles. Dragging snaps
to 4px (Shift = 1px), arrow keys adjust values, and Escape cancels. The active preview
size controls desktop/tablet/phone scope; Reset removes that size's overrides. Numeric
spacing fields also live in Layout & style. The shared renderer applies padding once
at the content box and carries the same responsive overrides onto the storefront.

## Storefront look (Riso Noir)

The public site defaults to Riso Press on black/white with a flare accent. Keep it token-driven:
no literal colours in `RISO_STOREFRONT_CSS`, RGB triplet variables stay comma-separated, and any new
shopper-facing string needs a `COPY_SCHEMA` entry + `getCopy` call so it is editable in the theme
editor (see `docs/THEME_EDITOR.md` › Riso Noir). Payment UI stays conventional and legible.

Colour schemes (Studio › Theme settings › Colour schemes) are the way to give one part of the shop
its own palette: a scheme's roles become `[data-scheme]` token variables (`schemeCss` in
`features/site/colorSchemes.ts`, emitted by `StorefrontOverrides`). New storefront parts should read
the shared tokens (`--bg-color`, `rgb(var(--fg-rgb))`, `var(--surface)`, `var(--accent)` …) rather
than fixed design keys alone, so a scheme reaches them; new book cards carry `fm-card`. Never change
how a saved scheme without `v: 2` renders — `colorSchemes.test.ts` guards that.

## Product page

The book page is the Riso "catalogue card" layout; every part of it is a `pdp*` control in Studio ›
Style › Book page · buy box & details (see CLAUDE.md). Trust-signal lines were removed on purpose.

## Working rules

- Match the surrounding code's style, naming, and patterns.
- Prefer composing existing **shadcn/ui** primitives in
  `src/app/components/ui/` over hand-rolling new UI.
- Tests live beside source as `*.test.ts`; run with `npm test` (Vitest).
- After changing anything documented here or in `CLAUDE.md`, update both so they
  stay consistent.
- Validate before shipping: `npm run build` should succeed, and exercise the
  affected flow (storefront purchase path or admin action) end-to-end.

Live carrier choices show up to five distinct Canada Post methods, cheapest first, using the lowest quote for each service. Server quote selection sorts prices before resolving duplicate service names.

## Studio organization

Studio organization milestone: Page layout, Theme settings, Text & labels, Navigation and Pages
use readable navigation with page context. Theme settings and text browse by category; search spans
categories and Find anything/click-to-edit opens the owning category. The page outline searches
section and nested-block content, expands matching sections, numbers original positions and offers
Expand/Collapse all and explicit Move up/down actions. Section reorder is disabled while searching to preserve the complete stack.
The toolbar keeps page/device, undo/redo, draft state, Save draft and Publish visible; Theme actions
holds preview, history, checks and guarded discard. Inspector device context distinguishes shared
content from responsive layout overrides. Existing draft/publish persistence is unchanged.

**Friendlier settings homes (October 2026).** `studio/settingsMap.ts` (pure, tested) decides *where* controls
appear; it never adds or removes one. Theme settings opens in three bands (`THEME_HEADINGS` `band`):
**Site-wide design** (presets, logo, colours, typography, small print, buttons, layout, motion, Riso — the design
system), **Parts of your shop** (Header, menu & footer · Shop & book pages · Bag, checkout & accounts · Pages &
features) and **Advanced** (folded **Fine-tune single elements** + Custom code). Part cards have **Show on page**
(`CATEGORY_PAGES` names the preview page or pop-over; Studio opens it and selects the part from the structure scan). Each category card has a one-line description (`GROUP_BLURBS`)
and a **● N changed** badge. **Theme presets & saved themes** and **Payment icons** are categories now
(`EXTRA_STYLE_CATEGORIES`; click-to-edit `style:paymentIcons` opens it). Big categories split into short collapsible
sub-sections (`STYLE_SUBSECTIONS`; unlisted keys fall into **More settings**, so a new control always shows);
Find anything opens the sub-section holding the field (`fieldFocus`). Fields that differ from the default
design show **Changed from default** + **Reset to default**, and **What I've changed** lists them all.
Text & labels uses the same home (`TEXT_HEADINGS`, `TEXT_BLURBS`, "Text I've changed"); long groups (Checkout,
Order tracking, Customer account, Product page, Cart) open as short sub-sections (`TEXT_SUBSECTIONS`, regex by key,
leftovers in **More words**; a new key always shows). Find anything indexes region fields once (desktop entry,
tagged tablet/phone) instead of per device. Page layout shows
**Add section**, **Auto-fit page for phones** and a **Section tools** menu (copy / paste / save for reuse);
saved sections are picked from Add section › **Your saved sections**. A dismissible **How Studio works** card
(Theme actions › Show Studio tips) orients first-time use. `settingsMap.test.ts` fails if any Style category,
text group or field stops being reachable — place new STYLE_GROUPS / COPY_SCHEMA groups under a heading.

## Public storefront readiness repairs (2 October 2026)

Public designer coverage: Wishlist, Customer account and Order tracking have Studio canvases and section stacks. `features/site/storefrontRegions.ts` owns the public region manifest, responsive styling and click-to-edit hooks; its categories are generated in `studio/styleSchema.ts`. Add new optional regions there and attach `regionProps` in every supported renderer layout. Required commerce/consent regions support presentation controls without hide toggles. Page-only region writes merge with root settings; product overrides must retain precedence over catalog defaults. Keep phone region overrides in `autoFitRegions`. See `docs/THEME_EDITOR.md` for the page-by-page coverage and verification limits.

Public product links retain unique slugs and use immutable book IDs when slugs collide; catalog records are never rewritten. The storefront reads the entire paginated catalog and the sitemap uses the same route resolver. Unknown URLs show editable recovery content. Custom pages share the support/policy footer, with **Show page footer** in Studio > Style > Custom pages.

Phone navigation (`MobileStorefrontNav`, shared by the homepage and standalone page/product header) defaults to a sideways-scrolling row of tabs (`mobileNavStyle: "tabs"`, size `mobileNavTabSize`); a category with sub-categories is a `NavDropdown` tab like the desktop header. Studio > Style > Header & announcement bar > **Phone navigation style** switches to the keyboard-accessible disclosure menu (`"menu"`, label Text & labels > Header > **Mobile menu**). **Show phone navigation** controls visibility; existing header visibility controls apply inside both. Missing-page visibility controls live in Style > Custom pages; words remain in Text & labels > Custom pages & 404.

Checkout rejects placeholder/wrong-mode publishable keys and disables payment until an inline Stripe Element is ready. Teardown is idempotent and exception-safe. Admin payment readiness reports invalid keys. Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged. A production payment is still unverified until the owner configures valid Stripe credentials and completes a sandbox order, webhook, refund, email and fulfillment walkthrough. Public placeholder content still needs owner review.


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

## Checkout carrier delivery estimates

Live checkout shipping quotes preserve Shippo `estimated_days` and `duration_terms` for each
customer address, parcel and service. Missing carrier timing has no invented 3-7 day fallback.
Checkout displays carrier transit estimates after dispatch rather than calculating an arrival
promise from the order date; carrier terms stay separate from numeric days. Labels for transit
and unavailable timing are editable in Studio > Text & labels > Checkout. Static profile estimates
retain their existing Studio-controlled presentation. Deploy the updated `getShippoRates` Function
with the frontend. Live carrier response verification is separate from fixture-based tests.


## Responsive public element editing (4 October 2026)

Studio > Theme settings groups built-in public elements in a searchable element browser,
including hidden elements and conditional states. Selecting one opens only that element's
controls for the active desktop/tablet/phone preview, with an Edit words shortcut. Spacing
on each side, margins, dimensions, borders, typography, colors, optional visibility and
supported image cropping/grid columns are editable at each size. Tablet inherits desktop;
phone inherits tablet. Per-field resets and Reset size styling remove overrides in one
undoable draft change; All pages / This page only retain unrelated region settings.
Auto-fit for phones includes side spacing and uses tablet values where provided.
Required purchase, consent and recovery controls have presentation controls without hide
switches. Responsive visibility preserves the element's original flex/grid display.
Newsletter heading/description/form/button/status, search input/close/result rows/covers,
and individual review titles/body/authors/dates/states have explicit click-to-edit regions.
Text & labels displays effective defaults, preserves intentionally blank copy, and offers
Reset to default. Inline text uses the same page-aware writer so stale page copy cannot
shadow the new value. Copy changes preserve unrelated labels on other pages.
Local fixture checks do not certify authenticated Firestore publishing or live commerce.

Preview canvases retain their selected viewport width (1200px desktop, 820px tablet,
390px phone) in a scrollable canvas, so narrow editor windows cannot activate the
wrong breakpoint while the owner edits a different device.

## Storefront loading performance (4 October 2026)

Storefront components share one catalog/settings/published-pages bootstrap request, including
in-flight loads and route remounts. Successful display data is reused for 30 seconds; the next
mount after that refreshes it. Failed requests remain retryable and session-cached content
stays visible during refresh. The session cache is read only when a hook mounts, rather than
on every render. Studio snapshots still override backend data. Authoritative checkout prices,
stock validation and webhook payment handling are unchanged.


## Stripe checkout payment section (4 October 2026)

Checkout inserts `features/site/StripePaymentSection.tsx` with Stripe's actual
Payment Element fields inside the page. The method radio label is separate from
those interactive fields. Payment requires a valid mode-matched publishable key
and an Element-ready event. Missing/invalid keys block payment; they never route
to hosted Checkout. Legacy `stripeRedirect` design values are ignored and the
redirect control is removed from Studio. Failed/stalled loading offers an inline
Reload payment form action before a payment attempt; the form stays on checkout.
Studio > Style > Checkout · Stripe payment section owns responsive panel,
selector, card badges and recovery layout; required payment/recovery controls
cannot be hidden. Text & labels > Checkout owns all labels, badge text and retry
copy. Existing form background, padding, radius and fonts continue to apply.
Server totals and webhook-only Stripe-paid-order/inventory authority are unchanged.
Checkout submission locks synchronously before asynchronous field validation,
disables payment-method switches while processing, and retains the lock during
provider navigation. Failed validation/service calls release it for correction.
Actual field display can be verified without submitting a payment; authenticated
sandbox payment, webhook, refund and email verification remain separate.

Stripe field appearance follows Studio checkout field background, text, border, font, accent and corner-radius controls inside the secure iframe. Riso defaults use square, visibly outlined idle fields with accent focus outlines and danger outlines for invalid fields; payment tabs share the same border treatment.


## Book SEO pane (5 October 2026)

Catalog > Edit book > Search (SEO) owns `metaTitle`, `metaDescription` and optional
HTTPS `seoImage`, saved with the book through the existing admin-only write path.
A custom search title is used exactly; blank fields use catalog content and the
published Studio Site & sharing defaults. The pane previews the effective title,
plain-text description, collision-safe canonical URL and sharing image, and offers
content checks, catalog-default reset and a deployed-URL Rich Results Test link.
Checks are guidance, not a ranking score. Catalog copy and URLs are never bulk rewritten.

`lib/bookSeo.ts` supplies book metadata and Product + Book JSON-LD. The public
PDP uses its displayed currency, price and selected-edition availability, including
backorders. No reviews/ratings are fabricated. `lib/seo.ts` updates canonical and
social URLs on router navigation, strips query/fragment parameters, clears stale
sharing images, and marks previews and private account/checkout/tracking pages noindex.
`index.html` has no fixed homepage canonical that conflicts with product routes.

`build:sitemap` lists published book/page routes, escapes URLs and removes personal
pages. Book/page fetch failures fail the build instead of silently dropping their
URLs; the optional legacy collections endpoint may be unavailable and is reported.
Robots paths follow the deployment sub-path; Google reads robots.txt at the origin
root, so a project-folder robots.txt alone is not an origin-wide crawl restriction.
Private pages also use noindex metadata. Rebuild/deploy the sitemap when catalog
routes change. No new Firestore collection, rule, index or Function is required.

Verification covers focused SEO regression tests, the complete Vitest suite,
production build with public catalog reads, and local desktop/phone fixture checks
for preview/edit/save/reset and rendered PDP metadata. Fixture save evidence is not
live Firestore persistence. Google rankings/indexing and a live Rich Results Test
remain external verification. Firebase Hosting answers prerendered product routes directly with 200 and unknown
URLs with a real 404 (the old GitHub Pages SPA 404 redirect is gone). After deployment submit the sitemap and inspect
URLs in Search Console.

## Discount codes: start date and one-use-per-customer (6 October 2026)

Discounts › New/Edit has an optional **Start date** (code is refused server-side until that day; a **Scheduled**
tab lists them). **One use per customer** is now enforced by `assertDiscountNotUsedByCustomer` in
`functions/index.js` (paid orders with the same code + email; checkout lower-cases `customer.email`
on the order). Both checks run in `fetchValidDiscount` / both checkout paths; totals and webhook authority are unchanged.

## Customer bug sweep (6 October 2026)

- **Prices:** USD/EUR shoppers see the CAD price × today's rate everywhere (`CurrencyContext`), which is what the
  server charges. Stored `usdPrice`/`eurPrice` are reference-only (Books › edit › Pricing says so). `catalogUnitPrice`
  in `CartContext.tsx` mirrors the server's unit-price rule. A sale price counts only when it is above 0, and a variant
  with no price can't be added. One-click adds (wishlist, bag suggestion, "Add both") pick an in-stock edition via
  `features/site/buyable.ts`.
- **Checkout shipping:** until the shopper picks a rate, the best current quote stays selected, including after the
  address changes the quotes. With no option selected, the summary shows Text & labels › Checkout › `coShipChoose`
  instead of "Free". The IP country lookup only fills a form nobody has touched yet. BOGO "% off" uses `bogoPercent`
  (client `checkoutFulfillment.ts`, shared `src/shared/discountMath.ts`): missing means 100.
- **Abandoned carts:** `firestore.rules` limits browser writes to the cart fields and blocks `notified*`, and a
  recovered cart can't be reopened. `abandonedCartSweep` rebuilds items and prices from `books`, escapes the text,
  skips carts older than 7 days and throttles to one reminder per address every 3 days (`abandoned-cart-throttle`,
  server-only). Deploy rules and functions together.
- Order tracking accepts `#`/spaces in order numbers (`features/site/orderNumber.ts`).

## Bug sweep #2 (6 October 2026)

- **Payment integrity:** checkout accepts only CAD/USD/EUR (`functions/paymentGuards.js`). Stripe and PayPal store
  `expectedAmountMinor`/`expectedCurrency` when the payment is created, and the webhook/capture marks an order paid
  only on an exact match. A mismatch sets `paymentMismatch` and the order shows in Orders › Needs attention.
- **Stock** changes go through `functions/inventory.js` (`readBooks`/`writeStock`), one write per book, so two
  editions in one order both count. Oversells set `oversold: true`.
- **Buyable books:** the server refuses draft, archived and future-dated books, and bare lines for books sold in
  editions (`purchaseProblem`). The storefront shows only `isLiveBook` books (`features/site/liveBook.ts`, also used by
  the sitemap) outside a real Studio preview. Order item names come from the catalog.
- **Emails:** `compileEmailTemplate` HTML-escapes every value except `items_table`. Manual-payment instructions come from
  settings, not the order.
- **Checkout:** tax uses `features/site/taxRate.ts` (same matching as the server). E-book-only carts ask only
  country/province. A server-refused discount is removed with its reason (`coDiscountRejected`). PayPal has its own
  option (`coPaypalOption`). A failed PayPal capture returns to checkout. Discount dates follow the Toronto calendar day.
- **Consent:** `lib/consent.ts` `consentAllows()`. Declined analytics stops funnel/visit/referral tracking and custom code.
  Declined marketing stops abandoned-cart capture.
- Section links typed as `/path` get the site sub-path (`siteHref`). Category nav memoises on content. Untracked
  inventory never shows SOLD OUT.

## Crawlable public HTML

Production builds render the public sitemap into real HTML route documents via
`scripts/prerender-storefront.mjs` (see `docs/SEO_CRAWLABILITY.md`). Home, book,
custom-page and collection routes use the actual published storefront DOM;
account, wishlist, checkout, tracking and admin routes are excluded. Chromium is
installed by the storefront workflow. Snapshots update on deployment; rerun Deploy storefront
after publishing catalog or Studio changes. Browser storage and settings objects
are never serialized; render-time Firestore writes/analytics are blocked. Payment
and inventory authority remain live and unchanged. Install Chromium locally with
`pnpm exec playwright install chromium` before `npm run build`.

Public SEO/catalog pagination uses document IDs so records without `createdAt` are included consistently with the sitemap. Admin sorting is unchanged. HTML builds decline analytics/marketing consent and require completed custom-page content.

## Paid-but-unpaid recovery + Riso order tracking (6 October 2026)

- `markStripeOrderPaid` (functions/index.js) applies Stripe paid-order mutations only when called by
  `stripeWebhook` after signature verification (stock, discount usage, downloads, analytics and amount checks,
  idempotently). Status requests require an authorized customer/admin identity or the order's private access key;
  they retrieve that order's saved Stripe payment and record `reconciliationPending` when provider evidence
  indicates payment. The 15-minute `unpaidPaymentSweep` records the same evidence and alerts the owner.
  Neither path marks a Stripe order paid or changes stock, discount usage or revenue. Review webhook health
  and resend the signed Stripe event before fulfillment. PayPal, manual/offline and free-order paths remain available.
- Order tracking (`features/site/OrderTracking.tsx`) is a Riso order slip (`features/site/trackingStyle.ts`,
  `fm-track-*`, token-only). An unpaid Stripe order re-checks automatically and offers **Check payment again**
  (Text & labels › Order tracking › `trackRecheck`, `trackRechecking`, `trackStillUnpaid`).

## Collection indexing (7 October 2026)

Collection pages with no published, released books receive `noindex, follow` and are
omitted from the sitemap. Empty visible Studio categories remain in the prerender
route list so their initial HTML carries the same instruction. Search, sort and stock
filters do not change indexing; sold-out books still count. Renamed category URLs
canonicalize to current names. `categoryMembership.mjs` shares alias, parent and
PUBLICATIONS membership between navigation and sitemap generation. Published and
activated scheduled Studio designs remain authoritative; draft categories stay private.

## Automatic SEO refresh and catalog search controls

The storefront workflow checks published Firestore catalog/pages/settings every 15 minutes,
compares the published-content SHA-256 marker, and rebuilds only on a change. Draft-only
Studio edits do not trigger refreshes; scheduled release visibility does. Push/manual
builds always run. Only successful deployments advance the public digest marker.
Studio visible categories (including visible children) own collection sitemap URLs and
collection SEO copy. Books > Search (SEO) exposes `seoNoindex`: excluded books remain
available to shoppers, receive noindex HTML, and are omitted from the sitemap.
Studio > Text & labels > Site & sharing owns the public Google Search Console verification
token. Google property verification/submission still requires the owner's Search Console access.

## Admin Overview (7 October 2026)

**Overview layout** (`AnalyticsDashboard.tsx`, panels in `Overview{Parts,Sales,Marketing,Customers,Stock}.tsx`):
period control (+ Refresh) → compact **Ready to sell?** strip (`ReadinessStrip`; "N of M ready", only open checks listed,
done ones under *Show completed*, hidden when all pass; `launchReadiness.ts` + `readinessProgress`) → two KPI rows → "To do today" beside
newest orders → Revenue/Traffic chart (every day filled, *Compare with the period before*) → **Dig deeper** tabs
Sales · Marketing & traffic · Customers · Stock. Keep new Overview content inside those groups.
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

## reCAPTCHA / App Check

Invisible reCAPTCHA Enterprise initializes before Firestore/Auth in src/lib/firebaseApp.ts.
Use functionFetch from src/app/lib/functionsBase.ts for every browser HTTP Function
request and onBrowserRequest in functions/index.js for its server handler. Keep signed
provider webhooks and emailed digital-download links outside browser attestation.
APP_CHECK_MODE defaults to monitor; enforce only after registering the public site key,
verifying traffic, and completing the rollout in docs/RECAPTCHA.md. Direct Firestore
protection requires separate Firebase App Check console enforcement. Verification
failure copy lives in Studio > Text & labels > Site & sharing. Tokens, debug credentials
and provider diagnostics must never be logged or saved to public settings.

## Commerce access, navigation and merchandising (7 October 2026)

Stripe paid-order authority belongs only to the signature-verified webhook. Authenticated or private-key
payment status checks and the payment sweep record pending reconciliation; provider success alone does not
release an unpaid Stripe order for fulfillment. PayPal capture, manual/offline payment and server-validated
free orders remain supported through their existing contracts. Guest order access requires the private order
key; an order number or payment ID alone is not authorization.

Studio > Navigation > Header bar order chooses each published page's Main shopping bar or Publisher navigation
row (`secondaryNavKeys`). Initially, exact Submissions, History, Our history and Open call(s) page titles use the
publisher row; an explicit selection, including an empty list, overrides that grouping. Categories remain in
shopping navigation. Style > Header layout > Show publisher navigation row controls visibility; Text & labels >
Header owns its accessible name. Both header layouts and standalone page/product headers share this hierarchy,
including phones, where search stays directly available under the existing search visibility control.

Books > Categories & tags > Curated recommendations offers automatic category matches or up to four chosen
books in editable display order, with full-catalog search and removal. Saving the book applies the choice; an
empty publisher selection hides recommendations. Public rendering excludes missing, current and unpublished
books without filling a curator's selection with automatic results. Studio's existing related-books visibility
and heading controls still apply. Product details show supplied edition, positive page count, publisher and
publication date; a selected variant's name takes precedence for edition. Show edition details and the four
spec labels live in Studio. Existing contributor display, genuine photo upload, cover order and alt-text fields
remain the content source; owner-supplied photographs and editorial facts are required, never fabricated.

Checkout adds a separate optional apartment/unit field, eligible Stripe express-wallet presentation and a total
beside payment. Studio > Checkout controls their optional visibility and Text & labels owns their words. Wallet
availability depends on Stripe, browser, account and domain eligibility; this change does not prove live wallet
activation. Required payment, validation and server-priced totals remain intact.

Readiness distinguishes payment configuration, contributor/edition metadata and possible test titles from
verified deployment, hosting and email delivery. Admin alerts cover pending payment reconciliation, unresolved
label purchases and recent failed/bounced/complained email attempts, with links to the relevant workspace.
Provider acceptance is distinct from inbox delivery. Local tests and builds do not verify deployment or live
Stripe/PayPal payments, wallet eligibility, webhook delivery, email, refunds or carrier purchases.


## Cart estimates, returns and catalog review (7 October 2026)

The cart offers country/postal-code shipping previews from current server catalog prices,
edition weights and configured shipping profiles. These are preliminary profile estimates;
live carrier prices and eligibility require the full checkout address. They exclude discounts
and tax, never authorize a charge and reset when the cart/destination changes. Session storage
carries the destination into checkout. Matching saved addresses may fill street details;
other saved/recovered destinations cannot overwrite or mix with the selected destination.
Studio > Style > Cart drawer > Total & checkout button owns Show shipping cost preview;
Text & labels > Cart owns its words. Inputs use the shared cart palette and typography.

Orders > Customer return progresses through approval/decline with customer-visible instructions,
parcel receipt, full-order inspection and an explicitly confirmed full-order refund. Mixed-condition
lines record a resellable quantity. Only eligible physical copies restock, once, through the existing
provider/admin-authorized refund path. Approval and receipt never change money or inventory.
Full-order refunds include shipping, tax and digital items; partial financial refunds remain a
separate provider workflow. Cash/e-Transfer refunds must be sent externally before recording them.
Private inspection/actor/history data live in admin-only order-operations.returnCase. A limited
returnProgress summary appears in secure customer tracking with Studio-owned status words and the
existing trackingRequests region controls. Open returns block dispatch/local fulfillment and label
purchases. Stripe paid-order authority remains webhook-only; supported PayPal/manual authority is
unchanged. New endpoints cartShippingPreview and manageReturn use functionFetch and App Check.

Books loads the full catalog. Show books needing publish review flags cover/interior images,
contributor credits, base/sale/edition prices, format/edition/page count, shipping weight, publisher
copy and possible placeholders. Single-book saves to Published and bulk Publish open a reviewed
selection; invalid title/prices block publishing, other warnings require explicit acknowledgement.
Bulk Move to draft previews the chosen records and preserves their content, inventory and order
history. Failed updates remain selected for retry. Publication status controls public routes,
lists, recommendations and sitemap: titles never automatically hide products. Owners must review
and draft currently published test/duplicate records before releasing this visibility change.

Deploy the Functions bundle with the frontend so cart estimates, return transitions and refund
completion agree (including Stripe/PayPal webhooks and reconciliation). Existing books/orders/
order-operations access patterns require no new rules or composite indexes; inspection remains
private. Local handler tests and provider-isolated browser fixtures prove workflow behavior,
not deployed functions, real payment/refund acceptance, carrier rates or email delivery.

## App release notes
Every PR must add one release-note file, `src/app/admin/updates/YYYY-MM-DD-NN-<id>.ts` (`export default { … } satisfies AppUpdate`; NN = the next number for that day, so the newest note of a day sorts first; `appUpdates.ts` collects the files with `import.meta.glob`, newest first, and `app-release-notes.yml` fails a PR that adds none). Never edit another PR's note file — separate files are why parallel PRs no longer conflict. A branch started before this change that still prepends to `appUpdates.ts` fails `appUpdates.test.ts` and conflicts with `main`: keep `main`'s `appUpdates.ts` (the collector) and run `node scripts/split-app-updates.mjs <your copy of the old file>` (or with no argument on the working tree) to move your note into its own file. Each note has a stable unique ID, date (YYYY-MM-DD), plain-language title and summary, and shortcuts to the affected admin screens (`tab`, optional `settingsTab`, using IDs from `riso/nav.ts`). Explain user-visible benefits honestly; do not claim a backend deployment or live provider verification from local checks. For maintenance-only PRs, say what reliability changed and link to its relevant workspace. Keep older entries for View all updates. The admin sidebar's What's new box shows the newest entry bundled with the deployed frontend; it is not a live GitHub feed.

Checkout country dropdowns pair option backgrounds and text with Studio's Checkout field colours, including Stripe's Windows dropdown; highlighted Stripe options use contrasting text on the checkout accent.
Stripe payment fields retain Studio colours when readable and choose contrasting black/white text for insufficient-contrast pairs; labels follow the surrounding checkout text.

Custom-page navigation resolves published bodies from useSiteData's shared snapshot, including Studio preview updates. Avoid separate slug fetches that clear the header/content on each link; cold custom-page loading retains the shared header.
Grouped footer navigation defaults to Explore and Participate & connect, with policies in a wrapping row above copyright. Studio > Style > Footer & social links selects grouped/classic layout and group/location/heading visibility; Text & labels > Footer owns headings. Menus > Footer menu can customize automatic links, assign groups, edit destinations/labels, reorder and hide links, preserving sub-links. Contact pages suppress the duplicate automatic email link. Preview click-to-edit and inline copy hooks remain available.

## Bug sweep #6 + shop filters (8 October 2026)

- **Shop filters:** `features/site/CatalogControls.tsx` adds Shopify-style **Format** chips (paperback, hardcover,
  e-book, audiobook, other — from the book's and every edition's format, `bookFormats`), **Price** Min/Max boxes
  (typed in the shopper's currency, `priceRangeFor`) and **Clear filters**. Chips show only when the current view has
  2+ formats and the price boxes only with 2+ prices (`filterView`); a hidden filter never applies (`appliedFilters`).
  "In stock" counts editions and backorders (`bookInStock`); search also matches ISBN. Each piece is a Studio region
  (`catalogFormat`, `catalogPrice`, `catalogClear` — show/hide + layout in Theme settings › Fine-tune single elements › Catalog & shared content · layout);
  words are Text & labels › Search & filters (`filterFormat*`, `filterPrice*`, `filterClear`). The bar itself still
  follows Style › Shop page heading & filters › **Show search, sort & in-stock bar**.
- **Display price:** `features/site/displayPrice.ts` — a book sold only in editions shows its cheapest edition
  (CurrencyContext `getBookPrice`, shop cards, search, showcase grid, filters/sort) instead of CA$ 0.00.
- **Server prices:** `functions/catalogPrice.js` `catalogUnitPrice` mirrors `CartContext.catalogUnitPrice` everywhere
  (a `"0"`/negative sale price is ignored; an edition with no price is refused, never charged $0).
- **Discounts:** `validateDiscountCode` returns `maxDiscountAmount` (checkout showed the uncapped amount);
  `functions/discountPayload.test.js` fails if checkout reads a field the server doesn't send. Every discount is clamped
  to 0…items value on both sides; percent tiers over 100 are refused in the editor. The card-retry key includes the code.
- **Stock holds:** holds carry `owner` (sha256 of the email, `holdOwner`); a shopper's own earlier attempt never blocks
  their retry, other shoppers are still held off.
- **Digital vs physical:** one rule (`isPhysicalItem` / admin `isDigitalItem`) in the cart estimate, returns, label guard
  and publish review — audiobooks/EPUBs/format-only e-books are never shipped, returned or weight-checked.
- **Returns:** a return request the shop hasn't approved can be refunded directly (only approved/received block refunds);
  the workbench offers **Close request without a return**; a closed request can't be reopened; a refund that never reached
  the provider clears its `refundRequest` claim; a lost dispute doesn't show the customer "refund complete"; refunding an
  undispatched order follows the admin's restock choice.
- **Storefront:** `lib/ScrollToTop.tsx` opens each newly clicked page at the top; account data is cleared on sign-out /
  user change (no address carry-over) and order rows/fields are keyboard + screen-reader accessible; product views count
  once; product **Back** goes home when the shopper landed directly; the quantity stepper counts copies already in the bag
  and `addToCart` returns false when nothing was added; Recently viewed updates between books; search overlay traps focus;
  footer icon links have labels (Text & labels › Footer); the grouped legal row hides with no policies; wishlist badges
  count only live books; the cart estimate guesses the country and hands its destination to checkout only after **Estimate**.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Bug sweep #7 (8 October 2026)

- **Stock on book save:** `adminApi.updateBook(id, form, loaded)` re-reads the book in a transaction and keeps the live
  `stockLevel` / edition stock for any count the owner didn't change (`admin/bookStockMerge.ts` `keepLiveStock`), so a
  sale made while the editor was open is never undone. **Discount edits** never write `usageCount`/`createdAt`
  (server-owned). Duplicate codes are refused in the editor (`validateDiscountDraft(…, otherCodes)`); the server trims
  codes and uses the usable copy when old duplicates exist (`fetchValidDiscount` / `discountProblem`).
- **Display price:** a book sold in editions shows its cheapest edition and never a SALE badge (`displayPrice`,
  `showsSale` in `features/site/displayPrice.ts`) — it's always charged an edition's price. Search/wishlist/sections use it.
- **Backorders:** `backorderable(book)` (CartContext, book-level `allowBackorder` like the server) — no stock cap in
  `addToCart` or the product page quantity. The bag drawer reprices saved lines once the live catalog loads (never in
  preview; lines that can't be bought are left for checkout's notice).
- **Release dates:** a plain `scheduleDate` opens at midnight Toronto (`releaseArrived` in `liveBook.ts`, mirrored in
  `functions/paymentGuards.js` and `scripts/publicStorefrontData.mjs`); admin discount "today" and Expires use the shop day.
- **PayPal:** partial refunds accumulate (`paypalRefundedTotalMinor`, `paypalRefundIds`) and a full total refunds the
  order; capture uses the order's own `paypalMode`. Order emails list download links for every non-physical line
  (`isPhysicalItem`); the shop's paid-order email escapes the address.
- **Admin:** bulk Feature writes `isFeatured`; Approve/Reject selected acts only on visible reviews and the queue loads
  every pending review; Orders CSV includes partial refunds; Overview stock skips `trackInventory: false` books and the
  format mix uses each line's sold edition.
- **Account:** email-link sign-in survives blocked storage; order rows count copies.
- Deploy Functions with this frontend. No Firestore rule or index changes.

## Pre-orders

A published book with `preorder: true` sells before its `publishDate` (see CLAUDE.md › Pre-orders). The rules live once in
`src/shared/preorder.ts` (the Functions use its generated copy `functions/shared/preorder.js`; `pnpm run build:shared`). Pre-orders never change
stock, price or payment authority; the server stamps `preorder`/`releaseDate` on order lines from the catalog, and the
**Awaiting release** queue plus `labelProblem` keep parcels back until release or **Ready to ship now**.

## Coming soon books (12 October 2026)

Books › edit › Inventory › **Coming soon** (`comingSoon: true`) shows a published book that can't be bought yet. One rule,
`features/site/comingSoon.ts` `comingSoonActive` (server: `purchaseProblem` in `functions/paymentGuards.js` refuses it as
`unavailable`, so every checkout path refuses it). It wins over Pre-order (the editor switches the other off). `addToCart`
refuses it, `repriceCart` drops saved lines, `quickAddChoice` returns `{ inStock: false, comingSoon: true }`; it is never shown
as Sold out. Product page: stock line `pdpComingSoon` / `pdpComingSoonDate` (Publication date, `data-state="soon"`), the buy
button reads `comingSoonButton` and opens `BackInStockForm comingSoon` (`#pdp-coming-soon-signup`, same `stockAlerts` doc for
the whole book, variantId ""); no qty, Buy it now or sticky bar. Cards: `comingSoonBadge` (shop grid, wishlist, related);
section quick-add hides. Studio: Style › Badges › `showComingSoonBadge`, Product page › `showComingSoonSignup` (off = the button
is a disabled label). JSON-LD says OutOfStock. Turning the switch off fires `onBookRestocked` (`before.comingSoon === true`):
signups get an **Out now** email for editions with stock (`releasePending` carries the wording to `backInStockSweep`); while
it is on, no back-in-stock email is sent. Admin › Books has a Coming soon badge and status filter. Deploy Functions with the frontend.

## Payment-integrity audit fixes (9 October 2026)

- **Exact card amount:** `StripeCardForm` exposes `setAmount(minor, currency)` / `releaseAmount()`. Checkout pins the
  Elements amount to the server PaymentIntent's `amount`/`currency` before every `confirm` (a reused intent too); the
  screen-total effect can't overwrite it during the attempt, and a changed amount is re-submitted before confirming.
- **Reused intents age out:** the remembered card attempt (`features/site/cardAttempt.ts`, `reusableCardOrder`) keeps its
  PaymentIntent for 25 minutes (holds last 30); after that Pay asks the server again on the same order (re-price, renew
  holds, cancel the old intent). A non-card confirm error on a reused intent asks `action: "status"` and opens the
  success page when Stripe says complete/processing.
- **No paying twice:** `releaseSupersededAttempt` returns `{ paidOrderId }` when the shopper's own earlier attempt is paid,
  PayPal-captured, `reconciliationPending` or Stripe-taken (`previousAttemptPaid`, `paymentGuards.js`); card, hosted,
  PayPal, free and manual checkout then refuse with 409 `previous_attempt_paid` + `previousOrderId` before touching the
  new order. Checkout opens that order's confirmation (`?previous_paid=true`) with Text & labels › Checkout ›
  **Earlier attempt already paid** (`coPreviousPaid`). The success landing forgets the tab's attempt once it is bought.
  A `payment_in_progress` refusal is now decided before the order is re-priced, so it never rewrites gift cards.
- **Gift cards:** paid transactions read the cards in `chargedRedemptions(order)` (what the live payment was created for).
- **Failed refunds:** `charge.refund.updated` (in `REQUIRED_WEBHOOK_EVENTS`) with status failed/canceled, and the reversal
  sweep (refund_pending, `amount_refunded` 0, `failedRefundId`), call `revertFailedRefund`: back to paid (status from
  `preRefund`, saved by `applyOrderRefund`), restocked copies taken back, discount use and revenue re-counted, restored
  gift-card amounts re-debited, `refundRequest` cleared, timeline note — once. Run **Fix webhook** after deploying.
- **Totals:** `totalNeedsConfirming(server, shown, currency)` allows 5¢ in CAD and max(5¢, 1%) in USD/EUR. Customer
  emails' Total (`chargedTotalFmt`) and the Orders CSV `ChargedAmount` use `expectedAmountMinor`/`expectedCurrency` when set.
