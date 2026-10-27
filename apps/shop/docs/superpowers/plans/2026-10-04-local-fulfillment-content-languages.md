# Local fulfillment, reusable content, and languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native implementation, or superpowers:subagent-driven-development if the owner selects delegated implementation. Steps use checkbox syntax.

**Goal:** Deliver the four approved features as complete admin, Studio, shopper, and fulfillment workflows.

**Architecture:** Execute three subsystem milestones in order: local fulfillment, reusable content, then localization. Keep checkout decisions server-authoritative; use explicit immutable fulfillment snapshots, published resource references, and per-resource translations. Integrate each milestone before beginning the next because translations must cover both new workflows.

**Tech Stack:** React 18, TypeScript, Vite 6, Firebase/Firestore, Node 22 Functions, Stripe, Resend, Vitest, existing Riso admin primitives.

**Spec:** ../specs/2026-10-04-local-fulfillment-content-languages-design.md

## Global constraints

- Preserve server-priced checkout, webhook-only paid status and inventory changes, restricted admin access, and router-relative URLs.
- Preserve unrelated fulfillment edits currently in the checkout.
- New public presentation and copy are Studio-owned.
- Initial languages: English and French, with extensible locale definitions.
- First version uses normalized Canadian postal-code prefixes and exact postal codes.
- Manual translation editing is included; automatic AI translation is deferred pending an explicit provider choice.
- Pickup and delivery start disabled; no sample addresses or service areas are activated.
- Draft content stays admin-only; preview carries unsaved changes without publishing them.

## Review focus

1. An unavailable local method must fail server validation rather than fall back to a shipping charge (Task 2).
2. Payment redirects and order-tracking links must preserve locale, including anonymous customers (Task 8).
3. Deleted/unpublished reusable records must not expose draft content or break book pages (Tasks 5–6).
4. Duplicate ready/delivery transitions must not send duplicate notices or alter paid status (Task 4).
5. An explicitly blank translation must not become default-language text (Task 7).

## Execution setup

- [ ] Inspect attached worktrees and Git state; reuse suitable isolation or create a managed worktree based on current main. Copy only approved design/plan documents. Preserve dirty main-checkout fulfillment files.
- [ ] Read repository instructions in that checkout, fetch main, inspect CI/deployment config, and run baseline tests before edits.
- [ ] Use a scoped codex/local-fulfillment-content-languages branch. Do not deploy or merge as part of PR delivery.

## Milestone A: Pickup and local delivery

### Task 1: Configuration, normalization, and quote parity

**Create:** functions/localFulfillment.js, functions/localFulfillment.test.js, src/app/features/site/localFulfillment.ts, src/app/features/site/localFulfillment.parity.test.ts, src/app/admin/LocalFulfillmentSettings.tsx.
**Modify:** src/app/admin/ShopSettings.tsx, src/app/features/site/types.ts, src/app/admin/api.ts, firestore.rules, firestore.indexes.json as dictated by actual access/query changes.

**Interfaces:** LocalFulfillmentConfig contains enabled pickupLocations and deliveryZones with stable IDs. quoteLocalFulfillment(config, destination, cartSubtotal, physicalItems) returns eligible quotes with ID, method (pickup/local_delivery), price, location/zone ID and public information. Invalid monetary or postal configuration yields no eligible option. Pickup requires valid origin address; delivery minimum uses discounted physical-merchandise subtotal before delivery and tax, consistently client/server.

- [ ] Add failing parity tests: disabled config returns [], lowercase/spaced postal codes match normalized prefixes, exact codes stay exact, overlapping zones return separately identified choices, minimum boundaries work, negative/NaN prices are rejected, digital-only baskets return no physical quotes.
- [ ] Run the focused Vitest parity test and Functions node test; confirm assertion failures.
- [ ] Implement the contract and Riso Shipping controls, including zone tester, actionable validation, ordering, enabled toggles, editable instructions/hours/estimates.
- [ ] Run focused tests and verify persistence rejects unauthorized edits. Commit scoped files.

### Task 2: Server checkout authority and fulfillment snapshot

**Modify:** functions/index.js, functions/localFulfillment.js, functions/fulfillmentGuard.js, firestore.rules.
**Test:** functions/localFulfillment.test.js and server checkout regression tests using the existing test harness.

**Interfaces:** Validate explicit order.fulfillmentSelection {method, optionId}; return {cost, method, fulfillment} where fulfillment is a server-built immutable snapshot of destination/location, instructions, price and method. Legacy shippingMethod remains compatible with existing shipping orders. Unknown local IDs fail closed.

- [ ] Add failing tests for stale/disabled choices, changed fees, spoofed snapshot/price, insufficient minimum, mixed carts, pickup without shipping address, and free-shipping promotions preserving local method identity.
- [ ] Add tests proving enabled Shippo cannot replace an explicit local option; neither Stripe nor PayPal checkout accepts the client's price.
- [ ] Implement validation before carrier resolution in all actual checkout entry points. Recalculate pickup tax using the configured collection location and required billing information; persist authoritative snapshot in unpaid order creation.
- [ ] Verify hosted and inline Stripe flows preserve webhook-only stock/payment mutation. Run focused tests; commit.

