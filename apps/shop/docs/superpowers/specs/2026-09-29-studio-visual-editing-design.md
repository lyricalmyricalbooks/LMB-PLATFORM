# Studio visual-editing milestone

Date: 2026-09-29
Status: Proposed design for user review; implementation has not started.

## Outcome

Make the active Studio a coherent visual editor for the bookstore: find a page,
select its content, change and rearrange it, inspect the responsive result, save
and recover a draft, and deliberately publish. The user approved this milestone's
scope after requesting a drastic improvement toward Shopify-level functionality
and usability. This milestone completes the everyday editing workflow; it does
not claim complete Shopify feature parity.

## Evidence and approach

Dashboard mounts `studio/StudioEditor.tsx`. The older ThemeEditor remains a source
of shared schemas and controls, but improving only that older shell would miss
the active experience. Studio already has three columns, a section registry,
theme presets, saved themes, device previews and immutable undo history.

Current gaps verified in source:

- The outline displays sections with arrow controls and no block children.
- The preview bridge sends block IDs, but Studio's selection handler ignores them.
- The bridge intercepts section clicks unconditionally, preventing normal browsing.
- Studio's style setter always calls `applyGlobalStyle`.
- Draft saving reads the current design again after awaiting persistence, so edits
  made during the request can be falsely marked saved.
- Preview URLs select the first product and a fixed collection.
- Editor chrome uses fixed neutral utility classes instead of the Riso primitives.

Extend the existing Studio and its schema-driven controls. A replacement editor
would duplicate established rendering and persistence contracts. Adding isolated
features to the existing panels would leave selection and workflow fragmented.

## Workspace and navigation

Use the Riso admin appearance, components and tokens throughout the Studio shell.
On wide screens show a 280px outline, flexible canvas, and 340px inspector. Below
1100px, the inspector becomes a dismissible overlay; below 768px, Outline,
Preview and Settings become mutually exclusive views with persistent top actions.
Keep device-preview width independent of the editor's own responsive layout.

The top bar contains page/template selection, relevant product or collection
selection, desktop/tablet/mobile preview, Edit/Browse toggle, undo/redo, status,
Save draft and Publish. Less frequent theme and draft actions use a labelled menu.
Never silently select an unrelated product when the selected one disappears: show
an empty state and offer another selection. Preserve the deployment base path.

## Outline and block editing

Represent selection as a template/global target, section ID and optional block ID.
Derive the selected object from current design state instead of holding a stale
copy. The outline expands sections into their schema-supported block arrays using
`getBlocksKey` and existing registry metadata. Product cards generated from catalog
data are not editable theme blocks; selecting them opens their owning section.

Use existing dnd-kit sensors and sortable helpers for section ordering and block
ordering within the owning section. Provide visible insertion positions, including
the start, end and empty section list. Add-section actions remember the insertion
position while the registry-driven library is open. Block creation uses the
section's allowed defaults and fields. Cross-section block transfers and arbitrary
recursive block schemas are deferred because current section types have different
contracts.

Provide section and block duplicate, visibility and removal actions, preserving
the renderer's existing block visibility convention. Duplicates get fresh IDs.
Legacy blocks without IDs receive stable IDs in the editable draft, consistently
used in preview and persistence. Do not use filtered array indices as identity.
An unsupported or stale block selection falls back to the owning section.

The inspector opens the selected block's fields directly and provides a breadcrumb
back to its section. Existing structured list fields remain available. Undoing a
deletion restores content; invalid current selections resolve to the surviving
parent or clear. Reordering retains the selection by ID.

## Canvas and preview protocol

Edit mode shows labelled section/block hover and selection outlines. Canvas
selection expands the matching outline and opens its inspector. Outline selection
scrolls the canvas to the matching visible node. Hidden items remain editable in
the outline with an explicit hidden status. Slideshow selection must expose the
selected slide through an editor-only event without changing storefront playback.

Browse mode disables selection interception, hover chrome and inline text editing
so ordinary navigation, accordions and cart interactions work. Same-origin internal
navigation retains preview mode and the unsaved design. Report route changes to
the parent so the page selector and settings target follow the actual preview.
Reapply design, selection and mode after iframe loads and SPA navigation. External
destinations must not replace the editor itself. Browse mode is a real storefront
preview, not an implicit payment sandbox; validation never submits a real payment.

Validate message origin AND source against the active iframe/parent. Validate
message shape, target ownership and editable field keys. Ignore unknown targets.
Escape selector values and avoid constructing selectors from untrusted copy keys.
Keep plain-text inline editing restricted to schema text fields; rich HTML remains
in its existing editor. Group an inline editing session into one undo action and
make Escape restore its starting value.

Show preview loading/error/retry states. A bridge failure cannot appear as a
working edit mode. Remove observers/listeners when replaced and prevent duplicate
handlers. Public rendering outside preview mode receives no editing overlays.

