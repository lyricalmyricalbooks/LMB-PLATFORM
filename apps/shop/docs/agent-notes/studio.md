# Feature notes: src/app/admin/studio/CLAUDE.md

The dated feature notes that used to live in `src/app/admin/studio/CLAUDE.md`, kept verbatim. That guide holds the standing rules and is
loaded whenever work happens in its folder; this file is read on demand. Find a feature's section by its heading (Grep).
Add new feature notes here, newest last, and put any new must-follow rule in the guide itself.

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
preset `press-riso-noir`). `RISO_STOREFRONT_CSS` in `themeTokens.ts` must stay token-driven
(no literal hex — `themeTokens.test.ts` enforces it). Colour triplet variables (`--fg-rgb`, `--accent-rgb`,
…) are **comma-separated** (`255, 255, 255`) so `rgba(var(--x-rgb), a)` is valid. Every shopper-facing
string goes through `getCopy(design, key)` with a `COPY_SCHEMA` entry (`storeCopy.coverage.test.ts`
guards this); print-treatment knobs live in **Print style & template details** (group id `riso`), element toggles in
Additional › **Show or hide whole features**.

**Section contract:** the storefront looks up renderers by the registry `type`
string. A registry type with **no identically named renderer renders nothing**
("added but doesn't show up"). Adding a section = registry schema **+** matching
renderer **+** storefront mapping **+** library entry **+** verify on the live
storefront. Theme data persists as `design` (live, public `settings/website`) and the private
draft in `themes/workspace`, both written only through `admin/themeStore.ts`.

**Named header layouts (27 October 2026, plan 1.22).** The shop header's two looks are named options of the shared
header: Header & announcement bar › **Header layout** (`headerLayout`: `classic` = the big masthead over a ruled
category bar, once called Reference; `modern` = logo, links and bag in one bar). Empty (every existing shop) follows
Shop page masthead & covers › Layout exactly as before, and picking one never changes the shop page grid.
`features/site/headerLayout.ts` decides; `usesReferenceHeader` (navItems.ts) reads it, so StoreHeader and Menus ›
Shop categories agree. Theme presets set only the shop page layout, so an owner's explicit header choice survives
applying one. Product and other pages keep their own header for now.
**Theme presets with content (27 October 2026, plan 1.23).** A library preset can hold section lists
(`content.sections`, by template id from `PRESET_SECTION_TEMPLATES`; its `homeLayoutTemplate` counts as Home) and
starter pages (`content.starterPages`, ids from `pageStarters.ts`). `studio/presetContent.ts` reads them. Applying a
preset still changes only the look. Studio then asks (askConfirm with `presetContentSummary`) whether to use the
content as well. Accepting replaces those templates' sections in the draft (undoable) and creates the missing starter
pages as drafts through `adminApi.createPage`, skipping any slug already in use, so a re-run never doubles a page. The
preset card shows "Comes with: …" (`data-preset-content`). `themeLibrary.test.ts` treats `content` as preset metadata, not
design keys.

**The theme check (27 October 2026, plan 1.24).** `studio/themeCheck.ts` `themeProblems(theme)` lists everything a
theme sets that Studio can't edit afterwards: top-level keys outside metadata / `THEME_APPLIED_KEYS`, `global` keys
without a Theme settings control (`copy` words must be Text & labels keys, `elementSchemes` parts need their scheme
control), unknown palettes or home layouts, sections Studio can't add, section settings that aren't the section's own
fields, block list or Style/Layout/Visibility fields, and unknown starter pages. `themeCheck.test.ts` runs it on every
`THEME_LIBRARY` entry, so a new theme file fails CI until it passes. It found the hero's `height` (read by
`HeroSection`, set by the Punk home layout) with no control; Hero Banner now has **Height**.
**The shop's name is a default (28 October 2026, plan 1.16).** The name is typed once: Text & labels › Site & sharing ›
**Site name** (`siteName`, default `DEFAULT_SHOP_NAME` in `features/site/shopIdentity.ts`, the only file that may spell
the placeholder; `shopIdentity.test.ts` scans `src`). Copy that mentions the press uses `{name}` (footer wordmark,
copyright, logo alt, checkout brand, loading, maintenance, review replies, about lines). The wordmark's unset words are
the name's first word and the rest (`wordmarkWords`; LogoMark and StoreFooter), `logoText` falls back to the name, and
no theme or the Riso Noir defaults set `wordmarkPrimary/Secondary`, `logoText` or `catalogMastheadText`. Section text can
say `{{shop.name}}` or connect to **Shop › Shop name** (`dynamicSources.ts`; `SectionList` puts `shop` in the context);
renderer fallbacks use `fb(key, useShopName())`. The admin rail, top bar and sign-in show `shopNameFromSettings`
(Settings › General store name, else the site name). Emails: every template knows `{{shop_name}}` (server
`loadNotificationSettings` → Email sender name, else store name, else `SHOP_SENDER_NAME`), and `risoLayout` takes
`shopName`. Still naming the placeholder: plain-Node build scripts and a few server fallbacks (newsletter, customs
signer, weekly PDF, AI writer prompt).

**Every theme stays readable (28 October 2026, plan 1.25).** Themes › Apply writes `themeLookKeys(theme, design)`
(`studio/themeLook.ts`): a palette theme sets the brand kit's full colour set (`paletteKeys` + `readableExtras`: cards,
raised buy box, footer, bag, small print, scrim), then `THEME_APPLIED_KEYS`, then `global`. `paletteKeys` small print
reads at 4.5:1 on the raised surface. Faint `text-white/NN` classes are floored at `--fg-faint` (`faintFloor` in
`features/site/themeTokens.ts`, 3:1 on the page). `themeReadability.test.tsx` applies the starting look and every
`THEME_LIBRARY` entry, checks each colour pair (`themeColourPairs`, 4.5:1 body / 3:1 large), draws every
`SECTION_REGISTRY` section, the theme's preset layout and a book page with every buy-box block, and walks the markup
(`markupProblems`: class colours via `colorUtilityCss`, inline styles, translucent layers, tint overlays). A new theme,
section or block is covered automatically; fix the colour, never loosen the check. Section fallbacks use tokens
(`var(--bg-color)`, `var(--surface-2)`, `--fg-rgb`), never a fixed colour.

**Import warns (28 October 2026).** My themes › Import runs `importedThemeProblems` (`themeCheck.ts`) on the file's
design: top-level keys must be a Theme settings key, a structural key (`DESIGN_STRUCTURE_KEYS`), a page with sections or
a key the starting design holds; `copy` words must be Text & labels keys; section types must be ones Studio can add.
Any problem opens a confirm ("Import anyway" / Cancel) that names them in plain words, at most six per kind.
`themeImportCheck.test.ts` keeps Studio's own exports (starting look, every library theme, the fixture draft) free of
warnings; a new structural design key belongs in `DESIGN_STRUCTURE_KEYS` or that test fails.

**Essentials (28 October 2026, plan 1.27).** Studio opens in **Essentials** (`leftTab` `essentials`, first in
`RAIL_TABS`, G then E) unless it remembers another workspace or a link names one. The panel is `ESSENTIALS` in
`studio/essentials.ts`: name (Text & labels `siteName`), logo, colours, fonts and buttons, announcement bar, plus buttons
to Themes, the homepage's Page layout and Pages. Every key is the same control as in Theme settings / Text & labels
(`renderStyleField`, `StudioCopyField`), never a second store; `essentials.test.ts` checks that and keeps it to 8 steps
and 12 settings. The other workspaces sit under an "All settings" heading in the rail. `studio-e2e.mjs` starts each check
in Page layout (`startAt`) unless its query names a tab or is `FIRST_VISIT`; `StudioEditor.test.tsx`'s `mount()` does
the same.

**Theme wave 2 and what carried over (28 October 2026, plan 2.12).** New looks Zine, Letterpress and Index (palettes
`photocopy`, `cotton`, `cobalt`; homepage layouts `press-zine` / `press-letterpress` / `press-index`). Use this look
computes `themeSwitchReport(before, after, defaults, theme)` (`studio/themeSwitch.ts`) and Themes shows it at the top
until Done or another look: an "own edit" is a Style control (every `STYLE_GROUPS` key once) whose value differs from
both the starting design and the previous ready-made look out of the box, plus any page-only copy the look cleared.
Kept / replaced lists use Studio's own labels; **Bring back** (one or all) writes the old values with `bringBack` as one
undoable change. The panel hides when the draft's `themeLibraryPreset` no longer matches (Undo). Ready-made look
drawings and Preview use `themedDesign`, so they show the palette's colours, not only `global`.