### Task 3: Shopper checkout, tracking, and editable surfaces

**Modify:** src/app/Checkout.tsx, src/app/features/site/OrderTracking.tsx, src/app/features/site/storeCopy.ts, src/app/features/site/storefrontRegions.ts, src/app/admin/studio/styleSchema.ts, src/app/admin/studio/autoMobile.ts, relevant header/cart/checkout schema paths discovered during execution.
**Create:** src/app/features/site/FulfillmentMethodPicker.tsx and adjacent meaningful interaction tests.

**Interfaces:** Picker consumes eligible quote records from Task 1 and emits fulfillmentSelection. Pickup collects customer contact and required billing information; delivery requires serviceable full address. Selected quote IDs are stable across re-rendering and invalidated visibly after cart/address/config changes.

- [ ] Write failing tests for shipping/pickup/delivery switching, stale selection clearing, contact requirements, digital-only baskets, and retaining local options beside Shippo quotes.
- [ ] Implement method/location selection, cost summary, pickup instructions and delivery estimate. Add COPY_SCHEMA fields, regions/style controls, click-to-edit hooks and mobile overrides together.
- [ ] Render validated snapshots in order confirmation/tracking, including recovery text; keep required commerce controls available.
- [ ] Run focused interaction, copy, designer coverage and parity tests. Commit.

### Task 4: Fulfillment desk and transactional notifications

**Modify:** src/app/admin/fulfillment.ts, src/app/admin/fulfillment.test.ts, src/app/admin/fulfillmentActions.test.ts, src/app/admin/api.ts, src/app/admin/FulfillmentWorkbench.tsx (resolve actual existing path), functions/fulfillmentGuard.js, functions/index.js, src/app/admin/NotificationEditor.tsx, firestore.rules.

**Interfaces:** Authenticated transitions: pickup prepared -> ready_for_pickup -> collected; delivery prepared -> ready_for_delivery -> out_for_delivery -> delivered. Packing remains required. Paid status, inventory and refunds remain provider-controlled. Operations notes remain private; public status/instructions are the minimum tracking projection. All transitions are transactional and idempotent.

- [ ] Write failing tests for pickup skipping shipping-address review, delivery retaining address review, terminal/unpaid/held rejection, packing prerequisites, duplicate transitions, carrier label rejection for local methods, and completed queues.
- [ ] Extend existing workbench/queues without duplicating the workflow; use method-specific actions and confirmation dialogs. Adapt existing legacy orders without rewriting them.
- [ ] Extend the existing notification trigger/template infrastructure with a durable per-transition notification claim, editable ready/delivery messages, locale-ready template fields, and honest error reporting. Avoid introducing deploy-time IAM dependencies without checking CI support.
- [ ] Run Functions guard/notification and admin action tests; browser-check the complete local flow with labeled fixtures. Commit.

## Milestone B: Reusable authors and events

### Task 5: Published resource data and Riso management

**Create:** src/app/admin/ReusableContent.tsx, src/app/admin/contentRecords.ts, src/app/admin/contentRecords.test.ts.
**Modify:** src/app/admin/api.ts, src/app/admin/Dashboard.tsx, src/app/admin/BookEditor.tsx, src/app/features/site/types.ts, firestore.rules, firestore.indexes.json.

**Interfaces:** AuthorRecord extends current author IDs with status, biography, portrait/alt, public links, slug and translations. EventRecord adds title, description, timezone, start/end, venue/online URL, authorIds/bookIds, image/alt, status, booking URL, slug and translations. APIs separate admin listing from public published queries. Existing authors without status are normalized through an explicit compatible migration policy before restrictive public queries; no drafts become public implicitly.

- [ ] Add failing tests for malformed dates/timezones, unsafe URLs, missing required publish fields, duplicate route slugs, referenced deletion, and draft/public query contracts.
- [ ] Implement create/edit/publish/unpublish/delete with searchable lists, reference counts and explicit deletion handling. Retain BookEditor author identity compatibility.
- [ ] Update rules/indexes and test public reads cannot expose draft author/event content. Run focused tests; commit.

### Task 6: Studio references, routes, and previews

**Create:** src/app/features/site/AuthorPage.tsx, src/app/features/site/EventPage.tsx, src/app/features/site/contentRoutes.ts and adjacent tests.
**Modify:** src/app/admin/ThemeEditorExtensions.tsx, src/app/admin/studio/StudioEditor.tsx, src/app/components/SectionComponents.tsx, src/app/components/sectionRender.tsx, src/app/components/sectionFallbacks.ts, src/app/features/site/useSiteData.ts, src/app/features/site/siteCache.ts, src/app/admin/studio/studioWorkflow.ts, src/app/features/site/previewTab.ts, src/app/App.tsx, src/app/features/site/storefrontRegions.ts, styleSchema.ts, autoMobile.ts, src/app/lib/seo.ts, scripts/generate-sitemap source at actual existing filename.

