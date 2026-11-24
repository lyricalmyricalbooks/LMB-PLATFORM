# Adding products, round 3: part 2 (24 November 2026)

Plan: https://claude.ai/artifact/MEmMDYot4WY3S1c8cRDRaL. Part 1 notes are in `src/app/admin/CLAUDE.md` › Adding products, round 3.

- **Make a copy:** `duplicateBookData` (`catalogList.ts`) drops photos and stock and names it "<title> (copy)", a draft.
  Products › ⋯ › Make a copy and the editor's ⋯ menu (`BookEditor` `makeCopy`, refuses while there are unsaved edits)
  open the copy with its name selected (`Dashboard` `openCopy` → `handleEditBook(copy, { rename: true })` →
  `renameOnOpen`).
- **Done moment:** the saved banner of a new product offers See it in the shop, Add another, Make a copy, Back to products.
- **Bigger sizes cost more:** `VariantGrid` row using `sizeOptionOf` / `bumpBySize` (`variantGridRules.ts`): base price up
  to the chosen size, base + extra from it on.
- **Needs attention:** `needsAttention.ts` `attentionReasons(book, stock, live)` (No photo, No weight for parcel products,
  Sold out, a missing law fact). Products shows All / Needs attention pills (`.bk-views`) and each row's reasons.
- **Add several:** Products › Add several (and the empty list) opens `AddSeveralDialog.tsx` (pure `addSeveral.ts`).
  Blank type/price/stock copy the row above (`filledRows`), `rowProblems` checks every row first, `rowProduct` makes a
  draft from `NEW_BOOK_DEFAULTS` + `typeStart`. Rows save one by one with `createBook(…, { quiet: true })`; a photo that
  won't upload leaves the draft without it; rows that fail stay in the table (`onDone(made, false)` keeps it open).
  One audit-log line per run. Max 50 rows. Phone: rows become cards (`.as-*` in `books.css`).
- **Fixture:** `admin-fixture.html?page=catalog&books=goods`; products made in the fixture (`createBook`,
  `duplicateBook`) are kept in memory and join `getAllBooks`.