**A press's edits apart from their look (28 October 2026, plan 3.5).** Use this look goes through `applyLook`
(`themeSwitch.ts`), which also stores `design.themeBase = { id, name, look, sig }`: exactly the keys the look wrote and a
signature of the theme as it ships (`lookSignature`). `ownEdits(design, defaults)` lists the press's edits against that
stored look (else the library look, else the starting design); Themes shows them as "Your changes to …" with **Use the
theme's** (`resetToLook`, one or all, undoable). When a release changes a theme, `updatedTheme(design)` finds it and
**Update …** applies the new version with every own edit laid back on top (`updateLookKeepingEdits`). The storefront
ignores `themeBase`; it is a structural key for the import check. Wave 3: Chapbook, Archive, Poster (palettes `vellum`,
`archival`, `poster`, layouts `press-chapbook` / `press-archive` / `press-poster`). Changing a shipped theme now offers an
update to every shop using it, so change themes on purpose.

**Phone pass (13 November 2026).** On a screen up to 767px Studio opens on the phone preview (a remembered or linked
device still wins), `StudioRail` scrolls the open workspace into sight in its sideways row (again when the row gets a
width: it is hidden until the Sections tab opens), and the tips name nothing a phone lacks. Section product cards with
no photo draw `NoPhoto` (`SectionComponents.tsx`: `placeholderImage(design)`, as the shop grid and product page do);
`noPhotoCards.test.tsx` lists the sections, so add a new card section there. The fixture calls `applyAdminLook()`.

**Checks that run here (13 November 2026).** Root CI job `shop-studio` runs `pnpm run test:studio` on every pull request
(three shards). A look's `headingFont` / `bodyFont` must be a `FONT_CHOICES` family in a weight it lists
(`themeFonts.test.ts`): a font outside the list reads "Default (not set)" in the pickers and loads only 400 and 700.
Browser checks that pick a look must pick one the picker offers (the ten in `lookGallery.ts`).

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

## Template designer coverage (4 November 2026)

Every storefront template (Print style: Marquee, Shelf, Atlas, Mosaic, Arch, Market stall, Index, and since 10 November 2026 Folio, Lantern, Gutter, Signal, Kiln, Almanac, Console, Picnic, Cutout, Reel) must stay fully
editable in Studio. `features/site/templateStyles.ts` holds the list (`TEMPLATE_STYLES`, which also builds the Print
style options), each stylesheet (`TEMPLATE_CSS`) and `TEMPLATE_KNOBS`: one CSS variable per Studio control a template
shape answers to (button corners/case/shadow, photo corners from Image outline › Corner set, card
title case, panel and card corners, outlines, hard shadows, ruled lines, photo frames, card tilt, footer curve, price
tag, heading capitals). Templates read `var(--tpl-…, <their own look>)`; `templateKnobCss` writes a variable only for a
control the press set, after the template, so an untouched shop is pixel-identical and a changed control wins. A knob
with `rule` brings its shape to templates that don't draw it by default. Outline, shadow and heading capitals use
their own `template*` keys, never the Riso Press ones (every look's palette writes `risoOutlineColor` /
`risoShadowColor`, and Riso Noir's widths and capitals carry over), so stale Riso values never restyle a template.
Shop photo corners on a template follow Image outline, then Corner set, never Card corner radius (every shop stores
one, and it would flatten Arch's arches and Shelf's book corners in shops that never asked). `features/site/templateCoverage.test.ts` fails a template that is
missing from Print style, the theme library or the home layouts, whose home layout uses settings with no Studio field,
that writes a colour, font or words of its own, writes an owned shape as a literal, or ignores a knob; and fails a
knob that is not a Studio control or does not change the page. To add a template: TEMPLATE_STYLES + TEMPLATE_CSS, a
THEME_LIBRARY look, a home layout, then run that test. `a11y-fixture.html?theme=<id>&design={…}` lays settings over
a look, to watch a control work in the browser.
Buttons that draw their own border inline (the header bag button `.fm-hdr-cart`, the book page's Add to bag and retry
buttons, whose `--btn-border` rule is important) used to hide the outline controls. Each template's button rule now
writes its border into `--template-btn-border`, and the outline knobs' shared `rule` sets
`border:var(--template-btn-border) !important` on `.custom-btn` / `.store-btn-primary` once either control is set
(untouched, those buttons keep their old border). The coverage test reads a same-rule variable as its value.
Shadows work the same way: `--template-btn-shadow` (base, hover and pressed), and the three shadow knobs share an
important rule that skips Add to bag's Glow animation (`.fm-cta-glow`). Template button selectors come from
`BUTTON_CLASSES` (`BTN`, `BTN_HOVER`, `BTN_ACTIVE`), which includes the page newsletter button `.fm-newsletter-btn`
(MainSite). `scripts/template-buttons-check.mjs` (`pnpm run test:template-buttons`, CI job `shop-accessibility`)
checks the bag, Add to bag and newsletter buttons on every template in Chromium. Studio shows one note above the
template-only controls while Print style isn't a template (`templateNote.ts`). Choose your look draws each look over
the press's own design (`lookPreview(theme, design)` = what Use this look leaves). Studio › Themes cards draw the press's own covers
and first product name (`ThemeThumb products`, `ownBooks(books, 2)`). Print style & template details shows **Reset template
details** once any template-only control is set (`templateDetailsSet`; one undo step). Section newsletter forms (home and
pop-up) carry `fm-newsletter-btn` unless the section sets its own button style or corners.
`ThemeThumb` also draws a phone frame (`.studio-theme-thumb-phone`). The reset line names what it clears
(`templateDetailsLine`, short names in `TEMPLATE_DETAIL_NAMES`) and shows on the Themes draft card too. Look previews use
real prices (`previewPrice` in `ownBooks`). The template button check covers the home newsletter and pop-up sections.
Thumbs show the press's name (`pressNameOf`) and `design.logoUrl` in place of "Aa"; the drawing is a button that
previews that design on a phone (`onPreview(entry, "mobile")`). Preview prices use the storefront's format (`CA$ 22.00`).

**Ten more looks and the feel filter (10 November 2026).** Folio, Lantern, Gutter, Signal, Kiln, Almanac, Console, Picnic,
Cutout and Reel come from Julian's "Public website UI mockups". Their CSS is built by `lookCss` in `templateStyles.ts`, which
reads every knob the same way, so a new look passes only its own defaults (add it there, then to `TEMPLATE_STYLES`,
`TEMPLATE_CSS`, `PALETTES`, `THEME_LIBRARY` and `HOME_LAYOUT_TEMPLATES`). Template CSS may not hold words, so Console's
brackets live in its Add button words (`[ ADD ]`) and Signal/Almanac's row numbers use a CSS counter. Accents must read on the
page and on button text (`themeReadability.test.tsx`: Picnic and Cutout use darker accents than the mockup); a hero whose
colour equals the accent sets `accentColor`. Pickers sort looks by **feel** (`lookFeel` in `admin/lookGallery.ts`: quiet,
bold, warm, dark; every look has exactly one) in Choose your look and Studio › Themes, and `SUGGESTED` there picks the first
three by what the press sells. The try-on (`LookStage`) draws a hero and card for each new look. New looks go in `BOLD` or
`WARM` there, else they count as quiet (or dark by page colour).

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

**Closed dialogs build nothing (27 October 2026).** `StudioEditor` re-renders on every edit, so a closed dialog must
not build its contents: guard children with the open flag (the Keyboard shortcuts list) or return early once the hooks
have run (`StudioSchedule`, which otherwise measured the whole design on every keystroke). Measured with the
StudioEditor tests: about a fifth less time per click in development React.

**`beforeShop` (10 November 2026):** Studio for a press with no store yet (`src/designFirst/`, admin CLAUDE.md › Design
before the store): saves 1.2 s after each edit to the press's setup record, Done saves first, and no publish, draft,
discard, schedule or View website controls. Keep new top-bar actions that need a real shop behind `!beforeShop`.

## Studio look and phone top bar (13 November 2026)

Studio wears the Colophon look through one block at the end of `studio.css`, scoped `:root[data-admin-look="colophon"] .studio-editor` (the radius tokens, pill top bar, filled rail tile, mint tips tile, 1px borders). Corners carry `!important` because `adminCompat.css` squares every Tailwind-rounded control. New Studio boxes: add the class to that block's lists instead of a 2px ink border. On a phone (767px and under) the top bar is two rows: labels inside `.studio-topbar-label` hide visually (still read aloud), the preview-size group and View website hide (View website is then the first Theme actions item), and top bar buttons are 44px. A browser check holds the bar to 120px. **Night mode:** `/studio-fixture.html?night=1` shows Studio as the admin's night mode does. Ink buttons (`bg-neutral-900`) take `--rp-primary` / `--rp-on-primary`, which flips at night; never pair the inverse fill with the info ink.

## Starter websites (23 November 2026, plan "Editable starter websites", step 1)

A **starter** is a whole website a new shop starts from (like a Squarespace template): a `THEME_LIBRARY` entry's look,
its section lists (`content.sections`, by template id) and its starter pages (`content.starterPages`). `studio/starterDesign.ts`
`applyStarter(design, theme, getSectionMeta, w)` applies look + layouts in the shop's words (`wordsFor`); `starterPagesToAdd`
lists the draft pages. It applies whole only where the shop is new: Choose your look (`chooseLook.applyChosenLook`, which
then adds the pages best effort through `addStarterPages`) and design-before-the-store (`designFirst/beforeShop.ts`
`startingDesign`; pages wait for the real store). Studio › Themes still changes only the look, then offers the layouts as a
separate undoable step (`applyLibraryTheme`), because by then the sections are the owner's own. `starterDesign.test.ts`
runs every library entry through `themeProblems` and applies it twice (same result as once).

**Adding a Figma design as a starter (repeatable, ~2-3 days each):**
1. Read the Figma Make file (`get_design_context` node `0:1`, then each source file) and list its parts: page bands,
   fonts, colours, buttons, cards, words, photos.
2. Map every part to something Studio already edits: a palette in `PALETTES`, `global` keys with `STYLE_GROUPS` controls,
   a Print style template (`lookCss` in `features/site/templateStyles.ts`) and sections from `SECTION_REGISTRY` with their
   own fields. A part with no Studio home gets a new section design or control first (with its Studio control and
   storefront reader), never a one-off.
3. Add the `THEME_LIBRARY` entry with `content.sections` for each page it shapes and `content.starterPages`, and a
   `lookFeel` in `admin/lookGallery.ts`. Run `starterDesign.test.ts`, `themeCheck.test.ts`, `themeReadability.test.tsx`
   and `templateCoverage.test.ts` until green.
4. Screenshot the real Studio fixture and the storefront on desktop and phone next to the Figma file, fix differences,
   and show the owner real screenshots, never a drawing. Existing shops are untouched: a starter applies whole only to new shops.

**Section designs (23 November 2026, starter websites step 2, first part).** Add section lists **designs** grouped by
**kind** (`studio/sectionDesigns.ts`: `SECTION_KINDS` opening banners → build your own, `kindOf`, `sectionDesigns(registry)`).
A design is a section type plus some of its own settings; each type keeps its plain design (id = the type, card carries
`data-library-type`), extra designs are `Type~key` (`data-library-design`, "Built from …"). Add section, the try-on candidate
and Add it there instead all take a design id and resolve it with `designParts`. A new design may only set the section's
own fields (`settingsWithoutControl` in themeCheck.ts; `sectionDesigns.test.ts`); a new section type must be placed in a
kind there or the test fails. **Second round (same day):** 33 more designs, so every kind has at least three, including the parts the Juniper starters need (big capitals, dark story band, colour block, dark ticker, staggered collage, quick add, bright sign-up band). Dark and bright bands set only `colorSchemeId` to `scheme-inverse` / `scheme-accent` (the default schemes every shop falls back to), never a colour. `sectionDesigns.test.ts` also checks each value is one its control offers (select option, range bounds, scheme id) and that labels are unique within a kind.

### Starter websites, step 3: every page made of sections (23 November 2026)
A starter's `content.sections` may also hold `headerSections` and `globalSections` (the every-page bands, written through
`targetOf` → `setSections({kind:"global"})`) and `content.productBlocks` (the buy box, written to
`productPage.productInfoBlocks`). The apply summary names each part it replaces. `themeProblems` flags an unknown buy box
block and a required block marked hidden (`starterPages.test.ts`).

