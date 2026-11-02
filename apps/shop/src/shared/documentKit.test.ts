import { describe, expect, it } from "vitest";
import { docRaw, documentCss, documentDetails, documentFooter, documentFrame, documentPage, documentPress, documentTable, documentTotals } from "./documentKit";

describe("document kit", () => {
  it("lays out the press, title, reference and details across the top", () => {
    const html = documentFrame({ press: { name: "Moth & Co", lines: ["1 Main St", "Toronto, ON"] }, title: "Line sheet", reference: "LS-001", details: [{ label: "Date", value: "Nov 2, 2026" }], body: "<p>body</p>", footer: "Net 30." });
    expect(html).toContain("<strong>Moth &amp; Co</strong>1 Main St<br>Toronto, ON");
    expect(html).toContain('<h1 class="doc-title">Line sheet</h1>');
    expect(html).toContain("LS-001");
    expect(html).toContain("<dt>Date</dt><dd>Nov 2, 2026</dd>");
    expect(html.indexOf("<p>body</p>")).toBeGreaterThan(html.indexOf("doc-details"));
    expect(html.indexOf("Net 30.")).toBeGreaterThan(html.indexOf("<p>body</p>"));
  });
  it("escapes everything except what a caller marks as raw", () => {
    const table = documentTable([{ label: "<b>A</b>" }, { label: "Price", align: "right" }], [["<i>x</i>", docRaw("<img alt=''>")], [3, "$4.00"]]);
    expect(table).toContain("&lt;b&gt;A&lt;/b&gt;");
    expect(table).toContain("&lt;i&gt;x&lt;/i&gt;");
    expect(table).toContain("<img alt=''>");
    expect(table).toContain('<td class="num">$4.00</td>');
    expect(documentPress({ name: "<x>" })).toContain("&lt;x&gt;");
    expect(documentFooter("a < b")).toContain("a &lt; b");
  });
  it("leaves out blocks that have nothing to show", () => {
    expect(documentPress({})).toBe("");
    expect(documentDetails([{ label: " ", value: "x" }])).toBe("");
    expect(documentTotals([])).toBe("");
    expect(documentFooter("  ")).toBe("");
  });
  it("puts the totals in the order given and marks the total", () => {
    const html = documentTotals([{ label: "Subtotal", value: "$10.00" }, { label: "Total", value: "$11.30", strong: true }]);
    expect(html.indexOf("Subtotal")).toBeLessThan(html.indexOf("Total</span>"));
    expect(html).toContain('class="strong"');
  });
  it("prints in black and white: no colour but black, white, and none", () => {
    const css = documentCss();
    const colours = [...css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map(m => m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1]);
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) expect(c.slice(0, 2) === c.slice(2, 4) && c.slice(2, 4) === c.slice(4, 6)).toBe(true);
    expect(css).not.toMatch(/rgb|hsl/i);
  });
  it("has the print rules every document needs", () => {
    const css = documentCss();
    expect(css).toContain("@page{size:Letter");
    expect(css).toContain("break-inside:avoid");
    expect(css).toContain("table-header-group");
    expect(css).toContain("break-after:page");
  });
  it("wraps documents in one printable page", () => {
    const page = documentPage("Line sheet <1>", "<section>x</section>");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>Line sheet &lt;1&gt;</title>");
    expect(page).toContain("<section>x</section>");
  });
});
