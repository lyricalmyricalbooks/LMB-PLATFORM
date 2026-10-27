import { describe, expect, it } from "vitest";
import { catalogToCsv } from "./bulkPricing";
import { mapHeadings, parseCsv, parseMoney, planImport } from "./catalogImport";

const books = [
  { id: "b1", title: "Salt Hours", subtitle: "Zoe Moss", isbn: "978-0-306-40615-7", sku: "SH-1", retailPrice: 24, stockLevel: 7, status: "published", format: "Paperback", categories: ["Poetry"], photos: [{ url: "https://img.test/a.jpg" }] },
  { id: "b2", title: "Night Ferry", isbn: "", sku: "NF-1", retailPrice: "18.50", stockLevel: 0, status: "draft" },
  { id: "b3", title: "Box of Days", isbn: "", sku: "", retailPrice: 0, status: "published", variants: [{ id: "v1", name: "Paperback", price: 20, stock: 3 }] },
  { id: "b4", title: "Twin", sku: "DUP" }, { id: "b5", title: "Twin", sku: "DUP" },
];

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, line breaks in cells, CRLF and a BOM", () => {
    expect(parseCsv('﻿Title,Description\r\n"A, b","He said ""hi""\nthen left"\r\n')).toEqual([
      ["Title", "Description"], ["A, b", 'He said "hi"\nthen left'],
    ]);
  });
  it("detects semicolon and tab separated files and drops blank lines", () => {
    expect(parseCsv("Title;Price\nA;12,50\n\n")).toEqual([["Title", "Price"], ["A", "12,50"]]);
    expect(parseCsv("Title\tPrice\nA\t3")).toEqual([["Title", "Price"], ["A", "3"]]);
  });
});

describe("headings and values", () => {
  it("maps aliases, reports unknown and repeated columns", () => {
    const m = mapHeadings(["Book title", "ISBN-13", "Qty", "Colour", "Price (CAD)", "price"]);
    expect(m.fields).toEqual(["title", "isbn", "stockLevel", null, "retailPrice", null]);
    expect(m.ignored).toEqual(["Colour"]);
    expect(m.duplicates).toEqual(["price"]);
  });
  it("parses prices written the usual ways", () => {
    expect(parseMoney("CA$12.50")).toBe(12.5);
    expect(parseMoney("$1,250.00")).toBe(1250);
    expect(parseMoney("12,5")).toBe(12.5);
    expect(parseMoney("12 CAD")).toBe(12);
    expect(parseMoney("-3")).toBeNaN();
    expect(parseMoney("free")).toBeNaN();
  });
});