### Starter websites, step 4: Slow Season and Catalogue (23 November 2026)
`juniper-slow-season` and `juniper-catalogue` (themeLibrary.ts) are the first starters made only of Studio sections, with
no template style: `lookGallery.ts` `STARTER_SITES` offers them after the ten built looks. Fonts Instrument Serif,
Newsreader and Manrope were added to `FONT_CHOICES`. **Look colour schemes:** `themeLookKeys` writes the three starting
schemes in the look's colours (`lookSchemes`: dark = text on page, bright = `secondaryColor` or the accent), marked
`fromLook`, while the shop has no scheme of its own; editing a scheme (`colorSchemeOps` rename/role) drops `fromLook`, so the
owner's schemes are never replaced. `markupProblems` (themeReadability.ts) now reads a `data-scheme` band's own colours.
**Adding more Figma designs later:** 1) read the Figma file's parts and map each to a section design (sectionDesigns.ts,
add one if missing); 2) add a library entry with `global`, a palette, `content.sections` (pages and every-page groups) and
`productBlocks`; 3) add its id to `STARTER_SITES`; 4) run the theme, readability and font tests, then screenshot it in the
Studio fixture. Existing shops are untouched.

### Starter websites, step 5: gallery and Sample labels (23 November 2026)
`LOOK_FILTERS` has **Whole websites** (`websites`: `STARTER_SITES`), shared by Choose your look (sign-up) and Studio ›
Themes; Preview / Try on is the try-before-use. Sections a starter adds carry `sample: true` (`applyPresetSections`);
`patchSectionSettings` and `patchBlockField` drop it, and `StudioOutline` shows a **Sample** badge until then. The 10 saved
designs limit is `MAX_SAVED_THEMES`. Not done: sample photos (no licensed photo set in the repo yet).

### Aurel and starter sample shops (24 November 2026)
`aurel-editorial` (palette `aurel`, from Julian's Figma Make "Design Five E-commerce Concepts" › Aurel) is the third
starter. A starter may carry `content.sampleProducts` (title, maker, price, photo under `public/starters/<id>/`);
`starterSampleBooks` (presetContent.ts) turns them into book-shaped samples. Studio › Themes previews a starter through
`starterPreview` (StudioEditor): look + layouts (`applyStarter`) and its sample products in place of the shop's, never
saved. Design-before-the-store uses them too (`sampleShopBooks(sells, look)`). Photos are made for each starter (Julian's
choice, 23 November 2026); keep each under ~150 KB.
**Starters match their Figma design and stay neutral (24 November 2026).** A starter is a template style plus its own
sections, never only generic sections: Aurel is `themeStyle: "aurel"` (`AUREL_CSS`, lookCss in templateStyles.ts: thin
banner, centred spaced wordmark, untinted numbered photos, wide first product) and `SplitOpeningSection` (big headline +
italic `accentWord`, edge-to-edge photo, caption, round + link, underlined link; CSS `.fm-split*` in styles/index.css, sizes
`titleSizePx`/`titleSizePxMobile`). Words describe the spot ("Your headline,"), products are "Example product N" by
"Sample", and the wordmark is the shop's own name; `neutralStarters.test.ts` checks every starter in its NEUTRAL list
(Slow Season added 24 November 2026; Catalogue next). Slow Season is `themeStyle: "slowseason"` (`SLOWSEASON_CSS`) with
`PhotoOpeningSection`, `BigIntroSection`, `FeatureDuoSection` and `StoryOrbitSection` (CSS `.fm-po*`, `.fm-bi*`, `.fm-duo*`,
`.fm-orbit*`; a two-line title is typed with a new line; `accentFont` loads a Google font for the quote/accent word).
Showcase grids get the template's 01, 02… numbers through `[class*="showcase-grid-"]`. Plan: https://claude.ai/artifact/PKepfF8oXL3jZ5Ewo7S4Wv.

## Starters and Studio rethink, step 1: sample sets (24 November 2026)
A starter is a design; a **sample set** is the content that fills it (`admin/starterSamples.ts`): photos for the page
bands (`opening`, `story`, `about`, `banner`), example products or example services, in neutral "Example …" words with no
made-up makers, stories or reviews. Four sets: `home`, `clothing`, `books`, `studio` (services). `sampleSetFor(sells)`
picks the shop's own set from its sign-up answer; `sampleSetsFor` lists the sets that suit its kind (for the gallery's
"Show with" picker). Photos live in `public/samples/<set>/*.webp` (about 1200px, under 250 KB) from Unsplash's free
licence (only `images.unsplash.com` photos, never paid `plus.` ones), each listed in `public/samples/LICENSE.md`;
`starterSamples.test.ts` fails on a missing, oversized, unlisted or unused photo and on non-neutral names.
`lookGallery.sampleProducts` (look previews, design-before-the-store) now reads the shop's set. **A new kind of shop** only
needs a new set here plus its photos and licence lines; any starter can show any set.

