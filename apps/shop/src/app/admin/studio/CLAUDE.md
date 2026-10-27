# Studio (the theme editor)

Studio is the only designer. Read `docs/THEME_EDITOR.md` too before changing it. The repo-wide rules are in the root `CLAUDE.md`.

## Theme editor

> [!IMPORTANT]
> **The default Admin → Settings → Design editor is the new Studio editor**
> (`src/app/admin/studio/StudioEditor.tsx`; left rail **Page layout / Theme settings /
> Text & labels / Navigation / Pages**). It is the **only** designer: the old `ThemeEditor.tsx`,
> `ThemeEditorPro.tsx`, `ThemeEditorBuilder.tsx`, `NewSectionLibraryModal` and `?editor=legacy` no
> longer exist. **Add or change every theme/design feature in Studio** — the user only sees Studio.
> The Studio 2.0 roadmap (navigation overhaul, Shopify-level features) is in `docs/THEME_EDITOR.md`. Shop categories (the storefront category bar) are edited in Studio › **Menus** ›
> **Shop categories**. They can also be created while editing a book in **Categories & tags**;
> that catalog workflow publishes the category immediately and synchronizes Studio's working copy.
> Custom pages (About, Journal…) also live only in Studio › **Pages** tab
> (`studio/StudioPages.tsx`); there is **no** separate Pages screen in the admin nav — do not
> re-add one. New pages join the storefront header by default (Studio › Pages › **Where the link shows**: Header and footer =
> `showInNav`, Footer only = `showInFooter`, read through `pageInFooter` in `footerNavigation.ts`; a **Stockists** starter
> opens as Footer only), and their public
> routes render the themed storefront header. Walkthroughs must use Studio's
> labels, not legacy legacy-editor tabs.

Studio › Menus › Shop categories has a searchable category manager with explicit
Edit/Delete, descriptions, optional images, visibility, parent placement and order.
Counts show direct assignments (including aliases); parent roll-ups and the
automatic PUBLICATIONS all-books view are separate. The picker reads the entire
catalog, including drafts and records without createdAt. Category details follow
Save draft/Publish; book assignments have an explicit live Save action, use the
published category name, and cannot target unpublished categories. Bulk writes
read fresh tags in an atomic transaction (up to 400 books), touching only
categories/genres/updatedAt. Deletion keeps all books, promotes children and offers
keep/remove/move assignments, refreshing membership before and after cleanup.
For larger categories, use Edit › Assigned here in groups of up to 400 first.
**Find anything:** the Studio top bar **Find** button (or Ctrl/Cmd+K) searches every Style control, Text & labels
string, Menus panel, page, section and action (`studio/studioSearch.ts` + `StudioSearch.tsx`; `goToResult` in
`StudioEditor.tsx` navigates). It indexes `STYLE_GROUPS` and `COPY_SCHEMA`, so new controls are findable with no extra
work — give them clear labels. It also lists the parts of the previewed page and books, opens on commands for the current selection
(`contextCommands`), then Recent and Shortcuts; `>` searches commands only (`paletteGroups`). **Auto-fit for phones** (`studio/autoMobile.ts`) fills phone/tablet values from the
desktop design: Sections tab › *Auto-fit page for phones*, or section › Layout & style › *Phone & tablet layout*.