**Interfaces:** Complete preview snapshot adds authors/events; sections store record IDs and local presentation settings. Reference resolver returns only permitted records (published publicly, explicitly available drafts in admin preview). Public routes use stable collision-safe IDs/slugs and relative navigation.

- [ ] Add failing tests for record-update propagation, missing/deleted references, no shopper sample content, draft isolation, preview cloneability, section parity, and route/SEO resolution.
- [ ] Add searchable Studio author/event pickers and matching registry/library/renderers; preserve section local styling and nested/shared block contracts. Add owning search category and click-to-edit targets.
- [ ] Implement author/event detail routes, responsive region controls, editable fallback messages, metadata and sitemap publication filtering.
- [ ] Run focused Studio/renderer/route tests and browser-check author reuse across book/page/section and an event preview/public route. Commit.

## Milestone C: Languages

### Task 7: Locale resolution and Studio translation editing

**Create:** src/app/features/site/localization.ts, src/app/features/site/localization.test.ts, src/app/admin/studio/StudioLanguages.tsx, src/app/features/site/LanguageSelector.tsx.
**Modify:** src/app/features/site/storeCopy.ts, types.ts, useSiteData.ts, src/app/admin/studio/StudioEditor.tsx, studioWorkflow.ts, previewTab.ts, existing storefront headers and COPY_SCHEMA/style/region schemas.

**Interfaces:** resolveLocale(enabledLocales, defaultLocale, URL, savedPreference) returns supported locale. translateField(resource, locale, field) and getCopy resolve missing keys to default language; key presence with empty string preserves blank. Locales use validated language tags, initially en/fr. Studio translations follow each associated resource's draft/publication lifecycle.

- [ ] Add failing tests for unsupported locales, query precedence, reload/navigation persistence, explicit empty fields, missing fallback, and draft preview without public leakage.
- [ ] Implement locale selection and per-resource translation fields for copy, book/page/author/event content, categories/navigation, policies, section/block fields and image alt text. Editor shows completeness and source text; searches translation categories.
- [ ] Extend preview snapshot with selected locale and unsaved translated resources, preserving iframe/new-tab synchronization. Set document lang on public routes.
- [ ] Run focused localization/Studio/copy tests and browser-check editing French content, preview, save/discard/publish and selector phone accessibility. Commit.

### Task 8: Apply translations across storefront, checkout, notifications and SEO

**Modify:** all public renderers/pages that consume translatable resources, checkout, tracking/account/cart/search, functions/index.js and notification template helpers, src/app/lib/seo.ts, sitemap generator, App.tsx and relative-link helpers where necessary.

**Interfaces:** Server validates and persists order.locale; notification template resolver uses locale with deterministic default-language fallback. Display projections translate presentation fields while immutable IDs, money, stock, category membership and payment configuration remain original authoritative values.

- [ ] Add failing tests for French search results and book detail, selected language through cart/checkout/provider return links, guest tracking, localized messages, untranslated fallback, empty text, nested sections and shared blocks.
- [ ] Translate every approved content surface including notices/provider error mapping and accessible labels. Preserve token substitution and rich-content sanitization.
- [ ] Add localized metadata, canonical/hreflang and sitemap rules for supported language parameter URLs; prevent duplicate default-language URLs and preserve unique product routes/subpath.
- [ ] Localize transactional receipt/pickup/delivery templates using order.locale and editable template resources; never change payment authority.
- [ ] Run focused multilingual integration, SEO, message and copy coverage tests; browser-check both locales at desktop/phone through new content and all three fulfillment methods. Commit.

## Final delivery

- [ ] Update AGENTS.md, CLAUDE.md and docs/THEME_EDITOR.md together with controls, data contracts, behavior and deployment order.
- [ ] Fetch current origin/main and integrate without discarding upstream or unrelated work. Run npm test and npm run build, plus Functions tests required by changed server code.
- [ ] Verify affected admin and storefront flows in a real browser; distinguish fixtures from authenticated/live evidence. Check drafts, anonymous access, mobile keyboard use, and payment readiness behavior.
- [ ] Review full scoped diff for security/payment regression and specification completeness. Resolve findings and rerun only relevant checks after changes.
- [ ] Push scoped committed branch, create PR against main, attach it to this chat and inspect CI. Document Functions/rules/frontend deployment dependencies and pending authenticated sandbox order/webhook/refund/email/fulfillment verification.

## Self-review

All four approved features map to Tasks 1–8. Browser/server quote parity, provider checkout paths, private operations, notification idempotence, publication boundaries, existing author compatibility, Studio full-state preview, explicit blank translations, route/SEO/subpath handling and documentation have assigned tasks. Postal-code delivery and manual English/French translations preserve the approved initial scope. Execution method awaits owner selection.
