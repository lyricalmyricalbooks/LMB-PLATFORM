import { describe, expect, it } from "vitest";
import { draftsWord, filledRows, rowProblems, rowProduct, type SeveralRow } from "./addSeveral";
import { typeById } from "../../shared/productTypes";

const row = (key: string, r: Partial<SeveralRow>): SeveralRow => ({ key, name: "", typeId: "", price: "", stock: "", ...r });

describe("Add several at once", () => {
  it("copies a blank type, price and stock from the row above, never the name", () => {
    const rows = [row("a", { name: "Fig candle", typeId: "candles", price: "22", stock: "6" }), row("b", { name: "Cedar candle" }), row("c", {}), row("d", { name: "Big candle", price: "30" })];
    expect(filledRows(rows).map((r) => [r.key, r.name, r.typeId, r.price, r.stock])).toEqual([
      ["a", "Fig candle", "candles", "22", "6"], ["b", "Cedar candle", "candles", "22", "6"], ["d", "Big candle", "candles", "30", "6"],
    ]);
  });
  it("checks every row before saving", () => {
    const rows = [row("a", { price: "22" }), row("b", { name: "Mug", typeId: "nope", price: "-1", stock: "1.5" }), row("c", {})];
    expect(rowProblems(rows)).toEqual({
      a: ["Add a name", "Pick a type"],
      b: ["Pick a type", "Price must be a number, 0 or more", "Stock must be a whole number, 0 or more"],
    });
    expect(rowProblems([row("a", { name: "Mug", typeId: "ceramics" })])).toEqual({});
  });
  it("makes a draft with what its type starts with", () => {
    const p = rowProduct(row("a", { name: " Fig candle ", typeId: "candles", price: "22.499", stock: "6" }), typeById("candles")!);
    expect(p).toMatchObject({ title: "Fig candle", typeId: "candles", retailPrice: 22.5, stockLevel: 6, status: "draft", format: "", trackInventory: true });
    expect(rowProduct(row("b", { name: "Poems", typeId: "printed-books" }), typeById("printed-books")!)).toMatchObject({ format: "Paperback", retailPrice: 0 });
    expect(draftsWord(1)).toBe("1 draft");
  });
});
