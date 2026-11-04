// @vitest-environment jsdom
// The Excel writer (plan 23.38): what it writes reads back cell for cell, numbers stay numbers and codes stay text.
import { describe, expect, it } from "vitest";
import { parseCsv } from "./catalogImport";
import { spreadsheetText } from "./spreadsheetFile";
import { toXlsx } from "./xlsxWriter";

const table = [
  ["Title", "ISBN", "Price", "Stock", "SKU", "Description"],
  ["Salt & Hours <2nd>", "9780306406157", "24.5", "7", "00123", 'Says "hi",\nthen leaves'],
  ["", "", "-3", "", "AB-1", ""],
];

describe("toXlsx", () => {
  it("reads back cell for cell", async () => {
    const bytes = toXlsx(table, "Books");
    const back = parseCsv(await spreadsheetText(new File([bytes as BlobPart], "books.xlsx")));
    expect(back).toEqual(table.map((r) => { const out = [...r]; while (out.length && out[out.length - 1] === "") out.pop(); return out; }));
  });

  it("writes numbers as numbers and codes as text, with a bold frozen heading row", () => {
    const zip = new TextDecoder().decode(toXlsx(table));
    expect(zip).toContain('<c r="C2"><v>24.5</v></c>');
    expect(zip).toContain('<c r="D2"><v>7</v></c>');
    expect(zip).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">9780306406157</t>');
    expect(zip).toContain('<c r="E2" t="inlineStr"><is><t xml:space="preserve">00123</t>');
    expect(zip).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(zip).toContain('state="frozen"');
  });
});
