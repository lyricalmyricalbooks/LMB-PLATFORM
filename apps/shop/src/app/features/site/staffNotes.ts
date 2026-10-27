// ─────────────────────────────────────────────────────────────────────────────
// Staff Notes table — pure row resolution for StaffNotesTableSection.
//
// Blocks reference books by slug ({ slug, note }); when no blocks are
// configured the table falls back to the first N books (note = subtitle).
// Kept free of React/DOM imports so it is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

export const bookSlug = (book: any): string | undefined =>
  book?.slug || book?.title?.toLowerCase?.().replace(/[^a-z0-9]+/g, "-");

export type StaffNoteRow = { book: any; note: string };

export function resolveStaffNoteRows(blocks: any[], books: any[], fallbackLimit = 8): StaffNoteRow[] {
  const visible = (blocks || []).filter((b: any) => !b?.hidden);
  if (visible.length === 0) {
    return (books || [])
      .slice(0, Math.max(1, fallbackLimit))
      .map((book: any) => ({ book, note: book.subtitle || "" }));
  }
  return visible
    .map((b: any) => {
      const slug = String(b.slug || "").trim();
      // A Studio book picker saves the immutable id when two books share a slug.
      const book = (books || []).find((bk: any) => bookSlug(bk) === slug) || (slug ? (books || []).find((bk: any) => bk?.id === slug) : undefined);
      return book ? { book, note: b.note || "" } : null;
    })
    .filter(Boolean) as StaffNoteRow[];
}
