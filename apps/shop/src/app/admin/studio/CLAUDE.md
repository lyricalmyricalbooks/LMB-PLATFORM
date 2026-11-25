# Studio (the theme editor)

Studio is the only designer. Read `docs/THEME_EDITOR.md` too before changing it. The repo-wide rules are in the root `CLAUDE.md`.

## Standing rules

### Studio is the only designer
- Add or change every theme/design feature in Studio (`studio/StudioEditor.tsx`); custom pages live only in Studio › Pages (never a separate Pages screen).
- **After every theme-editor change, end the reply with a plain-English click path** in the admin, using the real on-screen labels from the code (tab names, accordion `title`s, button text), never from memory.
- Essentials (`studio/essentials.ts`) reuses the same controls as Theme settings / Text & labels, never a second store (`essentials.test.ts`: at most 8 steps, 12 settings).
- `beforeShop` Studio (no store yet): keep new top-bar actions that need a real shop behind `!beforeShop`.

### Everything shopper-facing is editable
- Every storefront element needs a show/hide control in `STYLE_GROUPS` (`studio/styleSchema.ts`, default = current behaviour) and its words in Text & labels (`COPY_SCHEMA`, via `getCopy`), in the same change that adds it.
- Indirect sentences are copy too (errors, notices, SEO, template `aria-label`/`alt`, renderer fallbacks); in `SectionComponents.tsx` use `fb("Type.field")` with `??` (`noHardwiredMessages.test.ts`, `sectionFallbacks.test.ts`, `storeCopy.coverage.test.ts`). Behaviour numbers and the placeholder image are Style controls.
- The shop's name is typed once (Text & labels › Site name). Only `features/site/shopIdentity.ts` may spell the placeholder name (`shopIdentity.test.ts`); copy uses `{name}`, sections `{{shop.name}}`, fallbacks `fb(key, useShopName())`.
- No hard-coded colours: design keys or `var(--token, #hex)`; never literal `rgb()/hsl()`; every Tailwind colour class listed in `features/site/storefrontColorClasses.ts`; section fallbacks use tokens. Enforced by `designerCoverage.test.ts`, `studioCoverage.test.ts`, `themeTokens.test.ts`.
- No sample content for shoppers; empty-section samples show only in the preview (`noSampleContent.test.tsx`). Starter sections carry `sample: true` until edited.

### Themes, templates and starters
- Presets, brand kit and starters may only set keys with a Studio control. `themeCheck.test.ts` runs `themeProblems` on every `THEME_LIBRARY` entry; `themeLibrary.test.ts`, `brandKit.test.ts`. Add the control with the key; never allowlist around a test.
- Every theme stays readable: `themeReadability.test.tsx` checks every look, section and buy-box block. Fix the colour, never loosen the check. A look's fonts must be `FONT_CHOICES` families in listed weights (`themeFonts.test.ts`).
- Templates (`features/site/templateStyles.ts`): read `var(--tpl-…, own look)`, write no colour, font or words, answer every knob, and use `template*` keys, never the Riso ones (`templateCoverage.test.ts`). To add one: `TEMPLATE_STYLES` + `TEMPLATE_CSS`/`lookCss`, `PALETTES`, a `THEME_LIBRARY` look, a home layout, a `lookFeel`.
- Changing a shipped theme offers an update to every shop using it: change themes on purpose. Studio › Themes changes only the look; layouts and pages are a separate undoable step. Starters apply whole only to new shops and must stay neutral (`neutralStarters.test.ts`); `starterDesign.test.ts` applies each twice.
- Starter content comes from sample sets (`admin/starterSamples.ts`, chosen by `sampleSetFor(sells)`): neutral "Example …" words, no made-up makers or reviews, photos in `public/samples/<set>/` from Unsplash's free licence only, each listed in `public/samples/LICENSE.md` (`starterSamples.test.ts`). A new kind of shop needs only a new set.
- Starters fill empty pictures from the shop's sample set (`studio/starterPhotos.ts`) and never replace a photo the starter brings; example products are never sold (`comingSoon.ts` `notForSale`, server `purchaseProblem`). Services shops get `starterForShop(theme, sells)`; booking sections are never re-worded (`SERVICES_WORDED`).
- A new structural design key goes in `DESIGN_STRUCTURE_KEYS` (`themeImportCheck.test.ts`) and, if it has its own editor, `designDiff.ts` `STRUCTURAL`.
- Section designs only set the section's own fields with values its controls offer; a new section type must be placed in a kind in `studio/sectionDesigns.ts` (`sectionDesigns.test.ts`). Bands use colour schemes, never a colour. Never replace an owner's own schemes (`fromLook`).

