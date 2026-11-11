import { describe, expect, it } from "vitest";
import { deriveStockBreakdown } from "@stockroom/inventory.js";
import { moveAuthorCopies } from "./authorCopies";

const book = { id: "b1", maxPrint: 50 };
describe("copies with the author", () => {
  it("hands copies over and takes some back, as the old app", () => {
    const s: Record<string, any> = { hist: [] };
    moveAuthorCopies(book, 10, "launch")(s);
    expect(deriveStockBreakdown(s as any, book as any)).toMatchObject({ authorHeld: 10, publisherOnHand: 40 });
    moveAuthorCopies(book, -4)(s);
    expect(deriveStockBreakdown(s as any, book as any)).toMatchObject({ authorHeld: 6, publisherOnHand: 44 });
    expect(s.stockTransfers.map((t: any) => t.direction)).toEqual(["to_author", "from_author"]);
  });
  it("refuses zero", () => expect(() => moveAuthorCopies(book, 0)({})).toThrow());
});
