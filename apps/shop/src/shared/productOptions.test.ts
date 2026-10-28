import { describe, expect, it } from "vitest";
import {
  MAX_VARIANTS,
  adoptEditions,
  findVariant,
  isBookKind,
  optionCombinations,
  optionProblems,
  picksPossible,
  productKind,
  productOptions,
  usesOptionPicker,
  valueAvailable,
  variantLabel,
  variantsForOptions,
} from "./productOptions";

// A book as shops save it today: editions with a name each, no kind, no options (plan 10.20: books shops unchanged).
const book = {
  id: "moths",
  title: "Moths of the North",
  retailPrice: 30,
  variants: [
    { id: "hc", name: "Hardcover", price: 45, stock: 3 },
    { id: "pb", name: "Paperback", price: 30, stock: 0 },
  ],
};

const shirt = {
  id: "tee",
  kind: "clothing",
  options: [
    { name: "Size", values: ["S", "M", "L"] },
    { name: "Colour", values: ["Black", "White"] },
  ],
  variants: [
    { id: "s-b", name: "S / Black", options: { Size: "S", Colour: "Black" }, price: 25, stock: 2 },
    { id: "s-w", name: "S / White", options: { Size: "S", Colour: "White" }, price: 25, stock: 0 },
    { id: "m-b", name: "M / Black", options: { Size: "M", Colour: "Black" }, price: 25, stock: 0 },
    { id: "m-w", name: "M / White", options: { Size: "M", Colour: "White" }, price: 25, stock: 4 },
    { id: "l-b", name: "L / Black", options: { Size: "L", Colour: "Black" }, price: 27, stock: 0 },
    { id: "l-w", name: "L / White", options: { Size: "L", Colour: "White" }, price: 27, stock: 0 },
  ],
};

const inStock = (v: any) => v.stock > 0;

describe("books shops stay the same (plan 10.20)", () => {
  it("reads a product with no kind as a printed book", () => {
    expect(productKind(book)).toBe("book");
    expect(productKind({ kind: "spaceship" })).toBe("book");
    expect(productKind(null)).toBe("book");
    expect(isBookKind(productKind(book))).toBe(true);
  });
  it("keeps today's editions list for a book with editions", () => {
    expect(productOptions(book)).toEqual([]);
    expect(usesOptionPicker(book)).toBe(false);
    expect(findVariant(book, {})).toBeNull();
  });
  it("keeps the editions list when only some variants carry picks", () => {
    const half = { ...shirt, variants: [...shirt.variants, { id: "x", name: "Old", price: 1 }] };
    expect(usesOptionPicker(half)).toBe(false);
  });
});

describe("product kinds", () => {
  it("knows the other kinds, any case", () => {
    expect(productKind({ kind: " Clothing " })).toBe("clothing");
    expect(isBookKind("clothing")).toBe(false);
    expect(isBookKind("ebook")).toBe(true);
  });
});

describe("options", () => {
  it("tidies names and values, drops repeats and blanks, keeps at most three", () => {
    const options = productOptions({
      options: [
        { name: " Size ", values: ["S", "s", " M ", ""] },
        { name: "size", values: ["XL"] },
        { name: "Empty", values: [] },
        { name: "Colour", values: ["Black"] },
        { name: "Material", values: ["Cotton"] },
        { name: "Fit", values: ["Slim"] },
      ],
    });
    expect(options).toEqual([
      { name: "Size", values: ["S", "M"] },
      { name: "Colour", values: ["Black"] },
      { name: "Material", values: ["Cotton"] },
    ]);
  });
  it("lists every combination, first option slowest", () => {
    const combos = optionCombinations(productOptions(shirt));
    expect(combos.map((p) => variantLabel(productOptions(shirt), p))).toEqual(["S / Black", "S / White", "M / Black", "M / White", "L / Black", "L / White"]);
    expect(optionCombinations([])).toEqual([]);
  });
  it("names problems in plain words", () => {
    expect(optionProblems(productOptions(shirt))).toEqual([]);
    const many = Array.from({ length: 11 }, (_, i) => `v${i}`);
    expect(optionProblems([{ name: "A", values: many }, { name: "B", values: many }])[0]).toMatch(`at most ${MAX_VARIANTS}`);
    expect(optionProblems([{ name: "Size", values: [] }])).toEqual(["Add at least one choice to Size."]);
  });
});

