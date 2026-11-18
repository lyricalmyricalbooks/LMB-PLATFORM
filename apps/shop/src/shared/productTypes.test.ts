import { describe, expect, it } from "vitest";
import { PRODUCT_KINDS } from "./productOptions";
import { SIZE_SETS, orderSizes, sizeSet } from "./productSizes";
import { PRODUCT_TYPES, TYPE_GROUPS, lawFacts, productGroup, searchTypes, sellsGroups, sizeListsFor, typeOfProduct, typeStart, shopGroups, typeById, cleanOwnTypes, searchOwnTypes, namesAType } from "./productTypes";

describe("product types", () => {
  it("has about 100 types in 16 groups, every group used", () => {
    expect(TYPE_GROUPS).toHaveLength(16);
    expect(PRODUCT_TYPES.length).toBeGreaterThanOrEqual(95);
    for (const g of TYPE_GROUPS) expect(PRODUCT_TYPES.some((t) => t.group === g.id)).toBe(true);
  });

  it("gives every type a unique id, a known kind and known size lists", () => {
    expect(new Set(PRODUCT_TYPES.map((t) => t.id)).size).toBe(PRODUCT_TYPES.length);
    for (const t of PRODUCT_TYPES) {
      expect(PRODUCT_KINDS).toContain(t.kind);
      for (const s of t.sizes) expect(sizeSet(s), `${t.id} size list ${s}`).not.toBeNull();
      expect(new Set(t.facts.map((f) => f.key)).size, `${t.id} repeats a fact`).toBe(t.facts.length);
    }
  });

  it("keeps every one of today's kinds reachable", () => {
    for (const kind of PRODUCT_KINDS) expect(PRODUCT_TYPES.some((t) => t.kind === kind), kind).toBe(true);
  });

  it("reads a product saved before types by its kind", () => {
    expect(typeOfProduct({})?.id).toBe("printed-books");
    expect(typeOfProduct({ kind: "ebook" })?.id).toBe("ebooks");
    expect(typeOfProduct({ kind: "clothing" })).toBeNull();
    expect(productGroup({ kind: "clothing" })).toBe("clothing");
    expect(productGroup({ kind: "other" })).toBeNull();
    expect(typeOfProduct({ kind: "other", typeId: "candles" })?.name).toBe("Candles");
    expect(typeOfProduct({ typeId: "nope", kind: "art" })).toBeNull();
  });

  it("finds a type from everyday words", () => {
    const top = (q: string) => searchTypes(q)[0]?.type.id;
    expect(top("cand")).toBe("candles");
    expect(top("mug")).toBe("ceramics");
    expect(top("Earrings")).toBe("earrings");
    expect(top("tote")).toBe("bags");
    expect(top("t-shirt")).toBe("tops");
    expect(top("hoodies")).toBe("knits");
    expect(top("riso")).toBe("prints");
    expect(top("crème")).toBeUndefined();
    expect(searchTypes("  ")).toEqual([]);
  });

  it("puts the shop's own groups first in a tie", () => {
    const plain = searchTypes("toys").map((m) => m.type.id);
    const pets = searchTypes("toys", { groups: ["pets"] }).map((m) => m.type.id);
    expect(plain[0]).toBe("toys");
    expect(pets[0]).toBe("pet-toys");
  });

  it("marks the facts the law requires", () => {
    expect(lawFacts(typeById("skincare")).map((f) => f.key)).toContain("ingredients");
    expect(lawFacts(typeById("coffee")).map((f) => f.key)).toEqual(expect.arrayContaining(["bestBefore"]));
    expect(lawFacts(typeById("tops"))).toEqual([]);
    expect(typeById("candles")?.traits.safety).toMatch(/unattended/);
  });

  it("offers each type's size lists in order", () => {
    expect(sizeListsFor(typeById("rings")).map((s) => s.option)).toEqual(["Ring size"]);
    expect(sizeListsFor(typeById("shoes"))[0].id).toBe("shoes-na");
    expect(sizeListsFor(null)).toEqual([]);
  });

  it("treats a gift card as the Gift cards type", () => {
    expect(typeOfProduct({ productType: "giftCard" })?.id).toBe("gift-cards");
  });

  it("starts a product with its type and kind, a printed book with no kind", () => {
    expect(typeStart(typeById("candles")!)).toEqual({ typeId: "candles", kind: "other", format: "", googleCategory: typeById("candles")!.google });
    expect(typeStart(typeById("zines")!)).toEqual({ typeId: "zines" });
  });

  it("points each sign-up answer at its groups", () => {
    expect(sellsGroups(null)[0]).toBe("books");
    expect(sellsGroups("clothing")[0]).toBe("clothing");
    expect(sellsGroups("other")).toEqual([]);
  });

  it("reads the sign-up groups, all groups when none were picked", () => {
    expect(shopGroups(["home", "home", "nope"])).toEqual(["home"]);
    expect(shopGroups(undefined)).toHaveLength(16);
  });
});

