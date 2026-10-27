import { describe, expect, it } from "vitest";
import { recommendedBooks, editionFacts } from "./merchandising";
const catalog = [{ id: "a", title: "A", status: "published", categories: ["Poetry"] }, { id: "b", title: "B", status: "published" }, { id: "c", title: "C", status: "draft" }, { id: "test", title: "test", status: "published" }, { id: "sss", title: "sss", status: "published" }, { id: "copy", title: "Altrove (Copy)", status: "published" }, { id: "copy2", title: "Copy", status: "published" }];
describe("publisher recommendations", () => {
  it("keeps curator order and excludes missing, duplicate, current and unpublished books", () => {
    expect(recommendedBooks({ id: "a", relatedBookIds: ["c", "missing", "b", "b", "a"] }, catalog).map(b => b.id)).toEqual(["b"]);
  });
  it("uses publication status rather than title guesses for recommendations", () => {
    expect(recommendedBooks({ id: "a", categories: ["Poetry"] }, catalog).map(b => b.id)).toEqual(["b", "test", "sss", "copy"]);
    expect(recommendedBooks({ id: "a", relatedBookIds: ["test", "sss", "copy", "copy2", "b"] }, catalog).map(b => b.id)).toEqual(["test", "sss", "copy", "copy2"]);
  });
  it("an explicitly empty selection hides automatic recommendations", () => {
    expect(recommendedBooks({ id: "a", relatedBookIds: [] }, catalog)).toEqual([]);
  });
  it("preserves automatic matches for older records without a selection", () => {
    expect(recommendedBooks({ id: "a", categories: ["Poetry"] }, catalog).map(b => b.id)).toEqual(["b", "test", "sss", "copy"]);
  });
});
describe("real edition details", () => {
  it("renders supplied values only, without inventing edition facts", () => {
    expect(editionFacts({ edition: "Second printing", pageCount: 48, publisher: "LM", publishDate: "2026-10-07" })).toEqual([
      { key: "specEdition", value: "Second printing" }, { key: "specPages", value: "48" }, { key: "specPublisher", value: "LM" }, { key: "specPublished", value: "2026-10-07" },
    ]);
    expect(editionFacts({ pageCount: 0 })).toEqual([]);
  });
});
