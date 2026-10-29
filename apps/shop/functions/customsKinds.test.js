// Plan 10.4: the customs form and fallback weight follow the product's kind; a printed book is exactly as before.
import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { customsItems, customsDeclaration, parcelContents, DEFAULT_DESCRIPTION, DEFAULT_HS_CODE } = require("./customs");
const { kindShipping } = require("./shared/kindDefaults");
const { FALLBACK_COPY_GRAMS } = require("./parcelWeight");

const line = (id, extra = {}) => ({ id, quantity: 1, price: 20, ...extra });
const order = (...items) => ({ orderId: "AB-1", subtotal: 20 * items.length, discount: 0, items });

describe("customs by product kind", () => {
  it("a product with no kind is a printed book, with today's words, code and weight", () => {
    const [item] = customsItems(order(line("b1")), { b1: { title: "Poems" } }, "CA");
    expect(item).toMatchObject({ description: DEFAULT_DESCRIPTION, tariff_number: DEFAULT_HS_CODE, net_weight: FALLBACK_COPY_GRAMS.toFixed(1) });
    expect(kindShipping({}).copyGrams).toBe(FALLBACK_COPY_GRAMS);
  });

  it("a shirt, a ring and a pair of shoes get their kind's words, code and weight", () => {
    const books = { s: { kind: "clothing" }, r: { kind: "jewelry" }, h: { kind: "shoes" } };
    const [shirt, ring, shoes] = customsItems(order(line("s"), line("r"), line("h", { quantity: 2 })), books, "CA");
    expect(shirt).toMatchObject({ description: "Clothing", tariff_number: "6109.10", net_weight: "300.0" });
    expect(ring).toMatchObject({ description: "Jewellery", tariff_number: "7117.19", net_weight: "50.0" });
    expect(shoes).toMatchObject({ description: "Footwear", tariff_number: "6403.99", net_weight: "1800.0" });
  });

  it("the owner's own answers and weights always win", () => {
    const books = { s: { kind: "clothing", customsDescription: "Cotton tee", hsTariffNumber: "6109.10.0010", weight: "0.2 kg", variants: [{ id: "v", weight: "250 g" }] } };
    const [a] = customsItems(order(line("s")), books, "CA");
    expect(a).toMatchObject({ description: "Cotton tee", tariff_number: "6109.10.0010", net_weight: "200.0" });
    const [b] = customsItems(order(line("s", { variantId: "v" })), books, "CA");
    expect(b.net_weight).toBe("250.0");
    // A bad code falls back to the kind's, not the book code.
    const [c] = customsItems(order(line("s")), { s: { kind: "clothing", hsTariffNumber: "nope" } }, "CA");
    expect(c.tariff_number).toBe("6109.10");
  });

  it("another kind has no tariff code to guess: the form goes without one", () => {
    const [item] = customsItems(order(line("o")), { o: { kind: "other" } }, "CA");
    expect(item.description).toBe("Merchandise");
    expect("tariff_number" in item).toBe(false);
  });

  it("the declaration names what the parcel holds, but a parcel of books keeps \"Printed books\"", () => {
    const books = { b: { customsDescription: "Poetry" }, s: { kind: "clothing" }, h: { kind: "shoes" } };
    const mixed = order(line("b"), line("s"), line("h"));
    expect(parcelContents(customsItems(mixed, books, "CA"), mixed, books)).toBe("Poetry, Clothing, Footwear");
    expect(customsDeclaration(["i"], mixed, "Press", "CA", "Clothing, Footwear").contents_explanation).toBe("Clothing, Footwear");
    const onlyBooks = order(line("b"));
    expect(parcelContents(customsItems(onlyBooks, books, "CA"), onlyBooks, books)).toBe("");
    expect(customsDeclaration(["i"], onlyBooks, "Press", "CA", "").contents_explanation).toBe(DEFAULT_DESCRIPTION);
  });
});
