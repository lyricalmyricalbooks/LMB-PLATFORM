import { describe, expect, it } from "vitest";
import { loadStPresets, saveStPresets, stPresetMissingBooks, upsertStPreset } from "@stockroom/sales-tracker-presets.js";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("saved packing lists on the tally sheet", () => {
  it("saves a list and reads it back, one per name", () => {
    const store = mem();
    let lists = saveStPresets(store, upsertStPreset([], { name: "Summer market", cols: 12, currencyCode: "CAD", includeNotes: true, bookIds: ["a", "b"], qtyBrought: { a: 10 }, customBooks: [], savedAt: "" }));
    lists = saveStPresets(store, upsertStPreset(lists, { name: "Summer market", cols: 8, currencyCode: "CAD", includeNotes: false, bookIds: ["a"], qtyBrought: { a: 4 }, customBooks: [], savedAt: "" }));
    const back = loadStPresets(store);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: "summer-market", cols: 8, bookIds: ["a"], qtyBrought: { a: 4 } });
  });
  it("names books a list remembers that left the stockroom", () => {
    const [list] = upsertStPreset([], { name: "X", cols: 10, currencyCode: "CAD", includeNotes: false, bookIds: ["a", "gone"], qtyBrought: {}, customBooks: [], savedAt: "" });
    expect(stPresetMissingBooks(list!, ["a"])).toEqual(["gone"]);
  });
});
