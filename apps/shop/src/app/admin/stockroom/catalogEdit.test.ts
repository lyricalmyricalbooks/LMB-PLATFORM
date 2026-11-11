import { describe, expect, it } from "vitest";
import { detailsFormOf, withDetails } from "./catalogEdit";

const catalog = { b1: { id: "b1", title: "Moths", author: "A", maxPrint: 100, listPrice: 20, threshold: 5, productionCost: 900, profitTiers: [1] }, b2: { id: "b2", title: "Ferns" } };
describe("edit details", () => {
  it("changes only the form's fields and keeps the rest", () => {
    const f = { ...detailsFormOf(catalog.b1), maxPrint: "150", productionCost: "1200", threshold: "" };
    const next = withDetails("b1", f)(structuredClone(catalog)) as any;
    expect(next.b1).toMatchObject({ maxPrint: 150, productionCost: 1200, threshold: 10, listPrice: 20, profitTiers: [1] });
    expect(next.b2).toEqual(catalog.b2);
  });
  it("refuses a title another item has", () => {
    expect(() => withDetails("b1", { ...detailsFormOf(catalog.b1), title: "ferns" })(structuredClone(catalog))).toThrow("already has");
  });
});
