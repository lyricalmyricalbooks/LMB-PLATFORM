// @vitest-environment jsdom
// The files in testdata/moves/ are laid out the way each popular shop system really exports them (every column, the
// odd rows real shops have: gift cards, hidden and digital products, guarded codes, refunds, cancelled orders).
// Each is read end to end, and read again over what the first run made: a second import must add nothing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMoney } from "./catalogImport";
import { readPastOrders } from "./pastOrders";
import { planShopMove, readCustomerExport } from "./shopMove";
import { decodeText, spreadsheetText } from "./spreadsheetFile";

const file = (name: string) => readFileSync(`testdata/moves/${name}`, "utf8");
const move = (name: string, books: any[] = [], keepOptions = false) => planShopMove(file(name), books, [], {}, { keepOptions });
const row = (plan: ReturnType<typeof move>, title: string) => plan.plan.rows.find(r => r.title === title)!;
const PRODUCT_FILES = ["shopify-products.csv", "woocommerce-products.csv", "squarespace-products.csv", "wix-products.csv", "etsy-listings.csv", "square-items.csv"];

describe("every product file", () => {
  it.each(PRODUCT_FILES)("%s is recognised, has no row in error, and a second import adds nothing", (name) => {
    const first = move(name);
    expect(first.moved).not.toBeNull();
    expect(first.plan.problems).toEqual([]);
    expect(first.plan.counts.error).toBe(0);
    expect(first.plan.counts.create).toBeGreaterThan(1);
    // Never published, never a made-up price.
    for (const r of first.plan.rows) expect(r.patch.status).toBe("draft");
    const saved = first.plan.rows.map((r, i) => ({ id: `b${i}`, ...r.patch }));
    const again = move(name, saved);
    expect(again.plan.counts).toEqual({ create: 0, update: 0, unchanged: saved.length, error: 0 });
  });

  it.each(PRODUCT_FILES)("%s keeps its accents in any common encoding", async (name) => {
    const text = file(name).replace("Moth Songs", "Mötley Sông");
    const as = (bytes: Uint8Array) => spreadsheetText(Object.assign(new Blob([bytes as any]), { name: "export.csv" }));
    const utf16 = (s: string) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 255; b[i * 2 + 1] = s.charCodeAt(i) >> 8; } return b; };
    const latin1 = Uint8Array.from([...text].map(ch => ch.charCodeAt(0) & 255));
    for (const bytes of [new TextEncoder().encode(text), new TextEncoder().encode(`﻿${text}`), latin1, utf16(text), Uint8Array.from([0xff, 0xfe, ...utf16(text)])]) {
      const plan = planShopMove(await as(bytes), []);
      expect(plan.plan.rows.some(r => r.title.startsWith("Mötley Sông"))).toBe(true);
    }
  });
});

describe("one line per edition (handle rows)", () => {
  const plan = move("shopify-products.csv");
  it("reads a code guarded with an apostrophe as the code", () => { expect(row(plan, "Moth Songs").patch.sku).toBe("MS-001"); });
  it("keeps the sale and both photos in order", () => {
    const p = row(plan, "Moth Songs").patch;
    expect([p.retailPrice, p.salePrice, p.isOnSale, p.isbn]).toEqual([22, 18, true, "9781234567897"]);
    expect(p.photos.map((x: any) => x.url.split("/").pop())).toEqual(["moth-front.jpg?v=1", "moth-back.jpg?v=1"]);
  });
  it("leaves gift cards out and says so", () => {
    expect(plan.plan.rows.some(r => /gift card/i.test(r.title))).toBe(false);
    expect(plan.moved!.notices.join(" ")).toMatch(/1 gift card product was left out \(Gift Card\)/);
  });
  it("says which products were hidden, and reads an http photo as https", () => {
    expect(row(plan, "Old Almanac").warnings).toContain("This product was hidden in your old shop.");
    expect(row(plan, "Work in Progress").warnings).toContain("This product was hidden in your old shop.");
    expect(row(plan, "Moth Songs").warnings).not.toContain("This product was hidden in your old shop.");
    expect(row(plan, "Old Almanac").patch.photos[0].url).toBe("https://cdn.shopify.com/s/files/1/0001/almanac.jpg");
  });
  it("brings sizes and colours as editions, or as option buttons for a shop that isn't a bookshop", () => {
    expect(row(plan, "Tide Tee").patch.variants.map((v: any) => [v.name, v.price, v.stock, v.sku])).toEqual([["S / Black", 30, 4, "TT-S-BLK"], ["M / Black", 30, 0, "TT-M-BLK"], ["S / Cream", 32, 0, "TT-S-CRM"], ["M / Cream", 32, 7, "TT-M-CRM"]]);
    expect(row(plan, "Tide Tee").patch.options).toBeUndefined();
    expect(row(move("shopify-products.csv", [], true), "Tide Tee").patch.options).toEqual([{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "Cream"] }]);
  });
  it("brings a digital product over without stock counting", () => { expect(row(plan, "Night Zine (PDF)").patch.trackInventory).toBe(false); });
});

