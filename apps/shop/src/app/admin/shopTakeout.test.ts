// "Download your shop": every product layout reads back through this shop's own importer (shopMove.ts), and the whole
// zip holds what a press needs to leave.
import { describe, expect, it } from "vitest";
import { handlesFor, photoPlan, takeoutFiles, productsForBigCartel, productsForSquarespace, productsForWoo } from "./shopTakeout";
import { zipStored } from "./xlsxWriter";
import { planShopMove, readProductExport } from "./shopMove";
import { productsForAnotherShop } from "./shopExport";
import { fetchPhotos } from "./takeoutPhotos";

const NOW = new Date("2026-11-10T12:00:00Z");
const BOOKS = [
  { id: "b1", title: "Moths of the North", slug: "moths", description: "A **field** guide.\n\n- 120 moths\n- Night maps", retailPrice: 30, isOnSale: true, salePrice: 24, stockLevel: 7, trackInventory: true, sku: "MOTH-1", categories: ["Nature"], tags: ["field", "moths"], status: "published", photos: [{ url: "https://img.example/a.jpg" }, { url: "https://img.example/b.png" }] },
  { id: "b2", title: "Night Zine", retailPrice: 10, trackInventory: true, status: "published", variants: [{ id: "v1", name: "Paperback", price: 10, stock: 3, sku: "Z-P" }, { id: "v2", name: "Signed copy", price: 15, stock: 1, sku: "Z-S" }], photos: [{ url: "https://img.example/z.jpg" }] },
  { id: "g1", title: "Gift card", productType: "giftCard", retailPrice: 25 },
];
describe("product layouts read back through the importer", () => {
  it("WooCommerce: a variable product with its editions", () => {
    const move = readProductExport(productsForWoo(BOOKS, { now: NOW }))!;
    expect(move.shape).toBe("parent-rows");
    expect(move.books.map((b) => b.cells.Title)).toEqual(["Moths of the North", "Night Zine"]);
    expect(move.books[1].editions.map((e) => [e.name, e.price, e.stock, e.sku])).toEqual([["Paperback", 10, 3, "Z-P"], ["Signed copy", 15, 1, "Z-S"]]);
    expect(move.books[0].cells).toMatchObject({ Price: "30", "Sale price": "24", Stock: "7", SKU: "MOTH-1" });
    expect(move.books[0].cells.Categories).toBe("Nature");
  });
  it("Squarespace: editions under one product", () => {
    const move = readProductExport(productsForSquarespace(BOOKS, { now: NOW }))!;
    expect(move.shape).toBe("product-id-rows");
    expect(move.books).toHaveLength(2);
    expect(move.books[1].editions.map((e) => [e.name, e.price, e.stock])).toEqual([["Paperback", 10, 3], ["Signed copy", 15, 1]]);
    expect(move.books[0].cells).toMatchObject({ Price: "30", "Sale price": "24", Stock: "7" });
  });
  it("Big Cartel: one listing per edition, photos in numbered columns", () => {
    const move = readProductExport(productsForBigCartel(BOOKS, { now: NOW }))!;
    expect(move.shape).toBe("listing-rows");
    expect(move.books.map((b) => b.cells.Title)).toEqual(["Moths of the North", "Night Zine (Paperback)", "Night Zine (Signed copy)"]);
    expect(move.books[0].cells["Image URL"]).toBe("https://img.example/a.jpg");
  });
  it("Shopify: the existing layout", () => {
    expect(readProductExport(productsForAnotherShop(BOOKS, { now: NOW }))!.shape).toBe("handle-rows");
  });
  it("every layout brings in the same two products through planShopMove", () => {
    for (const csv of [productsForWoo(BOOKS, { now: NOW }), productsForSquarespace(BOOKS, { now: NOW }), productsForAnotherShop(BOOKS, { now: NOW })]) {
      const plan = planShopMove(csv, [], []);
      expect(plan.moved?.books).toHaveLength(2);
    }
  });
  it("gift cards stay out of every file", () => {
    for (const csv of [productsForWoo(BOOKS), productsForSquarespace(BOOKS), productsForBigCartel(BOOKS)]) expect(csv).not.toContain("Gift card");
  });
});

describe("the whole download", () => {
  const books = BOOKS;
  const plan = photoPlan(books);
  it("names each photo once after its product", () => {
    expect(plan.map((p) => p.file)).toEqual(["images/moths-1.jpg", "images/moths-2.png", "images/night-zine-1.jpg"]);
    expect(handlesFor(books).get(books[0])).toBe("moths");
  });
  it("copies photos, keeps going when one fails, and lists the rest", async () => {
    const fetcher = (async (url: string) => (url.endsWith("b.png") ? new Response("no", { status: 404 }) : new Response(new Uint8Array([1, 2, 3])))) as unknown as typeof fetch;
    const saved = await fetchPhotos(plan, { fetcher });
    expect([...saved.keys()].sort()).toEqual(["https://img.example/a.jpg", "https://img.example/z.jpg"]);
    const files = takeoutFiles({ pressName: "Moth Press", books, orders: [], consent: { subscribed: new Set(), optedOut: () => false }, notes: new Map(), pages: [{ id: "p", title: "About" }], settings: { info: { name: "Moth Press" } }, photos: { plan, saved }, now: NOW });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["README.txt", "products/shopify-products.csv", "products/woocommerce-products.csv", "products/squarespace-products.csv", "products/bigcartel-products.csv", "customers/customers.csv", "orders/orders.csv", "pages/pages.json", "settings/settings.json", "backup/books.json", "images/images.csv", "images/moths-1.jpg", "images/night-zine-1.jpg"]));
    expect(paths).not.toContain("images/moths-2.png");
    const images = String(files.find((f) => f.path === "images/images.csv")!.content);
    expect(images).toContain("not copied");
    expect(String(files[0].content)).toContain("2 of 3 product photos");
    // And it zips: the end-of-directory record counts every file.
    const zip = zipStored(files.map((f) => [f.path, typeof f.content === "string" ? new TextEncoder().encode(f.content) : f.content]));
    expect(new DataView(zip.buffer).getUint16(zip.length - 22 + 10, true)).toBe(files.length);
  });
});