describe("planImport", () => {
  it("an unedited export changes nothing", () => {
    const plan = planImport(catalogToCsv(books.slice(0, 3)), books);
    expect(plan.problems).toEqual([]);
    expect(plan.counts).toEqual({ create: 0, update: 0, unchanged: 3, error: 0 });
  });

  it("matches by ISBN (ignoring hyphens), then SKU, and writes only changed fields", () => {
    const plan = planImport("ISBN,SKU,Price,Stock,Title\n9780306406157,,25,7,\n,NF-1,18.5,4,\n", books, [], { stockMode: "set" });
    expect(plan.rows[0]).toMatchObject({ action: "update", bookId: "b1", patch: { retailPrice: 25 } });
    expect(plan.rows[0].patch).not.toHaveProperty("stockLevel");
    expect(plan.rows[1]).toMatchObject({ action: "update", bookId: "b2", patch: { stockLevel: 4 } });
    expect(plan.rows[1].changes).toEqual([{ field: "stockLevel", label: "Stock", from: "0", to: "4" }]);
  });

  it("never writes stock for a book counted in the inventory app, even when asked to set it", () => {
    const plan = planImport("SKU,Stock\nNF-1,4\n", books, [], { stockMode: "set", linkedBookIds: ["b2"] });
    expect(plan.rows[0].action).toBe("unchanged");
    expect(plan.rows[0].warnings.join(" ")).toContain("counted in the inventory app");
  });

  it("leaves live stock alone by default and says what the file wanted", () => {
    const plan = planImport("SKU,Stock\nNF-1,4\n", books);
    expect(plan.rows[0].action).toBe("unchanged");
    expect(plan.rows[0].warnings.join(" ")).toContain("live is 0, file says 4");
  });

  it("imports weight, sale dates, tags, shipping profile and extra images", () => {
    const plan = planImport("ID,Weight,Sale starts,Tags,Shipping profile,Extra image URLs\nb1,450 g,2026-11-01,a; b,general-profile,https://img.test/b.jpg | https://img.test/c.jpg\n", books);
    expect(plan.rows[0].patch).toMatchObject({ weight: "450 g", saleStartsAt: "2026-11-01", tags: ["a", "b"], shippingProfileId: "general-profile" });
    expect(plan.rows[0].patch.photos.map((p: any) => p.url)).toEqual(["https://img.test/a.jpg", "https://img.test/b.jpg", "https://img.test/c.jpg"]);
    expect(planImport("ID,Weight\nb1,heavy\n", books).rows[0].action).toBe("error");
  });

  it("creates new books as drafts with editor defaults and never publishes", () => {
    const plan = planImport("Title,ISBN,Price,Status,Categories,Image URL\nNew Moon,9781234567897,15,published,Poetry; Essays,https://img.test/n.jpg\n", books, ["Poetry"]);
    const row = plan.rows[0];
    expect(row.action).toBe("create");
    expect(row.patch).toMatchObject({ title: "New Moon", status: "draft", retailPrice: 15, trackInventory: true, categories: ["Poetry", "Essays"], photos: [{ url: "https://img.test/n.jpg", altText: "" }] });
    expect(row.warnings.join(" ")).toMatch(/doesn't publish/);
    expect(row.warnings.join(" ")).toMatch(/Essays isn't a shop category/);
  });

  it("can move a book to draft but not publish one", () => {
    const plan = planImport("ID,Status\nb1,draft\nb2,published\n", books);
    expect(plan.rows[0].patch).toEqual({ status: "draft" });
    expect(plan.rows[1].action).toBe("unchanged");
    expect(plan.rows[1].warnings[0]).toMatch(/Publish/);
  });

  it("refuses bad values, ambiguous matches, unknown IDs and repeated books", () => {
    const plan = planImport([
      "ID,Title,SKU,Price,Stock,Featured,Publication date,Image URL",
      "b1,,,abc,,,,", "nope,,,,,,,", ",,DUP,,,,,", "b2,,,,-1,maybe,12/11/2026,http://x.test/a.jpg",
      ",Box of Days,,,,,,", "b2,,,,,,,",
    ].join("\n"), books);
    const errs = plan.rows.map(r => r.errors.join(" "));
    expect(errs[0]).toMatch(/Price “abc”/);
    expect(errs[1]).toMatch(/No book has the ID/);
    expect(errs[2]).toMatch(/matches 2 books/);
    expect(errs[3]).toMatch(/Stock/); expect(errs[3]).toMatch(/Featured/); expect(errs[3]).toMatch(/YYYY-MM-DD/); expect(errs[3]).toMatch(/https/);
    expect(plan.rows[4]).toMatchObject({ action: "unchanged", bookId: "b3" });
    expect(errs[5]).toMatch(/Line 5 already changes this book/);
    expect(plan.counts.error).toBe(5);
  });

  it("refuses two new rows with the same ISBN and a new row without a title", () => {
    const plan = planImport("Title,ISBN\nA,9781234567897\nB,978-1-234-56789-7\n,9780000000002\n", books);
    expect(plan.rows.map(r => r.action)).toEqual(["create", "error", "error"]);
    expect(plan.rows[2].errors[0]).toMatch(/needs a Title/);
  });

  it("leaves price and stock of books sold in editions to the book editor", () => {
    const plan = planImport("ID,Price,Stock,Publisher\nb3,30,9,Lyrical\n", books);
    expect(plan.rows[0].patch).toEqual({ publisher: "Lyrical" });
    expect(plan.rows[0].warnings[0]).toMatch(/editions/);
  });

  it("keeps existing photos and warns about invalid ISBNs", () => {
    const plan = planImport("ID,Image URL,ISBN\nb1,https://img.test/other.jpg,978-0-306-40615-7\nb2,,12345\n", books);
    expect(plan.rows[0].patch).toEqual({});
    expect(plan.rows[0].warnings[0]).toMatch(/already has photos/);
    expect(plan.rows[1].warnings[0]).toMatch(/valid ISBN/);
  });

  it("reports file-level problems", () => {
    expect(planImport("Title\n", books).problems[0]).toMatch(/no book rows/);
    expect(planImport("Colour,Size\nred,1\n", books).problems[0]).toMatch(/recognised/);
  });
});
