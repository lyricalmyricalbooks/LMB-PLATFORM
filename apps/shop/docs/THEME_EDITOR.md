# Theme Editor — Architecture & Shopify-Parity Roadmap

This is the **north star** for the theme editor. Studio (`src/app/admin/studio/`) is
the only designer — the legacy `ThemeEditor.tsx` / `ThemeEditorPro.tsx` /
`ThemeEditorBuilder.tsx` files are gone, so older roadmap entries below that name
them are history. Any AI session or contributor should **read this file first**,
then read the relevant source, before changing the editor. The goal is to reach
**Shopify-level theme editing**. Work the roadmap below milestone by milestone —
complete one end-to-end and check it off, rather than making a single timid
increment and stopping.

> Keep this file accurate. When you change the editor, update the architecture
> notes and tick/extend the roadmap in the same PR. Also keep the short "Theme
> Editor" sections in `CLAUDE.md` and `AGENTS.md` consistent with this doc.

## What already exists (don't rebuild it)

- [x] Studio › Menus category management: searchable Edit/Delete, descriptions,
  optional images, direct assignment counts, visibility, hierarchy and menu order;
  full-catalog book picker with add/remove/move and safe deletion choices.
  Category details remain draft/publish edits. Explicit book saves update live
  tags atomically (up to 400 books), anchored to published category names so
  Discard Draft cannot orphan assignments. New categories must be published first.
  Deletion preserves books, promotes children and refreshes membership before/after
  cleanup. For more than 400 members, use Edit › Assigned here in groups first.

The editor is **not** a blank slate. It already supports:

- A **section + block** model with per-section/per-block settings schemas.
- **Drag-and-drop** reordering, duplicate, show/hide, and delete of sections.
- **Color schemes**, palettes, and a theme/preset library.
- **Fonts** (Google Font loader + selector) and typography tokens.
- **Contrast checking** (WCAG ratio badges) for accessibility.
- **Draft / publish** workflow, plus **scheduled publish**.
- A persistent **unpublished changes** state and guarded **Discard Draft** flow
  that restores the working copy to the live theme without touching shoppers.
- An **All pages / This page only** scope switch for visual and feature panels.
  All-pages changes are copied to every static and dynamic template while
  preserving each template's section stack.
- **Section presets** (save/reuse a configured section).
- **Live preview** via an iframe `postMessage` channel with click-to-edit (the
  preview can request a section be opened in the editor). `STUDIO_PREVIEW_STATE`
  sends the complete unsaved design plus current books, published pages and
  non-design settings, so colors, navigation and newly created pages update
  together without an iframe reload. Studio also directly dispatches the same
  event into its same-origin iframe as a delivery fallback, preventing iframe
  timing from leaving the canvas on published colours; `THEME_UPDATE` remains
  supported for legacy callers. The snapshot is JSON-cloned first (`toCloneable`,
  dropping Firestore `_lastDoc`) because an uncloneable book made every post throw.
  **Preview in new tab** sends the same snapshot over
  `BroadcastChannel("studio_preview")` to a top-level `?preview=true` window
  (`features/site/previewTab.ts`), which re-dispatches it as a window message.
- **Import/export** of a theme design as a `.theme.json` file (Studio › My themes, `studio/savedThemes.ts`).
- A **token/CSS-variable layer** applied to every storefront surface.
- **Shared shop categories** edited in Studio › Menus, with create-and-assign also
  available in the admin book editor. Catalog-created categories update the
  published storefront and Studio working copy atomically without replacing
  unrelated design fields.

## Architecture map

| File | Owns |
|------|------|
| `src/app/admin/studio/StudioEditor.tsx` | Studio shell: top bar (page picker, device, Edit/Browse, undo/redo, Save draft, Publish, Theme actions), left rail (Page layout, Theme settings, Text & labels, Navigation, Pages, Media), preview iframe wiring and the single `change(fn)` edit entry point. |
| `src/app/admin/studio/StudioOutline.tsx` / `StudioInspector.tsx` | Section/block outline and the section/block inspector (Content, Layout & style). |
| `src/app/admin/studio/styleSchema.ts` / `settingsMap.ts` | Every Theme settings control (`STYLE_GROUPS`, region groups) and where each one lives. |
| `src/app/admin/studio/previewBridge.ts` / `canvasBridge.ts` | Script injected into the preview: click-to-edit, inline text, canvas toolbar, spacing handles. |
| `src/app/admin/ThemeEditorExtensions.tsx` | The real **`SECTION_REGISTRY`** (41 section types), `getSectionFields`, `getBlockFields`, `getSectionMeta`, the shared field editors (`SectionFieldEditor` / `BlockFieldEditor`). Field types: `text`, `textarea`, `html`, `richtext`, `color`, `number`, `range`, `select`, `toggle`, `date`, `image`, plus the picker kinds `link`, `book`, `books`, `category`, `page`, `video`, `font` (`studio/StudioPickers.tsx`). |
| `src/app/components/SectionComponents.tsx` | **One storefront renderer per registry section type** (the components that actually draw each section) + shared style helpers (spacing, background, button styles, animation wrappers). Registry and renderers are at parity — every `SECTION_REGISTRY` type has a matching renderer. |
| `src/app/components/sectionRender.tsx` | **Shared section renderer** (single source of truth for section→renderer mapping). `SectionList` (pure: maps a `sections` array → renderers via `(Sections as any)[type]` and emits stable `data-fm-section` / `data-section-id` edit hooks); `TemplateSections` (renders `design[templateId].sections` for a page-type template); `GlobalSections` (renders the flat `design.globalSections`). Used by MainSite **and** every standalone page. |
| `src/app/components/MainSite.tsx` | Renders the homepage/storefront. Uses `SectionList` for `heroPage.sections` and the shared `GlobalSections` from `sectionRender`. |
| `src/app/features/site/StorefrontThemeStyle.tsx` + `themeTokens` | Injects the semantic token / CSS-variable layer onto any storefront surface via the `[data-fm-store]` attribute. |
| `src/app/admin/api.ts` | Persistence: `getSettings`, `updateSettings(settings, { publish })`, `schedulePublish`. |
| `src/app/admin/studio/StudioMedia.tsx` / `mediaLibrary.ts` / `mediaPicker.tsx` | Media library (2.4): rail panel, picker dialog, pure where-used/replace/filter helpers; `components/ResponsiveImage.tsx` renders library pictures with `srcset`. |
| `src/app/admin/studio/studioModel.ts` | Immutable Studio state, recursive block-tree operations (three levels), linked shared-block resolution, normalization, and undo/redo. |

## The section/block contract (read before adding a section)

The storefront maps a section to its renderer **by name**, in
`MainSite.tsx`:

```tsx
const SectionComponent = (Sections as any)[section.type];
if (!SectionComponent) return null;   // <-- silently renders nothing
```

This is the #1 footgun: if a section type exists in `SECTION_REGISTRY` (so it
appears/edits in the admin) but has **no matching exported renderer** in
`SectionComponents.tsx`, the storefront silently renders nothing — "I added it
but it doesn't show up." The registry and renderers are currently at **parity**
— every `SECTION_REGISTRY` type has an identically named renderer — so keep it
that way: whenever you add a registry type, add its renderer in the same change
(verify with the grep in "Verifying").

To add (or fix) a section end-to-end, all of these must line up:

1. **Schema** — add/extend the entry in `SECTION_REGISTRY`
   (`ThemeEditorExtensions.tsx`) with its `getSectionFields` (and
   `getBlockFields` if it has blocks). The registry `type` string is the join
   key for everything else.
2. **Renderer** — add an `export function <Type>({ settings, books, onCtaClick,
   onProductClick, enableAnimations }) {…}` in `SectionComponents.tsx`. The
   export name **must equal** the registry `type`.
3. **Storefront mapping** — rendering goes through `sectionRender.tsx`
   (`SectionList`), so a correctly named renderer resolves automatically on every
   surface: the homepage (`heroPage.sections`), each page-type template via
   `TemplateSections` (product/collection/page/cart), and `globalSections`. No
   per-page wiring is needed for a new section type.
4. **Section library** — make sure it's exposed in Studio's **Add section** dialog
   (registry-driven; this is the only section library).
5. **Verify on the live storefront**, not just in the editor preview — render it,
   reorder it, hide/show it, and save+publish.

Blocks follow the same idea: schema via `getBlockFields` + `BlocksEditor`,
rendered by the section's renderer (e.g. `RowSection`/`RowBlock`).

Field kinds: a link field is `kind: "link"` (never a bare `text` box), a video URL `video`, a book
`book`, several books `books`, a category `category`, a custom page `page`, a font name `font`
(`sectionFieldKinds.test.ts` enforces the url/slug ones). A section that lists books takes them from
`selectBooks` (`features/site/merchandising.ts`) — add `...bookSourceFields(…)` to its fields.

## Persistence model

- **Studio 2.0 (0.4):** the live design stays in public `settings/website.design`; the work-in-progress
  draft moved to admin-only `themes/workspace.draft` (with a save revision) and My themes to
  `savedThemes/{id}` — see `admin/themeStore.ts`. The notes below describe the legacy layout, which Studio
  still uses until the Firestore rules for those collections are deployed.
- The theme lives in site settings as **`design`** (live) and **`draftDesign`**
  (work-in-progress). Sections are in `design.sections` (homepage),
  `design.globalSections`, and `design.homepageSections` (legacy alias still
  read as a fallback).
- `adminApi.updateSettings({ design }, { publish })`:
  - `publish: true` → writes both `design` and `draftDesign` (goes live).
  - `publish: false`/omitted → writes only `draftDesign` (save draft).
- `adminApi.discardThemeDraft(design)` replaces `draftDesign` with the current
  published design. The editor clears local undo/redo state at the same time so
  a discarded draft cannot accidentally be restored and re-saved.
- `adminApi.schedulePublish(design, at)` stores `scheduledPublish` so the
  storefront can promote a design at a future time.
- `design.sectionPresets` holds saved section presets.
- **Per-page section stacks** live at `design["page:<slug>"]` — one dynamic
  surface per published custom page, listed by `buildPageTemplates(pages)`
  (`ThemeEditorExtensions.tsx`) and shown as extra template pills. `PageView`
  renders that surface when it has sections and falls back to the shared
  `design.page.sections` otherwise; `design["page:<slug>"].hidePageBody`
  suppresses the legacy title + body HTML so a page can be fully
  section-built. Fully backward compatible — pages without a per-page stack
  behave exactly as before. Custom pages use the themed storefront header
  (logo, header menu, published in-header pages, wishlist and account controls),
  and newly created pages opt into that header navigation by default.
- **Full-theme presets** (`THEME_LIBRARY` in `studio/themeLibrary.ts`) may carry a
  `global` record; `applyThemePreset` bulk-writes those keys to the design
  root and **every static/dynamic page surface** in one undo step via
  `applyGlobalDesignKeys`. The same mechanism powers the editor's **All pages**
  setting scope for colors, typography, layout, controls, and feature toggles.
  This matters because page surfaces resolve object-first, so surface clones
  shadow root-only writes. A preset may also name a `homeLayoutTemplate`
  (`HOME_LAYOUT_TEMPLATES` id), offered opt-in (confirm dialog) after apply.
  Reference implementation: `lyricalmyrical-punk`.

## Known gaps & inconsistencies (seed for the roadmap)

- **Section library unified.** The single library is Studio's **Add section**
  dialog over `SECTION_REGISTRY` (34 types) in `ThemeEditorExtensions.tsx`.
- **Registry↔renderer parity.** Every `SECTION_REGISTRY` type has an identically
  named renderer in `SectionComponents.tsx` (verify before each change with the
  grep in "Verifying"). Keep them in lockstep when adding section types.
- **Page-type templates (milestone A — done).** Product, collection, custom
  page, cart, and the catalog `storefront` surface now render their own
  `design[surface].sections`, and global sections render on every page
  (including Wishlist/Account/OrderTracking). The remaining follow-up is
  click-to-edit routing per template (noted in roadmap A).

## Studio 2.0 roadmap (October 2026 — active)

The owner asked for a designer that is easy to navigate and Shopify-level. This program supersedes the
older lists below. Each milestone ships end-to-end (tests, docs, release-note file in admin/updates/, walkthrough) and keeps
the public storefront looking identical unless it says otherwise. Not in scope (owner decision): AI
assistant, personalization/A-B tests, author/series/event pages, multi-language storefront.

**Phase 0 — Foundations**
- [x] 0.1 Infra: CI (`.github/workflows/ci.yml`: tests, type-check ratchet, bundle build), `tsconfig.json` +
      `scripts/typecheck-ratchet.mjs`, Studio lazy-loaded in its own chunk, dead code removed
      (`BlocksEditor`, `COPY_SELECT`/`PAGE_PREVIEW_UPDATE` handlers, unrouted `CollectionPage.tsx`), docs drift fixed.
- [x] 0.2 Repairs. Studio uploads go through `studio/mediaUpload.ts` (compressed, saved under the
      admin-writable `assets/studio/YYYY/MM/`, plain-English errors under the button; `admin/storagePaths.test.ts`
      fails on any upload path storage.rules refuses) and section background / category images gained Upload
      buttons (`studio/ImageUploadButton.tsx`). Linked shared blocks resolve in `SectionList` for every section
      type (`features/site/sharedBlocks.ts`). `SectionBoundary` drops a crashing section for shoppers and shows a
      placeholder + `PREVIEW_ERROR {sectionId}` in the preview. `features/site/scheduledDesign.mjs` (replaced in 3.5 by the server scheduler) ignored a
      scheduled design once anything was published after it was due (`designPublishedAt`). Save draft refreshes one
      `theme-versions/draft-latest` entry; only Publish adds versions. Book editor › create category uses
      `adminApi.addShopCategory` (live and draft lists appended separately) and assigns from published categories.
      Studio lists unpublished pages as "(draft)" templates and previews them; Preview collection lists the
      shop's own categories. One breakpoint module (`features/site/breakpoints.ts`, phone ≤767px) for sections,
      blocks and built-in elements. Featured product shows the shopper's currency.
- [x] 0.3 Studio test harness. `studio/fixture/fakeStudioApi.ts` swaps Studio's `adminApi` calls for in-memory
      data and records every write. `studio/StudioEditor.test.tsx` mounts the real editor in jsdom (add section,
      undo/redo, Save draft never publishes, Publish needs confirmation, Theme settings, Find). `studio-fixture.html`
      (served by `vite` in development only) opens the real Studio with that data, and `pnpm run test:studio`
      (`scripts/studio-e2e.mjs`, Chromium) drives it: preview connects with the unsaved design, add/undo/redo/save,
      device widths, Find anything, click a section in the preview, phone-sized editor. CI runs both.
