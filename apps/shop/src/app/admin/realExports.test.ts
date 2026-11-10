// @vitest-environment jsdom
// Product files made by real shop systems (fixtures/exports, sources in fixtures/exports/SOURCES.txt), read the way
// Books › Import and setup mode read them: readSpreadsheet, then planShopMove, with and without options.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readSpreadsheet } from "./spreadsheetFile";
import { planShopMove, type MovePlan, type MovedBook } from "./shopMove";

async function plans(name: string): Promise<{ options: MovePlan; editions: MovePlan; books: MovedBook[] }> {
  const bytes = readFileSync(join(__dirname, "fixtures", "exports", name));
  const { text } = await readSpreadsheet(Object.assign(new Blob([bytes]), { name }));
  const options = planShopMove(text, [], [], {}, { keepOptions: true });
  const editions = planShopMove(text, [], [], {}, { keepOptions: false });
  for (const p of [options, editions]) {
    expect(p.moved, name).not.toBeNull();
    expect(p.plan.problems, name).toEqual([]);
    expect(p.plan.counts.error, name).toBe(0);
    expect(p.plan.rows.every(r => r.action === "create"), name).toBe(true);
  }
  return { options, editions, books: options.moved!.books };
}
const titled = (books: MovedBook[], title: string) => books.find(b => b.cells.Title === title)!;
const rowOf = (p: MovePlan, b: MovedBook) => p.plan.rows.find(r => r.line === b.line)!;