describe("products with their variations (parent rows)", () => {
  const plan = move("woocommerce-products.csv");
  it("reads the ISBN from the product code column and both variations whichever way they name their parent", () => {
    expect(row(plan, "Moth Songs").patch.isbn).toBe("9781234567897");
    expect(row(plan, "Tide Tee").patch.variants.map((v: any) => [v.name, v.price, v.stock])).toEqual([["S / Black", 30, 4], ["M / Cream", 32, 7]]);
  });
  it("keeps a line break written inside formatted words", () => { expect(row(plan, "Moth Songs").patch.description).toBe("Poems for **night** readers.\nSecond line."); });
  it("names the lines it leaves out, a sale on one edition and a draft", () => {
    expect(plan.moved!.notices.join(" ")).toMatch(/2 lines were left out \(Poetry Set, Sold Elsewhere\)/);
    expect(row(plan, "Tide Tee").warnings.join(" ")).toMatch(/M \/ Cream \(28\.00\) was on sale in your old shop/);
    expect(row(plan, "Old Almanac").warnings).toContain("This product was hidden in your old shop.");
  });
});

describe("a product line, then its options (product id rows)", () => {
  const plan = move("squarespace-products.csv");
  it("names a category, not its address", () => { expect(row(plan, "Moth Songs").patch.categories).toEqual(["poetry"]); });
  it("leaves the gift card out and marks the hidden product", () => {
    expect(plan.plan.rows.map(r => r.title)).toEqual(["Moth Songs", "Tide Tee", "Night Zine (PDF)", "Printing Workshop"]);
    expect(plan.moved!.notices.join(" ")).toMatch(/gift card product was left out/);
    expect(row(plan, "Night Zine (PDF)").warnings).toContain("This product was hidden in your old shop.");
  });
});

