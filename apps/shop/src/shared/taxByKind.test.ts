import { describe, expect, it } from "vitest";
import { ratesForKind, ratesUseKinds, taxPartsByKind } from "./taxByKind";

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
