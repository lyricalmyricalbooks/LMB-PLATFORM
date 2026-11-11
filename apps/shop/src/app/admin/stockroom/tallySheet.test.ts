import { describe, expect, it } from "vitest";
import { tallySheetHtml, tallySizes } from "./tallySheet";

const base = { event: "Zine <Fair>", date: "2026-11-14", cols: 12, notes: false, currencySymbol: "$", heading: "Book Sales Tracker", titleHeading: "Book title",
  rows: [{ title: "Moths", author: "A. Writer", qty: 5 }, { title: "Ferns", author: "", qty: 0 }] };

describe("tally sheet", () => {
  it("prints a row per title with the asked number of boxes and the packed count", () => {
    const html = tallySheetHtml(base);
    expect(html.match(/<td class="tally">/g)).toHaveLength(24);
    expect(html).toContain("Packed: 5");
    expect(html).toContain("5 copies");
    expect(html).toContain("Zine &lt;Fair&gt;");
    expect(html).not.toContain("price-row\">");
  });
  it("adds the price row and keeps columns to 1–30, as the old sheet did", () => {
    const html = tallySheetHtml({ ...base, notes: true, cols: 99 });
    expect(html.match(/<th class="num">/g)).toHaveLength(30);
    expect(html.match(/<tr class="price-row">/g)).toHaveLength(2);
  });
  it("uses the old sheet's type sizes", () => {
    expect(tallySizes(1).titleFontSize).toBe("18pt");
    expect(tallySizes(8).titleFontSize).toBe("11.5pt");
    expect(tallySizes(20).thHeight).toBe(24);
  });
});
