import { describe, expect, it } from "vitest";
import { offerChange, offerProblem, offerStart, offerSummary, type OfferAnswers } from "./offerStage";
import { leadSideOf, shopKindOf } from "./servicesSetup";
import { sellsBooks } from "../../shared/shopSells";

const label = (id: string) => ({ hair: "Hair and beauty" } as Record<string, string>)[id] ?? "Services";

describe("the shop's kind (shop types plan)", () => {
  it("reads products, services or both from the saved answers", () => {
    expect(shopKindOf(null)).toBe("products");
    expect(shopKindOf({ publishes: "books" })).toBe("products");
    expect(shopKindOf({ publishes: "other", sellsProducts: true })).toBe("products");
    expect(shopKindOf({ publishes: "hair" })).toBe("services");
    expect(shopKindOf({ publishes: "hair", sellsProducts: true })).toBe("both");
    expect(shopKindOf({ publishes: "other", sells: "lessons", sellsProducts: true })).toBe("both");
  });

  it("leads with bookings unless the shop said products", () => {
    expect(leadSideOf({})).toBe("services");
    expect(leadSideOf({ leadSide: "products" })).toBe("products");
    expect(leadSideOf({ leadSide: "junk" })).toBe("services");
  });
});

const base: Pick<OfferAnswers, "other" | "otherText" | "serviceText"> = { other: false, otherText: "", serviceText: "" };

describe("What you offer (Get started, step 1)", () => {
  it("starts a new product shop with nothing picked and the book tools off", () => {
    expect(offerStart({ publishes: "other" })).toMatchObject({ kind: "products", groups: [], books: false, does: "" });
    expect(offerStart({ publishes: "zines", productGroups: ["books"] })).toMatchObject({ books: true, groups: ["books"] });
    expect(offerStart({ publishes: "hair", sellsProducts: true, leadSide: "products" })).toMatchObject({ kind: "both", does: "hair", lead: "products", ...base });
  });

  it("asks for what is missing in plain words", () => {
    expect(offerProblem({ kind: "products", groups: [], books: false, does: "", lead: "services", ...base })).toBe("Pick at least one kind of thing you sell.");
    expect(offerProblem({ kind: "products", groups: [], books: true, does: "", lead: "services", ...base })).toBe("");
    expect(offerProblem({ kind: "services", groups: [], books: false, does: "", lead: "services", ...base })).toBe("Pick what people book.");
    expect(offerProblem({ kind: "both", groups: [], books: false, does: "hair", lead: "services", ...base })).toBe("Pick at least one kind of thing you sell.");
    expect(offerProblem({ kind: "both", groups: ["beauty"], books: false, does: "hair", lead: "services", ...base })).toBe("");
  });

  it("turns the book tools on only for a shop that said books", () => {
    const books = offerChange({ kind: "products", groups: ["art"], books: true, does: "", lead: "services", ...base }, { publishes: "other" }, "t");
    expect(books).toEqual({ sells: "books", productGroups: ["art", "books"], offer: { at: "t" } });
    expect(sellsBooks(books.sells)).toBe(true);
    // A zine shop keeps its own book answer.
    expect(offerChange({ kind: "products", groups: [], books: true, does: "", lead: "services", ...base }, { publishes: "zines" }, "t").sells).toBe("zines");
    // Clothing and candles: no book tools, the first kind gives the words.
    const goods = offerChange({ kind: "products", groups: ["home", "clothing"], books: false, does: "", lead: "services", ...base }, { publishes: "books" }, "t");
    expect(goods).toEqual({ sells: "clothing", productGroups: ["clothing", "home"], offer: { at: "t" } });
    expect(sellsBooks(goods.sells)).toBe(false);
    expect(offerChange({ kind: "products", groups: ["food"], books: false, does: "", lead: "services", ...base }, null, "t").sells).toBe("other");
  });

  it("saves what people book, and for Both its lead side and what it sells", () => {
    expect(offerChange({ kind: "services", groups: [], books: false, does: "wellness", lead: "services", ...base }, { publishes: "hair" }, "t"))
      .toEqual({ sells: "wellness", offer: { at: "t" } });
    expect(offerChange({ kind: "both", groups: ["beauty"], books: false, does: "hair", lead: "products", ...base }, { publishes: "hair", sellsProducts: true }, "t"))
      .toEqual({ sells: "hair", leadSide: "products", productGroups: ["beauty"], offer: { at: "t" } });
  });

  it("sums the answer up for the list on Home", () => {
    expect(offerSummary({ sells: "books" }, label)).toBe("A product shop selling books, with the book tools on.");
    expect(offerSummary({ sells: "clothing" }, label)).toBe("A product shop.");
    expect(offerSummary({ sells: "hair" }, label)).toBe("Hair and beauty.");
    expect(offerSummary({ sells: "hair", sellsProducts: true }, label)).toBe("Hair and beauty, with products too.");
  });

  it("always offers Something else, with the owner's own words (Julian, 26 November 2026)", () => {
    const goods = { kind: "products" as const, groups: [], books: false, does: "", lead: "services" as const, ...base };
    expect(offerProblem({ ...goods, other: true })).toBe("Tell us what else you sell.");
    expect(offerProblem({ ...goods, other: true, otherText: "  Surfboards " })).toBe("");
    expect(offerChange({ ...goods, other: true, otherText: "  Surfboards " }, { publishes: "other" }, "t"))
      .toEqual({ sells: "other", productGroups: [], otherSells: "Surfboards", offer: { at: "t" } });
    const care = { kind: "services" as const, groups: [], books: false, does: "services", lead: "services" as const, ...base };
    expect(offerProblem(care)).toBe("Tell us what people book.");
    expect(offerChange({ ...care, serviceText: "Dog grooming" }, { publishes: "services" }, "t"))
      .toEqual({ sells: "services", otherService: "Dog grooming", offer: { at: "t" } });
    // Unpicking it clears words saved before; words longer than the limit are cut.
    expect(offerChange({ ...goods, groups: ["art"] }, { otherSells: "Kites" }, "t").otherSells).toBe("");
    expect(offerStart({ publishes: "other", otherSells: "Kites" })).toMatchObject({ other: true, otherText: "Kites" });
    expect(offerChange({ ...goods, other: true, otherText: "x".repeat(200) }, null, "t").otherSells).toHaveLength(80);
  });
});
