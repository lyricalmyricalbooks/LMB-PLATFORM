import { describe, expect, it } from "vitest";

// Studio 2.3: links, books, videos and fonts are picked, not typed. Every section and block field
// whose key says it holds one of those must use the matching picker kind, so a new "…Url" field
// can't quietly ship as a bare text box. Images keep their own `image` kind (upload + style).

const { SECTION_REGISTRY, getSectionFields, getBlockFields } = await import("../ThemeEditorExtensions");
const { PICKER_KINDS } = await import("./StudioPickers");

type Field = { key: string; label: string; kind: string; itemFields?: { key: string; label: string; kind?: string }[] };
const all: { where: string; field: Field }[] = [];
for (const meta of SECTION_REGISTRY) {
  for (const field of getSectionFields(meta.type) as Field[]) all.push({ where: `${meta.type}.${field.key}`, field });
  for (const field of getBlockFields(meta.type) as Field[]) {
    all.push({ where: `${meta.type}.block.${field.key}`, field });
    for (const item of field.itemFields || []) all.push({ where: `${meta.type}.block.${field.key}[].${item.key}`, field: { ...item, kind: item.kind || "text" } });
  }
}

const expected = (key: string): string | null => {
  if (/video(url)?$/i.test(key)) return "video";
  if (/(image|logo|poster|photo)url$/i.test(key)) return "image";
  if (/(^|[a-z])(url|link|href)$/i.test(key)) return "link";
  if (/slugs$/i.test(key)) return "books";
  if (/(^|product)slug$/i.test(key)) return "book";
  if (/font$/i.test(key)) return "font";
  return null;
};

describe("section and block field kinds", () => {
  it("finds the fields it guards", () => {
    expect(all.filter(f => f.field.kind === "link").length).toBeGreaterThanOrEqual(15);
    expect(all.some(f => f.field.kind === "books")).toBe(true);
    expect(all.some(f => f.field.kind === "category")).toBe(true);
  });

  it("url-like fields use the link picker (videos the video picker, images the image field)", () => {
    const wrong = all.flatMap(({ where, field }) => {
      const want = expected(field.key);
      return want && want !== "font" && field.kind !== want ? [`${where}: ${field.kind}, expected ${want}`] : [];
    });
    expect(wrong).toEqual([]);
  });

  it("book slugs use the book pickers and font names the font picker (or a font list)", () => {
    const wrong = all.flatMap(({ where, field }) => {
      const want = expected(field.key);
      if (want !== "font" && want !== "book" && want !== "books") return [];
      const ok = want === "font" ? field.kind === "font" || field.kind === "select" : field.kind === want;
      return ok ? [] : [`${where}: ${field.kind}, expected ${want}`];
    });
    expect(wrong).toEqual([]);
  });

  it("picker kinds only appear where the key fits, and list rows only use text or link", () => {
    const kinds = new Set<string>(PICKER_KINDS);
    for (const { where, field } of all) {
      if (where.includes("[]")) expect(["text", "link"], where).toContain(field.kind);
      if (kinds.has(field.kind) && field.kind !== "category" && field.kind !== "page") expect(expected(field.key), where).toBe(field.kind);
    }
  });
});
