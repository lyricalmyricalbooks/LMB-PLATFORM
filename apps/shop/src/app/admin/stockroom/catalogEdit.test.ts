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

import { withNewItem } from "./catalogEdit";
describe("add an item", () => {
  it("adds one with a free id and the old defaults", () => {
    const f = { title: "Moths", author: "", maxPrint: "", listPrice: "15", threshold: "", productionCost: "" };
    expect(() => withNewItem(f, "CAD")(structuredClone(catalog))).toThrow("already has");
    const next = withNewItem({ ...f, title: "Moths II" }, "CAD")(structuredClone(catalog)) as any;
    expect(next["moths-ii"]).toMatchObject({ id: "moths-ii", title: "Moths II", maxPrint: 100, listPrice: 15, threshold: 10, currency: "CAD" });
  });
});
