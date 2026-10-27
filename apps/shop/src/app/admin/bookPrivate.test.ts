// Private book fields (#18): cost prices and other admin-only fields never travel on the public book document.
import { describe, expect, it } from "vitest";
import { mergeBookPrivate, PRIVATE_BOOK_KEYS, privateKeysIn, splitBookPrivate } from "./bookPrivate";

const book = {
  title: "A", retailPrice: 20, costPrice: 6.5, usdCostPrice: 4.7, eurCostPrice: 4.4, shelfLocation: "B2",
  legacyInventoryKey: "hound", digitalFilePath: "digital-assets/1-a.epub", digitalFileName: "1-a.epub",
  variants: [{ id: "p", name: "Paperback", price: 20, shelfLocation: "B2-p" }, { id: "e", name: "E-book", price: 9 }],
};

describe("splitBookPrivate", () => {
  it("keeps every private field off the public record", () => {
    const { pub, priv } = splitBookPrivate(book);
    for (const key of PRIVATE_BOOK_KEYS) expect(pub).not.toHaveProperty(key);
    expect(pub.variants.every((v: any) => !("shelfLocation" in v))).toBe(true);
    expect(pub).toMatchObject({ title: "A", retailPrice: 20, digitalFileName: "1-a.epub" });
    expect(priv).toMatchObject({ costPrice: 6.5, usdCostPrice: 4.7, eurCostPrice: 4.4, shelfLocation: "B2", legacyInventoryKey: "hound", digitalFilePath: "digital-assets/1-a.epub" });
    expect(priv.variantShelf).toEqual({ p: "B2-p" });
  });

  it("round-trips through mergeBookPrivate", () => {
    const { pub, priv } = splitBookPrivate(book);
    expect(mergeBookPrivate(pub, priv)).toEqual(book);
  });

  it("does not write a private document for a book without private fields or editions", () => {
    expect(splitBookPrivate({ title: "Plain" }).priv).toEqual({});
  });
});

describe("mergeBookPrivate during the transition", () => {
  it("shows legacy public values when nothing is private yet", () => {
    expect(mergeBookPrivate(book, null).costPrice).toBe(6.5);
    expect(mergeBookPrivate(book, undefined).variants[0].shelfLocation).toBe("B2-p");
  });
  it("prefers the private value over a leftover public one", () => {
    const merged = mergeBookPrivate({ ...book }, { costPrice: 7 });
    expect(merged.costPrice).toBe(7);
    expect(merged.usdCostPrice).toBe(4.7);
  });
  it("lists the keys to scrub from the public record", () => {
    expect(privateKeysIn({ costPrice: 1, variantShelf: {} })).toEqual(["costPrice"]);
  });
});

describe("per-edition download file (#115)", () => {
  it("keeps the file name public and the Storage path private, and merges it back", () => {
    const book = { title: "T", variants: [{ id: "e", digital: true, digitalFileName: "1-a.epub", digitalFilePath: "digital-assets/1-a.epub" }] };
    const { pub, priv } = splitBookPrivate(book);
    expect(pub.variants[0]).toEqual({ id: "e", digital: true, digitalFileName: "1-a.epub" });
    expect(priv.variantFiles).toEqual({ e: "digital-assets/1-a.epub" });
    expect(mergeBookPrivate(pub, priv).variants[0].digitalFilePath).toBe("digital-assets/1-a.epub");
  });
});