describe("size lists", () => {
  it("has unique ids and no repeated sizes", () => {
    expect(new Set(SIZE_SETS.map((s) => s.id)).size).toBe(SIZE_SETS.length);
    for (const s of SIZE_SETS) {
      expect(new Set(s.values).size, s.id).toBe(s.values.length);
      for (const c of s.common ?? []) expect(s.values, s.id).toContain(c);
    }
  });

  it("orders picked sizes smallest first, own sizes last", () => {
    expect(orderSizes("letters", ["XL", "s", "M", "Tall", "xl"])).toEqual(["s", "M", "XL", "Tall"]);
    expect(sizeSet("rings")?.values.slice(0, 3)).toEqual(["4", "4.5", "5"]);
    expect(orderSizes("nope", ["B", "A"])).toEqual(["B", "A"]);
  });
});

describe("the shop's own types", () => {
  it("keeps tidy names on known types, once each", () => {
    const own = cleanOwnTypes([
      { name: "  Tote   bags ", base: PRODUCT_TYPES.find((t) => t.group === "bags")!.id },
      { name: "tote bags", base: "candles" },
      { name: "Mystery", base: "not-a-type" },
      { name: "", base: "candles" },
      "junk",
    ]);
    expect(own).toHaveLength(1);
    expect(own[0].name).toBe("Tote bags");
    expect(own[0].id).toBe("own-tote-bags");
    expect(cleanOwnTypes(null)).toEqual([]);
  });

  it("keeps names in any script, and still spots them twice", () => {
    const own = cleanOwnTypes([{ name: "ろうそく", base: "candles" }, { name: "Свечи", base: "candles" }, { name: "свечи", base: "candles" }]);
    expect(own.map((t) => t.name)).toEqual(["ろうそく", "Свечи"]);
    expect(own[0].id).toBe("own-ろうそく");
    expect(searchOwnTypes("свеч", own).map((t) => t.name)).toEqual(["Свечи"]);
  });

  it("finds own types from the owner's words and spots names we already list", () => {
    const own = [{ id: "own-tote-bags", name: "Tote bags", base: "candles" }];
    expect(searchOwnTypes("tote", own).map((t) => t.name)).toEqual(["Tote bags"]);
    expect(searchOwnTypes("mug", own)).toEqual([]);
    expect(namesAType("Candles")).toBe(true);
    expect(namesAType("candle")).toBe(true);
    expect(namesAType("tote bag", own)).toBe(true);
    expect(namesAType("Beeswax wraps")).toBe(false);
  });

  it("starts a product of an own type with the base type and the owner's name", () => {
    const candles = typeById("candles")!;
    expect(typeStart(candles, { id: "own-pillar-candles", name: "Pillar candles", base: "candles" })).toMatchObject({ typeId: "candles", typeName: "Pillar candles" });
    expect(typeStart(candles)).not.toHaveProperty("typeName");
  });
});
