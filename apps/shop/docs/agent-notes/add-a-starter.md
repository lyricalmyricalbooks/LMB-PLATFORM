# Adding a starter website (recipe, 24 November 2026)

A starter is a whole website a shop can start from: a look, its sections on each page, its every-page bands, its buy
box, starter pages, and sample content that fills it. Plan: https://claude.ai/artifact/QLdTWuXRYpba8FPrUQU3Q8. Budget
about 2 to 3 days per starter. Existing shops are never changed by a new starter.

## 1. Read the design
- Open the Figma (or mockup) file and list every part: page bands top to bottom, fonts, colours, buttons, cards, photo
  shapes, the words on each band, the product page and the footer.
- For each part, name the Studio home it will use: a palette (`PALETTES`), a Style control (`STYLE_GROUPS`), a section
  design (`studio/sectionDesigns.ts`) or a template style (`lookCss` in `features/site/templateStyles.ts`).
- A part with no home gets one first: a new section design (only the section's own fields), or a new section type with
  its renderer, registry entry, Content fields and a kind in `SECTION_KINDS`. Never a one-off that Studio can't edit.

## 2. Build the look and the pages
- Add the `THEME_LIBRARY` entry (`studio/themeLibrary.ts`): `id`, `name`, `mood`, `palettePreset`, the `global` keys,
  `homeLayoutTemplate`, and `content`:
  - `sections` for every page it shapes, plus `headerSections` / `globalSections` for the every-page bands
  - `productBlocks` for the buy box
  - `starterPages` (ids from `pageStarters.ts`)
- Words describe the spot ("Your headline"), never a made-up maker or story. Add the id to the NEUTRAL list in
  `neutralStarters.test.ts`.
- Add any new font to `FONT_CHOICES` in the weights the look uses.
- Pick the look's feel in `lookFeel` (`admin/lookGallery.ts`).

## 3. Samples
- The page band photos and example products come from the shop's sample set (`admin/starterSamples.ts`), so a starter
  needs no photos of its own. If it does ship its own (`content.sampleProducts`, `public/starters/<id>/`), keep each
  photo under about 150 KB, and list every photo with its licence.
- A new kind of shop needs a new sample set: photos in `public/samples/<set>/` from Unsplash's free licence (never
  `plus.` photos), lines in `public/samples/LICENSE.md`, and the set in `starterSamples.ts`.
- Check the services version: `starterForShop(theme, "hair")` should give a price list, Book a time cards and opening
  hours in place of product rows.

## 4. List it
- Add the id to `STARTER_SITES` in `admin/lookGallery.ts` and to `STARTERS` (id and the same name) in
  `control-room/starterSites.js`. `starterSites.test.js` fails until the two match.
- If the control room has saved a starter choice, the new starter waits there as "new, waiting for you", hidden from
  shops. That gives the owner a yes before it is listed.

## 5. Check
- Tests: `starterDesign.test.ts`, `themeCheck.test.ts`, `themeReadability.test.tsx`, `templateCoverage.test.ts`,
  `themeFonts.test.ts`, `neutralStarters.test.ts`, `sectionDesigns.test.ts`, `starterSamples.test.ts`, and root
  `control-room/starterSites.test.js`.
- Every starter on every shop type: `scripts/studio-e2e.mjs` reads `STARTER_SITES` and tries each one in Studio as a
  bookshop, a clothing shop and a salon (`?sells=`), at desktop and phone. It fails when the look is unstyled, the page
  scrolls sideways, a header button covers the shop name, or a non-book shop shows the books menu. A new starter is
  checked by it with no edit; it must pass before Show. Run one starter with
  `STUDIO_ONLY="starter <id>" pnpm run test:studio`.
- Screenshots, desktop and phone, next to the design file, all from the real product:
  - the Studio fixture (`/studio-fixture.html#designer?tab=themes` › Whole websites › Try this starter)
  - the storefront
  - Choose your look (`/admin-fixture.html?start=look&page=overview`)
  - a services shop (`&sells=hair`)
- Fix every difference, then show the owner the real screenshots.
- Once the owner says yes, open Control room › Shops › Setting up › Starter websites, tick Show (and Mark New) and save.
