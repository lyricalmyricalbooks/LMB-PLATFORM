# Studio pass: bugs first, then better (13 November 2026)

Julian: "continue improving the website designer, find bugs, make it better".

## Plan
- [x] Open Studio's fixture on a computer and a phone, every workspace, every one of the ten looks, wearing the admin's look
- [x] Product with no photo: home page sections drew an empty box; show the stand-in picture like the shop grid does
- [x] Phone: Studio opened on the computer preview (a 1200px page drawn 390px wide); open on the phone preview
- [x] Phone: the open workspace sat off screen in the workspace row (Themes is the eighth); keep it in sight
- [x] Tips named "the bar on the left" and Ctrl K, neither of which a phone has; plain words that fit both
- [x] Two preview hints said "books" to every shop; plain product words
- [x] The fixture wears the admin's one look, so screenshots show what a shop sees
- [x] Verify: `noPhotoCards.test.tsx` (fails without the fix), three new Studio browser checks, `pnpm test`, typecheck, lint

## Found, next
- Studio's own labels say "book" to shops that don't sell books (Theme settings categories, field labels, page names):
  nothing in `admin/studio` reads `useShopWords`. A bug under the book-only rule; next PR.
- Studio's chrome is square and takes five rows on a phone before any content; the admin is Colophon bento. Restyle.
- On touch screens Studio's toolbar buttons are 36px tall (the admin's rule is 44px).

## Review
- The stand-in picture is one small component (`NoPhoto` in SectionComponents.tsx) read from the section's design, so a
  shop's own picture (Theme settings) is used everywhere a product card is drawn.
- A remembered or linked device still wins over the phone default, so nobody's saved view changes.

## Round 2 (same day): the checks that guard Studio
- [x] The full Studio click-through (94 checks) had five failures on main, all in Themes: they named looks the picker no
      longer offers (Riso Paper, Zine, Index) and a Preview button that now has a twin on the drawing. Pointed at
      Marquee and Atlas; Preview matched exactly.
- [x] Fixing them found a real bug: Marquee's title font (Big Shoulders Display) was not in the font pickers, so after
      Use this look the Heading font control read "Default (not set)", and the font loaded in two weights only, so its
      weight-900 titles were drawn fake-bold. Added to `FONT_CHOICES`; `themeFonts.test.ts` holds every look to it.
- [x] Root CI job `shop-studio` runs the click-through on every pull request, on three machines.
- [x] Verify: the five checks pass, the full run passes locally, `pnpm test`, typecheck, lint, root `npm test`.

### Review (round 2)
- The control check (`pnpm run test:studio-controls`) is still not in CI; run it and add it once it is known to pass.

## Round 3: Studio in each shop's own words

- [x] `wordCatalog` / `useCatalogWords` (admin/shopWords.tsx): a list of settings in the shop's words; keys, ids, values, defaults and {tokens} untouched
- [x] StudioEditor reads STYLE_GROUPS and COPY_SCHEMA through it; built-in page names, Essentials, look descriptions worded
- [x] Page parts (structure tree, region browser), template card, buy box blocks, page picker, shop categories
- [x] Fixture `?sells=clothing`; unit test (shopWords.test.ts); five browser checks in studio-e2e.mjs
- [ ] Later: pickers, Find, Health and Media panels still have some book words; "Review author" reads "Review maker"

### Review
Region labels double as ids (STYLE_TARGET_FIELDS is keyed by label), so they are worded only where shown.
