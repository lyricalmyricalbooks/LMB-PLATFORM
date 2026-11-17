// Digital D1: the files on a product or edition, their download-count keys and the countries buyers can be in. Run
// against the generated server copy too, so the admin, the shop and the server read files the same way.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import * as shop from "./digitalFiles";

const server = createRequire(import.meta.url)("../../functions/shared/digitalFiles.js") as typeof shop;

for (const [side, lib] of [["shop", shop], ["server", server]] as const) {
  describe(`digital files (${side})`, () => {
    test("a list wins; an older single file reads as a one-file list; bad entries and repeats are dropped", () => {
      expect(lib.filesOf({ digitalFiles: [{ file: "1-a.pdf", name: " A  pattern " }, { file: "1-a.pdf" }, { file: "../x" }, { file: "" }, null], digitalFileName: "old.pdf" }))
        .toEqual([{ file: "1-a.pdf", name: "A pattern" }]);
      expect(lib.filesOf({ digitalFileName: "1730000000000-old.pdf" })).toEqual([{ file: "1730000000000-old.pdf" }]);
      expect(lib.filesOf({})).toEqual([]);
      expect(lib.filesOf({ digitalFiles: Array.from({ length: 30 }, (_, i) => ({ file: `${i}.zip` })) })).toHaveLength(lib.MAX_DIGITAL_FILES);
    });
    test("a new version keeps the name and place, counts up, and starts the first file's downloads afresh", () => {
      const first = { file: "1-a.pdf", name: "Pattern", size: 10 };
      const v2 = lib.newVersionOf(first, { file: "2-a.pdf", size: 12 }, "2026-11-17");
      expect(v2).toEqual({ file: "2-a.pdf", name: "Pattern", size: 12, version: 2, updated: "2026-11-17" });
      expect(lib.newVersionOf(v2, { file: "3-a.pdf", size: 9 }, "2026-11-18").version).toBe(3);
      expect(lib.filesOf({ digitalFiles: [v2] })).toEqual([v2]);
      expect(lib.filesOf({ digitalFiles: [{ file: "x.pdf", version: 1, updated: "soon" }] })).toEqual([{ file: "x.pdf" }]);
      expect(lib.fileCountKey("b1__base", [first], 0)).toBe("b1__base");
      expect(lib.fileCountKey("b1__base", [v2], 0)).toBe("b1__base__v2");
    });
    test("an edition's own files win over the product's", () => {
      const book = { digitalFiles: [{ file: "book.pdf" }], variants: [{ id: "v", digitalFiles: [{ file: "v.zip" }] }, { id: "w" }] };
      expect(lib.filesFor(book, "v").map((f) => f.file)).toEqual(["v.zip"]);
      expect(lib.filesFor(book, "w").map((f) => f.file)).toEqual(["book.pdf"]);
      expect(lib.filesFor(book, null).map((f) => f.file)).toEqual(["book.pdf"]);
    });
    test("labels, count keys and the saved shape", () => {
      expect(lib.fileLabel({ file: "1730000000000-night.pdf" })).toBe("night.pdf");
      expect(lib.fileLabel({ file: "x.pdf", name: "Chapter 1" })).toBe("Chapter 1");
      const files = [{ file: "a.pdf" }, { file: "b c.zip" }];
      expect(lib.fileCountKey("b1__base", files, 0)).toBe("b1__base");
      expect(lib.fileCountKey("b1__base", files, 1)).toBe("b1__base__b_c_zip");
      expect(lib.filesPatch([{ file: "a.pdf", name: "A" }])).toEqual({ digitalFiles: [{ file: "a.pdf", name: "A" }], digitalFileName: "a.pdf" });
      expect(lib.filesPatch([])).toEqual({ digitalFiles: [], digitalFileName: "" });
      expect(lib.fileSizeText(5 * 1024 ** 3)).toBe("5.00 GB");
      expect(lib.fileSizeText(0)).toBe("");
    });
    test("countries: Canada and the US to start, the shop's list after, and * for every other country", () => {
      expect(lib.digitalCountries({})).toEqual(["CA", "US"]);
      expect(lib.digitalCountryAllowed({}, "ca")).toBe(true);
      expect(lib.digitalCountryAllowed({}, "FR")).toBe(false);
      expect(lib.digitalCountryAllowed({}, "")).toBe(false);
      expect(lib.digitalCountryAllowed({ digitalDownloads: { countries: [] } }, "CA")).toBe(false);
      expect(lib.digitalCountryAllowed({ digitalDownloads: { countries: ["us", "bad", "*"] } }, "FR")).toBe(true);
      expect(lib.digitalCountries({ digitalDownloads: { countries: ["us", "US", "bad"] } })).toEqual(["US"]);
    });
  });
}
