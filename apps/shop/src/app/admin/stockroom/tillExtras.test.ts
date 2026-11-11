import { describe, expect, it } from "vitest";
import { tillItems } from "./till";
import { tillOnlyItems } from "./stockroomData";
import { extraId, withExtra, withExtraSale, withoutExtra } from "./tillExtras";

const catalog = { zine: { id: "zine", title: "Zine", listPrice: 10 }, _posExtra: {} as Record<string, unknown> };

describe("till-only items", () => {
  it("adds one with the old register's shape and an id that never clashes", () => {
    const next = withExtra({ title: "Friend's Book", author: "A", price: "15", currency: "CAD" })(catalog) as any;
    expect(next._posExtra["pos-friend-s-book"]).toMatchObject({ title: "Friend's Book", listPrice: 15, posOnly: true, sold: 0, revenue: 0, maxPrint: 999999 });
    expect(extraId("Friend's Book", next)).toBe("pos-friend-s-book-2");
    expect(next.zine).toEqual(catalog.zine);
  });
  it("refuses a blank name or no price", () => {
    expect(() => withExtra({ title: " ", author: "", price: "5", currency: "CAD" })(catalog)).toThrow();
    expect(() => withExtra({ title: "X", author: "", price: "0", currency: "CAD" })(catalog)).toThrow();
  });
  it("tallies a sale once, even when sent twice", () => {
    const one = withExtra({ title: "Tote", author: "", price: "20", currency: "CAD" })(catalog);
    const sold = withExtraSale("pos-tote", "evt-1", 2, 20)(one);
    const again = withExtraSale("pos-tote", "evt-1", 2, 20)(sold) as any;
    expect(again._posExtra["pos-tote"]).toMatchObject({ sold: 2, revenue: 40 });
  });
  it("keeps the tally when changed, and removes cleanly", () => {
    const sold = withExtraSale("pos-tote", "evt-1", 1, 20)(withExtra({ title: "Tote", author: "", price: "20", currency: "CAD" })(catalog));
    const changed = withExtra({ title: "Tote bag", author: "", price: "22", currency: "CAD" }, "pos-tote")(sold) as any;
    expect(changed._posExtra["pos-tote"]).toMatchObject({ title: "Tote bag", listPrice: 22, sold: 1, revenue: 20 });
    expect((withoutExtra("pos-tote")(changed) as any)._posExtra).toEqual({});
  });
  it("shows on the till after the catalogue, with no stock count", () => {
    const stored = withExtra({ title: "Tote", author: "", price: "20", currency: "CAD" })(catalog);
    const items = tillItems({ books: [{ id: "zine", title: "Zine", listPrice: 10 } as any], states: { zine: { stock: 4 } }, taxCenter: null, extras: tillOnlyItems(stored) });
    expect(items.map((i) => [i.id, i.onHand, !!i.extra])).toEqual([["zine", 4, false], ["pos-tote", null, true]]);
  });
});