describe("real product exports", () => {
  it("one line per edition, today's headings (template file)", async () => {
    const { options, editions, books } = await plans("handle-rows-template.csv");
    expect(options.moved!.shape).toBe("handle-rows");
    expect(books.map(b => b.cells.Title)).toEqual(["Physical Product “The Band” T-Shirt", "Digital Product The History of Rock Music", "Example Perfume"]);
    const tee = books[0];
    expect(tee.editions).toHaveLength(12);
    expect(tee.editions[0]).toMatchObject({ name: "Small / green", price: 24.99, salePrice: 19.99, stock: 47, sku: "TheBandTShirt-SG" });
    expect(tee.cells.Stock).toBe("513");
    expect(tee.options.map(o => o.name)).toEqual(["Size", "Color"]);
    expect(tee.cells["Image URL"]).toContain("forest-hiker.jpg");
    expect(tee.oldPaths).toEqual(["/products/physical-product-the-band-t-shirt"]);
    expect(rowOf(options, tee).patch.options).toHaveLength(2);
    expect(rowOf(editions, tee).patch.options).toBeUndefined();
    expect(rowOf(editions, tee).patch.variants).toHaveLength(12);
    // Nobody counted the digital files or the perfume: they must not arrive sold out.
    const digital = books[1];
    expect(digital.editions.map(e => e.stock)).toEqual([null, null, null]);
    expect(rowOf(options, digital).patch.trackInventory).toBe(false);
    const perfume = books[2];
    expect(perfume.cells).toMatchObject({ Price: "80", "Sale price": "74.99" });
    expect(rowOf(options, perfume).patch.trackInventory).toBe(false);
  });

  it("product lines with variation lines (sample products file)", async () => {
    const { options, books } = await plans("parent-rows-sample.csv");
    expect(options.moved!.shape).toBe("parent-rows");
    expect(books).toHaveLength(16);
    const hoodie = titled(books, "Hoodie");
    expect(hoodie.editions.map(e => e.name)).toEqual(["Red / No", "Green / No", "Blue / No", "Blue / Yes"]);
    expect(hoodie.editions[0]).toMatchObject({ price: 45, salePrice: 42 });
    expect(hoodie.options.map(o => o.name)).toEqual(["Color", "Logo"]);
    expect(hoodie.cells["Extra image URLs"]!.split("|")).toHaveLength(3);
    expect(titled(books, "Belt").cells).toMatchObject({ Price: "65", "Sale price": "55", Categories: "Accessories" });
    expect(titled(books, "V-Neck T-Shirt").cells.Price).toBe("15");
  });

  it("one line per listing with numbered photos (two real listing files)", async () => {
    for (const name of ["listing-rows-a.csv", "listing-rows-b.csv"]) {
      const { options, books } = await plans(name);
      expect(options.moved!.shape).toBe("listing-rows");
      expect(books).toHaveLength(4);
      for (const b of books) {
        expect(Number(b.cells.Price)).toBeGreaterThan(0);
        expect(b.cells.Stock).toBe("1");
        expect(b.cells["Image URL"]).toMatch(/^https:\/\//);
      }
    }
    const { books } = await plans("listing-rows-a.csv");
    expect(books[0].cells).toMatchObject({ Title: "Dagger with inward curls in brass", Price: "38" });
  });

  it("Product and Variant lines under one handleId (three real catalog files)", async () => {
    const a = await plans("field-type-rows-a.csv");
    expect(a.options.moved!.shape).toBe("field-type-rows");
    const sleep = titled(a.books, "Animated Sleep wear.");
    expect(sleep.editions.map(e => [e.name, e.stock])).toEqual([["Free size (8-14) / Light pink", 8], ["Free size (8-14) / Brown", 13], ["Free size (8-14) / Pink", 0], ["Free size (8-14) / Orange", 2]]);
    expect(sleep.options[1]).toEqual({ name: "Color", values: ["Light pink", "Brown", "Pink", "Orange"] });
    expect(sleep.oldPaths[0]).toMatch(/^\/product-page\//);
    expect(titled(a.books, "Test 2").notes).toEqual(["This product was hidden in your old shop."]);
    const b = await plans("field-type-rows-b.csv");
    expect(b.books).toHaveLength(4);
    expect(b.books[0].cells).toMatchObject({ Price: "10", Stock: "1" });
    const c = await plans("field-type-rows-c.csv");
    expect(c.books[0].editions.length).toBeGreaterThan(5);
    expect(c.books[0].options).toHaveLength(2);
  });

  it("a product line, then lines for its other versions (two store files)", async () => {
    const a = await plans("product-id-rows-a.csv");
    expect(a.options.moved!.shape).toBe("product-id-rows");
    expect(a.books[0].cells).toMatchObject({ Title: "Sage and Cedarwood", Price: "12", Stock: "100" });
    expect(a.books[0].oldPaths).toEqual(["/shop/p/sagecedarwood-hp69w", "/shop/sagecedarwood-hp69w"]);
    const b = await plans("product-id-rows-b.csv");
    const tote = titled(b.books, "Canvas Tote Bag");
    expect(tote.editions.map(e => [e.name, e.price, e.salePrice])).toEqual([["Natural", 30, 24], ["Black", 30, 0], ["Olive", 32, 0]]);
    expect(tote.options).toEqual([{ name: "Color", values: ["Natural", "Black", "Olive"] }]);
    expect(titled(b.books, "Custom Sneaker").editions).toHaveLength(2);
  });

  it("one line per variation, in CSV and in Excel (item library)", async () => {
    for (const name of ["variation-name-rows-a.csv", "variation-name-rows-a.xlsx"]) {
      const { options, books } = await plans(name);
      expect(options.moved!.shape).toBe("variation-name-rows");
      expect(books.map(b => b.cells.Title)).toEqual(["Speckled Mug", "Cedar Candle", "Logo Tee", "Pottery Class"]);
      const mug = books[0];
      expect(mug.editions.map(e => [e.name, e.price, e.stock])).toEqual([["Small", 24, 15], ["Large", 28, 5]]);
      expect(mug.options).toEqual([{ name: "Size", values: ["Small", "Large"] }]);
      expect(books[1].cells).toMatchObject({ Price: "18", "Sale price": "15", Stock: "20" });
      expect(books[3].cells.Price).toBeUndefined();
    }
    const b = await plans("variation-name-rows-b.csv");
    expect(b.books.map(x => x.cells.Price)).toEqual(["4.98", "9.98", "29.98", "9.99"]);
  });

  it("Product and Variant lines with Name=…|Value=… choices (bulk edit file)", async () => {
    const { options, books } = await plans("item-rows.csv");
    expect(options.moved!.shape).toBe("item-rows");
    const towel = books[0];
    expect(towel.editions[0]).toMatchObject({ name: "XS / Silver", price: 49, picks: { Size: "XS", Color: "Silver" } });
    expect(towel.options.map(o => o.name)).toEqual(["Size", "Color"]);
    expect(rowOf(options, towel).patch.trackInventory).toBe(false);
    expect(books[1].cells).toMatchObject({ Title: "[Sample] Orbit Terrarium - Large", Price: "109" });
    expect(books[1].oldPaths).toEqual(["/orbit-terrarium-large/"]);
  });

  it("Product lines with SKU lines (older bulk file)", async () => {
    const { options, books } = await plans("sku-rows.csv");
    expect(options.moved!.shape).toBe("sku-rows");
    expect(books[0].cells).toMatchObject({ Title: "[Sample] Daventry Meers, dark denim shirt", Price: "24.5" });
  });

  it("product lines with a type column (catalog file)", async () => {
    const { options, books } = await plans("typed-rows.csv");
    expect(options.moved!.shape).toBe("typed-rows");
    expect(books.map(b => [b.cells.Title, b.cells.Price, b.cells.Stock])).toEqual([["ACEOFACES", "25", "1"], ["AFTERBURNER", "25", "1"], ["ARCHON", "25", "1"], ["ARKANOID", "25", "1"]]);
    expect(books[0].cells["Image URL"]).toMatch(/^https:\/\//);
    // Addresses after "#" are one page for every product, so no old link is kept for them.
    expect(books.every(b => b.oldPaths.length === 0)).toBe(true);
  });
});
