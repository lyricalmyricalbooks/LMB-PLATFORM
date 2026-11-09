// @vitest-environment jsdom
// Spreadsheets in every "bring a file" window (plan 23.35): Excel, OpenDocument, CSV and tab-separated files read the
// same. The .xlsx, .ods and .xls files in testdata/spreadsheets were made by LibreOffice from the CSV beside each, and
// edge.xlsx, sheets.xlsx and long-words.xlsx by a Python spreadsheet library and xlwt-orders.xls by another (plan 23.40),
// so these are files real programs write.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./catalogImport";
import { readDiscountFile } from "./discountMove";
import { readGiftCardFile } from "./giftCardMove";
import { readPastOrders } from "./pastOrders";
import { SpreadsheetError, decodeText, readSpreadsheet, spreadsheetText, toCsv } from "./spreadsheetFile";

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
    expect(same(await rows(name.replace(".csv", ".xls")))).toEqual(same(csv)); // plan 23.40
  });

  it("an Excel order file brings the same orders as its CSV", async () => {
    const csv = readPastOrders(readFileSync(join(DIR, "old-shop-orders.csv"), "utf8"));
    expect(csv.orders.length).toBeGreaterThan(3);
    expect(readPastOrders(await spreadsheetText(file("old-shop-orders.xlsx")))).toEqual(csv);
    expect(readPastOrders(await spreadsheetText(file("old-shop-orders.ods")))).toEqual(csv);
    expect(readPastOrders(await spreadsheetText(file("old-shop-orders.xls")))).toEqual(csv);
    const cards = readGiftCardFile(readFileSync(join(DIR, "old-shop-gift-cards.csv"), "utf8"), "2026-11-04");
    expect(readGiftCardFile(await spreadsheetText(file("old-shop-gift-cards.xlsx")), "2026-11-04")).toEqual(cards);
  });

  it.each(["edge.xlsx", "edge.xls"])("%s: reads Excel's dates, rich text, gaps and quotes from the first visible sheet", async (name) => {
    const table = await rows(name);
    expect(table[0]).toEqual(["Name", "Created at", "Paid at", "Total", "Gift", "SKU", "Note"]);
    expect(table[1]).toEqual(["#1", "2025-06-01", "2025-06-01 15:30:00", "0.3", "TRUE", "00123", 'Says "hi", then\nleaves']);
    expect(table[2].slice(0, 4)).toEqual(["#2", "2024-12-31", "", "64.24"]);
    expect(table[3]).toEqual(["", "", "", "", "", "", "far away"]);
    expect(table.flat()).not.toContain("not this one"); // the hidden sheet
  });

  it.each(["sheets.xlsx", "sheets.ods", "sheets.xls"])("%s: skips an empty cover sheet, lists visible sheets and reads the one asked for (plan 23.37)", async (name) => {
    const first = await readSpreadsheet(file(name));
    expect(first.sheets).toEqual(["Cover", "Books", "Summary"]);
    expect(first.sheet).toBe("Books");
    expect(parseCsv(first.text)).toEqual([["Title", "Price"], ["Salt Hours", "24"]]);
    expect(parseCsv(await spreadsheetText(file(name), "Summary"))).toEqual([["Total", "24"]]);
    expect(await spreadsheetText(file(name), "Cover")).toBe("");
    await expect(spreadsheetText(file(name), "Gone")).rejects.toThrow(/no sheet called “Gone”/);
    expect((await readSpreadsheet(file("codes.csv", "a,b\n"))).sheets).toEqual([]);
  });

  it("reads an .xls whose word table runs over several records, in both 8-bit and 16-bit text (plan 23.40)", async () => {
    const xls = await rows("long-words.xls");
    expect(xls.length).toBe(601);
    expect(xls).toEqual(await rows("long-words.xlsx"));
    expect(xls[1][1]).toContain("日本語");
  });

  it("reads an .xls from another writer: dates with times, numbers, true/false and an uncalculated formula", async () => {
    expect(await rows("xlwt-orders.xls")).toEqual([
      ["Name", "Created at", "Total", "Paid"], ["#1001", "2025-06-01", "28.5", "TRUE"], ["#1002", "2025-06-02 15:30:00", "1234567"],
    ]);
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
    await expect(spreadsheetText(file("old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])))).rejects.toThrow(/older Excel file \(\.xls\) couldn't be opened.*Save As/);
    await expect(spreadsheetText(file("list.numbers", new Uint8Array([1, 2, 3])))).rejects.toThrow(/Numbers file.*Export To/);
    await expect(spreadsheetText(file("broken.xlsx", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])))).rejects.toBeInstanceOf(SpreadsheetError);
  });

  it("writes CSV that reads back cell for cell", () => {
    const table = [["a,b", 'say "hi"', "line\nbreak", " padded ", "plain"]];
    expect(parseCsv(toCsv(table))).toEqual(table);
  });
});