## Settings discovery and scope

Search style controls by label, group and setting key, automatically expanding
matching groups. Search section/block fields inside the inspector. Preserve the
existing searchable Text & labels experience and fix navigation to collapsed
matching groups. Show clear empty results and a reset-search action.

For supported visual settings expose All pages / This page only. Default to All
pages to preserve current behavior, but always display scope beside the controls.
Page-only writes update that surface; global writes update root and all static and
dynamic surfaces while preserving their section stacks. Page-only reset removes
the override to inherit the global value. Identify settings whose storefront
consumers only support global values and label them All pages rather than offering
a nonfunctional page scope. Copy, menus, saved themes and theme-preset application
remain explicitly global in this milestone.

## Persistence and recovery

Capture an immutable snapshot before each save/publish. Serialize draft, publish
and discard operations, including keyboard shortcuts. On successful draft save,
only that snapshot becomes the saved baseline. Later edits stay dirty. A successful
publish updates live and saved baselines to the published snapshot; later edits
remain unpublished. Never report that nothing went live merely because an audit
or version-history write failed after the primary write succeeded.

Keep the existing Firestore design/draftDesign contract. Verify that replacing a
design really removes deleted overrides, rather than leaving them through nested
merge semantics. Keep unrelated website settings intact. Draft discard clears
history and recovery only after successful persistence. Publish remains explicit.

Add debounced local recovery of design-only data, namespaced by site and signed-in
admin identity. Store a schema version, timestamp and saved-base fingerprint. On
reopen, offer Recover local changes or Discard local recovery when a different
local draft exists. If the server baseline changed, explain the conflict and
require explicit recovery; never silently overwrite the server draft. Recovery
loads into unsaved history and never publishes. Quota/storage failure shows a
nonblocking notice and leaves manual save available. Clear obsolete recovery after
successful saves only when no newer edits exist.

Retain saved themes and existing version snapshots. Surface snapshot-write errors
separately from successful theme saves. Full theme-library redesign, collaborative
multi-admin editing and scheduled-publication changes are outside this milestone.

## Implementation boundaries

- `StudioEditor.tsx`: composition, current design, navigation and selection.
- Focused Studio modules: outline, inspector, settings search and persistence/
  recovery coordination, avoiding further growth of the monolithic component.
- `studioModel.ts`: pure section/block identity, mutations and selection resolution.
- `previewBridge.ts`: typed protocol contract and iframe interaction behavior.
- Shared schema controls and renderer hooks: narrowly scoped compatibility changes.
- `useSiteData`, MainSite and affected route consumers: preview continuity only.
- `admin/api.ts`: exact design replacement and truthful persistence outcomes.

Reuse installed UI and drag libraries. Preserve unknown existing theme fields,
section registry/renderer parity and the current saved-theme format. Review rules
and indexes for any persistence change; this design adds no Firestore collection.
Do not change admin authorization, payment calculations, webhook ownership of paid
orders, stock or discount mutations. Update THEME_EDITOR.md, AGENTS.md and CLAUDE.md
together to accurately describe the active Studio and completed milestone.

## Acceptance and verification

1. Add at the beginning, middle and end of a page, including an empty custom page;
   reorder by pointer and keyboard; save/reload preserves the exact order.
2. Select, edit, duplicate, hide and remove representative FAQ, slideshow and
   multicolumn blocks from outline and canvas; only the intended block changes.
   Repeat with legacy ID-less blocks and hidden siblings.
3. Undo/redo restores edits and order; typing shortcuts retain normal input behavior;
   Escape cancels inline editing and dialogs restore focus to their trigger.
4. Browse between home, catalog, chosen product, collection, custom page and cart;
   unsaved preview styles persist and selecting Edit targets the displayed page.
5. Page-only changes stay local; All pages reaches static and custom templates;
   resetting an override stays reset after save/reload.
6. Delay saving, edit again, then resolve the request: newer edits remain unsaved.
   Exercise failed saves, failed secondary logs, reload recovery and discard.
7. Verify desktop/tablet/mobile preview and the narrow editor shell, keyboard
   controls, focus containment, accessible names and readable Riso appearance.
8. Run focused model/protocol/persistence tests, existing section and copy coverage,
   the full `npm test` suite and `npm run build`. Use browser integration checks for
   actual drag interactions, route transitions and renderer selection.
9. Verify authenticated save/reload and published storefront rendering in an
   authorized test environment. Report any unavailable live verification separately
   from fixture-based tests; never treat a success toast as persistence proof.

Complete means all six approved workflow areas are implemented and verified, with
any external-environment limitation explicitly documented. Deferred features are
recursive blocks, cross-section shared blocks, breakpoint-specific grid placement,
AI authoring and canvas drag-and-drop. They remain subsequent roadmap milestones.