## Starters and Studio rethink, step 2: starters arrive with samples (24 November 2026)
`applyStarter` / `applyPresetSections` take an optional `StarterPhotos` (`studio/starterPhotos.ts` `starterPhotos(sells)`):
the shop's sample photos (`samplePhotosFor`: band photos, then item photos) and each section type's main picture field
(`mainPictureKeys`, the `imageUrl` image field of `getSectionFields`). `samplePhotoFiller` fills empty ones in turn, plus empty
`imageUrl` items in a section's lists, and an empty matching alt; a photo the starter brings is kept. Choose your look,
design-before-the-store, Themes › Use layout and the starter preview pass it. Example products come from the same set and
are never sold (`features/site/comingSoon.ts` `notForSale`, server `purchaseProblem`). Publish says how many sections still
carry `sample: true` (`sampleSectionsLeft`).
**Service shops (same day):** `starterForShop(theme, sells)` (starterDesign.ts) gives a services shop its version of any
starter: the first product row becomes the price list (`ServiceMenuSection`), the second the Book a time cards
(`BookTimeSection`), other product rows (`PRODUCT_SECTIONS`) go, and opening hours go before the sign-up band. The same four
callers pass it. Booking sections are never re-worded (`SERVICES_WORDED` in presetContent.ts: "Book" is their verb).

## Starters and Studio rethink, step 4: Show with (24 November 2026)
Choose your look's try-on has a **Show with** row (`data-show-with`) under the screen/page buttons: the sample sets from
`sampleSetsFor(publishes)`, the shop's own first, shown only while samples are on screen and only when more than one set
suits the shop (a bookshop and a services shop have one each). `lookGallery.sampleProducts(publishes, setId)` reads the
chosen set. The try-on's on/off buttons are black pills (`toggle` in ChooseLookWelcome), like other chosen options in the
admin. Fixture: `/admin-fixture.html?start=look&sold=clothing`.

## Starters and Studio rethink, step 5: Try this starter (24 November 2026)
Themes › a whole-website starter card (`STARTER_SITES`, passed as `starterIds`) leads with **Try this starter**
(`data-try-starter`), then Preview and **Use only its look** (the old look-only path, `applyLibraryTheme`). `tryStarter`
in StudioEditor first saves the current draft to My themes as `keptDesignName(list, starter)` ("Before Slow Season", a
date added when taken), refuses when My themes is full, then applies `applyStarter` as one undoable change, adds the
starter's missing pages as drafts and opens Home. It never asks first: nothing is lost (the kept theme, Undo, and the
shop stays as it was until Publish). `persistThemes` returns whether it saved; pass `null` to stay quiet.

## Starters checked against their Figma designs (24 November 2026, next starters plan phase 1)
- Each starter's Figma Make source was run locally and screenshotted beside the Studio preview at 1200px and 390px
  (shots in the project files, `starters-rethink/shots/figma-match/`). To repeat: read the Make files with the Figma
  tools (nodeId `0:1`), serve `App.tsx` + `index.css` (drop `@import "tailwindcss"`) with the shop's Vite, compare.
- New controls: Style › Navigation links › **Links in the middle (logo on the left)** (`navCentred`, StoreHeader puts the
  bar in a middle grid column) and the scrolling-text section's **Hold still** (`still`: the text splits at the separator
  into one evenly spread row, `.fm-ticker-still`, section design "Still line of short notes").
- Template logo rules use `!important` because LogoMark sets the wordmark's size and spacing inline.

## Starter styles (24 November 2026, next starters plan phase 2)
- Every starter comes in three named styles (`studio/starterStyles.ts` `STARTER_STYLES`): the first is the starter as it
  ships; the others lay `global` keys over its look (the `palette()` helper covers every colour the look sets, raised
  boxes, logo, bag small print and picture tint included) and `sections` patches over every section of that type.
- `withStyle(theme, styleId)` gives the styled starter (same id, `styleId`, `styleName`); `applyLook` stores
  `themeBase.style`, and `updatedTheme` measures against the same style, so a style's own colours never read as an update.
- Studio › Designs shows the styles as swatches under a starter's card (`data-starter-style="<starter>/<style>"`); the
  card's drawing, name and buttons follow the picked swatch, and Try this starter applies that style as one undo.
- The control room hides a style (`platform/starters` `hiddenStyles`, `starter/style` ids; `control-room/starterSites.js`
  mirrors the names, its test compares them). The starter's own style can't be hidden. Fixture: `?hiddenStyles=…`.
- Theme checks run every style (`STYLED_LOOKS`, `checkId`; `THEME_META_KEYS` allows `styleId`, `styleName`, `checkId`).

## Starter updates that keep owner edits (24 November 2026, next starters plan phase 4)
- Each starter has numbered releases with a plain note and the signature of every style as the newest release ships it
  (`studio/starterVersions.ts`). `starterVersions.test.ts` fails when a starter's look changes without a new release.
- Use this look records `themeBase.version` (`themeBaseFor`); a base without one counts as version 1. `starterUpdate(design)`
  gives the newer look in the shop's style, its styled name, the versions and the notes since (`releasesSince`).
- Studio: a one-time message wherever Studio opens ("A new version of Aurel Sand is ready", See what's new / Not now,
  `data-studio-look-update`), and in Designs the update box lists what changed, **Preview it** (the canvas only, through
  `themePreview` id `look-update`; the draft doesn't change) and **Update** (`updateLookKeepingEdits`: the new look with every
  own edit laid back on top, one undo, nothing live until Publish).
- Studio fixture `?olderStarter=aurel-editorial/sand` starts a shop on an older Aurel Sand with its own button corners.
- Control room: `shopLooks.js` reads `themeBase.version`, `lookTally` counts shops per version, and Setting up › Starter
  websites says how many live shops are on the newest (`STARTERS[].version`, kept in step by `starterSites.test.js`).

## Product page layouts for a whole category (24 November 2026, next starters plan phase 5)

Alternate product page templates (Studio 2.8, `features/site/templateAlternates.ts`) could only be picked per book
(`book.templateId`). A shop category can now give every product in it one: `category.productTemplateId`, set in Studio ›
Menus › Shop categories › Edit › **Product page layout** (`data-category-product-layout`). `bookTemplateSurface` decides in
this order: Studio's preview override (it alone decides, so "default" shows the default page), the book's own
`templateId`, then `collectionProductTemplate` (the first category in menu order that the book is in, `bookInCategory`,
with a layout), then `productPage`. A deleted layout at any step is passed over. The template card's "used by" list and
the book editor's empty choice ("Same as its category") follow the same rule. Book-only blocks inside a layout stay
bookshop-only because a layout is just the product page's own sections. Checks: `templateAlternates.test.ts`, e2e "a
category gives every product in it a product page layout".

## Six new starters (25 November 2026, round three phase 2)

Plan https://claude.ai/artifact/RAGCAzCvap1KAaXtWr1Jnj. `starter-gallery`, `starter-warehouse`, `starter-larder`,
`starter-salon`, `starter-workshop`, `starter-commission` in `themeLibrary.ts`, each with its own template
(`templateStyles.ts` GALLERY_CSS … COMMISSION_CSS via `lookCss`), palette, home layout (`homeLayouts.ts`), three styles
(`starterStyles.ts`), version 1 (`starterVersions.ts`) and a control-room mirror (`control-room/starterSites.js`).
- New sample sets `food`, `beauty` (hair and wellness shops now get it) and `made` in `starterSamples.ts`, photos in
  `public/samples/<set>/`, listed in `LICENSE.md`. A starter's own sample-shop photos stay for every kind of shop; only
  empty pictures take the shop's set (`starterPhotos.test.ts`).
- **They wait for the owner's yes:** `AWAITING_YES` (lookGallery.ts, mirrored and checked in control-room/starterSites.js)
  keeps them out of `offeredStarters(null)`; the control room shows them as "new, waiting for you" until a saved choice
  shows them. A saved record that never knew them hides them anyway (`known`).
- Salon and Workshop are made for bookings. `starterForShop` now also gives a product or books shop its version
  (`goodsVersion`): the first price list / Book a time row becomes the product grid with its eyebrow and title, the
  other booking rows are dropped. A services shop keeps them as they are.
