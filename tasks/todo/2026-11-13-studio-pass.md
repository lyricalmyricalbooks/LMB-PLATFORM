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