- [x] 0.4 Theme store (`admin/themeStore.ts`). The unpublished draft lives in admin-only `themes/workspace`
      `{draft, rev, updatedAt, tabId}` and each My themes entry in `savedThemes/{id}`; the first Studio open
      copies `settings/website.draftDesign`/`savedThemes` there, checks the copy, then deletes the public
      fields. Until the rules deploy (permission-denied) Studio stays in "legacy" mode on the old fields.
      Save draft / Publish / Discard are compare-and-set transactions on `rev`; a stale tab gets
      `ThemeConflictError`, changes to different settings merge automatically (`mergeDesigns`), and the
      **Saved in another tab or device** dialog offers Keep mine / Use the other version. Publish writes the
      live design and the draft in one transaction. Shop categories and the under-construction wall update
      the private draft without bumping `rev` (`draftFieldUpdate`). Shoppers read `adminApi.getPublicSettings()`
      (no admin lookups, draft/My themes stripped). Unsaved-work recovery is one record per tab
      (`studio-recovery-v2:…:<tabId>`, newest offered, 14-day expiry).
- [x] 0.5 Design value model (`features/site/designModel.ts`). Every storefront route resolves its design with
      `layerDesign` (used by `resolveSurfaceDesign` / `resolveMainDesign` / `resolveProductDesign`, the cart drawer and
      the page header): shop structure (`ROOT_ONLY_KEYS`: menus, categories, navOrder, secondaryNavKeys, footerBadges,
      sectionPresets, sharedBlocks, globalSections) always comes from the root, `copy`/`regions` merge per entry, and a
      page surface never carries another surface. "All pages" writes (`writeDesignValue`, behind `applyGlobalStyle` and
      `applyThemeKeysToSurfaces`) set the root and clear the matching page overrides instead of copying the value into
      every page. `compactDesign` (run by `normalizeDesign`) drops page values that equal what the page inherits.
      `designModel.property.test.ts` proves on the published design (`__fixtures__/liveDesign.json`) that tidying changes
      no page and that the only differences from the old resolver are the intended fixes (categories, copy,
      globalSections, navOrder). Theme settings shows **This page differs from all pages (N)** for the current page
      with **Use the all-pages value** / **Make this the all-pages value** (`StudioPageOverrides.tsx`). Check before
      publishing reports the design size; saves over ~900 KB are refused with a plain message.

**Phase 1 — Navigation overhaul ("one tree, one inspector")**
- [x] 1.1 Editor frame. A vertical icon rail (`StudioRail.tsx`: Layout, Shared, Theme, Text, Menus, Pages) replaces
      the button grid; on tablets/desktops the settings panel, canvas and inspector are resizable panels
      (`react-resizable-panels`, sizes remembered as `studio-panels-v1`) and the inspector stays docked with a
      "Nothing selected" state, so the preview never jumps. `StudioPreviewFrame.tsx` keeps the iframe at the
      device's real width and scales it (**Zoom**: Fit to screen / 100% / 75% / 50%), so the full 1200px desktop
      fits on a laptop. One searchable **Page to edit** picker (`TemplatePicker.tsx`, `templatePicker.ts`) lists
      store pages, every shop category, every book, custom pages (drafts included) and the every-page sections,
      replacing the three dropdowns; switching page keeps the open workspace. Page, workspace, device, zoom and
      preview book/collection are remembered per browser (`studioUiState.ts`). Phones keep the
      outline / preview / settings switcher with the rail across the top.
- [x] 1.2 Dialogs, undo, shortcuts and Studio links. No `window.confirm/prompt` left in Studio: undoable actions
      (delete section/block, apply a preset or saved theme, install a layout) happen at once with an **Undo**
      button in the toast; permanent ones (leave with unsaved edits, delete a saved theme or page) use Riso
      `useConfirm`, names use `usePrompt`. History steps are named (`change(fn, { label, coalesce })`,
      `commit` in `studioModel.ts`) so Undo/Redo say what they will do, and typing in one field within a second
      is one step. One keyboard listener driven by `studio/shortcuts.ts` (`SHORTCUTS` + `resolveShortcut`): Ctrl/⌘ K,
      S, Z, Shift Z / Y, D, Delete, Alt ↑/↓, Esc, 1/2/3 devices, E edit/browse, **?** opens the cheat sheet; the
      preview forwards Ctrl/⌘ shortcuts (`KEY_COMMAND`). Studio links (`lib/studioLocation.ts`:
      `/admin#designer?t=…&b=…&c=…&tab=…&d=…`) open Studio at a page and tool — used by What's new (`links[].studio`),
      and Books › edit › **Design this page**. (The owner-only floating **Edit in Studio** button on the live
      site was removed in October 2026 at the owner's request — don't re-add it.)
- [x] 1.3 Live page structure. Instead of a hand-written element manifest that could drift, the preview bridge
      scans what actually rendered — every `data-fm-section`, `data-store-region` and `data-studio-target`, in
      document order, with its zone (`header` / `footer` / `role=dialog` pop-over / page body), parent, repeat count
      and whether it shows at the previewed size — and sends `STRUCTURE` (re-scanned after DOM changes, route changes
      and resizes). New bridge messages: `SCAN_STRUCTURE`, `HOVER_NODE` / `HIGHLIGHT_NODE` (outline + scroll a part),
      `NODE_HOVER` (pointer → Studio), `OPEN_OVERLAY` (`cart` / `search` / `close`, handled in the preview by
      `features/site/studioOverlay.ts` `useStudioOverlay`, used by `CartContext` and `StoreHeader`
      — at 1.4 `MainSite` and `StorefrontPageHeader`) and `SET_TARGET_LABELS`: the "what do you want to edit?" pop-up now shows distinct names
      ("Style: Header & announcement bar", "Words: Header") from `studio/targetLabels.ts`, whose test fails on any
      storefront target without a name. Tests: `previewBridge.dom.test.ts` runs the real bridge string in jsdom.
- [x] 1.4 Page structure tree. `studio/pageStructure.ts` (pure, tested) turns the scan into Header · Page · Footer ·
      Pop-overs: whole-page wrappers become page settings, parts drawn inside a section stay with the section,
      repeated parts are one row with a count. `StudioStructure.tsx` shows it around the section outline in **Page
      layout**: rows and the preview highlight each other on hover, a row opens that part's controls (regions open their
      own element controls), built-in regions get a per-device eye toggle (required ones show a lock), Pop-overs open the
      shopping bag or search inside the preview, and Footer links to the every-page sections. Sections can be renamed
      (`section.label`, Studio-only, searchable). Still to do with 1.5: multi-select, a right-click menu, dragging blocks
      between sections and "move to another page".
- [x] 1.5 Unified inspector. Clicking a built-in part in the preview (`STUDIO_ELEMENT`, no more multi-target pop-up)
      or in Page layout's structure list (`SELECT_NODE` → `ELEMENT_INFO`) opens it in the right-hand inspector:
      **Words** (the strings visible inside the part, matched on its text, else its whole Text & labels group),
      **Style**, **Layout** (sizes/spacing for the previewed device) and **Visibility** (none for required parts),
      with breadcrumb, All pages / This page only and links to Theme settings and all words. Controls are picked
      from existing schemas by `studio/elementCatalog.ts`; site-wide categories (buttons, small print, motion, Riso,
      custom code) stay in Theme settings (`GLOBAL_STYLE_GROUPS`). The preview keeps a selection outline on the part.
      Sections: **Content · Style · Layout · Visibility** from the declarative `studio/sectionStyleSchema.ts`
      (`StudioSectionStyle.tsx`), replacing the ~700-line `SectionSettingsPanel` (same keys, frozen in a parity
      test) and adding **Hide on tablets** (`hideOnTablet`). The canvas Delete no longer uses `confirm()` — it acts
      at once with Undo. The **Shared layout** rail tab is retired; `tab=shared` links open Page layout.
- [x] 1.5b Page layout list tools. Right-click a section row (or its `···`) for Move up/down, Rename, Duplicate,
      Copy section / Paste copied section below, Copy style / Paste style (every `sectionStyleSchema` key plus
      per-device padding), Move to another page…, Save for reuse, Select for bulk actions and Remove. Ctrl/⌘-click
      (Shift for a range) picks several sections; the bulk bar hides, shows, pastes style, moves or deletes them in
      one undoable step. Blocks have **Move to another section** (same section kind, any page), and in the preview a
      block dropped on a block of another section moves there (`BLOCK_MOVE_TO`). All moves go through the pure
      `moveSectionTo` / `moveBlockTo` / `updateSectionsById` in `studioWorkflow.ts` (`studioMoves.test.ts`): blocks
      keep their children, never move into themselves, only move between sections of the same type and respect
      `MAX_BLOCK_DEPTH`; the preview's section drag-reorder uses `moveSectionTo` too.
- [x] 1.6 Theme settings as the global design system; slimmer search. The home is banded: **Site-wide design**
      (presets & saved themes, logo, colours, typography, small print, buttons, layout, motion, Riso print — one
      list), **Parts of your shop** (header/menu/footer, shop & book pages, bag/checkout/accounts, pages & features)
      and **Advanced**. Each part card has **Show on page**: `CATEGORY_PAGES` (settingsMap.ts) names the preview page
      or pop-over, Studio switches the preview, waits for the `STRUCTURE` scan and opens the first part whose
      target is `style:<group>` in the element inspector. Long Text & labels groups split into sub-sections
      (`TEXT_SUBSECTIONS` / `textSubsectionsFor`; leftovers in **More words**, error messages last). Find anything
      no longer indexes each region field three times (desktop entry carries "tablet phone mobile" keywords).
      Deviation from plan: no new Brand/Colours/… heading per category and no presets-gallery rebuild — the
      existing category cards already are those headings; Page starters stay in Add section.
- [x] 1.7 Command palette 2.0; legacy draft path cleanup. Find anything (`StudioSearch.tsx`, pure `paletteGroups` /
      `contextCommands` / `pushRecent` / `searchedDevice` in `studioSearch.ts`) opens on **For what you selected**
      (duplicate, move, hide/show, copy, copy/paste style, move to another page, save for reuse, delete for a section;
      Open in Theme settings / Close for a page part), then **Recent** (last picks, browser-local) and **Shortcuts**.
      `>` searches commands only. Commands show the key from `shortcuts.ts`. The index adds the parts of the previewed
      page (from the `STRUCTURE` scan) and books (open their product page). A search that names phone/tablet opens
      that size's element setting and preview. Legacy drafts: `themeStore.ts` has no public-document fallback any
      more — drafts and My themes are only in `themes/workspace` / `savedThemes/*`; the first open (or the first
      category/wall change) copies an older public `draftDesign`/`savedThemes` across once and then removes them;
      refused access raises `ThemeStoreUnavailableError` (Studio shows it) instead of saving where shoppers can
      read it. `themeWrite` never writes `draftDesign`/`savedThemes` to `settings/website`. Storage is swappable
      (`setThemeBackend`): the fixture records Save draft / Publish / Discard as `saveDesign`.
      Also fixes from the 1.6 review: Show on page waits for the page to finish loading (8s), rescans when the
      preview address doesn't change, keeps the open custom page, maps Badges to the product page, tags the Account
      screens with `style:accounts`, and opens the category's settings when its part isn't on the page.

