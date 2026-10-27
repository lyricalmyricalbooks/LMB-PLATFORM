import { describe, it, expect } from "vitest";
import { bookSlug, resolveStaffNoteRows } from "./staffNotes";

const books = [
  { id: "1", title: "Roadkill", slug: "roadkill", subtitle: "A cross-country elegy in 35mm" },
  { id: "2", title: "Find Still Catches Me Shifted", subtitle: "Long exposures of empty rooms" },
  { id: "3", title: "Soft Machine Field Notes", slug: "soft-machine" },
];

describe("bookSlug", () => {
  it("prefers the explicit slug", () => {
    expect(bookSlug(books[0])).toBe("roadkill");
  });
  it("derives a slug from the title when none is set", () => {
    expect(bookSlug(books[1])).toBe("find-still-catches-me-shifted");
  });
  it("handles missing books", () => {
    expect(bookSlug(undefined)).toBeUndefined();
  });
});

describe("resolveStaffNoteRows", () => {
  it("resolves blocks to books by slug with their notes", () => {
    const rows = resolveStaffNoteRows(
      [
        { slug: "roadkill", note: "What gets left behind." },
        { slug: "find-still-catches-me-shifted", note: "Quiet interiors." },
      ],
      books,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].book.id).toBe("1");
    expect(rows[0].note).toBe("What gets left behind.");
    expect(rows[1].book.id).toBe("2");
  });

  it("skips blocks whose slug matches no book", () => {
    const rows = resolveStaffNoteRows([{ slug: "does-not-exist", note: "x" }], books);
    expect(rows).toHaveLength(0);
  });

  it("skips hidden blocks", () => {
    const rows = resolveStaffNoteRows(
      [
        { slug: "roadkill", note: "keep" },
        { slug: "soft-machine", note: "hidden", hidden: true },
      ],
      books,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].book.id).toBe("1");
  });

  it("falls back to the first N books (note = subtitle) when no blocks are configured", () => {
    const rows = resolveStaffNoteRows([], books, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0].book.id).toBe("1");
    expect(rows[0].note).toBe("A cross-country elegy in 35mm");
    expect(rows[1].note).toBe("Long exposures of empty rooms");
  });

  it("tolerates empty inputs", () => {
    expect(resolveStaffNoteRows([], [])).toEqual([]);
    expect(resolveStaffNoteRows(undefined as any, undefined as any)).toEqual([]);
  });
});