### Controls must reach the shop
- Every control has a baseline file in `scripts/studio-control-baseline/`; after adding or changing one run `AUDIT_UPDATE=1 node scripts/studio-control-audit.mjs` and commit. Never mark a working control `none`.
- `storefrontOverrides.test.ts` fails on a control nothing reads: wire it or delete it. Any new storefront root injecting token `<style>` renders `<StorefrontOverrides>`.
- CSS must win where it lands; a default must draw exactly as before; `defaultValue` equals the storefront's unset fallback (`styleDefaults.test.ts`). Reviving a dead control means a new key defaulting to today's look. Fine-tune conflicts go in `studio/fineTuneConflicts.ts`.
- Settings buttons go through `openTarget`; extend `scripts/studio-e2e.mjs` when Studio behaviour changes. Browser checks that pick a look use one the picker offers.

### Click-to-edit, structure and search
- New storefront regions carry `data-studio-target` + `data-studio-label` (or `regionProps` in every layout); `studioTargets.test.ts`, `studio/targetLabels.ts`, `elementCatalog.test.ts`. Header parts inside `<header>`, footer inside `<footer>`, pop-overs `role="dialog"` (+ `STUDIO_OVERLAYS`, `useStudioOverlay`).
- New `STYLE_GROUPS`/`COPY_SCHEMA` groups go under a heading in `studio/settingsMap.ts` (`settingsMap.test.ts`).

### Preview pipeline
- Receivers follow Studio only through `subscribePreview` (`previewSubscribe.test.ts`); snapshots stay clone-safe (`toCloneable`).
- Preview pages never write (`inEditorPreview()`); Pay does nothing; Studio Health only reads. New page kinds go in `healthRoutes`. Custom code runs on public pages only.

### Data, saving and resolution
- Drafts in admin-only `themes/workspace`, My themes in `savedThemes/{id}`, all through `admin/themeStore.ts` (revision-checked). Never put draft, theme or schedule data in public `settings/website`. Outside Studio use `draftFieldUpdate`; shopper code reads `getPublicSettings()`.
- Resolve designs only through `features/site/designModel.ts`; "All pages" writes via `writeDesignValue`; book sections via `bookTemplateSurface`/`sectionsSurface`.
- Never auto-overwrite unsaved edits; a conflict during Publish never publishes. Schedules apply only on the server (`functions/themeSchedule.js`), Toronto time stored as UTC.
- Compare with `designEqual`, never `JSON.stringify`; keep normalisers identity-preserving. Tolerate `$dyn` values; show them via `displayValue()`.

### Studio code rules
- No `window.confirm/prompt/alert` (`say(…Undo)`, `useConfirm`, `usePrompt`); name every edit `change(fn, { label })`; failures via `studio/friendlyError.ts`; shortcuts in `studio/shortcuts.ts`.
- Moves and bulk edits through `studioWorkflow.ts` helpers, never splicing arrays.
- Uploads through `uploadStudioImage`/`uploadMediaImage` into allowed folders (`admin/storagePaths.test.ts`); never `data:` pictures; `ResponsiveImage` for new section images.
- Url-like fields use picker kinds, never `text` (`sectionFieldKinds.test.ts`). Catalog sections select through `merchandising.ts`. Breakpoints only from `features/site/breakpoints.ts`.
- A closed dialog builds nothing (guard children with the open flag).
- Colophon look for Studio lives in one block at the end of `studio.css`; add new boxes to its lists. Ink buttons use `--rp-primary`/`--rp-on-primary`.

### Storefront contracts Studio relies on
- A section = registry schema + identically named renderer + mapping + library entry + a kind. New card sections go in `noPhotoCards.test.tsx`.
- `StoreHeader`/`StoreFooter` are the only header and footer (`storeChrome.parity.test.tsx`). Header layout lives in `features/site/headerLayout.ts`; presets never override an explicit header choice.
- New book cards use `fm-card` + `fm-card-title`/`fm-card-price*` (`cardClasses.test.tsx`); a new buy-card piece needs a block type and a refreshed parity fixture. Fixed-bar sections go in `LAZY_EXCLUDED_TYPES`.

### Deploy
- Rules for `media`, `previewTokens` and Storage deploy with the frontend; Functions with schedule changes.

## Feature notes

Details of each feature live in [`docs/agent-notes/studio.md`](../../../../docs/agent-notes/studio.md) (read the section before changing that feature; Grep its heading). Sections:
- Theme editor
- Studio organization
- Public designer coverage (2 October 2026)
- Template designer coverage (4 November 2026)
- Responsive public element editing (4 October 2026)
- Studio look and phone top bar (13 November 2026)
- Starter websites (23 November 2026, plan "Editable starter websites", step 1)
- Starters and Studio rethink, step 1: sample sets (24 November 2026)
- Starters and Studio rethink, step 2: starters arrive with samples (24 November 2026)
- Starters and Studio rethink, step 4: Show with (24 November 2026)
- Starters and Studio rethink, step 5: Try this starter (24 November 2026)
- Make it yours (25 November 2026, round three phase 3)
- Calmer Studio (25 November 2026, round three phase 4)
- Site styles, Shoppable photo and Lookbook (25 November 2026, round three phase 5)
