import { describe, expect, it } from "vitest";
import { lineIsDigital } from "./digitalLine";

describe("lineIsDigital", () => {
  const book = { digitalFileName: "book.epub", variants: [{ id: "pb", name: "Paperback" }, { id: "eb", name: "E-book", digital: true }] };
  it("never offers a download for a book without a file", () => {
    expect(lineIsDigital({ format: "E-book" }, { variants: [] })).toBe(false);
    expect(lineIsDigital({ format: "E-book" }, undefined)).toBe(false);
  });
  it("trusts what the order line recorded", () => {
    expect(lineIsDigital({ format: "Paperback" }, book)).toBe(false);
    expect(lineIsDigital({ format: "EPUB" }, book)).toBe(true);
    expect(lineIsDigital({ digital: true }, book)).toBe(true);
  });
  it("falls back to the catalog edition for older lines", () => {
    expect(lineIsDigital({ variantId: "pb" }, book)).toBe(false);
    expect(lineIsDigital({ variantId: "eb" }, book)).toBe(true);
    expect(lineIsDigital({}, book)).toBe(false);
    expect(lineIsDigital({}, { ...book, digital: true })).toBe(true);
  });
});

import { createRequire } from "node:module";
import { digitalEntries, downloadBookIds, DOWNLOAD_LIMIT, hasDigitalFile } from "./digitalLine";

describe("round-2 PR 4: editions, box sets, limit", () => {
  const pdfBook = { digitalFileName: "main.pdf", variants: [{ id: "pdf", digital: true }, { id: "epub", digital: true, digitalFileName: "b.epub" }] };
  it("an edition's own file counts even when the book has none (#115)", () => {
    const onlyVariant = { variants: [{ id: "epub", digital: true, digitalFileName: "b.epub" }] };
    expect(hasDigitalFile(onlyVariant, "epub")).toBe(true);
    expect(hasDigitalFile(onlyVariant, "other")).toBe(false);
    expect(lineIsDigital({ variantId: "epub", format: "E-book (EPUB)" }, onlyVariant)).toBe(true);
  });
  it("offers one download per edition ordered, passing the edition on (#115)", () => {
    const order = { items: [{ id: "b", title: "T", variantId: "pdf", digital: true }, { id: "b", title: "T", variantId: "epub", digital: true }] };
    expect(digitalEntries(order, { b: pdfBook }).map((e) => e.variantId)).toEqual(["pdf", "epub"]);
  });
  it("lists the e-book parts of a box set (#114)", () => {
    const order = { items: [{ id: "box", title: "Box", bundle: true, format: "Hardcover", components: [{ id: "b", variantId: "", title: "Part" }, { id: "p", variantId: "", title: "Print" }] }] };
    const books = { box: {}, b: { digitalFileName: "x.pdf", digital: true }, p: { digitalFileName: "", digital: false } };
    expect(digitalEntries(order, books)).toEqual([{ itemId: "b", variantId: "", title: "Part", file: 0 }]);
    expect(downloadBookIds(order).sort()).toEqual(["b", "box", "p"]);
  });
  it("lists each file of a product with several files, by the name the owner gave it (Digital D1)", () => {
    const book = { digital: true, digitalFiles: [{ file: "1-a.pdf", name: "Pattern" }, { file: "2-b.zip", name: "Sizes" }] };
    const order = { items: [{ id: "k", title: "Quilt", digital: true }] };
    expect(digitalEntries(order, { k: book })).toEqual([
      { itemId: "k", variantId: "", title: "Quilt: Pattern", file: 0 },
      { itemId: "k", variantId: "", title: "Quilt: Sizes", file: 1 },
    ]);
    expect(hasDigitalFile({ digitalFiles: [{ file: "x.zip" }] })).toBe(true);
  });
  it("shows the same limit as the server (#113)", () => {
    expect(DOWNLOAD_LIMIT).toBe(createRequire(import.meta.url)("../../../../functions/digitalDelivery").DOWNLOAD_LIMIT);
  });
});

import { libraryEntries } from "./digitalLine";

describe("Digital D1b: the account library", () => {
  const entry = (itemId: string, file = 0, variantId = "") => ({ itemId, variantId, title: itemId, file });
  it("lists each file once, through the newest paid order", () => {
    const orders = [
      { id: "new", paymentStatus: "paid" },
      { id: "unpaid", paymentStatus: "pending" },
      { id: "old", paymentStatus: "paid" },
    ];
    const rows = libraryEntries(orders, {
      new: [entry("zine")],
      unpaid: [entry("album")],
      old: [entry("zine"), entry("zine", 1), entry("zine", 0, "hd")],
    });
    expect(rows.map((r) => [r.itemId, r.variantId, r.file, r.order.id])).toEqual([
      ["zine", "", 0, "new"],
      ["zine", "", 1, "old"],
      ["zine", "hd", 0, "old"],
    ]);
  });
  it("is empty with no paid downloads", () => {
    expect(libraryEntries([], {})).toEqual([]);
    expect(libraryEntries([{ id: "a", paymentStatus: "paid" }], {})).toEqual([]);
  });
});