Studio's Sections outline supports sortable sections and blocks. Canvas clicks
open their inspector; **Edit mode** selects content and **Browse mode** lets
storefront links and controls work. **Style** has searchable controls with
**All pages / This page only** scope for supported visual groups. Save draft,
Publish and local unsaved recovery are separate actions. **My themes** (Style › Theme look) can be renamed, duplicated, downloaded as a file and re-imported. History provides
non-destructive snapshot Preview and Restore to draft; change-aware dialogs
guard Publish/Discard. Reusable/copyable sections, scheduled visibility,
phone overrides, canvas reordering and pre-publish checks also live in Studio. These live in
`studio/StudioEditor.tsx`, `StudioOutline.tsx`, `StudioInspector.tsx` and
`useStudioPersistence.ts`; `themeWrite.ts` replaces complete design maps when
saving so removed page overrides do not reappear. The iframe receives an atomic
`STUDIO_PREVIEW_STATE` snapshot of the unsaved design, settings, books and
published pages, keeping colors, menus and newly created page content live
across preview navigation without another Firestore read. Delivery uses both
`postMessage` and a same-origin message-event fallback so iframe load timing
cannot leave the canvas showing the published design. `buildPreviewState` makes the
snapshot clone-safe (`toCloneable` strips `_lastDoc` Firestore snapshots — they made
`postMessage` throw `DataCloneError` and silently froze the preview once books loaded).
In preview, `useSiteData` keeps the snapshot's books/pages/settings on `window.__studioPreviewState`
so a late Firestore load never overwrites them; chrome outside that pipeline (cookie banner,
boot splash) uses `useLiveDesign()` (every storefront receiver follows Studio through `subscribePreview` in
`features/site/previewTab.ts`, which checks origin and sender once; never add another `message` listener for
`STUDIO_PREVIEW_STATE`/`THEME_UPDATE`, `previewSubscribe.test.ts` fails). **Preview in new tab** (Studio top bar) opens a full-screen
top-level `?preview=true` window: Studio posts the same snapshot on `BroadcastChannel("studio_preview")`
and `features/site/previewTab.ts` (started in `main.tsx`) re-dispatches it as a window message, answers
`PREVIEW_READY`, and keeps `?preview=true` on in-app navigation. Unsaved Studio › Pages edits ride
along in the snapshot (`withDraftPage`) without being saved.
**Preview follows every edit (12 October 2026):** any change to the draft clears a Themes/Version history preview
(`themePreview`/`historyPreview`), so the canvas never keeps a previewed look over an edit. Opening a page in Studio › Pages
switches the canvas to `page:<slug>` (`StudioPages` `onShow`). `rememberPreviewSnapshot` (`previewTab.ts`, first in
`main.tsx`) stores every snapshot on `window` before React mounts, so lazy pages start from it; the route `ErrorBoundary`
clears its error on the next snapshot in preview; spacing drags use pointer capture so a release outside the frame still
ends the pause on preview updates (`inlineEditingRef`).
**Preview clicks and links (12 October 2026, round 2):** the bridge reports its route on every load (`route()` at init);
Studio ignores the page it asked for (`samePreviewPage` vs `previewUrlRef`) and otherwise follows it, mapping `/` to the
catalog when `showHero` is off and a template-less book link to the book's alternate (`previewRoute` options). Editable words
outside a section fall through to element selection; a clicked repeated part is kept (`pickedEl`). The canvas/edit maps
cover `headerSections` and `overlaySections`. "cookie" is a Studio pop-over (`STUDIO_OVERLAYS`; the preview never writes
consent). Checkout's Pay does nothing in `?preview=true` (`coPreviewNoPay`). Outline rows show `sectionPreviewNote`.
**Preview audit (12 October 2026, round 3):** a Style control's `defaultValue` must equal what the storefront draws for an
unset key (`styleDefaults.test.ts` compares `?? true` / `!== false` / `|| "x"` / `?? n` fallbacks; Studio's default design wins).
The default **Reference** header (`usesReferenceHeader`, every layout but Modern) renders `menus.header`, sticker pills and only the
Navigation links values the owner set (`ownNavLinkStyle`), logo alignment and `navGap`; its categories come from
`referenceNavCategories` (also used by Shop categories' "Not in the shop header" note). Checkout in the preview with an empty bag
uses a display-only sample line (`previewSampleCart`, never `setCart`); the preview never writes abandoned carts. Shop text a
storefront part falls back to (footer About → `settings.info.description`) goes through `shopCopyFallback`, which
`StudioCopyField` shows as the default. `[data-fm-checkout]` background skips `.fm-bag` when the bag has its own.
**Button audit (12 October 2026):** Studio toast Undo buttons go through `undoAction()` (undoes only the change it names);
the checkout `<form>` blocks Enter-submission from text inputs (only Pay submits); Orders bulk actions act only on visible
rows (selection is pruned to `filteredOrders`); Books-page inline stock uses `inventoryApi.adjustStock`; My themes refuse
to save past `MAX_SAVED_THEMES` instead of dropping the oldest. New shopper words from the audit are in Text & labels.

Preview canvas actions resolve section ownership and block arrays from the
current draft, including global sections and dynamic `page:<slug>` templates.
Linked compositions inherit source children when a placement has no child
override. Studio Pages stays mounted across editor tabs; unsaved page edits are
protected on exit, typing during a save is retained, and Ctrl/Cmd+S saves the
active page. Page-load failures expose Retry. Pre-publish checks inspect global
and nested content, and identify image-size and contrast review as manual checks.

Studio also supports three-level recursive composition blocks through the
**Flexible composition** section. Groups can contain text, image, button, or
more group blocks; the active desktop/tablet/mobile preview controls local
alignment, visibility, and CSS-grid coordinates. Any configured block can be
promoted to a linked shared block and inserted in another block-capable section;
shared content updates everywhere while placement stays local. The preview
supports section and block drag/reorder plus schema-derived inline editing for
safe text fields.

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

**Media library (2.4):** Studio's **Media** rail tab (`studio/StudioMedia.tsx`) manages admin-only Firestore
`media/{id}` records (`admin/mediaApi.ts`); `uploadMediaImage` (`studio/mediaUpload.ts`) stores WebP copies at
480/960/1600 px under `assets/media/<id>/`. Image fields get **Choose from library** (`studio/mediaPicker.tsx`), and
their **Upload image** adds to the library once it is readable (Theme settings images too). A picture placed in a
section/block field keeps its plain URL plus a public `${field}__media` record; Theme settings images (logo, share
image, favicon, placeholder) get the URL only (plain `<img>`, written through the scoped `onChange`). The
record is defined in `features/site/mediaRef.ts`; section renderers draw images with
`components/ResponsiveImage.tsx` (`srcset`/`sizes`/`width`/`height`/lazy; `fetchpriority="high"` in the home/custom
page's first section) and render plain URLs exactly as before — new `<img>`s in `SectionComponents.tsx` should use
it too. Where-used/replace/filters are pure in `studio/mediaLibrary.ts`; Delete refuses a picture still used in the
draft, live design, a page, My themes or a retained Version history snapshot (`snapshotUses`; versions re-read first). **Deploy Firestore rules (`match /media/{mediaId}`) and Storage rules with the
frontend**; until then Media shows "isn't switched on yet" and fields keep URL + plain upload.

**Studio repairs (0.2):** every Studio image upload uses `uploadStudioImage` (`studio/mediaUpload.ts`) — never write
uploads outside a Storage folder `storage.rules` lets the admin write (`admin/storagePaths.test.ts`). Linked shared
blocks resolve centrally in `SectionList`; each section renders inside `SectionBoundary`. Phone/tablet widths come
only from `features/site/breakpoints.ts` (phone ≤767px, tablet ≤1023px). Scheduled designs and campaigns
are published by the server (`functions/themeSchedule.js`, 3.5). Save draft overwrites `theme-versions/draft-latest`; Publish adds a version.

**Private drafts (0.4):** Studio's unpublished draft is in admin-only `themes/workspace` (`draft`, `rev`) and
My themes in `savedThemes/{id}`; never add draft or theme data back to public `settings/website`. All Studio
saves go through `admin/themeStore.ts` (revision-checked; `ThemeConflictError` → merge or the conflict dialog).
Admin tools that change one design field outside Studio call `draftFieldUpdate`. Shopper code reads settings
with `adminApi.getPublicSettings()`, never `getSettings()` (which also reads admin-only key flags).
There is no public fallback any more (1.7): the first open copies an older public `draftDesign`/`savedThemes` across once and removes them; refused access raises `ThemeStoreUnavailableError` and Studio says so. `themeWrite` never writes a draft to `settings/website`. The fixture/tests swap storage with `setThemeBackend` (saves are recorded as `saveDesign`).

**One design resolver (0.5):** storefront code must resolve page designs only through
`features/site/designModel.ts` (`layerDesign`, or the `resolve*Design` helpers in `surfaceDesign.ts`) — never
`{ ...design, ...design.storefront }` by hand. Shop structure (`ROOT_ONLY_KEYS`) always comes from the root; `copy` and
`regions` merge per entry. Studio "All pages" writes go through `writeDesignValue` (sets root, clears page
overrides); "This page only" writes set the page surface. `designModel.property.test.ts` guards this against the
published design snapshot.

**Studio interaction rules (1.2):** never use `window.confirm/prompt/alert` in Studio — undoable actions run at once
with `say("ok", text, { label: "Undo", run })`, permanent ones use Riso `useConfirm`, names use `usePrompt`. Name every
edit: `change(fn, { label, coalesce })`. Add shortcuts to `studio/shortcuts.ts` (the cheat sheet reads the same table).
Studio messages: failures go through `studio/friendlyError.ts` (never show `err.message`), warnings and delete-with-Undo use `say("warn", …)` (stays until dismissed).
Link into Studio with `studioHash()` from `lib/studioLocation.ts` (`/admin#designer?…`); What's new links can carry `studio`.

**Pickers & catalog sources (2.3):** section/block fields of kind `link`, `book`, `books`, `category`, `page`, `video`,
`font` render Studio pickers (`studio/StudioPickers.tsx`, pure choices in `studio/pickers.ts`, data from
`StudioPickerProvider` in `StudioEditor`). They save the same strings as the old text boxes (hrefs like `/page/<slug>`,
`/collections/<slug>`, `/books/<storefront slug>`; comma-separated slugs; category names) — no migration, `siteHref` still
adds the sub-path. Never add a url-like section/block field as `text` (`sectionFieldKinds.test.ts`). Catalog sections pick
books only through `features/site/merchandising.ts` `selectBooks` / `sectionBookQuery` / `pickBook` (Studio: **Which books**
= all · featured · books I pick · shop category · newest · on sale · pre-orders, plus **Order**); without
`productSource`/`productSort` the result equals the old one (`catalogSources.test.ts`, `catalogSources.render.test.tsx`).

**Page structure (1.3/1.4):** Studio › Page layout lists the page the preview actually rendered — Header · Page · Footer ·
Pop-overs — from the bridge's `STRUCTURE` scan (`studio/pageStructure.ts`, `StudioStructure.tsx`). Any new storefront part
appears there automatically once it carries `data-studio-target` / `regionProps` and a `data-studio-label`; put header parts
inside `<header>`, footer parts inside `<footer>` and pop-overs in a `role="dialog"`. A new click-to-edit target needs a
name in `studio/targetLabels.ts` (its test fails otherwise). A new pop-over Studio should open goes in `STUDIO_OVERLAYS`
and listens with `useStudioOverlay`.
Section rows have a right-click menu (copy/paste section, copy/paste style, move to another page, save for reuse) and
Ctrl/⌘-click multi-select with a bulk bar; blocks move between sections of the same kind (row button, or drag in the
preview). Use `moveSectionTo` / `moveBlockTo` / `updateSectionsById` (`studio/studioWorkflow.ts`) for any new move or
bulk edit — never splice section arrays by hand.

**Finding your way (16 October 2026):** the breadcrumb under the top bar is the full path (workspace › page or category ›
section › block, every level but the last clickable, `role="link"`), and **← Back** / Alt+← returns to the previous place:
`studio/placeHistory.ts` (pure) records places from StudioEditor's own state (Find, preview clicks, Show on page, rail, page
picker), folds changes within 700 ms, caps 20 and never restores a deleted section/page. Find anything (`studioSearch.ts`)
reads plain words: synonyms/UK-US spellings, phrase rewrites, typo correction ("Showing results for…"), categories rank above
single controls, every result carries its click path (`trail`), and a miss offers suggestions + Browse buttons; pin new
owner queries in `studioSearch.test.ts`. Page layout's structure rows have **Style** / **Words** shortcuts (`onOpenTarget`).
**View website** (top bar) opens the shop in a `?preview=true` tab fed the plain draft (never Add-section try-outs, theme or
brand-kit previews) plus `studioStatus` (unsaved/draft/live); `DraftPreviewBanner` (only in that top-level tab; words
Text & labels › Site & sharing › `draftPreview*`) says which, or that Studio is closed and it shows the live shop.
**Workbench & navigation (Studio 3.0 phase 1, 15 October 2026):** `studio/StudioWorkbench.tsx` is docked under the preview
(tablets/computers; phones keep the Health dialog). Its tabs: **Health** (`HealthFindings` from `StudioHealth.tsx`; open it with
`openHealth()`, never `setChecksOpen` directly), **Changes** (undo steps; jump with `jumpBy` in `studioModel.ts`; draft vs live
via `summariseDiff`, only while open) and **Setup** (`studio/setupChecklist.ts`, pure). Its open state and tab live in
`studioUiState.ts`. Shortcuts: `G` then a letter for workspaces (`GO_KEYS`), `W` Workbench, `A` Add section, `[`/`]` sections;
`StudioBreadcrumb.tsx` shows Page › Section › Block.
**Design scales (3.0 phase 2):** Theme settings › Design scales (`tokens`, `features/site/designTokens.ts`, emitted by
`storefrontOverridesCss`): type scale → `--fm-step-0…5` (fluid clamp; section h1–h4), spacing unit + phone multiplier
(sections' Layout › Space above and below = `spacingStep`, `sectionStepCss`), corner set (`--rp-card-radius`), focus ring
width, field focus border, pressed buttons. All off until chosen; a section's own values still win.
**Arrange on page (3.0 phase 3):** Flexible composition › Content › *Arrange on the page* → Studio posts `GRID_ARRANGE`; the
preview's `studio/gridBridge.ts` overlay (move area, resize corner, arrow keys) answers `GRID_PLACE` in pixels and
`studio/gridPlacement.ts` (`applyGridMessage`) writes `block.grid[device]` as one undoable change. Layers = `grid[device].z`;
rotate/size/see-through = `block.responsive[device]` (`compositionLook`).
**Motion (3.0 phase 4):** section › Style › Motion (`components/sectionMotion.ts`: `revealBlocks`, `staggerStep`, `motionDuration`,
`motionDelay`, `blockHover`, `parallax`, `sticky`, `stickyTop`, `motionOffOnPhones`). Blocks hide only while `MotionWatcher` has
armed the section (`data-motion="armed"`); never under reduced motion; Page animations off removes it. Studio's **Play this
section's motion** posts `MOTION_REPLAY`.
**Block library (3.0 phase 5):** add blocks through the picker (`studio/StudioBlockPicker.tsx`, choices + clipboard + the
preview-only `__studio-block-candidate` in `studio/blockLibrary.ts`; outline Add <block>, inspector Add block…, canvas + Block).
Copy/paste blocks only between sections of the same type. Studio › Pages › New page offers starters (`studio/pageStarters.ts`,
drafts with [prompts]). Header/footer follow `elementSchemes.header` / `.footer` (`data-fm-header`, `data-fm-footer`); a
Theme settings address field is `kind: "link"` (picker), never `text`.
**Check every page (3.0 phase 7):** Workbench › Health › **Check every page** (`studio/StudioSiteHealth.tsx`, pure
`studio/siteHealth.ts`) audits each kind of page (`healthRoutes`) in a hidden see-through frame fed the canvas's unsaved
snapshot, one at a time (scrolled through once so reveal animations finish), with `auditDocument` (read-only); the frame is
removed after each page. A new page kind belongs in `healthRoutes`; preview pages must never write (Account skips its
customer record under `inEditorPreview`). Section background pictures from the Media library use `features/site/backgroundSources.ts` (`--fm-bg-img`
per breakpoint, read by `bgStyle`); plain URLs are unchanged. Run history is localStorage only.
**Brand kit (3.0 phase 6):** `studio/StudioBrandKit.tsx` + pure `studio/brandKit.ts` (logo colours → palettes with guaranteed
contrast, `PERSONALITIES`, `brandKitDesign`); previews through `brandChoice` in `sendPreviewState`, applies as one `change`
("Apply brand kit"). Anything it writes must be a `STYLE_GROUPS` key (`brandKit.test.ts`). Opened from Setup (`go: { kind: "brand" }`),
Theme actions › Brand kit… and Find anything. The rest of the Studio 3.0 roadmap (tokens, free placement, motion,
block library, brand wizard, site-wide Health; AI/languages/A-B need the owner's go-ahead) is in `docs/THEME_EDITOR.md`.

Studio is a Shopify-style theme editor under `/admin`. **Read
`docs/THEME_EDITOR.md` before changing it** — it has the architecture map, the
section/block contract, and the Studio 2.0 roadmap.

- `src/app/admin/studio/` — Studio itself: `StudioEditor.tsx` (shell, top bar, rail, preview
  wiring), `StudioOutline.tsx` / `StudioInspector.tsx` (sections and blocks), `styleSchema.ts`
  (every Theme settings control), `settingsMap.ts` (where controls live), `studioModel.ts`
  (immutable design ops + undo), `previewBridge.ts` / `canvasBridge.ts` (in-preview editing),
  `useStudioPersistence.ts` (Save draft / Publish / recovery).
- `src/app/admin/ThemeEditorExtensions.tsx` — the `SECTION_REGISTRY` (41 section types),
  `getSectionFields`/`getBlockFields`, the shared field editors (`SectionFieldEditor`,
  `BlockFieldEditor`) and the per-section **Layout & style** panel (`SectionSettingsPanel`).
  It also exports `buildPageTemplates(pages)` — static `PAGE_TEMPLATES` plus one
  dynamic `page:<slug>` template per published custom page
  (`design["page:<slug>"].sections`, rendered by `PageView` with fallback to the
  shared `design.page.sections`).
- `src/app/components/SectionComponents.tsx` — the storefront section renderers
  (one per registry type; registry and renderers are now at parity).
- `src/app/components/sectionRender.tsx` — shared renderer: `SectionList` maps a
  section to its renderer **by name** (`(Sections as any)[section.type]`),
  `TemplateSections` renders `design[templateId].sections` for a page-type
  template, `GlobalSections` renders `design.globalSections`, and section
  wrappers emit stable `data-fm-section` / `data-section-id` hooks for preview
  click-to-edit, scoped per-section CSS, and template-aware preview selection. Used by MainSite and every standalone page
  (product/collection/page/cart all render their template's sections — milestone A).

> [!IMPORTANT]
> **After every theme-editor change, end your reply with a plain-English navigation
> walkthrough** of how to find and use the new/changed feature in the actual admin
> UI — not just a code/file summary. The user has said they find the theme editor
> hard to navigate, so this is required, not optional, even for a small change.
> Use the real on-screen labels (tab names, accordion titles, button text) as a click
> path a non-developer can follow, e.g.:
> - "Homepage → click a section on the canvas → **Design** tab → scroll to **Effects**"
>   (shadow/radius/blur/hover effect/shape dividers/magnetic buttons/text gradients —
>   these live in the per-section **Design** tab, via `SectionSettingsPanel`).
> - "Homepage → click a section → **Content** tab → any image field → **Image style**"
>   (focal point/filter/overlay/hover zoom — collapsed by default under image fields).
> - "Homepage → click a section with blocks (Multicolumn, Row, Pricing Table, etc.) →
>   **Content** tab → open a block → the list field (Links/Buttons/Features)" (drag
>   handle to reorder, "Add" button to append a row).
> - "Menus → Header or Footer tab → sub-links and (if Mega menu is on) column links
>   now drag-reorder with the grip handle."
> - "Just double-click text directly in the live preview pane" (inline canvas
>   editing — dashed outline on hover, Escape to cancel; no panel involved).
> - "Colors → scroll to **Checkout & Cart**" (accent/background/input radius +
>   automatic WCAG contrast badges once a color is set).
> Since `/admin` requires real Google sign-in restricted to one account, agents
> cannot screenshot the live authenticated UI themselves — write the walkthrough
> from the actual on-screen labels in the code (accordion `title`s, tab labels,
> button text), not from memory or guesswork.

> [!IMPORTANT]
> **Everything shopper-facing must be editable in Studio — nothing "built into the site".**
> Any storefront element (box, row, link, heading, text) needs a Studio control to hide/show it
> and its words in Text & labels (`COPY_SCHEMA`). Add the toggle to `STYLE_GROUPS` in
> `studio/styleSchema.ts` (default = current behaviour) in the same change that adds the element.

> [!IMPORTANT]
> **Every design must be fully editable in Studio.** Each theme-library preset
> (`studio/themeLibrary.ts`) may only set keys that have a Studio › Style control in
> `STYLE_GROUPS`: top-level keys go through `THEME_APPLIED_KEYS`, everything else in the preset's
> `global`. `studio/themeLibrary.test.ts` fails on any preset key with no control, and
> `features/site/studioCoverage.test.ts` fails on any design key the storefront reads without one.
> Add the control in the same change as the design key — never allowlist around the test.

> [!IMPORTANT]
> **Every aspect of the public website must be editable in the designer (Studio).** No hard-coded
> colours in storefront code: use a design key (`design.x || "#hex"`) or a theme variable
> (`var(--token, #hex)`) — the hex may only be a fallback. Every section default needs a Content
> field (lists are edited as blocks). `features/site/designerCoverage.test.ts` enforces both,
> alongside `studioCoverage`, `storeCopy.coverage`, `studioTargets` and `themeLibrary` tests.
> Tailwind colour classes count too: every one the storefront uses (incl. `hover:`/`focus:`/
> `group-hover:`/`selection:`/`md:` variants) must be listed in `features/site/storefrontColorClasses.ts`,
> which `colorUtilityCss` in `themeTokens.ts` re-points at a Studio token (greys → text/muted/surface,
> black → overlay/page colour, hues → accent/success/warning/danger). `designerCoverage.test.ts` fails
> on an unlisted or unmappable class — add it to the list rather than hard-coding a colour.

**Page pictures (October 2026):** Studio › Pages edits the body with `studio/PageBodyEditor.tsx` (Quill + an `hr` divider blot,
video embeds, align/indent). Pictures (Add pictures, Choose from library, paste, drag-and-drop) upload through
`uploadPagePicture` (media library when on, else `uploadStudioImage`) onto their own line; never store `data:` pictures —
Save uploads any left (`features/site/pageBody.ts` `pastedImageSources`/`replaceImageSources`). Selecting a picture edits its
`width` (`IMAGE_SIZES`), line `align` and `alt`. `page.seoImage` (Sharing image) feeds `useSEO` in `PageView`, else the body's
first picture (`firstBodyImage`). `PageContentSection` styles Quill's `ql-align-*`/`ql-indent-*`, `iframe`, `hr` and `s`.

**Full width + shop filter bar (15 October 2026):** Style › Layout & spacing › **Use the full screen width** (`fullWidth`, off by
default) makes `contentMaxWidth` / `catalogHeaderMaxWidth` (`features/site/headerNav.ts`) return "100%" for the header, shop grid,
book page, footer, secondary nav and custom pages (`PageView` passes `headerWidth: "full"`); use those helpers for any new storefront
column, never `containerWidth` directly. Style › Shop page heading & filters › **Shop filter bar** (`showShopFilterBar`,
`shopFilterBarCounts` off, `shopFilterBarInStock` on, font/outline/chosen colours) renders `.fm-filter-bar` beside the catalog
heading in `MainSite` (All · `shopFilterBarCategories` = visible categories with no visible children · In stock, sharing the
catalog's `inStockOnly`); the heading has `catalogHeading{Font,Size,SizeMobile,Case,Color}` (`.fm-catalog-heading`). CSS and fonts
come from `features/site/shopFilterBar.ts` through `StorefrontOverrides`; words are Text & labels › Catalog (`catalogAllCategories`)
and Search & filters (`filterInStock`, `filterBarAria`).

**Custom pages share one look:** Studio › Style › **Custom pages** (`page*` design keys, `sitePageStyle`
in `PageView.tsx`) sets eyebrow, title size/case/colour, text size/colour, alignment and column
width for every custom page. Each "Page content" section follows it unless its **Style this page on
its own** switch (`ownStyle`) is on; pages without that section render the same component. Default is the Riso "Ruled" layout (Option D): no small "Page" label (`pageShowEyebrow`
off), the title lined up with the header (`pageWidth: "header"`, same width as the `StoreHeader` row), a line
under it (`pageShowRule`, `pageRuleColor/Width/Spacing`) and a readable text column (`pageTextMeasure`: readable 62ch · comfortable 75ch · wide 90ch · full column; `pageTextWidthPx` > 0 sets an exact width and wins; section fields `textMeasure`/`textWidthPx`). Title
font/size px (desktop + phone)/weight and top spacing are `pageTitleFont`, `pageTitleSizePx*`, `pageTitleWeight`,
`pageTopSpacing`; the Page content section has the same fields for "Style this page on its own".

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

**Click-to-edit in the preview:** sections carry `data-fm-section`; every other storefront region carries `data-studio-target="style:<groupId>|copy:<Group>|menus:<panel>|pages"` + `data-studio-label`. In Edit mode the preview bridge (`studio/previewBridge.ts`) outlines it, and a click selects that part (`STUDIO_ELEMENT`): the right-hand inspector opens it with **Words · Style · Layout · Visibility** tabs (`studio/elementCatalog.ts` picks the existing controls, `StudioElementInspector.tsx` renders them) — no pop-up menu. **Open in Theme settings** still reaches the full category (`openTarget`). New storefront regions must carry a target — `studioTargets.test.ts` checks every target points at a real panel.

**Category drop-downs:** a shop category can sit under another (`parentId`, Studio › Menus › Shop categories ›
**Sits under**, one level deep — `navItems.ts` `parentOf`/`childCategories`). A parent with sub-categories renders as
`features/site/NavDropdown.tsx` in every header (All + each sub-category); `bookInCategory(book, cat, allCats)` makes a
parent include its sub-categories' books. Books are filed in Books › edit › Organize (chips show `Parent › Child`).
Style › Navigation links has the drop-down controls (`navDropdown*`, `navFlatSubcategories`); the "All" word is
Text & labels › Header (`navDropdownAll`). `/collections/:slug` renders `MainSite` (same header/footer) opened on that
category — the standalone `CollectionPage` is no longer routed.

**One storefront shell:** `MainSite` renders a single Riso header/footer for every view; the Home view swaps the catalog grid for `design.heroPage.sections`. Studio › Sections (Home) › **Show a Home page** toggles `showHero` (off = open straight on the catalog). The legacy hero header/`HeroCarousel` were removed — don't re-add a second header.

**One header & footer (Studio 2.0 · 2.1):** `features/site/StoreHeader.tsx` is the only storefront header and
`features/site/StoreFooter.tsx` the only footer. MainSite passes `shop={…}` (in-page category picking, logo → Home,
masthead layout, logo alignment, sticker pills, transparent header, wishlist count, light/dark toggle, Ctrl/⌘+K);
product and custom pages use page mode (routed links). Wishlist, account, order tracking and 404 render inside
`StoreChrome` (header + footer around the page; its title bar becomes a plain row via `useInStoreChrome`), switched by
Style › Header & announcement bar › **Show the shop header & footer on wishlist, account, order tracking and missing
pages** (`showStoreChromeOnUtilityPages`, default on). Checkout keeps its own `checkoutHeader`. Add header/footer
features there only — `storeChrome.parity.test.tsx` checks every Studio hook against `__fixtures__/storeChromeHooks.json`
and fails if another file renders the navigation `<header>` or `footerPanel`; refresh the fixture
(`UPDATE_STORE_CHROME_HOOKS=1`) only for an intended hook change.

**Shop card title & price:** Studio › Style › **Book cards in the shop grid** has colour, size (desktop + phone), weight, font and letter-spacing controls for the card title and price (`productTitleColor`, `cardTitle*`, `productPriceColor`, `cardPrice*`), plus the boxed-tag and old-price colours. `features/site/cardTypography.ts` turns them into CSS (emitted by `StorefrontThemeStyle`); cards opt in with the `fm-card-title` / `fm-card-price-wrap` / `fm-card-price` / `fm-card-price-tag` / `fm-card-price-old` classes — the shop grid, collection, wishlist, search, related-books and recently-viewed cards and the **Product grid** / **Product showcase grid** sections do. When a Style card colour is set it wins over a section's own colour; empty = the section's colour. Add those classes to any new book card — `features/site/cardClasses.test.tsx` renders every section with sample books and fails on a book title without `fm-card-title`.

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
**Save conflicts (October 2026):** `resolveSaveConflict` (`studioWorkflow.ts`) gives the dialog both outcomes, each keeping every
change only one side made (`Keep mine` wins the shared setting, `Use the other version` takes theirs there; neither throws the other
side's other edits away). A conflict during **Publish** never publishes: even a clean merge is only restored into the draft with a
message, and the owner presses Publish again after reviewing it (only Save draft auto-saves a clean merge). `draftFieldUpdate`
(shop categories, Under construction wall) now bumps `rev` in a transaction (`action: "field"`), so other open Studios follow it
through live sync and a stale Save/Publish conflicts instead of reverting the value. Studio re-reads the live design
(`adminApi.getLiveDesign`) when it opens and when the Publish/Discard dialog opens; Discard writes the freshly read live design.

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
The Toronto clock is `features/site/shopTime.ts` (shared by Studio and the storefront); a nonexistent spring-forward time is refused
by `scheduleProblems` (never moved earlier). Section **Show from / Show until** (`sectionInWindow`) read zone-less values as Toronto time
via `shopInstant`. When a schedule starts or a campaign ends, `functions/themeSchedule.js` keeps the fields edited live outside Publish
(`LIVE_ONLY_KEYS`: `categories`, `showUnderConstruction`) from the current live design, unless the scheduled design itself changed them
(`liveBase`, recorded by `addThemeSchedule`; a started campaign records `appliedLiveOnly`). Media Delete also checks scheduled designs,
a running campaign's `revertDesign` and unexpired share links (`adminApi.listStoredDesigns`, `storedDesignUses`). Deploy Functions with the frontend.

**Performance (Phase 4):** compare designs with `designEqual` (`features/site/designEqual.ts`), never `JSON.stringify`, and
keep normalisers identity-preserving (return the same object when nothing changes) so edits share structure. Heavy Studio
derivations (Find index, "changed" counts) are computed only while their panel is open. Storefront sections from the third
on use `content-visibility: auto` (`lazySections`, default on; not in preview, groups or fixed bars) — a new section with
a fixed-position bar belongs in `LAZY_EXCLUDED_TYPES`. `components/sectionPerformance.test.tsx` caps section DOM size.

**Colour schemes (2.5):** Studio › Theme settings › **Colour schemes** (`StudioColorSchemes.tsx`, pure edits in
`studio/colorSchemeOps.ts`) edits `design.colorSchemes` — ten roles (background, surface, text, muted, accent, onAccent,
border, buttonBg, buttonText, link) with a live swatch and WCAG badges. `features/site/colorSchemes.ts` `schemeCss()`
(emitted first by `StorefrontOverrides`) writes `[data-scheme="<id>"]` variables using the existing token names;
`SectionList` sets `data-scheme` from the section's Style tab › Colour scheme (`colorSchemeId`). `design.elementSchemes`
(`cards` → `.fm-card`, `buyCard` → `.fm-pdp-card`, `cartDrawer` → `.fm-bag`) applies a scheme to those parts, and while
it does their own colour controls give way (`elementScheme()` in `cartDrawerStyle` / `productPageStyle`) — every new
book-card root needs the `fm-card` class. Schemes saved before 2.0 (no `v: 2`) keep their old background/text-only look
until a colour is edited (render-equivalence guard in `colorSchemes.test.ts`). Header/footer schemes wait for 2.1.

**Product page (catalogue card):** `features/site/BookDetail.tsx` renders the Riso "catalogue card" layout —
breadcrumb, thumbnail rail + framed photo + "Fig. n" caption, one bordered buy card (tag, title, price,
stock line | formats, qty, Add to bag, wishlist, share), then Description / Details / Reviews tabs (or
accordions) with Details as a label | value record. Every piece is a Studio › Style › **Book page · buy
box & details** control (inactive Description/Details tabs and closed accordions render `hidden` so crawlers and the prerender
read them; reviews stay lazy and Studio's preview skips the hidden copies) (`pdp*` keys, turned into CSS by `features/site/productPageStyle.ts`, `fm-pdp-*`
classes); its words are in Text & labels › Product page (`pdp*` copy keys). The main photo and the enlarged viewer are one swipeable,
snapping strip (`features/site/PhotoCarousel.tsx`: native scroll-snap for touch, mouse drag via `dragPlan`); the viewer
renders into `<body>` (`createPortal`, inside a `data-fm-store` wrapper). Dots under the photo: `pdpPhotoDots`. The old trust-signal lines
(`productTrust*`, `showTrustSignals`) were removed at the owner's request — don't re-add them.

**Every Style control must reach every surface (and the preview iframe):** the card title/price and small-print CSS comes from one place, `features/site/StorefrontOverrides.tsx` (`storefrontOverridesCss`). `StorefrontThemeStyle` renders it, and so do `MainSite`'s `TypographyTokens` and `BookDetail` — any new storefront root that injects its own token `<style>` must render `<StorefrontOverrides>` too. `storefrontOverrides.test.ts` fails on a surface that skips it and on any `STYLE_GROUPS` control that nothing on the storefront reads (wire it or delete it — don't allow-list). Custom code (Style › Custom code) is injected by `features/site/customCode.ts` on public pages only — never in the preview, checkout or admin.

> [!IMPORTANT]
> **Studio controls must reach the shop (16 October 2026, after an audit found ~30 dead controls).** A control that
> exists only in the schema, or whose CSS another rule beats, is a bug the owner finds by clicking it. Rules:
> - **Every control is in `scripts/studio-control-baseline/ (one file per control)`** with what it does to the Studio fixture preview
>   (`visible` / `css-only` / `dom-only`), or `none: <reason>` naming the state or setting it needs (a full bag, hover,
>   another switch). `studioControlBaseline.test.ts` fails on a missing, stale or reasonless entry; CI job
>   **studio-controls** (`pnpm run test:studio-controls`, ~15 min) changes every control in the browser and fails when one
>   that worked stops. After adding or changing a control run `AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs`
>   (or `AUDIT_ONLY=<group ids>` locally first) and commit the baseline. Never mark a working control `none` to get green.
> - **Write CSS that wins where it lands:** the Riso look (`RISO_STOREFRONT_CSS`) and Fine-tune element CSS use
>   `!important`; Tailwind classes set their own line height/tracking/size per element. A site-wide value must move the
>   Tailwind variables (see `shopTypography.ts`) or target the element with enough specificity, and an element's own
>   setting must beat the theme reset (`:not([style*="border-radius"])`, `:not(#fm-studio)`). A default value must draw
>   exactly as before (parity tests).
> - **One reader per key:** when two surfaces read the same keys (MainSite `resolveTypography` vs `StorefrontThemeStyle`),
>   give them the same priority. A key read only in one layout or state says so in its label.
> - **Buttons land somewhere:** every Studio button that opens settings goes through `openTarget` (or marks its panel with
>   `data-studio-panel`); one that opens nothing calls `reportDeadStudioLink` and fails `pnpm run test:studio`, which clicks
>   every part's Style / Words / inspector buttons on Home and a book page.
> - The audit report is `docs/STUDIO_CONTROL_AUDIT.md`; re-run the audit for a large Studio change and update it.
> - **Reviving a dead control starts at Off (owner's choice, 16 October 2026):** when a control never drew, its saved value was
>   never seen, so wire a new key that defaults to today's look (`sectionGap`, `cardShadowDepth`, `showCollectionBreadcrumbs`)
>   instead of switching the old saved value on. A Style control that a Fine-tune element setting beats goes in
>   `studio/fineTuneConflicts.ts` so Studio says so; on All pages a field notes the previewed page's own value (`fieldPageOverride`).

**Photo shapes:** Studio › Style › **Book cards in the shop grid** has **Image shape (proportions)** (12 ratios, 3:4 … 21:9 … 9:16 — `PHOTO_RATIOS` in `features/site/photoShapes.ts`, also used by the Product grid / Product showcase grid / cover carousel sections) and **Image outline** (`photoOutline`: arch, window, pill, circle/oval, leaf, hexagon, octagon, diamond, cut corners, slanted). The product page has its own **Photo shape** / **Photo outline** (`productImageAspect`, `productPhotoOutline`; "Same as shop grid" by default). Outlines are CSS from `photoOutlineCss` (via `StorefrontOverrides`); new photo frames opt in with `fm-photo-frame` (shop cards) or `fm-photo-frame-pdp` (product photos).

**Shopping bag (cart drawer):** `components/CartDrawer.tsx` is a Riso "order slip" — ruled header, free-shipping
meter, numbered line items (photo, title, per-copy price, line total, qty stepper, Remove), "Complete your collection"
card, then Subtotal / Shipping / Total ledger, trust badges and checkout button. Every piece is a Studio › Style ›
**Cart drawer (shopping bag)** control (`cartDrawer*` keys + `showFreeShipBar`/`showCartTrustBadges`; the bar's amount comes from Settings › Shipping,
CSS from `features/site/cartDrawerStyle.ts`, `fm-bag-*` classes); words are Text & labels › Cart. Each region carries
its own click-to-edit target (Bag heading, Free-shipping bar, Bag line items, Bag suggestion, Bag total & checkout).

**Small print:** Studio › Style › **Small print & labels** (`smallPrint*` keys, `features/site/smallPrint.ts`) sets a minimum size, colour, case, letter spacing and font for every tiny `text-[8px]…text-[11px]` label at once. **Smallest text on phones** (`phoneMinTextSize`, default 12, 0 = off; `phoneMinText`) floors those labels and the phone card title/price below 768px.

**Element inspector (1.5):** clicking a built-in part (preview or Page layout) opens it in the right-hand inspector — Words (the strings shown inside it, else its whole Text & labels group), Style, Layout (per previewed device) and Visibility (none for `required` regions). Controls come from `STYLE_TARGET_FIELDS` / the region manifest / its `style:` targets (`elementCatalog.ts`); `elementCatalog.test.ts` fails if a clickable part opens nothing or a style category is unreachable (site-wide ones are `GLOBAL_STYLE_GROUPS`). Theme settings › element focus ("Editing: <label>") still exists via **Open in Theme settings**. Sections get **Content · Style · Layout · Visibility** tabs from `studio/sectionStyleSchema.ts` (`StudioSectionStyle.tsx`; the old hand-written `SectionSettingsPanel` is gone — `sectionStyleSchema.test.ts` pins its keys), including **Hide on tablets** (`hideOnTablet`, 768–1023px).

**Fonts:** Studio › Style › **Typography** has Google Fonts pickers (heading, body, header & menu `navFont`, logo `wordmarkFont`) fed by the curated list in `features/site/fonts.ts` (Riso trio Anton / Archivo / DM Mono first; `googleFontHref` uses only weights each family serves).

**Riso Noir storefront:** the public site defaults to the Riso Press look on black with white text
(`src/app/features/site/risoNoir.ts` → `RISO_NOIR_TOKENS`, `withRisoNoirDefault`; theme-library
preset `lyricalmyrical-riso-noir`). `RISO_STOREFRONT_CSS` in `themeTokens.ts` must stay token-driven
(no literal hex — `themeTokens.test.ts` enforces it). Colour triplet variables (`--fg-rgb`, `--accent-rgb`,
…) are **comma-separated** (`255, 255, 255`) so `rgba(var(--x-rgb), a)` is valid. Every shopper-facing
string goes through `getCopy(design, key)` with a `COPY_SCHEMA` entry (`storeCopy.coverage.test.ts`
guards this); print-treatment knobs live in Colors › **Printed-paper look (Riso)**, element toggles in
Additional › **Show or hide whole features**.

**Section contract:** the storefront looks up renderers by the registry `type`
string. A registry type with **no identically named renderer renders nothing**
("added but doesn't show up"). Adding a section = registry schema **+** matching
renderer **+** storefront mapping **+** library entry **+** verify on the live
storefront. Theme data persists as `design` (live, public `settings/website`) and the private
draft in `themes/workspace`, both written only through `admin/themeStore.ts`.

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
appear; it never adds or removes one. Theme settings opens with a **Where is it on the shop?** map (`SHOP_MAP`, jumps to a heading),
then three bands (`THEME_HEADINGS` `band`): **Parts of your shop, top to bottom** (Top of every page · Shop & book pages ·
Bag, checkout & accounts · Custom pages & features · Bottom of every page · Pop-ups & notices — the order a shopper meets
them), **Whole-site look** (presets, colours, typography, buttons, layout, motion, Riso, design scales, small print) and
**Advanced** (folded **Fine-tune one element at a time** + Custom code). Category titles are plain shop words (Book cards in
the shop grid, Book page · buy box & details…); `settingsMap.test.ts` rejects jargon in them. Part cards have **Show on page**
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

## Public designer coverage (2 October 2026)

Wishlist, Customer account and Order tracking have Studio canvases and section stacks. `features/site/storefrontRegions.ts` owns the public region manifest, responsive styling and click-to-edit hooks; its categories are generated in `studio/styleSchema.ts`. Attach `regionProps` in every supported renderer layout when adding optional public elements. Required commerce/consent regions support presentation controls without hide toggles. Merge page-only regions with root settings, preserve product overrides over catalog defaults, and keep phone overrides in `autoFitRegions`. `docs/THEME_EDITOR.md` records the page-by-page ownership and authenticated/live verification limits. Local validation reasons and public order statuses use Text & labels; provider diagnostics must not bypass editable recovery copy.

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
