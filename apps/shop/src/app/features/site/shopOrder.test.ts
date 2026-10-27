import { describe, expect, it } from "vitest";
import { compareShopOrder, inShopOrder, moveId, shopOrderWrites } from "./shopOrder";

describe("shop order", () => {
  it("keeps the old order when nothing is arranged", () => {
    const books = [{ id: "a" }, { id: "b" }];
    expect(inShopOrder(books)).toBe(books);
  });
  it("puts arranged books first, in order, and keeps the rest stable", () => {
    const books = [{ id: "a" }, { id: "b", sortOrder: 20 }, { id: "c" }, { id: "d", sortOrder: 10 }];
    expect(inShopOrder(books).map((b) => b.id)).toEqual(["d", "b", "a", "c"]);
    expect(compareShopOrder({ sortOrder: "x" }, { sortOrder: 1 })).toBe(1);
  });
  it("moves ids and writes only changed numbers", () => {
    expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    const books = [{ id: "a", sortOrder: 10 }, { id: "b", sortOrder: 20 }, { id: "c" }];
    expect(shopOrderWrites(["a", "c", "b"], books)).toEqual([{ id: "c", sortOrder: 20 }, { id: "b", sortOrder: 30 }]);
  });
});