- Night styles of starters with an inverse or accent newsletter band set it back to `scheme-default` (readability).
- The product grid's registry defaults tint photos purple (`overlayColor` #A855F7 at 0.22). Every starter's grid sets
  `overlayOpacity: 0` (Aurel, Slow Season and Catalogue had the tint too; `neutralStarters.test.ts` now checks). Shops
  already on those three keep their grids until they edit them; new shops and Try this starter get the fix.
- Warehouse and Workshop set their own opening headline size (their wide fonts overflowed the shared size).

## Starter library on the platform site (25 November 2026, round three phase 2b)

`/demo/starters/` (all offered starters, filters Things to sell / Appointments and classes / Books and prints) and
`/demo/starters/<id>` (live desktop and phone frames, the style picker, Use this starter, See it live), drawn by
`src/demoShop/libraryPage.ts` (plain DOM, Colophon look) from `src/demoShop/starterLibrary.ts` (data and rules; a new
starter needs a `STARTER_INFO` entry, its test fails otherwise). The demo page routes by address (`libraryRoute`); frames
carry `frame=1` so the sample bar stays out. The list follows the control room through the public
`GET /api/starters/offered` (control-room/starterSites.js `starterSitesPublicRoutes`); if it can't be read in 2.5 s the
ready starters show. The front page's "See one live" row links to All starters.

## Make it yours (25 November 2026, round three phase 3)

Right after a new shop picks its starter (Choose your look › Use this look or Use and customize, not Skip and not setup
mode), the admin opens `#designer?yours=1` (`studioLocation.ts` `yours`). Studio opens on the **Make it yours** panel
(`StudioMakeItYours.tsx`, rules in `makeItYours.ts`) in the left column, beside the real preview; on a phone it opens on
the steps (`mobilePanel` "outline"). The link is used once: Studio strips `yours=1` from the address, so a reload opens
Studio as usual. Basics (Essentials) shows a mint "Make it yours" card to reopen it whenever the design's `themeBase` is a
starter (`starterOf`).

- Every click is one `change(…, { label })` on the draft, so the preview shows it at once, Undo takes it back and nothing
  is live before Publish. No new design keys: name and logo are the same Text & labels / Style fields as everywhere.
- **Colours** (`colourChoices`): the starter's styles (`starterStyles.ts`), then, when the logo's colour can be read
  (`logoColours(design.logoUrl)`), the same styles through guidedStart `withLogoColours` (accent only, 3:1 on the page).
  `applyColours` = `applyLook` (records `themeBase` with the style) plus the style's band settings on the draft's
  sections: only keys some style of that starter patches are touched, set to the chosen style's value, else the
  starter's own, else the section default, so switching back gives the starter's bands exactly (`makeItYours.test.ts`).
  `keepFonts` keeps a font pair picked in this session.
- **Fonts** (`fontChoices`): the starter's own pair ("As designed") then `FONT_PAIRINGS` ranked by the starter's
  `lookFeel`, six in all. Every heading weight is one Google serves (test).
- **Pages**: ticks for `pageChoices(sells)` (no Shipping for services shops). A tick creates the page starter as a draft;
  untick deletes it only while it is still an untouched draft (`untouchedStarterPage`), else it stays with a note.
- **Homepage** (`homeShapes`): as designed, products (or services) first, and short and simple, all made of the starter's
  own sections in the shop's version (`starterForShop`) and style; a shape equal to another is dropped. Applied with
  `applyPresetSections` on Home only, sample-marked.
- **Write my words**: one sentence goes on the opening (`withOpeningWords`: the first Opening/Hero/Banner section's body,
  plus the headline when the AI wrote one). Where the AI writer is available (not on Colophon shops yet,
  `aiWriterAvailable`) it calls the new server task `starterWords` (functions/aiWriter.js, `aiStudio.test.js`).
- **The end**: `nextFour` (photos via `sampleSectionsLeft`, own products or a live booking page, phone checked,
  published), each with Studio's Show me (`goSetup`; new `SetupGo` kind `admin` opens another admin page).
- Fixture: `/studio-fixture.html?starter=<id>[/<style>]&sells=…#designer?tab=essentials&yours=1` puts a whole starter
  in the draft; `studio-e2e.mjs` check "Make it yours: four steps…".

## Calmer Studio (25 November 2026, round three phase 4)

The preview takes most of the screen. Nothing was removed; each thing moved to where it is used.

- **Top bar** (`studio-topbar`): Exit, Find (icon only, `data-studio-find`, still "Find anything (Ctrl+K)"), the page
  picker, computer/tablet/phone, undo and redo, the save state, ⋯ Theme actions, Save draft and Publish
  (`data-studio-publish`). The "Design studio" title is gone. **View website** is always a Theme actions item (it was one
  only on phones), and Theme actions also lists **Find anything** and **Take the tour**.
- **Browse mode** moved to the preview's own bar (`.studio-canvas-status`, `.studio-mode-switch`, same
  `data-studio-mode-switch` and names "Switch to Browse mode" / "Switch to Edit mode").
- **The path** (`StudioBreadcrumb`, `crumbsBar`) sits at the top of the left panel on a computer (`.studio-left-col`), and
  under the top bar on a phone only while Edit is open. The **starter update** notice is one mint line at the top of the
  list (`.studio-panel-notice`, still `data-studio-look-update`), not a band over the preview.
- **Settings column**: `studio-left` starts at 24% (min 18%, was 28%/20%); the remembered layout id moved to
  `studio-panels-v4`, so every owner starts once from the new width and can drag it wider.
- **Phone**: the shop is always drawn. Sections (with the workspace row on top) and Edit open as a sheet over the lower
  56% of the screen (`data-mobile-panel` outline/settings); the preview's own bar hides under the sheet. Make it yours on a
  phone is therefore the shop's header on top and the steps below.
- **Tour** (`StudioTour.tsx`): four stops (the rail, the preview, the page picker, Publish), each skipped when its part
  isn't on screen (a phone, or no Publish before the shop exists). No backdrop, so Studio stays usable. It shows once per
  browser under the old tips key `studio-tips-dismissed`, waits while Make it yours is open, and Theme actions › Take the
  tour starts it again. The fixture marks it seen unless `?tour=1`, so browser checks never click under it.
- **Workbench › To-dos** (was Setup): the badge says "N left" (or ✓), never a fraction, so the only set-up count an owner
  sees is the admin Home list (agreed with the sign-up flow thread).
- Checks: "calmer Studio: slim top bar, path in the left panel, a four-stop tour that is remembered" and "calmer Studio on
  a phone: Sections slides up over the shop, which stays in sight".

## Site styles, Shoppable photo and Lookbook (25 November 2026, round three phase 5)

- **Style › Basics › Site styles** (`studio/siteStyles.ts` rules, `StudioSiteStyles.tsx` panel, opened by
  `data-open-site-styles` in Essentials; state `siteStylesOn`, shown only while Essentials is the tab).
  - Eight palettes (`SITE_PALETTES`, light first) built from `PALETTES`, each with its own **band** colour for the bright scheme.
  - A palette writes the same keys Apply writes for a look's palette (`paletteKeys`, `readableExtras`, `secondaryColor` = band),
    and the three starting schemes (`lookSchemes`) only while `hasOwnSchemes` is false. Owner-made schemes are never replaced;
    the panel then shows a note and a link to Style › Colour schemes.
  - Font pairings are `FONT_PAIRINGS` (Make it yours) through `applyFonts`. Each click is one `change()` named for Undo.
- **ShoppablePhotoSection** and **LookbookSection** (`SectionComponents.tsx`, kind `products`, Commerce in the library).
  - Dots are blocks in `items`. A Shoppable photo dot is `{ productSlug, x, y }`. A look is `{ imageUrl, imageAlt, caption,
    productSlug, x, y, secondProductSlug, secondX, secondY }`. `x`/`y` are percent, clamped 4 to 96.
  - A blank product means the shop's next product (`dotBook`), so a new section shows at once.
  - Without a photo, a Shoppable photo shows the placeholder image in Studio only, and shoppers see nothing. A look with no
    photo uses its product's photo, else the placeholder.
  - A dot is a 44px disclosure button (`aria-expanded`) that opens `ShopDotCard`: photo, name, price and Add to bag. Products
    with choices, example products and Coming soon products show View instead (`notForSale`). Escape closes the card.
  - On computers the card sits beside the dot (`.fm-shop-dot-pop`, `data-side`). On phones, and in every lookbook, it sits
    under the photo. All words are section fields with `fb()` fallbacks.
  - The Gallery starter's home has a Shoppable photo. Browser checks: "Style › Site styles…", "Shoppable photo…",
    "Lookbook…" (in Browse mode, since Edit mode clicks select).

