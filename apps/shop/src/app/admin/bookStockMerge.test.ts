import { describe, expect, it } from "vitest";
import { keepLiveStock, lockLinkedStock } from "./bookStockMerge";

describe("keepLiveStock", () => {
  it("keeps the live stock when the owner didn't touch it (a sale happened meanwhile)", () => {
    const initial = { title: "A", stockLevel: 5, variants: [{ id: "p", stock: 3, stockLevel: 3 }] };
    const form = { title: "A fixed", stockLevel: 5, variants: [{ id: "p", stock: 3, stockLevel: 3, name: "PB" }] };
    const live = { stockLevel: 4, variants: [{ id: "p", stock: 2, stockLevel: 2 }] };
    const out = keepLiveStock(form, initial, live);
    expect(out.title).toBe("A fixed");
    expect(out.stockLevel).toBe(4);
    expect(out.variants[0]).toMatchObject({ name: "PB", stock: 2, stockLevel: 2 });
  });
  it("saves stock the owner changed, and new editions as typed", () => {
    const initial = { stockLevel: 5, variants: [{ id: "p", stock: 3 }] };
    const form = { stockLevel: 10, variants: [{ id: "p", stock: 8 }, { id: "n", stock: 1 }] };
    const live = { stockLevel: 4, variants: [{ id: "p", stock: 2 }] };
    const out = keepLiveStock(form, initial, live);
    expect(out.stockLevel).toBe(10);
    expect(out.variants[0].stock).toBe(8);
    expect(out.variants[1].stock).toBe(1);
  });
  it("treats '5' and 5 as unchanged", () => {
    expect(keepLiveStock({ stockLevel: "5" }, { stockLevel: 5 }, { stockLevel: 3 }).stockLevel).toBe(3);
  });
});

describe("lockLinkedStock (books counted in the inventory app)", () => {
  const links = { b1: { _: "hound" }, b2: { pb: "alt-pb" } };
  it("keeps the live count of a linked book, whatever the form typed", () => {
    expect(lockLinkedStock({ stockLevel: 99, title: "New" }, { stockLevel: 4 }, links, "b1")).toEqual({ stockLevel: 4, title: "New" });
    expect(lockLinkedStock({ stockLevel: 99 }, { stockLevel: 4 }, links, "other")).toEqual({ stockLevel: 99 });
  });
  it("keeps only the linked editions' live counts and re-adds the book's total", () => {
    const live = { variants: [{ id: "pb", stockLevel: 3, stock: 3 }, { id: "hc", stockLevel: 1, stock: 1 }] };
    const form = { variants: [{ id: "pb", stockLevel: 50, stock: 50, name: "PB" }, { id: "hc", stockLevel: 6, stock: 6 }], stockLevel: 56 };
    expect(lockLinkedStock(form, live, links, "b2")).toEqual({
      variants: [{ id: "pb", stockLevel: 3, stock: 3, name: "PB" }, { id: "hc", stockLevel: 6, stock: 6 }], stockLevel: 9,
    });
  });
  it("nothing linked: unchanged", () => {
    const changes = { stockLevel: 5 };
    expect(lockLinkedStock(changes, { stockLevel: 1 }, null, "b1")).toBe(changes);
  });
});
