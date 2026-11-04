import { describe, expect, it } from "vitest";
import { discountedLineValues, ratesForKind, ratesUseKinds, taxPartsByKind } from "./taxByKind";

const ca = { country: "Canada", rate: 13 };
const first = (rates: any[]) => rates[0] ?? null;

describe("tax by product kind", () => {
  it("charges one rate on everything when no rate lists kinds (shops that don't use it)", () => {
    const parts = taxPartsByKind([{ kind: "book", value: 20 }, { kind: "clothing", value: 30 }], 50, [ca], first);
    expect(parts).toEqual([{ rate: ca, amount: 6.5 }]);
    expect(ratesUseKinds([ca])).toBe(false);
  });
  it("taxes each kind at its own rate in a mixed bag, sharing the discount by value", () => {
    const rates = [ca, { country: "Canada", rate: 0, kinds: ["clothing"] }];
    const parts = taxPartsByKind([{ kind: "book", value: 20 }, { kind: "clothing", value: 30 }], 40, rates, first);
    expect(parts).toEqual([{ rate: ca, amount: 40 * (20 / 50) * 0.13 }, { rate: rates[1], amount: 0 }]);
  });
  it("puts a kind's own rate before the general ones", () => {
    const own = { country: "Canada", rate: 5, kinds: ["shoes"] };
    expect(ratesForKind([ca, own], "shoes")).toEqual([own, ca]);
    expect(ratesForKind([ca, own], "book")).toEqual([ca]);
  });
  it("keeps an empty bag or no amount on the plain path", () => {
    expect(taxPartsByKind([], 0, [ca, { country: "Canada", rate: 0, kinds: ["art"] }], first)).toEqual([{ rate: ca, amount: 0 }]);
  });
});

describe("a discount taxed on the lines it covers", () => {
  // Ontario: books 5% (a rate listing books), everything else 13%.
  const rates = [{ country: "Canada", region: "ON", rate: 5, kinds: ["book"] }, { country: "Canada", region: "ON", rate: 13 }];
  const lines = [{ id: "novel", price: 20, quantity: 1 }, { id: "tee", price: 20, quantity: 1 }];
  const kinds: Record<string, string> = { novel: "book", tee: "clothing", gift: "clothing" };
  const categories: Record<string, string[]> = { novel: ["books"], tee: ["merch"] };
  const taxOf = (bag: any[], discountAmount: number, discount: any) => {
    const values = discountedLineValues(bag, discountAmount, discount, (id) => categories[id] || []);
    const amount = bag.reduce((sum, line) => sum + line.price * line.quantity, 0) - discountAmount;
    return taxPartsByKind(bag.map((line, i) => ({ kind: kinds[line.id], value: values[i] })), amount, rates, first).reduce((sum, part) => sum + part.amount, 0);
  };
  it("a $20 code on the books category leaves the tee taxed in full", () => {
    expect(taxOf(lines, 20, { type: "fixed", appliesTo: "categories", selectedCategories: ["books"] })).toBeCloseTo(2.6, 6);
    expect(taxOf(lines, 20, { type: "fixed", appliesTo: "products", selectedProducts: ["tee"] })).toBeCloseTo(1, 6);
  });
  it("a discount on the whole order is still shared by value", () => {
    expect(discountedLineValues(lines, 10, { type: "percentage", appliesTo: "all" }, () => [])).toEqual([15, 15]);
    expect(taxOf(lines, 10, { type: "percentage", appliesTo: "all" })).toBeCloseTo(15 * 0.05 + 15 * 0.13, 6);
  });
  it("buy-one-get-one takes the cheapest covered unit off, and a free gift its own line", () => {
    const bag = [{ id: "novel", price: 30, quantity: 1 }, { id: "tee", price: 20, quantity: 1 }];
    expect(discountedLineValues(bag, 20, { type: "bogo", buyQuantity: 1, getQuantity: 1 }, () => [])).toEqual([30, 0]);
    const withGift = [...lines, { id: "gift", price: 15, quantity: 1, promoGift: true }];
    expect(discountedLineValues(withGift, 15, { type: "gift" }, () => [])).toEqual([20, 20, 0]);
  });
  it("leaves every line whole without a discount", () => {
    expect(discountedLineValues(lines, 0, null, () => [])).toEqual([20, 20]);
  });
});
