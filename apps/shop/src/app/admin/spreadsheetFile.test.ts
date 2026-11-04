// @vitest-environment jsdom
// Spreadsheets in every "bring a file" window (plan 23.35): Excel, OpenDocument, CSV and tab-separated files read the
// same. The .xlsx, .ods and .xls files in testdata/spreadsheets were made by LibreOffice from the CSV beside each, and
// edge.xlsx by a Python spreadsheet library, so these are files real programs write.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./catalogImport";
import { readDiscountFile } from "./discountMove";
import { readGiftCardFile } from "./giftCardMove";
import { readPastOrders } from "./pastOrders";
import { SpreadsheetError, decodeText, spreadsheetText, toCsv } from "./spreadsheetFile";

const DIR = join(__dirname, "testdata", "spreadsheets");
const file = (name: string, bytes: Uint8Array | string = readFileSync(join(DIR, name))) => new File([bytes as BlobPart], name);
const rows = async (name: string) => parseCsv(await spreadsheetText(file(name)));
/** The same table, reading numbers as numbers (a spreadsheet shows 28.00 as 28) and with no empty cells at a row's end. */
const same = (a: string[][]) => a.map((r) => {
  const out = r.map((c) => (c.trim() !== "" && Number.isFinite(Number(c)) ? String(Number(c)) : c));
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
});

describe("reading a spreadsheet file", () => {
  const samples = readdirSync(DIR).filter((f) => f.endsWith(".csv"));

  it.each(samples)("%s reads the same as CSV, Excel and OpenDocument", async (name) => {
    const csv = parseCsv(readFileSync(join(DIR, name), "utf8"));
    expect(same(await rows(name))).toEqual(same(csv));
    expect(same(await rows(name.replace(".csv", ".xlsx")))).toEqual(same(csv));
    expect(same(await rows(name.replace(".csv", ".ods")))).toEqual(same(csv));
  });

  it("an Excel order file brings the same orders as its CSV", async () => {
    const csv = readPastOrders(readFileSync(join(DIR, "old-shop-orders.csv"), "utf8"));
    expect(csv.orders.length).toBeGreaterThan(3);
    expect(readPastOrders(await spreadsheetText(file("old-shop-orders.xlsx")))).toEqual(csv);
    expect(readPastOrders(await spreadsheetText(file("old-shop-orders.ods")))).toEqual(csv);
    const cards = readGiftCardFile(readFileSync(join(DIR, "old-shop-gift-cards.csv"), "utf8"), "2026-11-04");
    expect(readGiftCardFile(await spreadsheetText(file("old-shop-gift-cards.xlsx")), "2026-11-04")).toEqual(cards);
  });

  it("reads Excel's dates, rich text, gaps and quotes from the first visible sheet", async () => {
    const table = await rows("edge.xlsx");
    expect(table[0]).toEqual(["Name", "Created at", "Paid at", "Total", "Gift", "SKU", "Note"]);
    expect(table[1]).toEqual(["#1", "2025-06-01", "2025-06-01 15:30:00", "0.3", "TRUE", "00123", 'Says "hi", then\nleaves']);
    expect(table[2].slice(0, 4)).toEqual(["#2", "2024-12-31", "", "64.24"]);
    expect(table[3]).toEqual(["", "", "", "", "", "", "far away"]);
    expect(table.flat()).not.toContain("not this one"); // the hidden sheet
  });

  it("reads the text encodings spreadsheet programs save in", async () => {
    const words = "Code,Value\nCAFÉ-10,10%\n";
    // UTF-16 with tabs: Excel's "Unicode text".
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...words.replace(/,/g, "\t")].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(parseCsv(await spreadsheetText(file("codes.txt", utf16)))).toEqual([["Code", "Value"], ["CAFÉ-10", "10%"]]);
    // The older Windows encoding: É is one byte, 0xC9.
    const latin = new Uint8Array([...words].map((c) => c.charCodeAt(0)));
    expect(decodeText(latin)).toBe(words);
    // UTF-8 with Excel's byte-order mark.
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(words)]))).toBe(words);
    const codes = readDiscountFile(await spreadsheetText(file("codes.csv", new TextEncoder().encode("Code,Value\nSPRING-10,10%\n"))), "2026-11-04");
    expect(codes.codes.map((c) => c.code)).toEqual(["SPRING-10"]);
  });

  it("explains how to save older and other formats", async () => {
    await expect(spreadsheetText(file("old-shop-orders.xls"))).rejects.toThrow(/older Excel file.*Save As/);
    await expect(spreadsheetText(file("list.numbers", new Uint8Array([1, 2, 3])))).rejects.toThrow(/Numbers file.*Export To/);
    await expect(spreadsheetText(file("broken.xlsx", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])))).rejects.toBeInstanceOf(SpreadsheetError);
  });

  it("writes CSV that reads back cell for cell", () => {
    const table = [["a,b", 'say "hi"', "line\nbreak", " padded ", "plain"]];
    expect(parseCsv(toCsv(table))).toEqual(table);
  });
});