describe("a product line, then its versions (field type rows)", () => {
  const plan = move("wix-products.csv");
  it("finds photos written as bare file names", () => {
    expect(row(plan, "Moth Songs").patch.photos.map((p: any) => p.url)).toEqual([
      "https://static.wixstatic.com/media/a9ff3b_1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f~mv2.jpg",
      "https://static.wixstatic.com/media/a9ff3b_ffeeddccbbaa99887766554433221100~mv2.png",
    ]);
    expect(row(plan, "Moth Songs").warnings.join(" ")).not.toMatch(/photo/);
  });
  it("says so when a photo has no address at all", () => {
    const text = file("wix-products.csv").replace("a9ff3b_1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f~mv2.jpg", "cover final (2).jpg");
    expect(planShopMove(text, []).plan.rows[0].warnings.join(" ")).toMatch(/1 photo couldn't be brought over/);
  });
});

describe("a listings file", () => {
  const plan = move("etsy-listings.csv");
  it("reads a name's &amp; as &", () => { expect(plan.plan.rows[0].title).toBe("Moth Songs, risograph poetry book & zine"); });
  it("doesn't take a list of every choice's SKU as the product's SKU", () => { expect(row(plan, "Tide Tee").patch.sku).toBe(""); });
  it("says the prices are in another currency", () => { expect(plan.moved!.notices.join(" ")).toMatch(/prices in this file are in USD/); });
});

describe("an item list (one line per variation)", () => {
  const plan = move("square-items.csv");
  it("adds up stock across places, reads the weight and leaves the archived item out", () => {
    const p = row(plan, "Moth Songs").patch;
    expect([p.stockLevel, p.weight, p.isbn]).toEqual([12, "0.18 kg", "9781234567897"]);
    expect(plan.moved!.notices).toEqual(["1 archived line was left out."]);
    expect(row(plan, "Printing Workshop").warnings).toContain("This product was hidden in your old shop.");
  });
});

describe("order files", () => {
  const orders = (name: string) => readPastOrders(file(name), new Date("2026-01-01"));
  it.each(["shopify-orders.csv", "woocommerce-orders.csv", "squarespace-orders.csv", "bigcartel-orders.csv", "etsy-orders.csv"])("%s reads with no problem", (name) => {
    const read = orders(name);
    expect(read.problems).toEqual([]);
    expect(read.orders.length).toBeGreaterThan(1);
    expect(read.foreign).toEqual({ USD: 1 });
    const first = read.orders[0];
    expect([first.total, first.shipping, first.tax, first.name]).toEqual([64.41, 9, 7.41, "Zoë Brontë"]);
  });
  it("leaves out cancelled, on-hold and pending orders with a reason", () => {
    expect(orders("shopify-orders.csv").skipped.map(s => s.reason)).toEqual(["Order #1000: it was cancelled, so it never became a sale"]);
    expect(orders("woocommerce-orders.csv").skipped).toHaveLength(1);
    expect(orders("bigcartel-orders.csv").skipped).toHaveLength(1);
  });
  it("keeps refunds, whole and part", () => {
    expect(orders("shopify-orders.csv").orders.map(o => o.refunded)).toEqual([undefined, 18, 15.75]);
    expect(orders("squarespace-orders.csv").orders[1].refunded).toBe(18);
    expect(orders("etsy-orders.csv").orders[1].refunded).toBe(18);
  });
  it("works out each item's price from what the line came to", () => {
    expect(orders("woocommerce-orders.csv").orders[0].items).toEqual([{ title: "Moth Songs", quantity: 1, price: 18, sku: "MS-001" }, { title: "Tide Tee - S", quantity: 1, price: 30, sku: "TT-S-BLK" }]);
  });
  it("reads every item written in one cell", () => {
    expect(orders("bigcartel-orders.csv").orders[0].items).toEqual([{ title: "Moth Songs", quantity: 1, price: 18 }, { title: "Tide Tee", quantity: 1, price: 30 }]);
  });
});

describe("customer files", () => {
  it("skips lines with no usable email and a customer listed twice, with the reason", () => {
    const read = readCustomerExport(file("shopify-customers.csv"));
    expect(read.customers.map(c => [c.email, c.acceptsEmail, c.spent])).toEqual([["zoe@example.com", true, 64.41], ["sam@example.com", false, 48]]);
    expect(read.skipped.map(s => s.line)).toEqual([4, 5, 6]);
  });
  it("reads a till's customer list: what they spent and who is subscribed", () => {
    const read = readCustomerExport(file("square-customers.csv"));
    expect(read.customers.map(c => [c.email, c.acceptsEmail, c.spent, c.orders])).toEqual([["zoe@example.com", true, 64.41, 3], ["sam@example.com", false, 48, 1]]);
  });
});

describe("numbers and text from other places", () => {
  it("reads prices written the European way", () => {
    expect(parseMoney("1.250,00")).toBe(1250);
    expect(parseMoney("18,50")).toBe(18.5);
    expect(parseMoney("1'250.00")).toBe(1250);
    expect(parseMoney("1,250.00")).toBe(1250);
    expect(parseMoney("1.250")).toBe(1.25);
    const plan = planShopMove("Handle;Title;Variant Price;Variant Inventory Qty\nbig;Big Book;1.250,00;1\n", []);
    expect(plan.plan.rows[0].patch.retailPrice).toBe(1250);
  });
  it("keeps a title's own apostrophe", () => {
    const plan = planShopMove("Handle,Title,Variant Price,Variant SKU\ntis,'Tis the Season,10.00,'0042\n", []);
    expect([plan.plan.rows[0].title, plan.plan.rows[0].patch.sku]).toEqual(["'Tis the Season", "0042"]);
  });
  it("reads two-byte text saved without its marker", () => {
    const s = "Title,Price\nMötley,10\n";
    const b = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) & 255; b[i * 2 + 1] = s.charCodeAt(i) >> 8; }
    expect(decodeText(b)).toBe(s);
  });
});

describe("a big shop", () => {
  it("plans 2,000 products with two editions each, and a second import of them, in a few seconds", () => {
    const rows = ["Handle,Title,Body (HTML),Option1 Name,Option1 Value,Variant SKU,Variant Inventory Tracker,Variant Inventory Qty,Variant Price,Image Src"];
    for (let i = 0; i < 2000; i++) rows.push(`p-${i},Product ${i},"<p>${"A long description. ".repeat(40)}</p>",Size,S,SKU-${i}-S,shopify,3,10.00,https://cdn.example/p${i}.jpg`, `p-${i},,,,M,SKU-${i}-M,shopify,3,12.00,`);
    const text = rows.join("\n");
    const start = Date.now();
    const first = planShopMove(text, []);
    expect(first.plan.counts).toEqual({ create: 2000, update: 0, unchanged: 0, error: 0 });
    const again = planShopMove(text, first.plan.rows.map((r, i) => ({ id: `b${i}`, ...r.patch })));
    expect(again.plan.counts).toEqual({ create: 0, update: 0, unchanged: 2000, error: 0 });
    expect(Date.now() - start).toBeLessThan(15000);
  });
});
