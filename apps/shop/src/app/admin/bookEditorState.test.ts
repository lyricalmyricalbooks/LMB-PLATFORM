import { describe, expect, it } from "vitest";
import { editorDirty, fillEmpty, isbnWarning, joinWeight, needsPublishReview, parseGoogleBooks, parseOpenLibrary, slugClash, splitWeight, withMetricWeights } from "./bookEditorState";
import { parseWeightGrams } from "../features/site/shippingEngine";

describe("book editor dirty check", () => {
  it("opening a book is not an edit, even after reference prices, edition totals and the default profile fill in", () => {
    const loaded = { title: "A", retailPrice: 20, usdPrice: 0, shippingProfileId: "", variants: [{ id: "v", price: 10, stock: 2 }], stockLevel: 0 };
    const normalised = { ...loaded, usdPrice: 14.6, eurPrice: 13.4, shippingProfileId: "general-profile", stockLevel: 2, variants: [{ id: "v", price: 10, stock: 2, usdPrice: 7.3, eurPrice: 6.7 }] };
    expect(editorDirty(normalised, loaded, { defaultProfileId: "general-profile" })).toBe(false);
    expect(editorDirty({ ...normalised, retailPrice: 21 }, loaded, { defaultProfileId: "general-profile" })).toBe(true);
    expect(editorDirty(loaded, loaded, { extraDirty: true })).toBe(true);
  });
});

describe("publish review", () => {
  const good = { title: "A", status: "published", retailPrice: 10, description: "x" };
  it("opens when publishing, or when a published book gains a new problem", () => {
    expect(needsPublishReview(good, { ...good, status: "draft" })).toBe(true);
    expect(needsPublishReview({ ...good, description: "y" }, good)).toBe(false);
    expect(needsPublishReview({ ...good, description: "" }, good)).toBe(true);
    expect(needsPublishReview({ ...good, status: "draft" }, good)).toBe(false);
  });
});

describe("small editor helpers", () => {
  it("checks ISBN check digits as a warning", () => {
    expect(isbnWarning("978-0-306-40615-7")).toBe("");
    expect(isbnWarning("978-0-306-40615-8")).toMatch(/check digit/);
    expect(isbnWarning("123")).toMatch(/10 or 13/);
  });
  it("round-trips weights in the format shipping reads", () => {
    expect(splitWeight("0.5 kg")).toEqual({ amount: "0.5", unit: "kg" });
    expect(splitWeight("450")).toEqual({ amount: "450", unit: "g" });
    expect(splitWeight("about a pound").unreadable).toBe("about a pound");
    expect(parseWeightGrams(joinWeight("2", "kg"))).toBe(2000);
    // Older imperial values open in grams and are saved that way.
    expect(splitWeight("1 lb")).toEqual({ amount: "454", unit: "g" });
    expect(splitWeight("8 oz")).toEqual({ amount: "227", unit: "g" });
    const book = { weight: "1 lb", variants: [{ id: "a", weight: "8 oz" }, { id: "b", weight: "300 g" }] };
    expect(withMetricWeights(book)).toEqual({ weight: "454 g", variants: [{ id: "a", weight: "227 g" }, { id: "b", weight: "300 g" }] });
    const metric = { weight: "450 g", variants: [{ id: "b", weight: "300 g" }] };
    expect(withMetricWeights(metric)).toBe(metric);
    expect(joinWeight("", "g")).toBe("");
  });
  it("flags a slug another book uses", () => {
    expect(slugClash("a", "1", [{ id: "2", slug: "a", title: "Other" }])).toMatch(/Other/);
    expect(slugClash("a", "2", [{ id: "2", slug: "a" }])).toBe("");
  });
  it("fills only empty fields from ISBN data", () => {
    const facts = parseOpenLibrary({ "ISBN:1": { title: "T", authors: [{ name: "Ann" }], number_of_pages: 200, publishers: [{ name: "P" }], publish_date: "May 3, 2001", cover: { large: "https://c" } } }, "1")!;
    expect(facts).toMatchObject({ contributors: "Ann", publishDate: "2001-05-03", coverUrl: "https://c" });
    const { patch, filled } = fillEmpty({ title: "Mine", pageCount: 0 }, facts);
    expect(patch).toEqual({ subtitle: "Ann", pageCount: 200, publisher: "P", publishDate: "2001-05-03" });
    expect(filled).not.toContain("title");
    expect(parseGoogleBooks({ items: [{ volumeInfo: { title: "G", authors: ["B"], publishedDate: "2001" } }] })).toMatchObject({ title: "G", contributors: "B", publishDate: undefined });
  });
});
