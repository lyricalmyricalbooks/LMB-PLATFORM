import { describe, expect, it } from "vitest";
import { orderLineNotes, componentsSummary } from "./orderLineNotes";
import { getCopy } from "./storeCopy";
import { lineIsDigital } from "./digitalLine";

const copy = (key: string, vars?: Record<string, string | number>) => getCopy({}, key, vars);

describe("orderLineNotes", () => {
  it("describes gift cards, free gifts, extras and box sets from Text & labels", () => {
    expect(orderLineNotes({ giftCard: true, giftCardDetails: { recipientEmail: "ana@example.com" } }, copy, "track")).toEqual(["Gift card for ana@example.com"]);
    expect(orderLineNotes({ giftCard: true, giftCardDetails: { recipientEmail: "" } }, copy, "account")).toEqual(["Gift card · emailed to you"]);
    expect(orderLineNotes({ promoGift: true }, copy, "track")).toEqual(["Free gift"]);
    expect(orderLineNotes({ addOns: [{ id: "s", label: "Signed", price: 5 }, { id: "n", label: "Inscription", price: 2, text: "For Ana" }] }, copy, "track")).toEqual(["+ Signed", "+ Inscription “For Ana”"]);
    expect(orderLineNotes({ components: [{ id: "a", title: "Night", quantity: 2 }, { id: "b", title: "Day", variantName: "Hardcover", quantity: 1 }] }, copy, "account")).toEqual(["Includes 2 × Night, 1 × Day (Hardcover)"]);
    expect(orderLineNotes({ title: "Plain" }, copy, "track")).toEqual([]);
    expect(componentsSummary(undefined as any)).toBe("");
  });
  it("respects owner wording", () => {
    const design = { copy: { trackFreeGift: "On us" } };
    expect(orderLineNotes({ promoGift: true }, (k, v) => getCopy(design, k, v), "track")).toEqual(["On us"]);
  });
  it("never offers a download for a gift card", () => {
    const book = { digitalFileName: "x.epub", productType: "giftCard" };
    expect(lineIsDigital({ giftCard: true, digital: true }, { digitalFileName: "x.epub" })).toBe(false);
    expect(lineIsDigital({ digital: true }, book)).toBe(false);
    expect(lineIsDigital({ digital: true }, { digitalFileName: "x.epub" })).toBe(true);
  });
});