## Starters in three kinds, and nine distinct openings (26 November 2026, one website picker plan step 1)

- `starterForShop(theme, sellsOrKind, lead?)` (`studio/starterDesign.ts`) takes a sign-up answer or a kind (`"products" | "services" | "both"`,
  `starterKind`). Both (`bothVersion`) starts from the lead side's version and adds the other half after the lead's last row,
  worded per starter in `BOTH` (Salon and Workshop lead with services: "Shop the aftercare", "Take it home"); it keeps the
  bag and adds opening hours. `lead` missing = the starter's own lead. The shop types thread's switch calls it with
  `shopKindOf(doc)` / `leadSideOf(doc)` (`servicesSetup.ts`).
- Opening buttons move between `/collections/all` and `/book` through `retarget`, slides included.
- Demo (`demoShop.ts`): `?kind=products|services|both&lead=` shows any starter as that kind (Preview's "Show as"); a
  services demo has no products, a Both demo always has some.
- Julian 26 Nov: no two starters may look alike. Openings now: Aurel and Catalogue split (both from his Figma files),
  Slow Season full photo in capitals, Gallery full-screen banner, Warehouse huge moving words over a photo strip, Larder
  centred banner, Salon words on a colour band, Workshop giant headline + photo mosaic, Commission dark band. Keep a new
  starter's opening different from all of these.
- A service whose lowest price is 0 shows Free, never "From $0.00".

## Calmer Studio: no Designs (26 November 2026, one website picker plan step 3)

Studio is for editing only; the website is chosen on Online store (admin notes › One website picker).
- The Designs rail item and panel (`StudioThemes.tsx`) are gone with My themes, Import a theme file, the ready-made
  looks list, Try this starter, Use only its look and Style › "Theme presets & saved themes" (Riso Noir buttons).
  Old links with `tab=themes` open Style (`studioLocation.ts` `RETIRED_TABS`); the `g h` shortcut and the Basics step
  "Start from a look" are gone.
- **Share a preview link** is in ⋯ (Theme actions) and shares the draft (`StudioShareLink.tsx`).
- **Compare with the starter** is in Version history (`StudioHistory` `starter`, `OwnEditsPanel` in `StarterChanges.tsx`):
  the owner's edits over the starter, Use the starter's, and the "new version is ready" update with Preview it (closes
  the window; the canvas banner has Back to the update). The panel notice and Online store's notice open it
  (`#designer?starter=1`).
- **Site styles** shows the starter's colour versions (control room's hidden ones left out) instead of the 8 palettes
  when the website is built on a starter; an older look keeps the palettes.
- Saved designs stay stored: Online store lists them (Bring one back: Use this, Remove). Media names them "Saved designs".
- `themeCheck.ts` stays as a test helper (every look only sets keys Studio can change).

## Frame designs (26 November 2026, frame designs plan)

Starters used to differ only in their home page: every one shared the header, product page, product card, shop page,
footer and bag. Each of those parts now has named designs, each a Studio choice whose empty value keeps today's look:
- Header & announcement bar › Header layout: adds **rail** (side menu on computers, `RAIL_HEADER_CSS` in `headerLayout.ts`;
  phones draw it like modern; `headerOffset.ts` returns 0 for it).
- Footer layout › Footer design (`footerDesign`, `footerStyle.ts`): wordmark (the name huge, `giantNameSize`), line,
  centred, contact (email and address large first).
- Product page › Page layout › Product page design (`pdpLayout`, `productPageStyle.ts`): open, hero, editorial, split.
  CSS keys on `[data-pdp-layout]` on BookDetail's grid (`.fm-pdp-grid/.fm-pdp-photos/.fm-pdp-info`).