**Phase 2 — Shopify OS 2.0 features**
- [x] 2.1 One header and footer on every page. `features/site/StoreHeader.tsx` is the only storefront header:
      MainSite renders it in **shop** mode (`shop` prop: active canvas, in-page category selection, logo → Home,
      masthead layout, logo alignment, sticker pills, transparent header, scrolling announcement, wishlist count,
      light/dark toggle, Ctrl/⌘+K) and every standalone page in **page** mode (routed `/collections/<slug>` links).
      Both share one category bar (`CategoryBar` + `NavDropdown`), icon cluster (`HeaderActions`), announcement bar,
      phone menu, publisher row and search pop-over (`useStudioOverlay("search")`). `features/site/StoreFooter.tsx`
      (was MainSite's `SiteFooter`) is the only footer. `StorefrontPageHeader.tsx` is gone. Wishlist, account,
      order tracking and 404 (including a custom-page 404) render inside `StoreChrome` (`StoreChrome.tsx`), which adds
      the same header and footer; their own title bars stay underneath as plain rows (`useInStoreChrome`), so the
      structure scan lists them under Page. Style › Header & announcement bar › **Show the shop header & footer on
      wishlist, account, order tracking and missing pages** (`showStoreChromeOnUtilityPages`, default on) turns that
      off. Checkout keeps its minimal `checkoutHeader`. Parity: `storeChrome.parity.test.tsx` compares every Studio
      hook, link and aria label against `__fixtures__/storeChromeHooks.json`, recorded from the replaced
      implementations (identical except one added `aria-label` on the shop's desktop category bar), and fails if any
      other file renders the navigation header or footer panel. Also fixed `useNavFit`: it measured the full-row
      bar box instead of the links, shrinking them ~1% per font load/resize even with room (`naturalNavWidth`).
- [x] 2.2 Header/footer/popup section groups. Deviation from the planned `design.sectionGroups {…}` shape, chosen so
      nothing migrates: three root section lists, all `ROOT_ONLY_KEYS` — `headerSections` (under the header, every
      page), `globalSections` (above the footer, the list shops already had) and `overlaySections` (pop-up). Pure rules
      in `features/site/sectionGroups.ts` (`SECTION_GROUPS`, `isGroupSurface`, `groupSections`). `sectionRender.tsx`
      `GroupSections({ group })` renders any of them (`GlobalSections` wraps it); `StoreHeader` renders the header group
      and `features/site/PopupSections.tsx` on every page using it (not checkout). The pop-up waits for the cookie
      answer (`CONSENT_KEY`/`CONSENT_EVENT`, unless the banner is off), then Style › Pop-up › delay; how often
      (`popupFrequency` session/once/always, remembered per content version `popupVersion`), position, width, shading,
      colours/outline and hide on phones are Style › **Pop-up** controls; words `popupLabel`/`popupClose` in Text &
      labels › Sections. It portals into `[data-fm-store]` so it inherits the theme tokens. In the preview it opens only
      when Studio asks (`OPEN_OVERLAY "popup"`: Page layout › Pop-overs, or while its sections are being edited).
      Studio: `SectionTarget` `{ kind: "global", group }`, `studioWorkflow.writeSections` writes any surface (group =
      plain array), `sectionEntries`/moves/bulk edits/search/publish diff/media where-used/pre-publish checks cover all
      groups; Page layout offers **Shared sections under the header / above the footer / Pop-up sections** buttons in the
      Header, Footer and Pop-overs groups. Announcement bar: `announcements` list (`{ id, text, link?, from?, until? }`,
      Toronto days, `activeAnnouncements`) edited in Theme settings › Header & announcement bar › **Announcement
      messages** (`studio/StudioAnnouncements.tsx`); several messages take turns (`announcementRotateSeconds`, pause on
      hover/focus) or scroll together in the ticker; with no list the single `announcementText` behaves exactly as
      before (parity fixture unchanged). Mega menu: Navigation › Header menu › a link with sub-links › **Show sub-links
      as a mega menu (columns)** + featured picture (library), title and link (data shape already in `storeMenu.ts`).
      Tests: `sectionGroups.test.ts`, `PopupSections.test.tsx`, `announcementBar.test.tsx`, `StudioAnnouncements.test.ts`,
      group cases in `studioMoves.test.ts`; e2e: pop-up group, rotating messages, mega menu.
- [x] 2.3 Pickers + catalog sources. New section/block field kinds `link`, `book`, `books`, `category`, `page`,
      `video`, `font` (`studio/StudioPickers.tsx`, choices in the pure `studio/pickers.ts`) save exactly the string the
      old text field held, so there is no migration: `link` an href (`/`, `/?catalog=true`, `/wishlist`, `/account`,
      `/track`, `/page/<slug>`, `/collections/<slugify(name)>`, `/books/<storefront slug>` or any typed address —
      `siteHref` still adds the sub-path), `book` the storefront slug (resolved like `resolveProductRoutes` over live
      books), `books` comma-separated slugs, `category` the category name, `page` the slug, `video` the URL (with a
      "will it play?" note mirroring the renderers' YouTube/Vimeo/MP4 matching), `font` the Google Fonts family
      (typed names are kept). Studio passes its loaded books, pages and `design.categories` through
      `StudioPickerProvider`. List rows can be links too (`itemFields[].kind: "link"`). Catalog sections (Product grid,
      Showcase grid, Cover carousel, Featured product) choose books with `features/site/merchandising.ts`
      `selectBooks({ source: all|featured|manual|category|newest|onSale|preorder, sort, limit })` via
      `sectionBookQuery(settings, design.categories)` and `pickBook`; new keys `productCategory` and `productSort`;
      no `productSource`/`productSort` = exactly the old result. Tests: `sectionFieldKinds.test.ts` (url-like fields
      must use `link`, videos `video`, slugs `book`/`books`), `catalogSources.test.ts` + `catalogSources.render.test.tsx`
      (old selection frozen and compared, including the published design), `pickers.test.ts`, `StudioPickers.test.tsx`,
      and an e2e check (pick a page link and a book, assert the saved draft and the preview). Not done here: no page
      field uses `page` yet (available for 2.7/2.8); Theme settings' own URL fields (social links, mega-menu links)
      are unchanged. - [x] 2.4 Media library + responsive images (details below).
- [x] 2.5 Colour schemes 2.0. A scheme (`design.colorSchemes[]`, `features/site/colorSchemes.ts`) has ten roles:
      background, surface, text, muted, accent, onAccent, border, buttonBg, buttonText, link. `schemeCss(design)`, emitted
      first by `StorefrontOverrides` on every surface, turns each into `[data-scheme="<id>"]` variables with the
      storefront's existing token names (`--bg-color`, `--text-color`, `--fg-rgb`, `--surface(-rgb)`, `--muted(-rgb)`,
      `--accent(-rgb)`, `--on-accent`, `--border-rgb`/`--border-color`, `--btn-bg`, `--btn-text`, `--link-color`,
      `--rp-outline`; triplets comma-separated), so descendants follow without per-element edits. `SectionList` sets
      `data-scheme` from the section's existing `colorSchemeId` and keeps the inline background/text it always painted.
      `design.elementSchemes` (`cards` → `.fm-card`, now on every book-card root; `buyCard` → `.fm-pdp-card`;
      `cartDrawer` → `.fm-bag[data-fm-store]`) puts a scheme's variables on those elements; while a part follows a
      scheme its own colour controls give way (`elementScheme()` — `cartDrawerStyle` / `productPageStyle` skip their
      palette keys, the bag's checkout background is outranked, and a card scheme outranks the card title/price
      colour), so picking a scheme always shows. Header and footer are not
      scheme targets yet (they are being rebuilt in 2.1). **Compatibility:** schemes saved before 2.0 (no `v: 2`) keep
      exactly their old look — inline background/text only, no variables (`colorSchemes.test.ts` renders every saved
      scheme in `__fixtures__/liveDesign.json` and the old purple defaults and compares the wrapper style, and checks
      the published design gets no scheme CSS); the first colour edit upgrades a scheme to every role
      (`upgradeScheme`). The starter schemes keep their ids and light/dark polarity but use Riso Noir colours (Paper,
      Noir, Flare), all WCAG AA. Studio: Theme settings › Site-wide design › **Colour schemes** (`schemes` group:
      `elementSchemes.*` selects whose options are the current schemes via `schemeFieldOptions`) with
      `StudioColorSchemes.tsx` above them — add, rename, duplicate, reorder, delete, ten role pickers, live swatch and
      contrast badges (text/background, button text/button, text on accent). Pure edits live in
      `studio/colorSchemeOps.ts` (`colorSchemeOps.test.ts`); saving writes the list for all pages (clearing stale page
      copies). Deleting a scheme in use asks first, then removes its `colorSchemeId` / `elementSchemes` references so
      those parts fall back to theme colours (undoable). The buy card, bag and card-title click targets also show their
      scheme choice in the element inspector.
- [x] 2.6 Section library 2.0 + new sections. Add section is a panel in Page layout (`studio/StudioSectionLibrary.tsx`,
      a non-modal `role="dialog"` named "Add section") instead of a pop-up over the preview. Pointing at (or focusing) a
      card shows that section on the page at the insert spot: Studio adds a transient `__studio-candidate` section to the
      preview snapshot only (`sectionLibrary.withCandidate`, `CANDIDATE_ID`) — never to the draft, history or saves — and
      the bridges label it "Preview · not added yet" with no canvas toolbar. Clicking adds it. A selected section's canvas
      toolbar has **+ Section above / + Section below** (`INSERT_AT`), opening the library at that spot. Thumbnails are
      code-drawn wireframes per kind of section (`studio/sectionThumbs.tsx`) instead of the planned generated screenshots,
      so every type has one and nothing needs regenerating. Registry entries may carry `bestIn` (`{ group | template,
      note }`); the card shows the note and **Add it there instead** adds it to that group/page. Saved sections can be
      renamed and deleted (Undo), and **Shared blocks** lists each with where it is used; deleting one copies its content
      into every placement first, so nothing goes blank (`deleteSharedBlock`). Seven new sections (registry + fields +
      fallbacks + renderers, 41 types now): **Featured collection** (one category + View all), **Book spotlight** (picked
      book, else the book on a book page via `SectionPageContext` in `components/sectionCopy.ts`, provided by
      `BookDetail`), **Praise & press quotes** (blocks), **Image collage** (mosaic / stagger / strip), **Promo strip**
      (bestIn Under the header), **Newsletter sign-up (pop-up)** (bestIn Pop-up) and **Sticky add-to-bag bar** (book
      pages; adds plain books directly, otherwise scrolls to the buy box). The Newsletter section and the new pop-up one
      now really sign people up through `features/site/newsletterSignup.ts` (the footer box uses it too; same
      `newsletter/{email}` rules, nothing new to deploy) and never write from the Studio preview. Also fixed: clicking a
      section from the header or pop-up group in the preview now selects it. Tests: `sectionLibrary.test.ts`,
      `librarySections.test.tsx`, contract tests; e2e: try-on + add, + Section above, Promo strip "Add it there".
- [x] 2.7 Custom book fields + dynamic sources. Deviation: field definitions live in the public, admin-written
      `settings/bookFields` doc (`{ fields: BookFieldDef[] }`) instead of a new `catalogSchema/books` collection, so the
      existing `settings/*` and `books/*` rules cover it and nothing new has to be deployed. Pure rules:
      `features/site/bookFields.ts` (kinds text / long text / number / date / web address / picture, `fieldKeyFor`,
      `cleanBookFields`, `cleanCustomValues`, `mergeCustomValues`; max 30 fields, 2,000 characters a value). Books › edit
      › **More details** (`admin/BookCustomFields.tsx`) holds this book's answers (`book.custom`, saved with the book) and
      **Book fields (shared by every book)** to add / rename / re-kind / remove fields (saved at once via
      `adminApi.getBookFields` / `saveBookFields`; removing a field keeps saved answers). Dynamic sources:
      `features/site/dynamicSources.ts` — a connected field saves `{ "$dyn": "book.custom.series" }`, and text may hold
      `{{book.title}}`-style tokens. Sources: book title, subtitle, author, plain description, publisher, publication
      date, page count, format, edition, ISBN, first photo, book page link, every custom field; category name,
      description, picture, collection link; page title. `SectionList` runs `resolveDynamicSettings` with the page's
      `SectionPageContext` (book from `BookDetail`, open category from `MainSite`, custom page from `PageView`) before the
      renderer, so the 41 renderers are unchanged. Section › Visibility › **Hide when a connected detail is empty**
      (`hideWhenEmpty`) leaves the section out where a connected detail is missing; the Studio preview never hides it
      and shows `‹Book › Series›` placeholders instead. Studio: Content-tab text, picture and link fields get
      **Connect to a detail…** (`studio/StudioConnect.tsx`; a connected field shows a chip with Disconnect); connected
      text opens the inspector instead of inline editing; pre-publish checks count connections as content; outline
      labels use `displayValue`. Tests: `dynamicSources.test.ts`, `dynamicSections.render.test.tsx`,
      `StudioConnect.test.tsx`, `BookCustomFields.test.tsx`, `studioReliability.test.ts`; e2e: connect a title to Series.
- [x] 2.8 Alternate templates. Book and collection pages can have extra layouts. The list is the root-only
      `design.alternateTemplates` (`{ productPage: [{ id, name }], collectionPage: [...] }`); each one's sections and
      page-only styles live on `productPage~<id>` / `collectionPage~<id>` (`features/site/templateAlternates.ts`).
      `designModel` treats them as surfaces (`isSurfaceKey`, `surfaceChain` storefront → default → alternate), so All
      pages writes clear them like any page; an alternate without its own `sections` shows the default's
      (`sectionsSurface`, used by `TemplateSections`). A book chooses one with `book.templateId` (Books › edit ›
      Categories & tags › **Book page template**, `admin/BookTemplatePicker.tsx`; draft-only templates are listed as
      "not published yet" via `adminApi.getAlternateTemplates`), a category with `category.templateId` (Navigation › Shop
      categories › Edit › **Collection page template**). A deleted or unknown id = the default. `BookDetail` uses
      `bookTemplateSurface` for sections and `resolveProductDesign(design, surface)` for page styles. Deviations: custom
      pages are left out (each already has its own `page:<slug>` template), and collection alternates bring their own
      sections only — `MainSite` resolves the collection page's styles before the open category is known, so Studio
      disables "This page only" styling on a collection alternate rather than offer a control that would do nothing.
      Studio: Page layout shows a **Book page / Collection page template** card (`studio/StudioTemplateCard.tsx`:
      switch template, who uses it, **New template from this one** — sections copied with fresh ids, styles inherited
      from the default — Rename, Delete with Undo, and **Preview with** a book); the page picker lists alternates; the
      preview URL carries `?template=<id>` (or `default`) and `previewRoute` maps it back. Tests:
      `templateAlternates.test.ts`, `alternateTemplates.render.test.tsx`, `templatePickerAlternates.test.ts`,
      `BookTemplatePicker.test.tsx`; e2e: create "Poetry", add a section, save.
- [x] 2.9 Product information as blocks. The product page's buy card (`.fm-pdp-card` in `BookDetail.tsx`) is an
      ordered list, `productInfoBlocks`, on the `productPage` surface or an alternate `productPage~<id>` (arrays layer
      wholesale, so an alternate follows the default's list until it has its own). Pure rules in
      `features/site/productBlocks.ts`: built-in blocks at the card's existing DOM groups — `tag`, `heading` (title,
      subtitle, author; required), `price` (price, sale end, stock), `formats`, `boxSet`, `addOns`, `giftCard`, `buy`
      (quantity, Add to bag, wishlist, share; required), `backInStock`, `details` (the Sections-layout description and
      specs) — plus `divider` (starts a new part of the card) and added blocks `text`, `collapsible`, `badge`,
      `lookInside`, `customField` (2.7 book field). No list = `DEFAULT_PRODUCT_BLOCKS`, which reproduces the card exactly:
      `productCard.parity.test.tsx` renders `BookDetail` for 8 kinds of book × 3 designs and compares the card's markup with
      `__fixtures__/productCardDom.json`, recorded from the hand-written card before the change (refresh with
      `UPDATE_PRODUCT_CARD=1` only for an intended change). `productBlocks()` drops unknown/duplicate entries, keeps the
      required ones visible and appends missing built-ins hidden. Each built-in keeps every older control (`pdpShowTag`,
      `pdpShowStock`, `showQtyStepper`, `showBackInStock`, regions…); `BookDetail`'s `renderBlock` returns the original
      JSX (moved, not rewritten) or `null`, and a card part renders only when something in it does. Added blocks resolve
      2.7 connections against the book (`resolveDynamicSettings`) and honour Hide when empty. Fix: buy-card region
      visibility now reads the shown template's design (`regionDesign`), so an alternate's own "hide sale end" etc.
      applies. Studio: Page layout › **Buy box blocks** (`studio/StudioProductBlocks.tsx`, shown for book page templates):
      Move up/down, hide (the title and Add to bag rows show "Always shown"), Add a block (Text, Collapsible note, Badge,
      Look inside link, Book detail, Divider), inline fields with Connect to a detail, Remove with Undo, and **Use the
      default book page's blocks** / **Reset to the standard order**. Writes `writeDesignValue(…, { surface: template })`.
      Tests: `productBlocks.test.ts`, `productBlocks.render.test.tsx`, `productCard.parity.test.tsx`,
      `StudioProductBlocks.test.tsx`; e2e: reorder + hide + add, save, then Add to bag in Browse mode adds to the bag.

**2.4 Media library + responsive images (done).** A **Media** rail tab (`studio/StudioMedia.tsx`) lists the
admin-only Firestore `media/{id}` records (`admin/mediaApi.ts`: name, alt, focal point, width/height, bytes,
widths, per-copy `variants`, replaced files in `previous`). `uploadMediaImage` (`studio/mediaUpload.ts`) runs
`prepareMediaVariants` (`admin/prepareImage.ts`: WebP 0.82 at 480/960/1600 px, never enlarged, JPEG where the
browser can't write WebP, GIF/SVG kept as one original) and uploads to `assets/media/<id>/<stamp>-<w>w.webp`
(storage.rules' admin-writable `assets/`; `storagePaths.test.ts`). The panel searches, filters **Unused /
Over size budget / No description** (budgets 50/150/200 KB by width), edits the description and focal point,
lists **Where it's used** (draft, live design until Publish, custom pages — `collectStrings`/`usagePaths` in
the pure `studio/mediaLibrary.ts`), **Replace image…** (new files under the same id; `applyMediaChange` repoints
every draft use in one undoable change) and **Delete image** (refused while used anywhere, including My themes and retained Version history snapshots — `snapshotUses`, versions re-read before deleting). Image fields get
**Choose from library** (`studio/mediaPicker.tsx` context + the picker dialog) and their **Upload image** adds to
the library once it is readable (Theme settings images too — they store the URL only, since the logo, favicon,
share image and placeholder are drawn as plain images). Placing a picture in a section/block field writes the plain URL plus a public companion record
`${field}__media` (`features/site/mediaRef.ts`: id, src, srcset widths, width/height, alt);
`components/ResponsiveImage.tsx` emits `srcset`/`sizes`/`width`/`height`/lazy loading only when that record's
`src` still equals the field, and `fetchpriority="high"` + eager loading in the first section of the home page
and custom pages (`SectionPriorityContext`, set by `SectionList`). Section renderers use it through
`StyledImage` and every block `<img>`; plain URLs render the same DOM as before (`ResponsiveImage.test.tsx`).
Rollout: until `firestore.rules` (`match /media/{mediaId}`, admin-only) is deployed, reads are
permission-denied and Media/the picker explain it while fields keep URL + plain upload. Not done here: CSS
background images (section backgrounds) have no `srcset`; old files of a replaced image are deleted only with
the image; existing images are not migrated into the library.

**Phase 3 — Theme management & quality**
- [x] 3.1 Version history 2.0 (`studio/StudioHistory.tsx`, pure diff/restore in `studio/designDiff.ts`). Theme actions ›
  **Version history** lists each Publish (last 30), the latest saved draft and named **checkpoints** (Save checkpoint…,
  `adminApi.saveThemeCheckpoint`), which are pinned and never pruned (`pinned`, up to 20; Pin/Unpin/Rename/Delete in each
  row's ··· menu; the latest-draft row offers Keep as checkpoint). **Compare** lists what differs from the current draft,
  the live site or another version, labelled from `STYLE_GROUPS`, `COPY_SCHEMA`, the section registry and page templates
  (sections matched by id across pages and groups: added, removed, moved, changed fields). Against the draft each line has
  **Use this version's** (`restoreItem`: one named, undoable draft change). Publish/Discard dialogs use the same wording
  (`summariseDiff`). Same `theme-versions` collection and rules; `listThemeVersions` adds pinned rows via a single-field
  `where("pinned", "==", true)` (no composite index). Deviation: version bodies still load with their rows.
- [x] 3.2 Live sync. Studio follows `themes/workspace` while open (`themeStore.watchWorkspace`, Firestore `onSnapshot`;
  writes now record `action: "publish" | "save"`). `studioWorkflow.decideRemoteChange` decides: not newer → ignore (own
  saves included; a change arriving mid-save waits until the save finishes); same content → only the revision moves;
  nothing unsaved here → their version comes in (toast); unsaved edits → a banner: **Bring in their changes** (different
  settings) / **Bring in theirs, keep mine** (both changed some — `mergeDesigns` keeps this tab's value, the banner names
  them), **Use their version** (asks first) or **Later** (the next save combines as before). A Publish elsewhere updates
  the live copy at once. Remote drafts are normalised before comparing. Same rules (admin read); no index or Function. - [x] 3.3 Studio Health. Theme actions › **Studio Health** (`studio/StudioHealth.tsx`, replaces "Pre-publish check"; Find
  anything "check") audits the page the preview rendered — the same-origin iframe document, read only — with
  `studio/healthAudit.ts` `auditDocument`: WCAG text contrast (3:1 large / 4.5:1; skipped over background pictures),
  pictures without `alt`, oversized/blurry/heavy (>400 KB, Resource Timing) pictures, links/buttons with no name, empty
  links and links to unpublished books/pages/collections, tap targets (24 px desktop, 44 px tablet/phone; inline sentence
  links exempt), heading outline (no/multiple H1, skipped levels), failed or many fonts, page size and title/description.
  Findings carry the preview bridge's node key: **Show me** scrolls and outlines the element (Back to Health in the toast),
  **Edit this part** opens its section or element inspector. Repeats fold per part. Whole-draft `designChecks` stay
  below; their two "not measured" placeholders became one line pointing at the measured checks. The Publish dialog shows
  "Studio Health on <page> (<size>): N issues · M tips" with **Review**. Deviation: a dialog, not a rail tab; the audit
  runs in Studio rather than via a bridge `RUN_AUDIT` message (same-origin iframe). - [x] 3.4 Themes workspace + share previews. New rail tab **Themes** (`studio/StudioThemes.tsx`): Live theme, Your draft,
  My themes and the ready-made looks as cards with code-drawn thumbnails (`ThemeThumb`, via `withRisoNoirDefault` so it
  matches what the shop shows). **Preview** shows a theme in the canvas without touching the draft (Studio banner + Stop
  preview; cleared when leaving the tab); **Customize** loads it (undoable); ··· › **Publish…** loads it and opens the
  normal Publish confirmation; Rename / Duplicate / Download / Delete as before; Import a theme file…; **Use this look**
  applies a preset. **Share a preview link** (draft or a saved theme) writes `previewTokens/{token}` (24 random bytes,
  base64url; `adminApi.createPreviewLink/listPreviewLinks/revokePreviewLink`, 1/7/30 days). Rules: `get` only while
  `expiresAt > request.time`, admin-only list/create/delete, keys and ≤31-day expiry checked. Storefront
  `?themePreview=<token>` (`features/site/themePreview.ts`, read by `useSiteData` through `publicApi.getThemePreview`) shows
  that design for the visit (sessionStorage), never caches it, marks pages noindex, records no visits/analytics, and shows
  `ThemePreviewBanner` (Text & labels › Site & sharing `themePreview*`, cannot be hidden) with Exit preview; expired or
  removed links fall back to the live shop and say so. Until `firestore.rules` is deployed, Studio says links need the
  rules. Style › Theme look links to Themes.
- [x] 3.5 Scheduling & campaigns. Theme actions › **Schedule publishing…** (also **Schedule instead…** in the Publish
  confirmation, Themes › ··· › **Schedule…**, Find "schedule") — `studio/StudioSchedule.tsx`, pure rules in
  `studio/themeSchedule.ts` (Toronto wall-clock ↔ UTC, checks: future start, end after start, ≤120 days, one campaign at a
  time; scheduler health). Entries are admin-only `themeSchedule/{id}` (`kind` publish | campaign, `design` copied at
  scheduling time, `startAt`, `endAt`, `status` scheduled → live → done | cancelled | skipped). `functions/themeSchedule.js`
  runs from `unpaidPaymentSweep` (own try/catch): a due publish replaces `settings/website.design` (+ `designPublishedAt`);
  a campaign keeps the design it replaced (`revertDesign`) and puts it back at `endAt` unless something else was published
  meanwhile (`note: kept-later-publish`). Each change records a theme version and audit entry; `themes/scheduler.lastRunAt`
  shows Studio the scheduler runs. Cancel (scheduled) and End now (live campaign). The old client-side
  `scheduledPublish`/`scheduledDesign.mjs` path is removed: shoppers never download scheduled designs any more, and the
  sitemap/fingerprint read only the published design. Deploy `firestore.rules` and Functions with the frontend.

**Phase 4 — Performance (continuous).**
- [x] Editor structural sharing. `features/site/designEqual.ts` `designEqual` (same saved JSON, ignoring key order; no
  serialising; short-circuits on shared subtrees) backs `studioModel.sameDesign` and `designModel.same`.
  `normalizeDesign`, `normalizeBlocks` and `compactDesign` return the very same objects for parts that are already normal,
  so an edit replaces only what it touched; after Save/Publish the saved object itself (not a JSON copy) is kept as "saved".
  Find anything's index is built only while it's open; Theme settings / Text & labels "changed" counts only while those
  tabs are open; local recovery is written at idle time. `studio/studioPerf.bench.ts` (`pnpm exec vitest bench`): one edit
  on the live design 0.85–0.94 ms → 0.20–0.25 ms; on a 592 KB design 14.8 ms (p99 55 ms) → 0.69 ms (p99 1.7 ms).
- [x] Storefront: sections from the third on (`LAZY_FROM_INDEX`) use CSS `content-visibility: auto` (`data-draw-later`)
  unless Style › Layout & spacing › **Draw sections lower on the page only when shoppers scroll near them** (`lazySections`)
  is off; never in the Studio preview, the header/footer/pop-up groups or `StickyAddToBagSection`. The DOM stays complete.
  `components/sectionPerformance.test.tsx` guards it and caps every section at 600 elements / 24 levels with sample books.
- [x] Studio Health speed tips: pictures that may make the page jump (no size and not in a fixed-shape frame), a lazily
  loaded main picture in the first screenful, total picture weight over 3 MB, and the browser's LCP when exposed.

## Studio 3.0 roadmap (October 2026 — active)

Research on 15 October 2026 compared Studio with Stripe (Dashboard, Workbench, Checkout branding, Elements
Appearance API), Square Online, Squarespace (Fluid Engine, Site Styles, Blueprint AI, Refresh 2025), Shopify
Horizon (theme blocks, AI block generation), Webflow (GSAP interactions, variable modes) and Framer (AI Style,
localization, branching). Studio 2.0 already matches most of their foundations. The gaps are in **navigation and
what stays in view**, **layered design values**, **free placement**, **motion**, **guided setup** and **AI**.
Patterns the leaders share and Studio adopts:
- Customisation in **layers**: a ready-made theme, then shared values, then rules for one part or state.
- **Palettes per section**; Studio already has colour schemes.
- A **live preview next to every setting**.
- Advanced tools **docked** on screen instead of opening as dialogs (Stripe Workbench).
- A **setup checklist** that guides first use.
- A **block picker that previews** each block.
- Motion as an **optional finishing step** that respects reduced-motion settings.
- **Guided AI** that starts from the brand, not a blank prompt.

Items marked *(needs owner go-ahead)* reverse an earlier owner decision (see the 2.0 scope note). Don't start them
without a yes.

### Phase 1 — Workbench & navigation — DONE (15 October 2026)
- [x] **Workbench** (`studio/StudioWorkbench.tsx`): docked under the preview on tablets and computers, collapses to a
  one-line taskbar, open/closed state and tab remembered (`studioUiState.ts` `workbenchOpen`/`workbenchTab`).
  Tabs:
  - **Health** reuses `HealthFindings` (split out of `StudioHealth.tsx`; phones keep the dialog). Theme actions › Studio
    Health, Find's Studio Health command, the Publish dialog's Review and the toast's Back to Health all open it
    (`openHealth`). It checks again after a publish.
  - **Changes** lists every undo step (`pastLabels`/`futureLabels`); clicking one jumps there with `jumpBy`
    (`studioModel.ts`, plain Undo/Redo). It also lists what the draft changes against the live shop (`summariseDiff`,
    worked out only while the tab is open, from a deferred design).
  - **Setup** is the launch checklist (`studio/setupChecklist.ts`, pure): logo, colours, fonts, share image, Google
    listing, Home page, policies, phone check, clean Health, published. "Show me" uses `openTarget` / the rail / the device.
- [x] **Shortcuts** (`shortcuts.ts`, so the `?` sheet lists them):
  - `G` then `L/T/X/N/P/M/H` goes to a workspace (`GO_KEYS`, `resolveGoKey`, 1.2 s window, `goPendingRef` in the key handler).
  - `W` opens or closes the Workbench, `A` is Add section, `[` and `]` step through sections.
  - Workspace buttons' tooltips show the `G` keys. Find lists Workbench commands, and the workspace rows carry their keys.
  - No Publish shortcut on purpose: Ctrl/⌘+Shift+P opens a private window in Firefox.
- [x] **Breadcrumb** (`StudioBreadcrumb.tsx`) under the top bar: Page › Section › Block (or the selected built-in
  part); earlier parts step back out.

### Phase 2 — Shared values with layers — DONE (15 October 2026)
- [x] Theme settings › **Design scales** (`tokens` group; pure CSS in `features/site/designTokens.ts`, emitted last by
  `storefrontOverridesCss`). Every scale is off until chosen, so an unset design renders as before.
  - **Type scale:** ratio + base size. `typeSteps` gives `--fm-step-0…5`; with **Shrink headings smoothly** on they are
    fluid `clamp()` sizes between 390 px and 1200 px wide. Section h1–h4 follow it; a section's own heading size still wins.
    This closes the old "auto clamp() typography" item.
  - **Spacing:** `--fm-space-unit` (`spaceUnit`) and a phone multiplier (`phoneSpaceScale`). Sections pick
    Layout › Spacing › **Space above and below** (`spacingStep`: xs/s/m/l/xl = 2/4/8/12/16 units, `sectionStepCss`).
    These are plain rules, so typed padding numbers (inline) and per-device spacing overrides (!important) still win.
  - **Corners:** `radiusScale` sets `--fm-radius-s/m/l` and `--rp-card-radius` (buy card, order slip and the other parts
    that read it).
  - **States:** focus ring width (`focusRingWidth`; its colour stays Riso print treatment › Keyboard focus ring), border
    of a field being typed in (`inputFocusColor`), and pressed buttons (`buttonPress`, only when the shopper allows motion).
  - `StudioScalePreview.tsx` draws the scales live above the controls.
- Deviations from the plan:
  - Shadows already had Effects › Card shadow depth (`shadowScale`), so there is no second shadow set.
  - Named value **modes** are not built. Scheduling & campaigns (3.5) already switch a whole design on a date, which
    covers the seasonal case. Revisit if the owner wants modes inside one design.
  - Section fields refer to tokens only through `spacingStep`; a general `{ "$token": … }` reference was not needed yet.

### Phase 3 — Free placement — DONE (15 October 2026)
- [x] **Arrange on page** (Flexible composition › Content tab › *Arrange on the page* card): Studio sends `GRID_ARRANGE`
  `{ sectionId, device }` while that section is selected in Edit mode. The preview (`studio/gridBridge.ts`, injected by
  `previewBridge.ts`) draws the column overlay. Each block gets a move area and a resize corner, dragged with pointer
  capture; Esc cancels a drag. Arrow keys move the focused block one cell; Shift + arrows resize it.
- [x] The preview reports pixels (`GRID_PLACE { rect, grid, by? }`). Studio turns them into cells with the pure
  `studio/gridPlacement.ts` (`cellsFromRect`, `nudgeCell`, `setBlockGrid`, `applyGridMessage`) as one named, undoable
  change for the previewed size (`block.grid[device]`, the keys the storefront already reads). Placement stays on the
  placement, never on a shared block's source.
- [x] **Layers** list (front first) with Bring forward / Send back (`layerOrder`, `shiftLayer` → `grid[device].z`).
- [x] Per-block **Rotate / Size / See-through** per screen size (`block.responsive[device].rotate|scale|opacity`,
  `compositionLook` in `SectionComponents.tsx`; desktop is inline, tablet and phone go through `compositionBreakpointCss`).
- Not done: a block with no placement still auto-flows one column wide (unchanged storefront behaviour). The first drag
  or nudge gives it real cells.

### Phase 4 — Motion as a finishing step — DONE (15 October 2026)
- [x] Section › Style › **Motion** group (`components/sectionMotion.ts`, CSS scoped to `#section-<id>`):
  - Section entrance (`animation`, moved here from Effects), now with **How long it takes** / **Wait before starting**
    (`motionDuration`, `motionDelay`; `entranceTiming` feeds `SectionReveal`).
  - **Blocks appear as you scroll** (`revealBlocks`: fade up / fade / zoom / slide) with **Delay between blocks**
    (`staggerStep`, nth-child delays for the first 12).
  - **Blocks and cards when pointed at** (`blockHover`: lift / grow; hover-capable pointers only).
  - **Parallax** background (`parallax`: subtle / strong; `animation-timeline: view()` inside `@supports`, otherwise still).
  - **Sticky** (`sticky`, `stickyTop`).
  - **Turn motion off on phones** (`motionOffOnPhones`).
- [x] Safety: blocks are hidden only while `MotionWatcher` (sectionRender.tsx) has "armed" a section that started below
  the screen. It never arms under reduced motion (the prerender runs with reduced motion) or without IntersectionObserver.
  All movement sits in `prefers-reduced-motion: no-preference`, and Style › Page animations off removes it all.
- [x] **Play this section's motion** (Style tab card) posts `MOTION_REPLAY` to the preview.
- Not done: motion per individual block (it is per section, applied to its blocks) and a timeline editor.

### Phase 5 — Block library 3.0 (Shopify Horizon) — DONE (15 October 2026)
- [x] **Copy block / Paste copied block** (inspector Content tab card `block-clipboard`, Find anything block commands;
  `studio/blockLibrary.ts` `copyBlock` / `canPasteBlock` / `pasteBlock`). A block pastes into a section of the **same
  type** (not merely the same block type: two section types can share a block type with different fields). Fresh ids;
  linked shared blocks stay linked; grid/responsive placement comes along. Each paste is one named change.
- [x] **Block picker** (`studio/StudioBlockPicker.tsx`, a panel like Add section): opened by the outline's **Add <block>**,
  the inspector's **Add block…** and the canvas toolbar's **+ Block** (`ADD_BLOCK` now opens it). Choices from
  `blockChoices`: Text / Picture / Button / Group for Flexible composition, "New <block>" elsewhere, copies of blocks
  already in the section, compatible shared blocks and the clipboard. Pointing at one adds a preview-only
  `__studio-block-candidate` (`withBlockCandidate`, never saved) and scrolls to it ("Preview · not added yet").
- [x] **New page from a starter** (`studio/pageStarters.ts`): Studio › Pages › New page shows Blank, About, Shipping &
  returns, FAQ, Contact, Submissions and Journal. Starters are headings + [bracketed prompts] (no invented facts) and open
  as **drafts** with a free slug; nothing is saved until Save.
- [x] **Header and footer colour schemes**: `ELEMENT_SCHEME_TARGETS` `header` (`header[data-fm-header]`) and `footer`
  (`footer[data-fm-footer]`). While one is picked, StoreHeader/StoreFooter paint from `var(--bg-color)` /
  `var(--text-color)` / `var(--border-color)` and `footerStyleCss` skips the footer's own colour keys.
- [x] Theme settings link fields use the link picker (`StyleField` kind `link`; `cartDrawerEmptyLink`); a test refuses a
  new address-like Style field typed as plain text.
- Not done: live thumbnails rendered from the real block (the picker's pictures are code-drawn; the live preview is the
  page itself), and Page-section starters (starters fill the page body, not `page:<slug>` sections).

### Phase 6 — Brand kit & setup wizard (Squarespace Blueprint) — DONE (15 October 2026)
- [x] **Brand kit** panel (`studio/StudioBrandKit.tsx`, beside the preview like Add section): 1 Logo (upload or library;
  its colours are read in the browser by `studio/logoColours.ts` → `brandKit.dominantColours`) → 2 Colours
  (`palettesFromColours`: light page / dark page / your colour as the page, then the built-in palettes; text ≥ 4.5:1 and
  accent ≥ 3:1 guaranteed by `withContrast`) → 3 Personality (`PERSONALITIES`: bookish, bold, minimal — fonts, button
  style, corners, uppercase) → 4 Home page (keep, or the personality's starter layout without its fixed colours) →
  5 Review (`brandKitSummary`) → **Apply brand kit**.
- [x] Every step previews on the canvas (`brandChoice` → `brandKitDesign` in `sendPreviewState`, never the draft);
  Apply is one named `change` ("Apply brand kit"). It writes only keys with a Style control (`paletteKeys`,
  `personalityKeys`, `logoUrl`; tested against `STYLE_GROUPS`) on every page (`applyThemeKeysToSurfaces`) and adds a
  "Brand colour" scheme (`brand-accent`).
- [x] Entry points: Workbench › Setup › **Set up your brand in one go** (`go: { kind: "brand" }`), Theme actions ›
  **Brand kit…**, Find anything "Brand kit". Switching workspace closes it.
- Not done: a card on the Theme settings home (the three entry points above cover it); reading colours from a library
  picture whose storage host blocks canvas reads (the panel says so and offers the colour picker).

### Phase 7 — Site-wide Health & speed — DONE (15 October 2026)
- [x] **Check every page** (Workbench › Health, Find anything "Check every page"): `studio/siteHealth.ts` `healthRoutes`
  lists Home, the shop, one book per book-page template (default + each alternate), published custom pages, written
  policy pages, up to 12 categories and wishlist / account / tracking / 404. `studio/StudioSiteHealth.tsx` loads each into
  a hidden, see-through frame at the previewed device width, feeds it the canvas's unsaved snapshot
  (`buildPreviewState` + `deliverPreviewState`), waits for it to settle (8 s cap), scrolls through it once so sections that
  fade in lower down are revealed, and runs the read-only `auditDocument`. The preview's Customer account never creates a
  customer record for the signed-in owner (`Account.tsx`, `inEditorPreview`).
  Progress, **Stop**, results grouped by page (`mergeSiteFindings`: problems on several pages listed once, worst pages
  first), **Open this page** (canvas switches; Health re-checks it there for Show me) and **Edit this part** (a built-in
  part waits for its page to load). The frame is removed after each page; nothing is written.
- [x] Speed: the existing picture checks (main picture loading lazily, pictures without a size that make the page
  jump, heavy pictures, the preview's own LCP time) plus a per-page **estimate** of picture and font weight
  (`pageWeight`, from the browser's resource list). All labelled as estimates from the preview; no INP figure (it needs
  real shopper input).
- [x] Section background pictures picked from the Media library load a screen-sized copy:
  `features/site/backgroundSources.ts` writes `--fm-bg-img` per breakpoint (tablets ≥ 2400 px copy, phones ≥ 1600 px: a step
  up because "cover" scales to tall sections) and
  `bgStyle` reads `var(--fm-bg-img, url(full))`; a plain URL renders exactly as before. No AVIF (the library makes WebP).
- [x] History: the last 10 complete runs per browser (`studio-site-health-v1:` in localStorage) with a "Last checks"
  trend; Setup's Health item is done after a whole-shop run with nothing to fix. Health stays in the Workbench (not a
  rail tab).

### Phase 8 — AI assistant — DONE (15 October 2026, owner approved)
- [x] **Rewrite with AI** under every section/block text, text-area and rich-text field (`ConnectableField`) and every
  Text & labels entry (`StudioCopyField`), via `studio/StudioAiRewrite.tsx`: Improve, Shorter, A little longer, Friendlier,
  More formal, Fix spelling & grammar, or "tell it what to change". Server task `rewrite` (`functions/aiWriter.js`): keeps
  every `{placeholder}` / `{{connected detail}}` and every link (else nothing changes), rich text through an allowlist
  sanitiser (and `sanitizeRichText` again in the browser). The answer goes through the field's own onChange: one Studio
  change with a toast Undo; if the owner typed meanwhile, the answer is dropped.
- [x] **Draft a section with AI** (Page layout › Add section, Find anything "Draft a section with AI",
  `studio/StudioAiDraft.tsx`): six section kinds (`DRAFT_TYPES` in `studio/aiStudio.ts` = the server's; never quotes,
  testimonials or reviews). The draft shows on the page as the preview-only candidate; **Add to page** is one change.
- [x] **Pictures stay put (follow-up):** rich text with pictures, videos, dividers, alignment or indents is rewritten word by
  word. `protectRichText` (`studio/aiStudio.ts`) swaps each picture/video/divider for `[[keep-N]]` and each aligned or
  indented line's layout for a leading `[[line-N]]`; `restoreRichText` puts them back and refuses (nothing changes) if the AI
  dropped, repeated or reordered one (line markers must start a line that still has words). The markers count as placeholders on the server too (`TOKEN_RE`). Coloured or
  highlighted words are still refused. Studio › Pages bodies (`PageBodyEditor`) have the button too; their Undo is local
  (`localUndo`: page edits aren't Studio history) and refuses once the page was closed or changed since (`richTextSignature`).
- Sends Google only the field's words, its label and the section/group name (or the owner's brief) — never customers,
  orders, stock or costs. Same key, house style and rate limit (`LIMITS.aiWrite`) as the book/page AI buttons. The Studio
  fixture answers through `setAiTransport` (`admin/aiWriter.ts`), so browser checks never call Google.

### Friendlier Studio (16 October 2026)
Three audits (first-time owner, click paths, feedback) led to one round of fixes. No design key, save logic or storefront code changed.
- **Words:** no raw ids or developer terms on screen. Phone tabs read Sections · Preview · Edit. Find's badges are Go to / On the page / Look / Words / Menu / Do,
  and its tab names match the rail. Pages: "Web address", "Google listing (SEO)", "Title on Google", "Description on Google". Responsive fields say
  "Same as the larger screen" / "Use the all-pages value". Linked shared blocks show as "Reusable block". Pop-overs are "Pop-ups".
  `settingLabel`/`conflictLabel` use `STYLE_GROUPS`/`COPY_SCHEMA` labels.
- **Place kept:** clicking the active rail tab keeps the selection, and each tab's scroll is restored. The inspector keeps its tab across sections of the same type
  (`studio/inspectorState.ts`). There are Move up/down buttons in the inspector and Flexible-composition block **Hide on phones / Hide on tablets and phones** (`responsive[device].hidden`, preview-size independent; the storefront tablet rule is up-to-tablet, so it covers phones). The Responsive layout card shows only for Flexible composition, the only renderer that reads it. Block Move up/down are their own named undo steps.
  any page change (template or every-page group) resets "This page only" to All pages. The element inspector has **Back to Page layout**, and the element card goes back to its category. Text & labels opens
  the sub-section holding the focused key. The mode button says the action, and the preview bridge sends `LINK_BLOCKED` once for a one-time hint (`lm:studio-mode-hint`).
- **Feedback:** the status pill reads Not saved yet · shop unchanged / Saved as draft · shop unchanged / Live · the shop shows this.
  - `say("warn", …)` stays until dismissed. Use it for warnings and every delete toast with Undo.
  - "ok" toasts last `toastDuration` (`studio/toastTiming.ts`) and pause on hover/focus.
  - Failures go through `studio/friendlyError.ts` (plain sentence, raw error to the console). Never show `err.message` directly.
  - A live-sync failure shows a persistent banner. The Publish dialog counts changes and says when the live shop couldn't be read.
  - The preview shows "Loading your shop preview…".
  - Deleting 3+ sections or a template asks first.
  - `StudioCopyField` notes when Theme settings' `addToBagLabel` overrides the Add-to-bag words (`CopyTargetContext`).

### Finding your way (16 October 2026)
Three agents looked at search, wayfinding and browsing. One PR delivered the result:
- **Find anything** understands plain words, UK and US spellings, phrases and typos. Categories rank above single controls, and each result shows its click path. A miss offers suggestions and Browse buttons. 60 owner-style queries are pinned in `studioSearch.test.ts`. The old search failed 37 of them.
- **Back and path:** the breadcrumb is the full path, and every level except the last is clickable. **← Back** and Alt+← use `placeHistory.ts`.
- **Shop-order Theme settings:** the "Where is it on the shop?" map comes first, then the parts of the shop top to bottom, then the whole-site look. The category titles are plainer. Page layout parts have **Style** and **Words** shortcuts, and the page has a dismissible "click anything in the preview" tip.
- **View website:** a top-bar button opens the draft in a full storefront tab. `DraftPreviewBanner` tells the owner whether the tab shows unsaved changes, the saved draft or the live shop.

### Phase 9 — Multi-language EN/FR *(needs owner go-ahead)*
- [ ] Carry out `docs/superpowers/plans/2026-10-04-local-fulfillment-content-languages.md`: translating words and pages,
  a check for what is still untranslated, previewing each language, and a language switcher for shoppers.

### Phase 10 — Experiments & catalog pages *(needs owner go-ahead)*
- [ ] A/B tests: two versions of a section, compared on paid orders.
- [ ] Author, series and event pages that fill themselves from the catalog.

## Shopify-parity roadmap (history)

Status legend: `[ ]` todo · `[~]` partial · `[x]` done. Update these as work
lands. Pick a milestone, take it **end-to-end** (schema → renderer → mapping →
library → verify), then check it off.

### A. Sections everywhere (page-type templates) — DONE
- [x] Template concept keyed by page type. Sections live at
      `design[surface].sections` for `heroPage / storefront / productPage /
      collectionPage / cartPage / page / page404` (`PAGE_TEMPLATES` in
      `ThemeEditorExtensions.tsx`).
- [x] Section editor targets the current template via the `PAGE_TEMPLATES`
      pills; `update()` scopes writes to the active `designSurface`.
- [x] Product/collection/custom-page/cart surfaces render their template's
      sections via `TemplateSections` (in `BookDetail`, `CollectionPage`,
      `PageView`, `Checkout`). Rendering is unified in `sectionRender.tsx`.
- [x] `GlobalSections` now renders on **every** standalone page (previously
      homepage-only), via the shared `sectionRender.tsx` — including the
      Wishlist, Account, and OrderTracking pages.
- [x] The catalog `storefront` surface now renders its template's sections via
      `TemplateSections` in `MainSite`.
- [x] Click-to-edit now routes preview section clicks to the owning page-template
      panel before opening the section editor.
- [ ] Follow-up: group global sections into header/footer/announcement.

### B. More section types (close gaps + expand)
- [x] Configurable screenshot-style storefront homepage milestone shipped: a
      black editorial header/product-grid design can now be built from theme
      sections and settings rather than hard-coded homepage code. The milestone
      is considered complete only when the published storefront matches the
      reference screenshot, keeps registry↔renderer parity, and remains editable
      through the theme editor.
- [x] Reference design follow-through shipped: accurate live multi-currency
      cart subtotal display, reusable `ProductGridHeaderSection` registry +
      renderer + library entry, responsive masthead/nav controls, product focal
      point controls, and preview-canvas section drag/reorder via
      `data-fm-section` hooks.
- [x] Existing live storefronts now default into the photo-reference catalog
      treatment even before a merchant manually reapplies the preset, so older
      Firestore theme documents no longer stay on the previous utility-grid
      storefront by accident.
- [x] Renderers added for `VideoHeroSection`, `StatsCounterSection`,
      `PricingTableSection` — registry and renderers are now at full parity.
- [x] Unified the section library on `SECTION_REGISTRY`; retired the legacy
      `SECTION_TEMPLATES` + `SectionLibraryModal`.
- [x] Blog posts / journal cards shipped end-to-end as a reusable
      `BlogPostsSection` (registry schema, block fields, storefront renderer,
      and library exposure) for announcements, release notes, and editorial
      content.
- [x] Responsive Image Banner shipped end-to-end with separate desktop/mobile
      artwork, image focal/style controls, nine content positions, four heights,
      accessible alt text, overlay strength, and primary/secondary CTAs. It is
      registry-driven, appears in the Media library, and renders on every template.
- [ ] Add remaining common Shopify sections end-to-end as needed (e.g. featured
      collection and richer content compositions) — each via the full contract.
- [x] Core sections shipped end-to-end (Hero, FeatureGrid, Testimonials, FAQ,
      Newsletter, Slideshow, Multicolumn, RichText, Image-with-text, Video,
      Collection list, Featured product, Blog posts, Countdown, Contact form,
      Map, Gallery, Row, Marquee, Logo list, Collapsible, Text content,
      Custom HTML).
- [x] "Lyricalmyrical Riso" full-app design shipped as a first-class theme:
      warm uncoated-paper surfaces, red/blue/yellow ink tokens, hard black
      rules, halftone texture, deliberately stepped interactions, print-style
      card shadows, cart and checkout tokens, and matching global loading and
      consent overlays. The preset includes the curated
      `lyricalmyrical-riso` homepage layout (cover carousel, press marquee,
      product grid, print-room notes, and newsletter), and the shared Riso CSS
      is applied across the homepage and every standalone storefront surface
      when `themeStyle` is `riso`.
- [x] **Riso Press alignment (September 2026).** The "Lyricalmyrical Riso" preset now
      uses the published Riso Press design-system tokens (newsprint `#faf6ec`, ink
      `#100f0d`, flare `#e8402a` with ink text, press blue `#1b3fe0`, Anton / Archivo,
      square outlined objects, flat offset shadows, ink footer/announcement) and
      `RISO_STOREFRONT_CSS` mirrors it (2px ink outlines, flare focus ring, reduced
      motion, 44px coarse-pointer targets; halftone texture removed). `BookDetail` now
      loads the Riso CSS too. Editor chrome: the top bar wraps so Publish / Save Draft
      stay reachable below ~1500px and at 375px; a generated accent remap in
      `theme.css` fixes unreadable violet/blue active states in legacy panels.
      Draft/publish separation is covered by `admin/themeDraft.test.ts`.
      Known follow-up: the editor's panels are still legacy markup on the compat layer.
- [x] **Product page — Riso catalogue card (September 2026).** `BookDetail.tsx` uses a breadcrumb,
      thumbnail rail + framed photo + caption, one bordered buy card and full-width details tabs.
      Every part is in Studio › Style › **Product page · buy card & details** (`pdp*` keys →
      `features/site/productPageStyle.ts`, tested by `productPageStyle.test.ts`); words in Text & labels ›
      Product page. Trust-signal lines removed.
- [x] **Riso Noir (September 2026) — full public-site Riso redesign on black.** The
      storefront now defaults to Riso Press on black with white text and the flare
      `#e8402a` accent (ink text on flare fills). `features/site/risoNoir.ts` holds the shared
      `RISO_NOIR_TOKENS` record used by (a) the first `THEME_LIBRARY` preset
      (`lyricalmyrical-riso-noir`, with a matching `HOME_LAYOUT_TEMPLATES` layout), (b) the default
      design in `adminApi.getDefaultSettings` and `DEFAULT_SETTINGS`, and (c) `withRisoNoirDefault`,
      which restyles saved designs that never chose a `themeStyle` or applied a library preset
      (content, sections and menus are untouched; choosing "Standard" print style or any preset opts
      out). `RISO_STOREFRONT_CSS` is now 100% token-driven (`--rp-outline`, `--rp-outline-w`,
      `--rp-shadow-color`, `--rp-shadow-x`, `--rp-focus`, `--rp-card-radius`, `--rp-heading-transform`,
      `--on-accent`) with an optional halftone (`risoGrainCss`), a legibility floor for the faint
      `text-white/20…50` greys, explicit input borders, square pills, and `RISO_CHECKOUT_DARK_CSS`
      (turns the conventional white checkout dark). New editable keys: `risoOutlineColor`,
      `risoOutlineWidth`, `risoShadowColor`, `risoShadowOffset`, `risoCardRadius`,
      `risoUppercaseHeadings`, `risoGrain`, `focusRingColor`, `showRecentlyViewed`, `showBreadcrumbs`,
      `showCookieBanner`. `COPY_SCHEMA` grew to ~25 groups (~350 strings: header/About, cart, search &
      filters, collection/wishlist, product page, account, order tracking, checkout, 404,
      maintenance, loading screen, cookie banner) with a search box in Text & Translations, and
      `storeCopy.coverage.test.ts` fails if a `getCopy(…, "key")` is used without a schema entry.
      Bug fixed on the way: the token layer emitted space-separated triplets (`255 255 255`) but
      consumed them as `rgba(var(--x-rgb), a)` — invalid CSS, so every `text-white/N`,
      `bg-white/N` and `border-white/N` remap silently fell back to full white/transparent.
      Triplets are now comma-separated. Also: `StorefrontThemeStyle` now sets `--body-font` /
      `--heading-font` so standalone pages (not just the homepage) follow the chosen fonts.
- [x] **Studio parity (Shopify-style "everything editable").** `studio/styleSchema.ts` now exposes every
      design key the public storefront reads (logo & wordmark, catalog header/filters, navigation
      links, product page layout, badges & labels, motion/spacing/effects, checkout & cart drawer,
      footer extras, Riso print treatment, storefront elements) and Style › Theme look lists the whole
      `THEME_LIBRARY` with one-click apply. `studioCoverage.test.ts` scans the public source and fails
      if a design key is read without a Studio control; `storeCopy.coverage.test.ts` does the same for
      shopper-facing strings (now incl. reviews, checkout extras). Section-level text (sale label,
      form thank-you, slide arrows) is section settings.
- [x] **Studio: preview click-to-edit for storefront text, payment-icon picker, "My themes".**
      Double-clicking any storefront string (footer, cart drawer, account, checkout…) in the Studio
      preview is matched against the editable copy (`SET_COPY_MAP` → `COPY_SELECT` in
      `previewBridge.ts`) and jumps to that field in Text & labels. Footer payment icons are
      chosen in Style › Payment icons (`design.footerBadges`, falls back to Settings › Payments;
      `resolveFooterBadges`). Style › Theme look › **My themes** saves/loads/deletes whole-design
      copies (`settings.savedThemes`, max 10, `studio/savedThemes.ts`). Still open: recursive
      nested blocks with drag-and-drop.
- [x] **Studio "Find anything" (October 2026).** Top bar **Find** button / **Ctrl+K** (⌘K) opens one search
      over every Style control, every Text & labels string (by label *and* current wording), the Menus panels,
      each page and the sections on it, and the main actions (Save, Publish, History, phone preview…).
      `studio/studioSearch.ts` (pure, tested) builds and ranks the index — every typed word must match, titles
      beat location beats hidden keywords, and owner words work ("colour", "phone" ↔ mobile, "go live" →
      Publish). `StudioSearch.tsx` is the palette; `StudioEditor.goToResult` opens the right tab, expands the
      group, scrolls to and flashes the field (`data-style-key` / `data-copy-key`), selects a section, or opens
      a page in Studio › Pages (`StudioPages` `openSlug`). New Style/Text controls are picked up automatically.
- [x] **Studio visual editing workflow.** The active Studio has a sortable section
      outline with explicit add positions and expandable sortable blocks. Preview
      block selection opens its own inspector, including block fields, visibility,
      duplicate and remove. Edit/Browse modes separate selection from storefront
      interaction; device preview, selected product/collection, searchable settings,
      page/global style scope and phone-sized editor navigation are available.
      Draft saves capture an immutable snapshot, local unsaved work can be
      recovered, and design writes replace the full map so cleared overrides
      stay cleared. `studio/StudioEditor.tsx`, `StudioOutline.tsx`,
      `StudioInspector.tsx`, `previewBridge.ts`, `useStudioPersistence.ts` and
      `themeWrite.ts` own these behaviors. Fixture browser checks cover canvas
      block selection, slideshow selection, keyboard reorder and save races;
      authenticated Firestore save/publish remains to be checked in a live admin
      session. Recursive blocks and canvas drag remain future milestones.
- [x] Fixes found while verifying: token-layer selectors now also match roots that carry `data-fm-store` and `fm-page`/`fm-surface`/`text-white` on the SAME element (Account and Tracking never received the theme background before); Tracking text/placeholder contrast raised; `ProductCoverCarouselSection` text is pinned light
      over its image scrim (it was following the theme text colour), and Checkout restores
      literal paper for `bg-white` on light themes (the token layer maps `bg-white` to the
      foreground, which turned checkout fields black).
- [x] "Lyricalmyrical Punk" design shipped end-to-end (violet-on-black,
      Cormorant Garamond headings / Inter body). Four new catalog-driven
      sections: `ProductCoverCarouselSection` (hero auto-cycling book covers
      with dots, scrim, color-blend overlay, film grain),
      `ProductShowcaseGridSection` (4:5 covers, category tags, quick-add via
      `useCart()`, duotone + grain), `StaffNotesTableSection` (books-driven
      table; per-book note blocks resolved by `resolveStaffNoteRows` in
      `features/site/staffNotes.ts`, keyboard-accessible rows), and
      `EphemeraRowSection` (pure-CSS decorative objects as blocks). Section
      extensions: HeroSection `eyebrow`/`titleItalic`/`metaText`/
      `sideImageUrl`/`ctaUrl`; MarqueeSection `fontWeight`/`letterSpacing`.
      Theme plumbing: `punk` palette + `lyricalmyrical-punk` THEME_LIBRARY
      preset with a full `global` token record, and `lyricalmyrical-punk` /
      `lyricalmyrical-about` / `lyricalmyrical-journal` layout templates in
      `HOME_LAYOUT_TEMPLATES` (the About/Journal ones are applied while a
      per-page template pill is active). Chrome counterparts (settings-gated,
      defaults preserve the old look): sticker-pill nav + two-part wordmark
      (`navStyle`/`wordmarkStyle` etc., rendered by `MainSite` + `LogoMark`),
      a real scrolling announcement marquee (`announcementScrolling` now
      honored, plus speed/size/weight/tracking), catalog heading/count +
      category filter chips (`showCategoryChips`, adds an "ALL"
      pseudo-category), 4-column footer (`footerLayout`/`footerBg` +
      `footerLocationHeading` copy), themeable cart drawer
      (`cartDrawerBg/Text/Muted/Surface/Border`, `cartDrawerGrayscaleThumbs`),
      themed custom-page chrome (`pageChromeStyle`), product-page quantity
      stepper (`showQtyStepper`; `addToCart(product, variant?, quantity)`)
      and designed description card (`productDescriptionStyle`). Bugfix:
      `ProductGridHeaderSection`'s "Featured" source now filters on
      `isFeatured` (it previously matched every book).

- [x] **Studio audit (30 Sep 2026).** Browser-driven audit of Studio. Fixed: tabbing through an *unset* colour field wrote `#000000` (blank now stays blank; `transparent`/`rgba()` survive); the preview iframe no longer counts visits / funnel events as shopper traffic; unset sliders show the storefront default (`defaultValue` in `styleSchema.ts`); My themes refuses to grow past ~500 KB (each copy is a whole design and `settings/website` is one 1 MiB Firestore doc); dirty/unpublished compares memoised. Known gap: preview double-click→copy matching is exact-text, so strings with `{count}`/`{year}` placeholders never jump to their field.

### C. Live preview & editing UX
- [x] Canvas drag actions resolve section ownership and blocks from the latest
      draft, including global sections and custom-page templates, so delayed
      preview events cannot overwrite newer edits. Linked nested blocks retain
      their source children. Studio Pages keeps unsaved page edits mounted when
      switching tabs, protects them on exit, and preserves typing during a save.
      The pre-publish check scans nested content and reports manual image-size
      and contrast review as warnings rather than claiming those checks passed.
- [x] Inline click-to-edit routes preview clicks to the correct section/template panel and keeps the selected section highlighted.
- [x] Device preview toggle (desktop / tablet / mobile widths).
- [x] Visual/feature setting scope: **All pages** applies colors, typography,
      navigation, layout, buttons, product controls, announcements, social,
      sizing, translations, and additional settings across every static and
      dynamic template; **This page only** keeps intentional page-level
      overrides. Section stacks and page content are preserved.
- [x] Undo / redo for editor changes (Ctrl+Z / Ctrl+Y).
- [x] Reorder polish: sections, blocks, global sections, nav menu items and
      color schemes all reorder via `@dnd-kit` (pointer + keyboard) through the
      shared `src/app/admin/dndSortable.tsx` helper. Section types can also be
      dragged out of the library modal onto explicit between-section insertion
      zones, and existing sections use the same insertion targets plus a lifted
      drag overlay for precise moves, including an empty page and the start/end
      of the outline. Mega-menu child and grandchild links (`MenuBuilderPanel`
      in `ThemeEditor.tsx`) now reorder via the same `SortableList`/`SortableRow`
      pattern as top-level menu items, at all three nesting levels. `BlocksEditor`
      also gained a generic `kind: "list"` nested sub-list field (drag-reorderable
      plain-text rows via the same primitives), demonstrated on
      `PricingTableSection`'s "Features" field. The same `kind: "list"` field also
      supports a structured `itemFields` variant (`Record<string, string>[]` rows
      instead of plain strings), first demonstrated on `MulticolumnSection`'s
      "Links" field (`text` + `url` per row) and now also on `RowSection`'s button
      blocks (`buttons` field, `text` + `url` per row) so a single column can hold
      multiple CTAs side by side — the legacy single `buttonText`/`buttonUrl`
      fields remain as a fallback for blocks that haven't been migrated to the
      list. (Full recursive multi-field nested blocks across more section types
      remains a follow-up.)
- [x] Live preview channel (`THEME_UPDATE` postMessage) covers the full design
      snapshot on every template. Studio also sends a schema-derived editable
      field map, so safe text/textarea fields can be edited in the canvas even
      when a renderer does not carry a handwritten `data-theme-field` hook.
- [x] Studio iframe preview state is atomic: `STUDIO_PREVIEW_STATE` carries the
      unsaved design, settings, books and published pages on every relevant
      change and again after every preview navigation/ready handshake. This
      keeps colors, menus, page content and newly created pages in sync without
      relying on a second Firestore read or timing-sensitive iframe reload.
- [x] Atomic inline text editing in Studio: double-click plain section/block text,
      announcement messages, mastheads, wordmarks and footer labels, or focus an
      edit hook and press Enter. Done commits one `INLINE_TEXT_COMMIT` against
      the latest draft; Cancel/Escape restores the original. One Undo reverses
      the edit. Multiline text preserves line breaks and letter case. Preview
      snapshots pause while typing so React cannot replace the active caret.
      Save, Publish and Exit wait for completion. Formatted HTML and templated
      labels route to the inspector; product data and composite labels remain
      inspector-only. Linked block edits update their shared source and preserve
      local placement. Browse mode removes editing focus/tooltip hooks.
- [x] (Retired in Studio 2.0 · 1.5 — now Page layout's Header/Footer groups.) Shared layout workspace groups announcement, header, navigation, footer
      and shared-section controls with direct links to existing settings and
      text groups. This organizes the controls; header/footer section placement
      remains a separate roadmap item.
- [x] Inline rich-content formatting toolbar: supported rich fields expose bold,
      italic, underline, selected-word links, paragraph/heading style and alignment.
      Done commits sanitized markup once; Cancel/Escape restores original content.
      Unsupported embeds/styles keep the inspector path; plain labels remain text.
- [x] Contextual canvas section/block actions: Edit, sibling Move up/down,
      Duplicate, Hide, Delete and supported Add block. Boundary moves are disabled;
      inherited linked children omit structural actions. Duplication preserves
      legacy block-array fallbacks and refreshes descendant IDs.
- [x] Visual section spacing: four padding handles and renderer-supported gaps,
      4px snapping (Shift = 1px), keyboard adjustment, Escape cancellation and one
      Undo per drag. Desktop/tablet/phone scope follows the active preview; Reset
      and numeric Layout & style controls remove or edit scoped overrides. Padding
      applies once to the rendered content box, including custom-page content.
- [x] Per-section box fill, raised box fill, and line/border color controls now feed the storefront token layer so hard-coded card/form/divider utilities can be recolored from the editor.


### Next five theme-editor suggestions

After the reference-grid follow-through work, the next five highest-leverage
Shopify/WordPress-parity improvements are:

The September 2026 composition milestone completed the previous five items:
recursive three-level blocks, linked shared blocks, breakpoint overrides,
guarded CSS-grid placement, and direct section/block canvas drag/drop. The next
five highest-leverage increments are asset processing, performance profiling,
collaboration conflict handling, a complete theme-management workspace, and
schema-valid AI composition authoring.

> Mega-menu child/grandchild drag/drop (previously #2 on this list) shipped:
> `MenuBuilderPanel` in `ThemeEditor.tsx` now uses `SortableList`/`SortableRow`
> for top-level items, sub-links, and mega-menu column links alike.

### Studio usability and organization — DONE

- [x] Readable workspace navigation and page context.
- [x] Category browsing for Style and Text with cross-category search and click-to-edit/search routing.
- [x] Searchable section/block outline, original positions, hidden-state labels, expand/collapse controls and safe filtered ordering.
- [x] Primary editing/publishing toolbar plus accessible secondary Theme actions menu.
- [x] Explicit inspector device context; shared content remains distinct from breakpoint-specific layout.

Studio organization milestone: Page layout, Theme settings, Text & labels, Navigation and Pages
use readable navigation with page context. Theme settings and text browse by category; search spans
categories and Find anything/click-to-edit opens the owning category. The page outline searches
section and nested-block content, expands matching sections, numbers original positions and offers
Expand/Collapse all and explicit Move up/down actions. Section reorder is disabled while searching to preserve the complete stack.
The toolbar keeps page/device, undo/redo, draft state, Save draft and Publish visible; Theme actions
holds preview, history, checks and guarded discard. Inspector device context distinguishes shared
content from responsive layout overrides. Existing draft/publish persistence is unchanged.

- [x] **Friendlier settings homes (October 2026).** `studio/settingsMap.ts` (pure, tested) decides *where* controls
      appear; it never adds or removes one. Theme settings opens in three bands (1.6): **Site-wide design**, **Parts
      of your shop** (Header, menu & footer · Shop & book pages · Bag, checkout & accounts · Pages & features, each
      card with **Show on page**) and **Advanced** (folded **Fine-tune single elements** + Custom code). Each category card has a one-line description (`GROUP_BLURBS`)
      and a **● N changed** badge. **Theme presets & saved themes** and **Payment icons** are categories now
      (`EXTRA_STYLE_CATEGORIES`; click-to-edit `style:paymentIcons` opens it). Big categories split into short collapsible
      sub-sections (`STYLE_SUBSECTIONS`; unlisted keys fall into **More settings**, so a new control always shows);
      Find anything opens the sub-section holding the field (`fieldFocus`). Fields that differ from the default
      design show **Changed from default** + **Reset to default**, and **What I've changed** lists them all.
      Text & labels uses the same home (`TEXT_HEADINGS`, `TEXT_BLURBS`, "Text I've changed"). Page layout shows
      **Add section**, **Auto-fit page for phones** and a **Section tools** menu (copy / paste / save for reuse);
      saved sections are picked from Add section › **Your saved sections**. A dismissible **How Studio works** card
      (Theme actions › Show Studio tips) orients first-time use. `settingsMap.test.ts` fails if any Style category,
      text group or field stops being reachable — place new STYLE_GROUPS / COPY_SCHEMA groups under a heading.

### D. Theme management
- [x] Draft/publish + scheduled publish now include a clear Live/Draft/Unsaved
      state, persistent unpublished-change detection, and a guarded Discard
      Draft action that resets both Firestore and local editor history to the
      published storefront without changing what shoppers see.
- [x] Import/export JSON exists (`ThemeEditorPro`) plus a friendly duplicate-theme draft flow in the theme toolbar.
- [x] Multiple saved themes: Studio › Style › Theme look › **My themes** (up to 10 full
      designs) with Rename, Duplicate, Download as a `.theme.json` file and
      **Import a theme file…** (`studio/savedThemes.ts`). Applying one loads it into the
      undoable draft; the published site is the active theme until Publish.
- [x] Version history / restore previous published versions: every Save Draft / Publish
      writes a snapshot to the admin-only `theme-versions` Firestore collection
      (`adminApi.saveThemeVersion`/`listThemeVersions`; Publish adds one, Save draft refreshes `draft-latest`; last 30
      unpinned kept, pinned versions/checkpoints never pruned — see 3.1),
      shown in Studio's History dialog so history survives reloads. Preview is
      non-destructive; Restore loads a snapshot into the working copy as an
      unsaved change, and nothing goes live until Publish.
- [x] Publish and Discard use accessible admin dialogs with a concise inventory
      of changed surfaces/settings instead of browser confirms. Ctrl/Cmd+S saves.
- [x] Studio can copy/paste sections between templates and save configured
      sections into the draft's reusable `sectionPresets` library.
- [x] Sections support phone/desktop visibility, scheduled show windows, phone
      padding/type/grid overrides, and direct drag reorder in the preview canvas.
- [x] A pre-publish check flags empty content and missing image descriptions and
      reminds editors of contrast and image-weight review.

### E. Visual layout & responsive engine (Fluid Engine / Wix Studio)
- [x] Nested blocks (block-in-block) in the Studio model, outline, inspector,
      and `CompositionSection` renderer — guarded to three levels deep.
- [x] Reusable linked shared blocks can be promoted from or inserted into any
      compatible section of the same renderer type. Content inherits from one
      source while placement, visibility and responsive layout remain local.
- [x] Emit stable `data-fm-section` / `data-fm-block` ids on rendered
      section and block nodes for reliable click-to-edit/hover-highlight.
- [x] `CompositionSection` supports CSS-Grid row/column/span/`z-index`
      positioning with separate desktop/tablet/mobile layouts and a three-level
      tree guardrail.
- [x] Block alignment/visibility and grid placement use the active
      desktop/tablet/mobile preview as their editing scope, with inheritance
      when an override is blank. Auto `clamp()` typography remains a later enhancement.
- [x] Soft section/block limits with in-editor warnings (25 sections / 50
      blocks reference).

### F. Performance & assets (Core Web Vitals)
- [ ] Keep renderers shallow; add a DOM-depth/node-count audit.
- [~] Image pipeline: 1500–2000px cap, JPEG 80–85, WebP/AVIF, responsive
      `srcset`, focal-point mapping, payload budgets (hero <200KB / content
      <150KB / thumb <50KB). Studio 2.0 · 2.4 covers Media-library pictures (WebP 480/960/1600, `srcset`,
      focal point, budget warnings); AVIF and CSS background images remain.
- [ ] Lazy-load below-the-fold sections/images; on-demand section JS.
- [ ] Element caching of unchanged rendered section HTML.
- [x] Surface an in-editor theme-weight guardrail score (section/block counts plus warning states).
- [ ] Expand theme-weight into a full Core Web Vitals proxy (LCP, CLS, INP, DOM node count).

### G. AI authoring & custom code
- [ ] Prompt → registry-valid section/block JSON inserted as a draft.
- [x] Desktop → mobile breakpoint/typography auto-generation (October 2026). `studio/autoMobile.ts`
      (pure, tested) fills phone values the owner hasn't set: phone top/bottom spacing (~55% of desktop),
      a smaller large heading (`mobileHeadingSize`, rendered as a phone-only `h1,h2` rule in `sectionRender.tsx`),
      fewer grid columns, and — for **Flexible composition** — stacked tablet (two-up) and phone (one per row)
      block placement in reading order. Own values are kept unless **Redo all phone values** is used; **Reset
      phone layout** removes them. Entry points: Sections tab › **Auto-fit page for phones** (whole page),
      section › **Layout & style** › **Phone & tablet layout** (one section), and Find anything › "Auto-fit this
      page for phones". Fixed along the way: tablet/phone grid rules in `compositionBreakpointCss` are now
      `!important` — the desktop placement is an inline style, so previously per-device grid overrides never won.
      `phoneLayout.test.tsx` guards the storefront output. Remaining: auto `clamp()` body typography and a
      visual diff of the phone result.
- [x] Custom CSS panel (global + per-section) via the token layer / scoped section style injection.
- [ ] Deferred custom JS hook (post first-paint) for widgets/analytics.

## Best-in-class feature targets (competitive analysis)

This is the bar a "legit" theme editor has to clear. It's distilled from a
comparative analysis of **Shopify Online Store 2.0 / Horizon, BigCommerce
Stencil / Catalyst, WooCommerce (Gutenberg vs Elementor), Wix Studio /
Harmony, and Squarespace Fluid Engine**. Each item below names the
best-in-class behaviour, then maps it to where it lands in *this* codebase
(registry, renderers, `design`/`draftDesign`, the token layer) so it can be
built end-to-end via the section contract above.

### Where we stand vs. the platforms

| Capability | Best-in-class reference | Us today | Gap to close |
|------------|------------------------|----------|--------------|
| Declarative page state | Shopify OS 2.0 JSON template tree (`templates/*.json`) | `design.sections` JSON in settings | Per-page-type templates (roadmap A) |
| Sections + blocks | OS 2.0 sections/blocks; Horizon **8 levels** of nesting | sections + 3-level composition blocks | Block copy/paste, previewing picker (3.0 Phase 5) |
| Reusable blocks across sections | OS 2.0 "theme blocks" / app blocks | linked shared blocks + saved sections | — |
| Click-to-edit in preview | `{{ block.shopify_attributes }}` data hooks | every section, block and built-in part | — |
| Visual drag layout | Squarespace Fluid Engine CSS-Grid coordinates; Wix Studio Grid+Flexbox | grid coordinates typed in Flexible composition | Drag/resize on the canvas (3.0 Phase 3) |
| Responsive per-device editing | Wix Studio breakpoints; Squarespace 24-col desktop / 8-col mobile grids | desktop/tablet/phone overrides + auto-fit | — |
| AI authoring | Horizon AI block generator; Wix AI layout/`clamp` typography | page search listings only | 3.0 Phase 8 (needs owner go-ahead) |
| Custom code | OS 2.0 `custom.css` inject + editor CSS panel | token/CSS-var layer only | Global + per-section custom CSS, deferred custom JS |
| Performance budgets | Lean semantic HTML, Core Web Vitals pass-rate, element caching | Health speed tips, lazy sections, image pipeline | Site-wide CWV estimates (3.0 Phase 7) |
| Theme management | Theme library, versions, duplicate | My themes, version history, scheduling, share links | — |
| Editor shell & navigation | Stripe Dashboard + Workbench; Linear-style key sequences | rail, Find (Ctrl K), Workbench, G-key jumps, breadcrumb | — (3.0 Phase 1) |
| Layered styling | Stripe Appearance API (theme → variables → rules); Webflow variable modes | presets + style controls + colour schemes | Tokens, modes, state rules (3.0 Phase 2) |
| Motion | Webflow GSAP interactions; Squarespace Finish Layer | section entrance animation only | 3.0 Phase 4 |

### Feature backlog (the "make it legit" list)

**1. Sections & blocks model parity (Shopify OS 2.0 / Horizon)**
- **Nested blocks.** Today blocks are a flat list under a section. Add
  recursive blocks (block-in-block) so layouts like cards-in-columns work
  without bespoke section types. Horizon allows up to **8** levels; even 2–3
  unlocks most real layouts. Extend `getBlockFields`/`BlocksEditor` and the
  renderer's block loop.
- **Reusable / shared blocks** ("theme blocks"): promote a configured block to
  a library entry usable inside any section, not just where it was authored.
- **Limits + guardrails.** OS 2.0 caps templates at **25 sections / 50 blocks
  per section** to protect performance. Surface soft caps + a warning in
  `HomepagePanel` instead of letting pages grow unbounded.
- **Stable edit ids.** `SectionList` emits `data-fm-section` on every rendered section wrapper, and block-based renderers emit `data-fm-block`/`data-block-id` on their primary block node (the analogue of `block.shopify_attributes`) so the preview iframe can hover-highlight and round-trip click-to-edit reliably.

**2. Visual layout & responsive engine (Squarespace Fluid Engine / Wix Studio)**
- **Grid positioning.** Move beyond a single vertical stack: allow blocks to be
  placed on a CSS Grid with start/end coordinates and a `z-index` so elements
  can overlap natively (Fluid Engine stores `[x_start,y_start]→[x_end,y_end]` +
  z per block). Keep the storefront output as CSS Grid so no layout JS runs at
  runtime.
- **Separate desktop/mobile grids.** Fluid Engine exposes a **24-col desktop /
  8-col mobile** grid; store per-breakpoint coordinates so mobile isn't just a
  squashed desktop.
- **Editing guardrails** (so dynamic row heights don't make dragging chaotic):
  prevent shrinking a container below its content, auto-adjust the end
  coordinate when content height changes, and temporarily restore a uniform
  grid while a drag is in progress.
- **Per-breakpoint overrides + device preview toggle** (desktop/tablet/mobile),
  with auto `clamp()` typography generation like Wix Studio's AI breakpoints.

**3. AI authoring (Horizon AI block generator / Wix AI layout)**
- **Prompt → section.** "Add a 3-up testimonial row in our brand colors"
  should emit a *registry-valid* section/block JSON (validated against
  `SECTION_REGISTRY` field types) and insert it as a draft. This is the single
  highest-leverage modern differentiator.
- **Desktop → mobile.** Given a desktop layout, auto-generate the mobile
  breakpoint coordinates/typography rather than making the merchant redo it.

**4. Custom code & extensibility (OS 2.0 `custom.css` / BigCommerce widgets)**
- **Custom CSS panel** — global and per-section — injected through the existing
  `StorefrontThemeStyle` / token layer (scoped under `[data-fm-store]`).
- **Deferred custom JS** hook for analytics/widgets, executed after first paint
  (Wix's lesson: never block INP with editor-injected scripts).
- **Custom HTML block** already exists — keep it sandboxed/sanitised.

**5. Performance & asset discipline (Core Web Vitals — the report's headline)**
The whole report hammers one point: **lean semantic HTML wins.** Gutenberg
beats Elementor by ~75% smaller DOM purely by avoiding nested `div` wrappers.
Our renderers must stay shallow.
- **Keep renderers shallow** — no Elementor-style wrapper-in-wrapper nesting in
  `SectionComponents.tsx`. Audit DOM depth as sections are added.
- **Image pipeline / payload budgets:** cap uploads at **1500–2000px**, JPEG
  **80–85%**, prefer **WebP/AVIF**, generate responsive `srcset`, and apply
  **focal-point mapping** so subjects stay centred across breakpoints. Target
  budgets: hero **<200 KB**, content image **<150 KB**, thumbnail **<50 KB**.
- **Lazy-load** below-the-fold sections/images; load section JS on demand.
- **Element caching:** memoise rendered section HTML where settings are
  unchanged (Elementor 3.24+ cut response time ~30% this way).
- **Surface a Core Web Vitals / "theme weight" score** in the editor (LCP, CLS,
  INP proxy, DOM node count) so merchants see the cost of what they add.

**6. Theme management & TCO (all platforms)**
- **Multiple saved themes** (a library of complete themes, one published) +
  **version history / restore** — already seeded in roadmap D.
- **Duplicate-theme** flow on top of the existing JSON import/export.
- **Section & theme presets** library (presets exist; grow into a gallery).

### Guiding principles pulled from the analysis
- **Declarative, JSON-first state** (we already match this with `design`).
- **Lean DOM > visual convenience** — every wrapper has a Core Web Vitals cost.
- **Responsive by construction**, not absolute positioning — favour CSS
  Grid/Flexbox and breakpoint overrides over pixel coordinates baked for one
  screen.
- **Editor stays WYSIWYG** — block-limit workarounds that push merchants into
  sidebar-only forms (the Shopify metafield-repeater hack) are a regression in
  UX; prefer real nested blocks.

## Verifying changes

- Re-confirm the registry↔renderer match before/after a change:
  - Registry types: `grep -oE 'type: "\w+Section"' src/app/admin/ThemeEditorExtensions.tsx`
  - Renderers: `grep -E 'export function \w+Section' src/app/components/SectionComponents.tsx`
  - Every registry `type` should have an identically named renderer.
  - This grep is also enforced as a permanent Vitest test:
    `src/app/components/sectionParity.test.ts` (runs with `npm test`).
- Run the app (`npm run dev`), open `/admin` → theme editor, add/edit/reorder the
  affected section, then **load the live storefront** and confirm it renders,
  toggles visibility, and survives save → publish.
- `npm run build` should succeed; run `npm test` (Vitest) for any touched logic.
- Respect existing guardrails in `CLAUDE.md` / `AGENTS.md` (sub-path routing,
  Firestore rules, accessibility).

## Riso chrome (Phase 5 complete)

The editor root is now `.rp` and follows the admin appearance (`appearance` prop from `Dashboard`). Top bar (Design studio heading, Live/Draft/Unsaved badge on `--rp-*` status tints), the tab strip (`role="tablist"`, 44px targets, flare active tab), left panel surface, shared primitives, and the section library (`role="dialog"`, focus trap, Escape, labelled search and delete controls) all use Riso tokens. Deeper panel bodies still carry legacy utility classes under the `.admin-reso` compat layer; migrate them panel by panel.

- [x] **Public recovery and phone navigation (2 Oct 2026).** Shared phone menu with Studio visibility/copy controls; custom pages retain the shared policy footer with a page-footer toggle; wildcard recovery exposes existing 404 copy and message/back-link visibility controls. Checkout configuration errors remain editable in Text & labels > Checkout.

## Page-by-page public designer coverage (2 Oct 2026)

- [x] Add Wishlist, Customer account and Order tracking to Studio's page selector, section stacks and preview routes. The 404 canvas previews a real unknown URL.
- [x] Resolve Home, Catalog and Collection tokens from the active page; preserve product-only controls over catalog defaults and merge local region settings without replacing unrelated fields.
- [x] Provide searchable Theme settings categories for catalog/shared content, product content, wishlist, account, tracking, checkout, search, reviews, recovery and overlays. `storefrontRegions.ts` maps each region to its renderer and click-to-edit target. Controls cover spacing, borders, backgrounds, fonts, text, optional visibility and supported grid columns; phone overrides participate in Auto-fit for phones. Unset controls preserve existing appearance.
- [x] Route local validation reasons and account/order statuses through Text & labels. Provider failures use editable recovery copy rather than displaying uneditable technical messages. Intentionally cleared catalog sort labels remain empty.

| Public surface | Studio ownership |
| --- | --- |
| Home, catalog, collections | Their page canvases, Catalog & shared content, existing card/header/footer controls |
| Book detail | Product canvas, existing buy-card controls, Product content, Reviews |
| Wishlist | Wishlist canvas and Wishlist layout & elements |
| Account, sign-in and order details | Customer account canvas and Account layout & elements |
| Order tracking | Order tracking canvas and Tracking layout & elements |
| Cart, checkout, empty/success states | Cart canvas and Checkout layout & elements |
| Custom/policy pages | Pages content, page-specific canvas, existing custom-page/header/footer controls |
| Missing URL and rendering failure | 404 canvas, Recovery layout & elements, Custom pages & 404 copy |
| Search, cookie notice, loading and construction screen | Search/Overlay layout & elements and their existing Text & labels groups |

Required checkout, sign-in, order-access and consent controls remain functional: their presentation is editable, but the region system does not offer a hide toggle. Catalog/customer/order records and Stripe's embedded secure fields retain their own data and validation authority. Publishing a design cannot change charge totals or mark orders paid.

Verification uses route-resolution/region/schema/copy regressions and a local Studio fixture: Home, Catalog, Collection, Product, Wishlist, signed-out Account, Tracking, 404 and empty Cart render their corresponding section stacks. Authenticated customer states, owner Firestore save/publish and a live Stripe order require separate authenticated production verification; the fixture does not certify those flows.


## Responsive public element editing — DONE (4 October 2026)

- [x] Browse built-in public elements by category/search, including hidden elements and
  conditional messages. Select an element to edit its active-device controls, or jump to
  its Text & labels category. Find anything opens the correct element and preview size.
- [x] Desktop/tablet/phone controls for per-side padding/margins, gap, dimensions, corner
  radius/border thickness, colors, font/weight/case/alignment/size/line-height/letter-spacing,
  optional visibility and supported image fit/focal points/grid columns. Existing keys and
  unset designs retain their appearance. Phone inherits tablet, then desktop.
- [x] Reset individual overrides or the selected size in one undoable draft action. All
  pages writes and This page only resets preserve unrelated settings and section stacks.
  Required commerce/consent/recovery regions cannot be hidden. Device visibility uses
  disjoint media ranges so showing an element retains its original flex/grid layout.
- [x] Auto-fit includes side spacing, margins and gap, reads tablet overrides, and keeps
  manual phone values including zeroes.
- [x] Separate click-to-edit controls for newsletter content/form/actions/messages, search
  input/close/result rows/covers, and review title/body/author/date/empty/loading states.
- [x] Text & labels shows effective defaults and distinguishes Custom text, Intentionally
  blank and Using default. Clear means blank; Reset to default restores the fallback.
  Inline edits follow the same page-aware copy writer and preserve unrelated labels.

Verification includes automated copy/region/CSS/auto-fit regressions and a local Studio
fixture exercising rendering at 1440px, 820px and 390px, hidden-element selection,
page scope, copy clear/reset, undo, search routing, and captured save/publish snapshots.
Fixture persistence captures data locally; owner-authenticated Firestore saves/publishing
and production payment/order flows remain separate verification.

- [x] Selected preview sizes retain their viewport widths (1200px desktop, 820px tablet,
  390px phone) with canvas scrolling. Narrow editor windows cannot silently activate
  another breakpoint. Browser verification reproduced and repaired this mismatch.


## Stripe checkout payment section (4 October 2026)

- [x] Insert actual Stripe Payment Element fields inside checkout, separate from
  the method radio label, with mode-validated initialization and readiness gating.
- [x] Keep card checkout inline: missing keys block payment, legacy redirect
  settings are ignored, and Studio's hosted redirect control has been removed.
- [x] Studio > Style > Checkout · Stripe payment section exposes responsive
  panel, selector, badge and recovery controls. Badge visibility is optional;
  payment selection and recovery remain required. Auto-fit derives phone
  overrides from the same public-region manifest.
- [x] Text & labels > Checkout owns badge text, inline retry explanation and
  action. A failed or 20-second-stalled loader offers Reload payment form before
  an attempt starts; it recreates the inline form without opening a hosted page.
- [x] Submission locks synchronously before validation, prevents payment-method
  switches during processing, and retains the lock during provider navigation.

A valid publishable key for the active Stripe mode is required. Display-only
validation of actual Stripe fields does not verify sandbox payment, authenticated
Studio persistence, webhook delivery, refunds, email or fulfillment. Server
prices and webhook-only paid-order authority remain unchanged.

Stripe field appearance follows Studio checkout field background, text, border, font, accent and corner-radius controls inside the secure iframe. Riso defaults use square, visibly outlined idle fields with accent focus outlines and danger outlines for invalid fields; payment tabs share the same border treatment.

## Shopping navigation and real catalog merchandising (7 October 2026)

- [x] Separate shopping categories/pages from a Studio-editable publisher information row on both storefront
  header layouts and standalone page/product headers, including phones. Navigation > Header bar order chooses
  each page's row; `secondaryNavKeys` stores that structural draft setting. Initial exact Submissions, History,
  Our history and Open call(s) labels use the publisher row until the owner makes an explicit selection.
  Style > Header layout owns Show publisher navigation row; Text & labels > Header owns its accessible name.
  Existing search visibility applies to the directly available phone search action.
- [x] Add full-catalog, ordered companion-book curation in Books > Categories & tags, preserving automatic
  category matches for unconfigured records. An explicit empty selection hides recommendations; public output
  excludes missing/current/unpublished books and never invents replacement choices. Existing Studio related-book
  visibility/copy remains authoritative. Product details use actual edition, pages, publisher and publication date,
  with the selected variant name as edition; Show edition details and spec labels are Studio controls.
- [x] Expose optional apartment/unit, eligible express wallets and payment-total presentation through Studio
  Checkout controls and Text & labels. Required payment and validation remain functional; browser/domain/provider
  wallet eligibility is not established by local rendering.

Contributor display and uploaded photographs remain owner-provided catalog content. This milestone does not
create author photographs, edit live catalog content or establish live payment/email/carrier/deployment success.
Stripe status checks require an authorized identity or private order key and record pending reconciliation only;
Stripe paid-order mutations remain exclusive to the verified signed webhook. Existing PayPal, manual/offline and
server-validated free-order contracts remain available.


### Cart shipping preview and return progress (7 October 2026)

- [x] Cart drawer > Total & checkout button > Shipping cost preview in cart controls
  the estimator visibility. Cart Text & labels owns destination fields, quote actions,
  errors, empty/digital results and preliminary-estimate wording. The shared cart input
  palette/font rules and data-studio-target hooks apply in the live preview and shop.
- [x] Secure tracking return progress uses the existing trackingRequests region and
  its responsive controls; Order tracking Text & labels owns approval, receipt,
  inspection, provider-pending, completion and declined status words. Return instructions
  are order-specific publisher data, with private inspection details kept out of tracking.
- [x] Catalog publication review uses explicit administrator acknowledgement and reviewed
  bulk draft changes. Public visibility follows publication status, including recommendations
  and sitemap, instead of title-based guesses.

Validation: handler tests cover authority, selective/idempotent restocking and profile
estimates; local desktop/phone browser fixtures cover forms/dialogs and customer progress.
The actual checkout destination handoff was exercised without creating an order/payment.
These checks do not prove deployed providers or live refunds.

### Grouped footer navigation (8 October 2026)

- [x] Replace long navigation/legal columns with two editable navigation groups and a wrapping legal row.

Grouped footer navigation defaults to Explore and Participate & connect, with policies in a wrapping row above copyright. Studio > Style > Footer & social links selects grouped/classic layout and group/location/heading visibility; Text & labels > Footer owns headings. Menus > Footer menu can customize automatic links, assign groups, edit destinations/labels, reorder and hide links, preserving sub-links. Contact pages suppress the duplicate automatic email link. Preview click-to-edit and inline copy hooks remain available.

### Shop filters (8 October 2026)

The catalog bar (`CatalogControls`) gains Format chips, Price Min/Max and Clear filters. Ownership:
Style › Catalog page header & filters › **Show search, sort & in-stock bar** shows/hides the whole bar;
Theme settings › Fine-tune single elements › **Catalog & shared content · layout** › elements **Format filter**, **Price filter** and **Clear filters
button** (regions `catalogFormat`, `catalogPrice`, `catalogClear`) carry per-element visibility and responsive
layout; Text & labels › Search & filters owns every word (`filterFormatLabel`, `filterFormat_<key>`,
`filterPriceLabel`, `filterPriceMin`, `filterPriceMax`, `filterClear`). Chips appear only when the visible books
have two or more formats; the price boxes only with two or more prices. Clicking any of them in the preview
opens its controls (`regionProps`). Verified with `catalogFilters.interaction.test.tsx` and a preview-snapshot
browser check (desktop + 390px); authenticated Studio publishing is not covered by local checks.
