import { describe, expect, it } from "vitest";
import { cleanBookFields, cleanCustomValues, fieldKeyFor, mergeCustomValues } from "./bookFields";
import { connect, dynamicSources, isDynamic, readSource, resolveDynamicSettings, sourceLabel } from "./dynamicSources";

const book = { id: "b1", slug: "night-pages", title: "Night Pages", authorName: "A. Writer", description: "<p>A <b>dark</b> book.</p>", photos: [{ url: "https://x/1.jpg" }], custom: { series: "The Night Series", series_number: "2" } };
const fields = [{ key: "series", label: "Series", kind: "text" as const }, { key: "series_number", label: "Number in series", kind: "number" as const }];

describe("book fields", () => {
  it("makes stable unique keys from labels", () => {
    expect(fieldKeyFor("Translated by", [])).toBe("translated_by");
    expect(fieldKeyFor("Series", ["series"])).toBe("series_2");
    expect(fieldKeyFor("2nd printing", [])).toBe("f_2nd_printing");
  });
  it("keeps only valid definitions", () => {
    expect(cleanBookFields([{ key: "series", label: " Series ", kind: "text" }, { key: "series", label: "dupe" }, { key: "Bad Key", label: "x" }, { key: "awards", label: "", kind: "text" }, { key: "odd", label: "Odd", kind: "nope" }]))
      .toEqual([{ key: "series", label: "Series", kind: "text" }, { key: "odd", label: "Odd", kind: "text" }]);
  });
  it("cleans answers by kind and keeps answers of removed fields", () => {
    const defs = [{ key: "n", label: "N", kind: "number" as const }, { key: "d", label: "D", kind: "date" as const }, { key: "u", label: "U", kind: "url" as const }, { key: "t", label: "T", kind: "text" as const }];
    expect(cleanCustomValues(defs, { n: "x", d: "2026-10-09", u: "javascript:alert(1)", t: "  hi  ", extra: "no" })).toEqual({ d: "2026-10-09", t: "hi" });
    expect(mergeCustomValues(defs, { gone: "kept", t: "old" }, { t: "new" })).toEqual({ gone: "kept", t: "new" });
  });
});

describe("dynamic sources", () => {
  it("reads book, category and page details", () => {
    expect(readSource("book.title", { book })).toBe("Night Pages");
    expect(readSource("book.description", { book })).toBe("A dark book.");
    expect(readSource("book.photo", { book })).toBe("https://x/1.jpg");
    expect(readSource("book.url", { book })).toBe("/books/night-pages");
    expect(readSource("book.custom.series", { book })).toBe("The Night Series");
    expect(readSource("book.costPrice", { book: { costPrice: 5 } })).toBe("");
    expect(readSource("category.url", { category: { name: "Art Books" } })).toBe("/collections/art-books");
    expect(readSource("category.name", { category: "Zines" })).toBe("Zines");
    expect(readSource("page.title", { page: { title: "About" } })).toBe("About");
    expect(readSource("book.title", {})).toBe("");
  });
  it("labels sources, including custom fields", () => {
    expect(sourceLabel("book.custom.series", fields)).toBe("Book › Series");
    expect(sourceLabel("category.name")).toBe("Category › Name");
    expect(dynamicSources(fields).filter(s => s.path.startsWith("book.custom")).map(s => s.label)).toEqual(["Series", "Number in series"]);
    expect(isDynamic(connect("book.title"))).toBe(true);
    expect(isDynamic("book.title")).toBe(false);
  });
  it("resolves connected values and {{tokens}} in settings and blocks, leaving everything else alone", () => {
    const settings = { title: connect("book.custom.series"), subtitle: "Book {{book.custom.series_number}} of the series", imageUrl: connect("book.photo"), columns: 3, items: [{ id: "a", text: connect("book.authorName") }], __sectionId: "s1" };
    const r = resolveDynamicSettings(settings, { book });
    expect(r.settings).toMatchObject({ title: "The Night Series", subtitle: "Book 2 of the series", imageUrl: "https://x/1.jpg", columns: 3, items: [{ id: "a", text: "A. Writer" }] });
    expect(r.used).toBe(4);
    expect(r.missing).toBe(0);
    const plain = { title: "Fixed", items: [{ id: "a" }] };
    expect(resolveDynamicSettings(plain, { book }).settings).toBe(plain);
  });
  it("hides a section with Hide when empty only where a connected detail is missing, never in the preview", () => {
    const settings = { title: connect("book.custom.series"), hideWhenEmpty: true };
    expect(resolveDynamicSettings(settings, { book }).hidden).toBe(false);
    expect(resolveDynamicSettings(settings, {}).hidden).toBe(true);
    expect(resolveDynamicSettings({ ...settings, hideWhenEmpty: false }, {}).hidden).toBe(false);
    const preview = resolveDynamicSettings(settings, {}, { preview: true, fields });
    expect(preview.hidden).toBe(false);
    expect(preview.settings.title).toBe("‹Book › Series›");
  });
});