- Products › Grid & columns › Card design (`cardDesign`: framed, caption, centred, numbered; numbered counts per
  `section`) and Shop page layout (`shopPageLayout`: list, staggered, on MainSite's `.fm-shop-grid`), both in `cardTypography.ts`.
- Bag › Slides in from: **full** (rises from the bottom and fills the screen, `data-bag-full`).

Each starter sets its own mix in its `global` (themeLibrary.ts), with its own heading typeface and background.
`starterFrames.test.ts` fails when two starters share more than two of the eight parts (header, product page, cards,
shop page, footer, bag, type, background), share a heading typeface, or a starter keeps the default frame. A new
starter picks a mix no other has (see `add-a-starter.md`).

## Starter design upgrade: shared fixes and Gallery (26 November 2026, starter design upgrade plan steps 1 and 2)

Plan https://claude.ai/artifact/A5vVNJk14QrF2JjoUk6gER; Figma https://www.figma.com/design/muJlnW2wGVKpH0kG51w6yG (page Redesign).
- **Milky banners, root cause:** in light looks `--overlay-rgb` is the light background, so the even shade over an opening
  photo washed it out. Image banner gets a new field **Shade** (`overlayStyle`: "" even, as before; "fade" = behind the
  words only). The fade is `color-mix` of the section's own scheme `--bg-color`, aimed at `contentPosition`
  (`bannerShadeStyle`, `BANNER_FADE` in `SectionComponents.tsx`; `bannerShade.test.ts`). Pair it with a dark scheme
  (`scheme-inverse`) for light words over a dark fade.
- Starter sample descriptions are plain text (the `<p>` showed raw on product pages).
- The demo shop publishes the starter's own pages with `showInNav` (`demoPages`), so rail and side menus are never empty
  in the picker preview. Real new shops still get those pages as drafts.
- Gallery v4: minimal header, open product page with grid photos (no glow, bundle or share), plain cards, staggered shop,
  centred footer, slim dark announcement; home = banner (fade, inverse), big intro, two large then three small products
  (`productSort` priceHigh/priceLow with `productLimit`), shoppable photo with words right.

## Starter design upgrade: Warehouse and the Search bar header (26 November 2026, plan step 3)

- New header layout **"market"** (Studio label "Search bar"): logo left, a search box in the middle, icons right, links
  always in a full row below (`HEADER_LAYOUTS`, `MARKET_HEADER_CSS` in `headerLayout.ts`; `HeaderSearchBox` in
  `StoreHeader.tsx`, both the shop and page headers). The box shows Text & labels › `searchPlaceholder` (shop-type
  worded) and opens the same search drawer; computers only, where it hides the search icon. Its accessible name starts
  with `ariaSearch` (axe label-content-name-mismatch).
- Warehouse v3 follows Figma: market header, Split opening (huge headline, `accentWord: ""` to drop the sample accent),
  categories, black/yellow marquee, 8 framed products, promises, yellow Image with text story. Wide sections use the
  section's own Content width "full".
- Gallery also hides the Back link (`pdpShowBackLink: false`, breadcrumb only, as in Figma): at 70% opacity its muted
  words failed contrast on the open product page.

## Starter design upgrade: Larder (26 November 2026, plan step 4)

- Larder v3 follows Figma: Split opening on `scheme-accent` with section `cornerRadius: "xl"` and `outerGap: 32` (a rounded
  golden card), Multicolumn with photos as round aisle links, 8 products at 4:3 with `cardRadius: 16`, a dark rounded
  Image with text gift band, a story and the FAQ. Words stay neutral (spot labels like "New in", "Gifts").
- The header stays Centred: switching to Modern would share three frame parts with Slow Season (`starterFrames.test.ts`).

## Starter design upgrade: Salon, Workshop and Commission (26 November 2026, plan step 5)

- Designed first in Figma (page Redesign, frames "Salon/Workshop/Commission · Redesign · Desktop home"), then built from
  existing sections. Slow Season, Catalogue and Aurel keep their own Figma Make designs (the owner asked that those look
  exactly like their Figma), so step 5 changed only the three services starters.
- Salon v3: Image banner (full, fade, inverse) opening, wider price list (`containerWidth: "md"`), space on the accent
  scheme, hours on the inverse scheme; the second booking list was dropped (the price list books too).
- Workshop v3: promises on the accent scheme without photos, newsletter on inverse.
- Commission v3: Split opening, three-across recent work, how it works on inverse, four pieces, enquiry on accent.
- Section-only changes don't move `lookSignature`, so their releases were added by hand with the control-room versions.

### Starter design upgrade, step 6: phones and pictures (26 November 2026)
Phone check of all nine starters at 390px. Warehouse, Larder, Workshop and Commission now set the section's own
"Phone grid columns" (`mobileColumns`) so promise and step columns stack and round photo links sit three to a row.
Multicolumn round photos get `max-w-full` so they shrink in narrow columns (unchanged where 128px fits).
SplitOpening's owner-set title size is now the size at 1440px and scales down with the screen
(`min(Npx, N/14.4 vw)`), so a long word never runs into the photo on a laptop. Warehouse v4 and Larder v4 releases;
"Choose your website" pictures regenerated with `scripts/starter-thumbs.mjs`.

## Starter sample shops (26 November 2026, plan "Starters vs Shopify and Squarespace", step 2)

The owner compared the starters with shop-builder theme demos and approved making each one a finished sample shop
(plan https://claude.ai/artifact/JrRbyag8kdqVT6T1tnnL8t, pick A). Each `THEME_LIBRARY` starter has `content.sampleBrand`
(Fallow House, Margin Editions, Atelier Ondine, Stillwater Ceramics, Northline Supply, Rye & Salt, Rosewater Studio,
Clayhouse Studio, Hollis & Pine Joinery) and its section words, banner and product list read as that business.
`sampleProducts` entries take `category`, a two-sentence `description` and `options`; `starterSampleBooks` turns options
into one variant per combination (`optionCombinations`, names joined with " / "), so the demo's product pages show option
buttons. The demo (`demoDesign`) shows the brand as the shop name when no `?name=` is given. A real shop keeps its own
name and products; `withOwnBanner` (sells.ts) swaps the starter's banner for the shop's starting line in `chooseLook` and
the before-shop designer, because a banner is not a section and carries no Sample mark. The changed banners shipped as a
new release of Slow Season, Aurel, Gallery, Warehouse and Larder (`starterVersions.ts`, control room `starterSites.js`).
`sampleShops.test.ts` replaced `neutralStarters.test.ts`.

## Starter photo sets (26 November 2026, plan "Starters vs Shopify and Squarespace", step 3)

Catalogue, Gallery, Warehouse, Larder and Commission each have their own photo folder under `public/starters/<name>/`,
made with Figma's AI image generation in one backdrop and one light per starter (Catalogue: cool grey paper, hard side
light; Gallery: limestone plaster, window light; Warehouse: folded flat on warm grey; Larder: oak table, morning light;
Commission: pale oak floor and limewashed wall). Each photo shows the product named in `sampleProducts`. They no longer use
the shared `public/samples/` sets, which stay for looks without a sample shop and for Salon and Workshop.
`public/starters/README.md` lists where every folder came from; keep product photos under about 150 KB. Catalogue's old
files were copies of Slow Season's and are gone. The rail header now wraps a long shop name (`RAIL_HEADER_CSS`), found
with "Hollis & Pine Joinery". Pictures on Choose your website were regenerated with `scripts/starter-thumbs.mjs`
(`CHROMIUM_PATH` set to the container's Chromium).

## Starter phone header and photo first (26 November 2026, plan "Starters vs Shopify and Squarespace", step 4)

Style › Header layout › "Phone navigation style" has a third choice, "Menu button beside the name (one row)"
(`mobileNavStyle: "icon"`). Phones then draw `PhoneHeaderMenu` (MobileStorefrontNav's `everywhere` menu, `md:hidden`) at the
start of the header row in both `ShopHeader` and `PageHeader`; `MobileStorefrontNav` itself draws nothing below the row, and
the links-below row is hidden on phones. `phoneMenuInHeader` decides it from `{ ...design, ...design.storefront }`, the same
merge the menu uses, so the two never disagree. Seven starters use it (Catalogue and Gallery are Minimal, already a Menu
button). Default stays "tabs".
Long names: the logo link and its wrapper can shrink on phones (`min-w-0`), the compact phone header lets `.fm-logo` wrap
between words (`flex-wrap` for the two-part wordmark), and a centred logo sits in an `auto minmax(0,1fr) auto` grid on
phones (computers keep `1fr auto 1fr`). Found with Stillwater Ceramics, Northline Supply and Atelier Ondine.
SplitOpeningSection has "Photo first on phones" (`phonePhotoFirst`, off by default, `.fm-split-photo-first` in
`styles/index.css`); the five starters that open with it turn it on. Releases: Slow Season, Aurel, Salon, Workshop and
Commission 4, Warehouse and Larder 6.

## Starter product pages (26 November 2026, plan "Starters vs Shopify and Squarespace", step 5)

Each sample product has a second photo (`morePhotos`, `public/starters/<name>/<photo>-2.jpg`, Figma AI, same light as the
first); `starterSampleBooks` turns `photo` + `morePhotos` into the product's photo list (ids `s1`, `s1-2`).
`sampleShops.test.ts` wants two photos per product and checks the files exist. The nine starters set existing product
page controls only: no ambient glow, no tag, no "Fig. 1" caption, no Back link, no share button, full-width Add to bag,
the tax and shipping line, phone thumbnails hidden (swipe), and the details tabs under the buy card for the side-by-side
layouts. The Magazine (`editorial`) product page keeps words first only on computers (`productPageLayoutCss`); phones
show the photo first. The empty Reviews tab stays: it is where a shopper writes the first review.

## Starter fonts and "Good for" (26 November 2026, plan "Starters vs Shopify and Squarespace", step 6)

- Every starter offers at least two font pairs across its styles (`starterStyles.test.ts`). The second ("calm") style of
  Slow Season, Gallery, Warehouse, Larder, Salon, Workshop and Commission sets its own `headingFont`/`headingWeight`/`bodyFont`
  (Catalogue Blueprint and Aurel Sand already had one). Fonts are `FONT_CHOICES` families in listed weights.
- `studio/starterStrengths.ts` is the one list of what each starter suits: a catalogue size (`goodFor`: a few products, a big
  range, either, or appointments and classes) and three plain lines (`strengthsOf`), each true of the starter's own sections.
  It feeds the public starter pages (`demoShop/libraryPage.ts`: the size under the mood on each card; size plus "What it
  does well" on the detail page) and Choose your website (`StarterCards.tsx`, `.rp-website-strengths` in `riso.css`).
  `starterStrengths.test.ts` keeps it to every starter, three lines of at most 48 characters, no full stops.
- A new starter needs an entry here as well as in `STARTER_INFO` and `STARTER_BLURB`.

## Starter page fixes (26 November 2026, plan "Starters on par", step 1)

Plan https://claude.ai/artifact/3otgMHoTqFVWJGv57nLMQP (every page of all nine starters checked against the Shopify and
Squarespace demos). Step 1 fixed what was broken:
- **Search box:** `TEMPLATE_BASE_CSS` (`templateStyles.ts`) sets `.fm-search-input` to the body font, normal case, 16–22px.
  The Riso search keeps its giant display type.
- **Product page body font:** `BookDetail.tsx` set `fontFamily` to the bare `design.font` name and never loaded it, so
  everything not given the heading font (tabs, Frequently bought together, related products) drew in the browser's serif.
  It now loads the body font with the heading font and sets `--body-font` with a system fallback (MainSite sets
  `--body-font` too).
- **Photos stay in view:** `pdpStickyPhotos.ts` makes the photo column sticky on computers when it fits on screen and the
  buy column is taller (default and "open" layouts only; never photos taller than the screen).
- **Footer email:** `StoreFooter.tsx` no longer falls back to `owner@example.com`. With no shop email the Contact design
  shows a large "Contact →" link to `/page/contact`, the Contact link goes to the page (unless the page is already in the
  footer menu) and the four-column layout leaves the email out.

## Starter About, Contact and services (26 November 2026, plan "Starters on par", step 2)

- **Brand pages:** `studio/starterPages.ts` holds `STARTER_PAGES`, one set per starter: About/Contact/Shipping words, an
  About photo band, contact form words, an optional map, and for Salon and Workshop sample services and team.
  `withStarterPages` (wrapping `THEME_LIBRARY`) adds `content.pageWords`, `"page:about"`/`"page:contact"` sections
  (PageContentSection first, then ImageWithText or ContactForm + Map) and `sampleServices`/`sampleTeam`.
- **Sample words:** `presetPagesToAdd` uses the starter's words and marks the page `sample: true`; Studio › Pages shows a
  "Sample words" note and list tag, and saving the page clears the flag. Plain looks keep the bracketed prompts.
- **Booking preview:** `bookTimePreview.ts` reads `__studioPreviewState.starterServices`/`starterTeam` when present
  (`starterBookingSamples(look)`), and a service with `places > 1` is a class. Services-only demo shops list no products.
- **No dead buttons:** ImageWithText blocks in starters always set `ctaText`/`ctaUrl` (the renderer's default is
  "Read more" to `#`). `starterPages.test.ts` checks words have no prompts, emails, reviews or "Example".

## Starter menus: Shop link and full-screen phone menu (26 November 2026, plan "Starters on par", step 3)

- **Shop link:** Style › Header layout › `navShopLink` (`off` default, `link`, `menu`). `withShopLink` (`navItems.ts`)
  puts a `{ kind: "link" }` item first in the bar (words `navShopLabel`, Text & labels › Header › Menu links); in
  `menu` mode the top-level categories move into its drop-down (All + each). CategoryBar, the phone tabs and both phone
  menus draw it; the Classic (Reference) header does not. On the home page the in-place category pick never lights it.
- **Full-screen phone menu:** `phoneMenuFullScreen` (default off) swaps the menu button's small `<details>` box for
  `PhonePanelMenu` (only where the menu button is used: Phone navigation style › Menu button beside the name, or the
  Minimal header). It is a body portal with `data-fm-store` (the header's blur would trap a fixed panel), locks page
  scroll, keeps Tab inside, closes on Escape or a link, and fades in only without reduced motion. Main links big in the
  heading font; Book a time joins them while bookings are live. Studio overlay `menu` (Pop-ups › Phone menu, listed
  only while the switch is on; opening it moves the preview to the phone). Baseline `none` on the fixture (tabs).
- **Starters:** every product starter sets `navShopLink: "menu"`; all nine set `phoneMenuFullScreen: true` (release
  per starter in `starterVersions.ts`, control room mirror bumped). Generic Shipping & returns page now
  `showInFooter: true`; the demo keeps each page's own menu/footer place, lists the sample products' shelves as
  categories and turns bookings on for a starter with sample services.

## Starter shop page: intro line, chips and one Filter button (26 November 2026, plan "Starters on par", step 4)

- `catalogIntro` (Style › Shop page heading & filters › Heading): a sentence beside/under the heading on the shop page
  and `/collections/all` only (a category page keeps its own words). `categoryChipsShowPages` (default on) lets the
  category chips leave out menu pages.
- `catalogFilterLayout`: `open` (default, unchanged) or `button`. `CatalogControls` builds the search box, sort, stock
  chips, filter rows and results once and lays them out either way; `button` = one row (Filter with a picked-count
  badge, results on computers, sort), results under it on phones, everything else opens under the row
  (`aria-expanded`/`aria-controls`). Baseline `none` on the fixture (its bar is off).
- The Market-style looks' catalog button colour rule skips `.fm-active`, so a picked filter chip reads (it was ink on ink).
- Product starters: intro line, chips without counts or pages, Filter button; Aurel "Bags & leather", Commission
  "Furniture" headings.

## Starter bag: free-shipping bar, estimate behind a link (26 November 2026, plan "Starters on par", step 5)

- `cartDrawerShippingPreviewLayout`: `open` (default, unchanged) or `link`. `CartShippingPreview` shows one
  "Estimate shipping" link (`cartEstimateOpen`) until clicked, then the form with focus on the country box. The choice is
  read on every render (Studio follows live); a shopper with a remembered destination sees the form at once. Baseline
  `none`: the live design turns the shipping preview off.
- `cartDrawerMetaCase`: `uppercase` (default) or `none` (small labels as typed, no wide letter spacing).
- `readShippingProfiles` uses `__studioPreviewState.shippingProfiles` when a preview brings them (no read). The demo shops
  pass `demoShipping(books)`: free over about twice the median sample price, rounded, so the free-shipping bar shows.
- Bag word defaults are sentence case now (`cartTitle`, `cartCheckoutButton`, `cartUpsellAdd`, `cartEmptyPicksAdd`); the
  CSS still capitalises them where the look asks.
- All nine starters: body-font small labels as typed (Warehouse keeps capitals), 26px heading, no item numbers, 1px
  lines, no offset shadows, no photo outlines, no per-item price, estimate behind the link, no trust badges; Larder,
  Salon and Workshop use the soft pill quantity buttons.

## Starter product pages, finished (26 November 2026, plan "Starters on par", step 6)

- `productDetailsLayoutPhone`: `same` (default) or `accordions`. When the layout is Tabs, `BookDetail` switches to the
  accordion markup under `PHONE_MAX` (the same `matchMedia` state the phone thumbnails use, now also watched for this).
  Baseline `none`: the live design uses Accordions.
- `starterSampleBooks` gives `sizeChart` from the starter's `content.sizeGuide` to products with a Size option
  (Warehouse), and Warehouse turns `showPdpSizeGuide` on.
- All starters: `pdpStickyBar` (phones only by default) and fold-open details on phones. `relatedHeading` "You may also
  like" is a starter word for every shop that doesn't sell books (`sells.ts` `WRITTEN`).
- `bundleAdd` default is sentence case ("Add both to bag").

## Starter footers and the missing page (27 November 2026, plan "Starters on par", step 7)

- New extra `features/site/extras/not-found-picks/`: `showNotFoundSearch` (a search form to `/collections/all?q=`) and
  `showNotFoundProducts` (four buyable products, `emptyBagPicks` order), both off by default, under Style › Custom pages.
  The control check now opens the missing page for every `showNotFound*` switch (`KEY_ROUTES`), so all four are visible.
- `.fm-footer-name` (the footer's shop name) follows `footerTextColor`, and `.fm-footer-copy` (the copyright line, full strength: at 70% the 9px line failed contrast in press-lantern); both used the page's ink, which vanished
  in footers whose band is the ink colour (seven starters).
- Starters: missing-page search and products, social and payment icons on (they draw only once set up). Non-book shops
  get `footerConnectHeading` "Help" (`sells.ts`). The demo's footer line is the sample brand's `catalogIntro`.
- Sentence case defaults: `footerLinkTrack` "Track order", `notFoundBack` "Back to home".


## Starter fade-in and more home sections (27 November 2026, plan "Starters on par", step 8)

- New Style control `sectionReveal` (Animations & hover effects › "Sections appear as you scroll": Off / Gentle fade /
  Fade and zoom; default Off = today's look). `SectionReveal` (`components/sectionRender.tsx`) uses it, through
  `siteRevealMode`, for sections without their own Animation, from the second section on and never in the shared
  header/footer/pop-up groups. Gentle values: fade = opacity 0, y 16; fade and zoom = opacity 0, scale .97. The page
  animations switch, reduced motion and prerendered landings still turn it off. Baseline `none` (the check runs with
  reduced motion).
- All nine starters set `sectionReveal: "fade-zoom"`. New home sections (no reviews, ratings or press): Slow Season
  "How we work", Catalogue "How the catalogue works" + "Eleven makers, one shelf", Aurel "Made on Rue Bernard" +
  Questions, Gallery and Warehouse a short FAQ, Salon "Before your visit". Larder, Workshop and Commission already had
  six or more sections.

## Starter check, page by page (27 November 2026, plan "Starters on par", step 9)

- `scripts/starter-check.mjs` (`pnpm run test:starters`, CI job `shop-speed`): every starter with a `sampleBrand` in the
  demo (`demo.html` on a Vite server, local requests only, reduced motion) at 1440 and 390 wide: home, shop, the first
  product (product starters), About, Contact and the missing page. Fails on a page error, sideways scroll, words left to
  replace (`LEFTOVER`: "Your headline", "Example …", "Say what …", `@example.com`, braces, "undefined"), a heading not in
  the starter's heading font, a paragraph not in its body font (`font` wins over `bodyFont`, as in `resolveTypography`)
  and a picture that didn't load. `STARTERS=a,b` checks only those.
- What the first run fixed: the product page's headings now take `--heading-font` (`:where(h1…h6)` in BookDetail's css);
  starters set `pdpMetaFont`/`checkoutMetaFont` to their body font and `hideNewsletter` (the shop page drew a second
  "Join the Catalogue" box under the starter's own); the Newsletter placeholder fallback is "Email address"; `withStyle`
  moves `font` with a style's `bodyFont` (the Website font hid every style's own body font; `starterStyles.test.ts`);
  Salon's `font` is Nunito, its body font; the missing page's sections sit outside the centred column (they ran 38px past
  a phone screen). New Style control `relatedHeadingStyle` (Book page › Related row heading: Small label, the default
  and today's look in the body font, or Section heading in the heading font); starters use Section heading.
- Numbered cards (`cardTypography.ts` "numbered") count on the title and reset at every `section` and `.fm-shop-grid`:
  the card-level increment lost to looks that number rows (`counter-increment:row`), and every card read "00".
- 27 November 2026 (jsdom 31): `richText.ts` checks a style longhand
  through its shorthand (`text-align-*`, `text-decoration-*`): jsdom 31 and browsers list shorthands by longhands, so
  allowed alignment/underline was being stripped. jsdom 31's `getComputedStyle` is empty on detached elements: append the
  host to `document.body` before reading styles in a test.
