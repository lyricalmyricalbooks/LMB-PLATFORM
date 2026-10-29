import { describe, expect, it } from "vitest";
import { lineSheetHtml, lineSheetRows } from "./lineSheet";
import { PRIVATE_BOOK_KEYS, splitBookPrivate } from "./bookPrivate";

const tee = { id: "t1", title: "Moth tee", authorName: "Moth Press", sku: "TEE-1", retailPrice: 40, wholesalePrice: 20, photos: [{ url: "https://x/t.jpg" }], variants: [{ id: "s", name: "S", price: 40 }, { id: "xl", name: "XL", price: 44 }] };

describe("line sheet", () => {
  it("lists products with a wholesale price and leaves the others out by name", () => {
    const { rows, skipped } = lineSheetRows([tee, { id: "b", title: "No price here", retailPrice: 12 }, { id: "c", title: "Free", retailPrice: 0, wholesalePrice: 5 }]);
    expect(rows.map(r => r.id)).toEqual(["t1"]);
    expect(skipped).toEqual(["No price here", "Free"]);
  });
  it("gives each edition the product's wholesale share of its own retail price", () => {
    const [row] = lineSheetRows([tee]).rows;
    expect(row.editions).toEqual([{ name: "S", retail: 40, wholesale: 20 }, { name: "XL", retail: 44, wholesale: 22 }]);
  });
  it("prints the shop, prices and codes, and escapes what it prints", () => {
    const html = lineSheetHtml(lineSheetRows([{ ...tee, title: "<b>Tee</b>" }]).rows, { name: "Moth & Co", terms: "Net 30." });
    expect(html).toContain("Moth &amp; Co");
    expect(html).toContain("&lt;b&gt;Tee&lt;/b&gt;");
    expect(html).toContain("TEE-1");
    expect(html).toContain("Net 30.");
    expect(html).not.toContain("<b>Tee</b>");
  });
  it("keeps the wholesale price off the public product record", () => {
    expect(PRIVATE_BOOK_KEYS).toContain("wholesalePrice");
    const { pub, priv } = splitBookPrivate(tee);
    expect(pub).not.toHaveProperty("wholesalePrice");
    expect(priv.wholesalePrice).toBe(20);
  });
});