describe("variants for options", () => {
  it("keeps each existing variant's id, price and stock and adds the new combinations", () => {
    const options = [{ name: "Size", values: ["S", "M", "XL"] }, { name: "Colour", values: ["Black"] }];
    let n = 0;
    const { variants, removed } = variantsForOptions(options, shirt.variants, () => ({ id: `new-${++n}`, price: 25, stock: 0 }));
    expect(variants.map((v) => [v.id, v.name, v.stock])).toEqual([["s-b", "S / Black", 2], ["m-b", "M / Black", 0], ["new-1", "XL / Black", 0]]);
    expect(removed.map((v) => v.id)).toEqual(["s-w", "m-w", "l-b", "l-w"]);
  });
  it("turns a book's editions into one option without losing them when the press adds options", () => {
    const options = [{ name: "Format", values: ["Hardcover", "Paperback"] }];
    const withPicks = book.variants.map((v) => ({ ...v, options: { Format: v.name } }));
    const { variants, removed } = variantsForOptions(options, withPicks, () => { throw new Error("no new ones"); });
    expect(variants.map((v) => v.id)).toEqual(["hc", "pb"]);
    expect(removed).toEqual([]);
  });
});

describe("adopting today's editions", () => {
  it("gives each edition its own name as its pick when one option lists the names", () => {
    const options = [{ name: "Format", values: ["Hardcover", "paperback", "Signed"] }];
    const adopted = adoptEditions(options, book.variants);
    expect(adopted.map((v) => v.options)).toEqual([{ Format: "Hardcover" }, { Format: "paperback" }]);
    let n = 0;
    const { variants, removed } = variantsForOptions(options, adopted, () => ({ id: `new-${++n}`, stock: 0 }));
    expect(variants.map((v) => [v.id, v.name])).toEqual([["hc", "Hardcover"], ["pb", "paperback"], ["new-1", "Signed"]]);
    expect(removed).toEqual([]);
  });
  it("leaves editions alone for two or more options", () => {
    expect(adoptEditions(productOptions(shirt), book.variants)).toEqual(book.variants);
  });
});

describe("picking on the product page", () => {
  it("finds the variant once every option is picked", () => {
    expect(usesOptionPicker(shirt)).toBe(true);
    expect(findVariant(shirt, { Size: "M" })).toBeNull();
    expect(findVariant(shirt, { Size: "M", Colour: "White" })?.id).toBe("m-w");
    expect(findVariant(shirt, { Size: "M", Colour: "Red" })).toBeNull();
  });
  it("knows which partial picks still lead somewhere", () => {
    const partial = { ...shirt, variants: shirt.variants.filter((v) => v.id !== "l-w") };
    expect(picksPossible(partial, { Size: "L" })).toBe(true);
    expect(picksPossible(partial, { Size: "L", Colour: "White" })).toBe(false);
    expect(picksPossible(partial, {})).toBe(true);
  });
  it("crosses out values that can't lead to something in stock", () => {
    expect(valueAvailable(shirt, {}, "Size", "L", inStock)).toBe(false);
    expect(valueAvailable(shirt, {}, "Size", "M", inStock)).toBe(true);
    expect(valueAvailable(shirt, { Size: "M" }, "Colour", "Black", inStock)).toBe(false);
    expect(valueAvailable(shirt, { Size: "M" }, "Colour", "White", inStock)).toBe(true);
    // Changing a size ignores the size picked so far, so the shopper can switch freely.
    expect(valueAvailable(shirt, { Size: "M", Colour: "White" }, "Size", "S", (v) => v.id === "s-w" || inStock(v))).toBe(true);
  });
});
