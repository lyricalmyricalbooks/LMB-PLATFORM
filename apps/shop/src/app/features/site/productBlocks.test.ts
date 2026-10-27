import { describe, expect, it } from "vitest";
import { addBlock, cardSections, DEFAULT_PRODUCT_BLOCKS, moveBlock, productBlocks, removeBlock, toggleBlock, updateBlock } from "./productBlocks";
import { resolveProductDesign } from "./surfaceDesign";

const types = (list: any[]) => list.map(b => b.type);

describe("product page blocks", () => {
  it("defaults to the card as it was hand-written: three parts", () => {
    expect(productBlocks({})).toBe(DEFAULT_PRODUCT_BLOCKS);
    expect(cardSections(DEFAULT_PRODUCT_BLOCKS).map(types)).toEqual([
      ["tag", "heading", "price"],
      ["formats", "boxSet", "addOns", "giftCard", "buy", "backInStock"],
      ["details"],
    ]);
  });
  it("cleans a saved list: unknown and duplicate blocks dropped, required ones kept and never hidden", () => {
    const list = productBlocks({ productInfoBlocks: [
      { id: "x", type: "nonsense" }, { id: "p", type: "price" }, { id: "p2", type: "price" },
      { id: "b", type: "buy", hidden: true }, { id: "t", type: "text", settings: { text: "Hi" } },
    ] });
    expect(list.find(b => b.type === "buy")?.hidden).toBeUndefined();
    expect(list.filter(b => b.type === "price")).toHaveLength(1);
    expect(list.some(b => b.type === ("nonsense" as any))).toBe(false);
    expect(list.find(b => b.type === "heading")?.hidden).toBeUndefined(); // required, re-added
    expect(list.find(b => b.type === "tag")?.hidden).toBe(true); // missing built-ins come back hidden
    expect(list.find(b => b.type === "text")?.settings).toEqual({ text: "Hi" });
  });
  it("collapses empty parts and skips hidden blocks", () => {
    const list = [{ id: "d0", type: "divider" }, { id: "h", type: "heading" }, { id: "d1", type: "divider" }, { id: "d2", type: "divider" }, { id: "t", type: "tag", hidden: true }, { id: "b", type: "buy" }] as any;
    expect(cardSections(list).map(types)).toEqual([["heading"], ["buy"]]);
  });
  it("edits: add, move, hide, update and remove (built-ins can only be hidden)", () => {
    let list = [...DEFAULT_PRODUCT_BLOCKS];
    const added = addBlock(list, "collapsible", 3);
    list = added.list;
    expect(list[3]).toMatchObject({ type: "collapsible", settings: { heading: "Shipping & returns" } });
    list = moveBlock(list, added.id, -1);
    expect(list[2].id).toBe(added.id);
    list = updateBlock(list, added.id, { heading: "Returns" });
    expect(list[2].settings?.heading).toBe("Returns");
    list = toggleBlock(list, "tag");
    expect(list.find(b => b.id === "tag")?.hidden).toBe(true);
    expect(toggleBlock(list, "buy").find(b => b.id === "buy")?.hidden).toBeUndefined();
    expect(removeBlock(list, "tag")).toEqual(list);
    expect(removeBlock(list, added.id).some(b => b.id === added.id)).toBe(false);
  });
  it("an alternate template follows the default's list until it has its own", () => {
    const own = [{ id: "b", type: "buy" }, { id: "h", type: "heading" }];
    const design = { alternateTemplates: { productPage: [{ id: "poetry", name: "Poetry" }] }, productPage: { productInfoBlocks: own }, "productPage~poetry": {} };
    expect(types(productBlocks(resolveProductDesign(design, "productPage~poetry"))).slice(0, 2)).toEqual(["buy", "heading"]);
    const altOwn = { ...design, "productPage~poetry": { productInfoBlocks: [{ id: "h", type: "heading" }, { id: "b", type: "buy" }] } };
    expect(types(productBlocks(resolveProductDesign(altOwn, "productPage~poetry"))).slice(0, 2)).toEqual(["heading", "buy"]);
  });
});
